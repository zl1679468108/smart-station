import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { BillsQueryDto } from './dto/bills-query.dto';
import { ReconcileBillDto } from './dto/reconcile-bill.dto';
import { UpsertRateDto } from './dto/upsert-rate.dto';
import { RatesQueryDto } from './dto/rates-query.dto';

interface CourierAgg {
  courierCompanyId: string;
  collectCount: number;
  deliverCount: number;
  shippingCount: number;
  shippingFreight: number;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 每月 1 日 03:00 北京时间为全部活跃驿站生成上月账单 */
  @Cron('0 3 1 * *', { timeZone: 'Asia/Shanghai' })
  async scheduledGenerateAll() {
    const month = this.lastMonth();
    this.logger.log(`开始定时生成 ${month} 月结账单...`);
    try {
      const { data: stations, error } = await this.supabase
        .getClient()
        .from('ss_stations')
        .select('id')
        .eq('status', 'active');
      if (error) {
        this.logger.error(`拉取驿站失败: ${error.message}`);
        return;
      }
      for (const st of stations || []) {
        try {
          const r = await this.generateBills(st.id, month);
          this.logger.log(`驿站 ${st.id} 生成账单 generated=${r.generated} skipped=${r.skipped}`);
        } catch (e: any) {
          this.logger.error(`驿站 ${st.id} 生成账单失败: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`定时生成账单异常: ${e?.message || e}`);
    }
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private lastMonth(): string {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-11，减一个月得到上月
    const d = new Date(Date.UTC(y, m - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  // 返回月份在北京时间的 [起, 止) UTC ISO 边界
  private monthRangeUtc(month: string): { startUtc: string; endUtc: string } {
    const [y, m] = month.split('-').map((s) => Number(s));
    // 北京时间 month-01 00:00:00 == UTC 前一天 16:00:00
    const startUtc = new Date(Date.UTC(y, m - 1, 1, -8, 0, 0));
    const endUtc = new Date(Date.UTC(y, m, 1, -8, 0, 0));
    return { startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() };
  }

  // ===== 费率配置 =====

  async listRates(stationId: string, q: RatesQueryDto) {
    const client = this.supabase.getClient();
    let query = client
      .from('ss_courier_rates')
      .select(
        `id, courier_company_id, effective_month, first_weight_price, additional_price,
         first_weight_kg, collect_rate, deliver_rate, insure_rate, created_at, updated_at,
         courier:ss_courier_companies(id, name, code)`,
      )
      .eq('station_id', stationId)
      .order('effective_month', { ascending: false });
    if (q.month) query = query.eq('effective_month', q.month);
    const { data, error } = await query;
    if (error) throw new Error(`查询费率失败: ${error.message}`);
    return (data || []).map((row) => this.mapRate(row));
  }

  async upsertRate(stationId: string, dto: UpsertRateDto) {
    const client = this.supabase.getClient();
    const payload = {
      station_id: stationId,
      courier_company_id: dto.courierCompanyId,
      effective_month: dto.effectiveMonth,
      first_weight_price: dto.firstWeightPrice,
      additional_price: dto.additionalPrice,
      first_weight_kg: dto.firstWeightKg ?? 1,
      collect_rate: dto.collectRate,
      deliver_rate: dto.deliverRate,
      insure_rate: dto.insureRate ?? 0,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client
      .from('ss_courier_rates')
      .upsert(payload, { onConflict: 'station_id,courier_company_id,effective_month' })
      .select(
        `id, courier_company_id, effective_month, first_weight_price, additional_price,
         first_weight_kg, collect_rate, deliver_rate, insure_rate, created_at, updated_at,
         courier:ss_courier_companies(id, name, code)`,
      )
      .maybeSingle();
    if (error) throw new Error(`保存费率失败: ${error.message}`);
    return this.mapRate(data);
  }

  private async rateMap(
    stationId: string,
    month: string,
  ): Promise<Record<string, { collect: number; deliver: number }>> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('ss_courier_rates')
      .select('courier_company_id, effective_month, collect_rate, deliver_rate')
      .eq('station_id', stationId)
      .lte('effective_month', month)
      .order('effective_month', { ascending: false });
    if (error) throw new Error(`查询费率失败: ${error.message}`);
    const map: Record<string, { collect: number; deliver: number }> = {};
    // 已按月份降序，首个即为该公司最新生效费率
    for (const r of data || []) {
      if (!map[r.courier_company_id]) {
        map[r.courier_company_id] = {
          collect: Number(r.collect_rate) || 0,
          deliver: Number(r.deliver_rate) || 0,
        };
      }
    }
    return map;
  }

  // ===== 月结账单 =====

  async listBills(stationId: string, q: BillsQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const client = this.supabase.getClient();
    let query = client
      .from('ss_finance_bills')
      .select(
        `id, courier_company_id, bill_month, collect_count, deliver_count, shipping_count,
         receivable, payable, net_amount, status, reconciled_amount, reconciled_note,
         generated_at, reconciled_at, created_at, updated_at,
         courier:ss_courier_companies(id, name, code)`,
        { count: 'exact' },
      )
      .eq('station_id', stationId)
      .order('bill_month', { ascending: false })
      .range(from, to);
    if (q.month) query = query.eq('bill_month', q.month);
    if (q.status) query = query.eq('status', q.status);
    if (q.courierCompanyId) query = query.eq('courier_company_id', q.courierCompanyId);
    const { data, error, count } = await query;
    if (error) throw new Error(`查询账单失败: ${error.message}`);
    return {
      items: (data || []).map((row) => this.mapBill(row)),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async listBillItems(stationId: string, billId: string) {
    const client = this.supabase.getClient();
    const { data: bill, error: bErr } = await client
      .from('ss_finance_bills')
      .select('id')
      .eq('id', billId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (bErr) throw new Error(`查询账单失败: ${bErr.message}`);
    if (!bill) throw new NotFoundException('账单不存在');
    const { data, error } = await client
      .from('ss_finance_items')
      .select('id, item_type, quantity, amount, direction, parcel_id, shipping_id, created_at')
      .eq('bill_id', billId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`查询账单明细失败: ${error.message}`);
    return (data || []).map((r) => ({
      id: r.id,
      itemType: r.item_type,
      quantity: r.quantity,
      amount: Number(r.amount),
      direction: r.direction,
      parcelId: r.parcel_id,
      shippingId: r.shipping_id,
      createdAt: r.created_at,
    }));
  }

  async generateBills(stationId: string, month: string) {
    const client = this.supabase.getClient();
    const { startUtc, endUtc } = this.monthRangeUtc(month);

    // 拉取当月入库（代收）/出库（代派）包裹与寄件单，内存聚合
    const [inboundRes, outboundRes, shippingRes] = await Promise.all([
      client
        .from('ss_parcels')
        .select('id, courier_company_id')
        .eq('station_id', stationId)
        .gte('inbound_at', startUtc)
        .lt('inbound_at', endUtc),
      client
        .from('ss_parcels')
        .select('id, courier_company_id')
        .eq('station_id', stationId)
        .gte('outbound_at', startUtc)
        .lt('outbound_at', endUtc),
      client
        .from('ss_shippings')
        .select('id, courier_company_id, freight')
        .eq('station_id', stationId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc)
        .neq('status', 'cancelled'),
    ]);
    if (inboundRes.error) throw new Error(`查询入库失败: ${inboundRes.error.message}`);
    if (outboundRes.error) throw new Error(`查询出库失败: ${outboundRes.error.message}`);
    if (shippingRes.error) throw new Error(`查询寄件失败: ${shippingRes.error.message}`);

    const aggMap: Record<string, CourierAgg> = {};
    const ensure = (cid: string | null): CourierAgg | null => {
      if (!cid) return null;
      if (!aggMap[cid]) {
        aggMap[cid] = {
          courierCompanyId: cid,
          collectCount: 0,
          deliverCount: 0,
          shippingCount: 0,
          shippingFreight: 0,
        };
      }
      return aggMap[cid];
    };
    for (const p of inboundRes.data || []) {
      const a = ensure(p.courier_company_id);
      if (a) a.collectCount++;
    }
    for (const p of outboundRes.data || []) {
      const a = ensure(p.courier_company_id);
      if (a) a.deliverCount++;
    }
    for (const s of shippingRes.data || []) {
      const a = ensure(s.courier_company_id);
      if (a) {
        a.shippingCount++;
        a.shippingFreight += Number(s.freight) || 0;
      }
    }

    const rates = await this.rateMap(stationId, month);

    // 保留已对账账单，仅重算未对账账单
    const { data: existingBills, error: eErr } = await client
      .from('ss_finance_bills')
      .select('id, courier_company_id, status')
      .eq('station_id', stationId)
      .eq('bill_month', month);
    if (eErr) throw new Error(`查询已有账单失败: ${eErr.message}`);
    const lockedCouriers = new Set(
      (existingBills || [])
        .filter((b) => b.status !== 'unreconciled')
        .map((b) => b.courier_company_id),
    );

    let generated = 0;
    let skipped = 0;
    for (const agg of Object.values(aggMap)) {
      if (lockedCouriers.has(agg.courierCompanyId)) {
        skipped++;
        continue;
      }
      const rate = rates[agg.courierCompanyId] || { collect: 0, deliver: 0 };
      const collectAmount = this.round2(agg.collectCount * rate.collect);
      const deliverAmount = this.round2(agg.deliverCount * rate.deliver);
      const shippingAmount = this.round2(agg.shippingFreight);
      const receivable = this.round2(collectAmount + deliverAmount);
      const payable = shippingAmount;
      const netAmount = this.round2(receivable - payable);

      // 先删旧的未对账账单（明细级联删除），再插入
      const existing = (existingBills || []).find(
        (b) => b.courier_company_id === agg.courierCompanyId,
      );
      if (existing) {
        await client.from('ss_finance_bills').delete().eq('id', existing.id);
      }

      const { data: bill, error: insErr } = await client
        .from('ss_finance_bills')
        .insert({
          station_id: stationId,
          courier_company_id: agg.courierCompanyId,
          bill_month: month,
          collect_count: agg.collectCount,
          deliver_count: agg.deliverCount,
          shipping_count: agg.shippingCount,
          receivable,
          payable,
          net_amount: netAmount,
          status: 'unreconciled',
          generated_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();
      if (insErr) throw new Error(`生成账单失败: ${insErr.message}`);

      const items = [
        {
          bill_id: bill.id,
          station_id: stationId,
          item_type: 'collect',
          quantity: agg.collectCount,
          amount: collectAmount,
          direction: 'receivable',
        },
        {
          bill_id: bill.id,
          station_id: stationId,
          item_type: 'deliver',
          quantity: agg.deliverCount,
          amount: deliverAmount,
          direction: 'receivable',
        },
        {
          bill_id: bill.id,
          station_id: stationId,
          item_type: 'shipping',
          quantity: agg.shippingCount,
          amount: shippingAmount,
          direction: 'payable',
        },
      ];
      const { error: itErr } = await client.from('ss_finance_items').insert(items);
      if (itErr) throw new Error(`生成账单明细失败: ${itErr.message}`);
      generated++;
    }

    return { month, generated, skipped, couriers: Object.keys(aggMap).length };
  }

  async reconcile(stationId: string, billId: string, dto: ReconcileBillDto) {
    const client = this.supabase.getClient();
    const { data: bill, error } = await client
      .from('ss_finance_bills')
      .select('id, net_amount')
      .eq('id', billId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询账单失败: ${error.message}`);
    if (!bill) throw new NotFoundException('账单不存在');

    const patch: Record<string, unknown> = {
      status: dto.status,
      reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (dto.reconciledAmount !== undefined) patch.reconciled_amount = dto.reconciledAmount;
    if (dto.reconciledNote !== undefined) patch.reconciled_note = dto.reconciledNote;

    // 若录入金额与净额不一致，自动置为有差异
    if (
      dto.reconciledAmount !== undefined &&
      this.round2(dto.reconciledAmount) !== this.round2(Number(bill.net_amount))
    ) {
      patch.status = 'discrepancy';
    }

    const { error: uErr } = await client
      .from('ss_finance_bills')
      .update(patch)
      .eq('id', billId);
    if (uErr) throw new Error(`对账失败: ${uErr.message}`);
    return this.getBill(stationId, billId);
  }

  async getBill(stationId: string, billId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_finance_bills')
      .select(
        `id, courier_company_id, bill_month, collect_count, deliver_count, shipping_count,
         receivable, payable, net_amount, status, reconciled_amount, reconciled_note,
         generated_at, reconciled_at, created_at, updated_at,
         courier:ss_courier_companies(id, name, code)`,
      )
      .eq('id', billId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询账单失败: ${error.message}`);
    if (!data) throw new NotFoundException('账单不存在');
    return this.mapBill(data);
  }

  async exportCsv(stationId: string, q: BillsQueryDto): Promise<string> {
    const { items } = await this.listBills(stationId, { ...q, page: 1, pageSize: 1000 });
    const header = [
      '月份',
      '快递公司',
      '代收件数',
      '代派件数',
      '寄件数',
      '应收',
      '应付',
      '净额',
      '状态',
      '对账金额',
      '生成时间',
    ];
    const statusLabel: Record<string, string> = {
      unreconciled: '未对账',
      reconciled: '已对账',
      discrepancy: '有差异',
    };
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = items.map((b) =>
      [
        b.billMonth,
        b.courier?.name || '',
        b.collectCount,
        b.deliverCount,
        b.shippingCount,
        b.receivable,
        b.payable,
        b.netAmount,
        statusLabel[b.status] || b.status,
        b.reconciledAmount ?? '',
        b.generatedAt,
      ]
        .map(escape)
        .join(','),
    );
    // UTF-8 BOM 保证 Excel 正确识别中文
    return '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  }

  private mapBill(row: any) {
    return {
      id: row.id,
      courierCompanyId: row.courier_company_id,
      courier: row.courier
        ? { id: row.courier.id, name: row.courier.name, code: row.courier.code }
        : null,
      billMonth: row.bill_month,
      collectCount: row.collect_count,
      deliverCount: row.deliver_count,
      shippingCount: row.shipping_count,
      receivable: Number(row.receivable),
      payable: Number(row.payable),
      netAmount: Number(row.net_amount),
      status: row.status,
      reconciledAmount: row.reconciled_amount === null ? null : Number(row.reconciled_amount),
      reconciledNote: row.reconciled_note,
      generatedAt: row.generated_at,
      reconciledAt: row.reconciled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRate(row: any) {
    return {
      id: row.id,
      courierCompanyId: row.courier_company_id,
      courier: row.courier
        ? { id: row.courier.id, name: row.courier.name, code: row.courier.code }
        : null,
      effectiveMonth: row.effective_month,
      firstWeightPrice: Number(row.first_weight_price),
      additionalPrice: Number(row.additional_price),
      firstWeightKg: Number(row.first_weight_kg),
      collectRate: Number(row.collect_rate),
      deliverRate: Number(row.deliver_rate),
      insureRate: Number(row.insure_rate),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * 当日对用户收款日结（到付 + 代收货款）
   * date: YYYY-MM-DD（北京时间日），默认今天
   */
  async getCashDay(stationId: string, date?: string) {
    const day = (date || this.beijingToday()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    }
    // 北京时间日 → UTC 区间近似：北京 00:00 = UTC-8 前一天 16:00
    const startUtc = new Date(`${day}T00:00:00+08:00`).toISOString();
    const endUtc = new Date(`${day}T23:59:59.999+08:00`).toISOString();

    const client = this.supabase.getClient();
    const [settledRes, unpaidRes] = await Promise.all([
      client
        .from('ss_parcels')
        .select(
          'id, tracking_number, recipient_name, pickup_code, freight_collect_amount, cod_amount, collect_status, collect_paid_method, collect_paid_at, collect_note, outbound_at',
        )
        .eq('station_id', stationId)
        .in('collect_status', ['paid', 'waived'])
        .gte('collect_paid_at', startUtc)
        .lte('collect_paid_at', endUtc)
        .order('collect_paid_at', { ascending: false })
        .limit(300),
      client
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('collect_status', 'unpaid')
        .in('status', ['in_stock', 'overdue']),
    ]);
    if (settledRes.error) throw new Error(`查询收款日结失败: ${settledRes.error.message}`);
    if (unpaidRes.error) throw new Error(`查询待收款失败: ${unpaidRes.error.message}`);

    const byMethod: Record<string, number> = {
      cash: 0,
      wechat: 0,
      alipay: 0,
      other: 0,
    };
    let total = 0;
    let freightTotal = 0;
    let codTotal = 0;
    let waivedTotal = 0;
    let paidCount = 0;
    let waivedCount = 0;
    const items = (settledRes.data || []).map((r: any) => {
      const freight = Number(r.freight_collect_amount || 0);
      const cod = Number(r.cod_amount || 0);
      const amount = Math.round((freight + cod) * 100) / 100;
      const status = (r.collect_status as string) || 'paid';
      if (status === 'waived') {
        waivedCount += 1;
        waivedTotal += amount;
      } else {
        paidCount += 1;
        total += amount;
        freightTotal += freight;
        codTotal += cod;
        const method = (r.collect_paid_method as string) || 'other';
        if (byMethod[method] !== undefined) byMethod[method] += amount;
        else byMethod.other += amount;
      }
      return {
        id: r.id,
        trackingNumber: r.tracking_number,
        recipientName: r.recipient_name,
        pickupCode: r.pickup_code,
        freightCollectAmount: freight,
        codAmount: cod,
        amount,
        collectStatus: status,
        collectPaidMethod: r.collect_paid_method || null,
        collectNote: r.collect_note || null,
        collectPaidAt: r.collect_paid_at,
        outboundAt: r.outbound_at,
      };
    });
    // 四舍五入汇总
    total = Math.round(total * 100) / 100;
    freightTotal = Math.round(freightTotal * 100) / 100;
    codTotal = Math.round(codTotal * 100) / 100;
    waivedTotal = Math.round(waivedTotal * 100) / 100;
    for (const k of Object.keys(byMethod)) {
      byMethod[k] = Math.round(byMethod[k] * 100) / 100;
    }

    return {
      date: day,
      total,
      freightTotal,
      codTotal,
      byMethod,
      paidCount,
      waivedCount,
      waivedTotal,
      unpaidInStock: unpaidRes.count || 0,
      items,
    };
  }

  /** 收款日结 CSV（UTF-8 BOM，Excel 可打开） */
  async exportCashDayCsv(stationId: string, date?: string): Promise<string> {
    const data = await this.getCashDay(stationId, date);
    const methodLabel: Record<string, string> = {
      cash: '现金',
      wechat: '微信',
      alipay: '支付宝',
      other: '其他',
    };
    const statusLabel: Record<string, string> = {
      paid: '已收款',
      waived: '已免收',
    };
    const lines: string[] = [];
    lines.push(
      [
        '日期',
        '运单号',
        '取件码',
        '收件人',
        '到付运费',
        '代收货款',
        '合计',
        '状态',
        '收款方式',
        '备注',
        '处理时间',
      ].join(','),
    );
    for (const it of data.items) {
      const row = [
        data.date,
        it.trackingNumber,
        it.pickupCode || '',
        it.recipientName,
        Number(it.freightCollectAmount || 0).toFixed(2),
        Number(it.codAmount || 0).toFixed(2),
        Number(it.amount || 0).toFixed(2),
        statusLabel[it.collectStatus] || it.collectStatus || '',
        it.collectPaidMethod ? methodLabel[it.collectPaidMethod] || it.collectPaidMethod : '',
        (it.collectNote || '').replace(/[\n\r,]/g, ' '),
        it.collectPaidAt || '',
      ];
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    lines.push('');
    lines.push(`"汇总收款合计","${data.total.toFixed(2)}"`);
    lines.push(`"汇总到付","${data.freightTotal.toFixed(2)}"`);
    lines.push(`"汇总货款","${data.codTotal.toFixed(2)}"`);
    lines.push(`"收款笔数","${data.paidCount}"`);
    lines.push(`"免收笔数","${data.waivedCount}"`);
    lines.push(`"免收金额","${data.waivedTotal.toFixed(2)}"`);
    lines.push(`"在库待收款","${data.unpaidInStock}"`);
    lines.push(`"现金","${data.byMethod.cash.toFixed(2)}"`);
    lines.push(`"微信","${data.byMethod.wechat.toFixed(2)}"`);
    lines.push(`"支付宝","${data.byMethod.alipay.toFixed(2)}"`);
    lines.push(`"其他","${data.byMethod.other.toFixed(2)}"`);
    return '\uFEFF' + lines.join('\n');
  }

  private beijingToday(): string {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

}
