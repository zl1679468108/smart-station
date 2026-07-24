import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CloseShiftDto, OpenShiftDto, ShiftListQueryDto } from './dto/shift.dto';

/**
 * 交接班服务
 * - 每店员每驿站同时仅一个 open 班次
 * - 交班时汇总本班入库/出库/收款快照
 */
@Injectable()
export class ShiftService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 当前登录店员的进行中班次 */
  async getCurrent(stationId: string, operatorId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shifts')
      .select(
        `id, station_id, operator_id, status, started_at, ended_at, opening_note, closing_note,
         handover_to_user_id, inbound_count, outbound_count, collect_paid_count, collect_paid_total,
         collect_cash, collect_wechat, collect_alipay, collect_other, stock_count, created_at,
         operator:ss_users!ss_shifts_operator_id_fkey(id, username)`,
      )
      .eq('station_id', stationId)
      .eq('operator_id', operatorId)
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw new Error(`查询当前班次失败: ${error.message}`);
    if (!data) return null;
    const live = await this.computeLiveStats(stationId, operatorId, data.started_at);
    return this.mapShift(data, live);
  }

  /** 开班 */
  async open(stationId: string, operatorId: string, dto: OpenShiftDto) {
    const existing = await this.getCurrent(stationId, operatorId);
    if (existing) {
      throw new ConflictException('您已有进行中的班次，请先交班');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shifts')
      .insert({
        station_id: stationId,
        operator_id: operatorId,
        status: 'open',
        started_at: new Date().toISOString(),
        opening_note: (dto.openingNote || '').trim() || null,
      })
      .select(
        `id, station_id, operator_id, status, started_at, ended_at, opening_note, closing_note,
         handover_to_user_id, inbound_count, outbound_count, collect_paid_count, collect_paid_total,
         collect_cash, collect_wechat, collect_alipay, collect_other, stock_count, created_at,
         operator:ss_users!ss_shifts_operator_id_fkey(id, username)`,
      )
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('您已有进行中的班次，请先交班');
      }
      throw new Error(`开班失败: ${error.message}`);
    }
    if (!data) throw new Error('开班失败：未返回数据');
    return this.mapShift(data, {
      inboundCount: 0,
      outboundCount: 0,
      collectPaidCount: 0,
      collectPaidTotal: 0,
      collectCash: 0,
      collectWechat: 0,
      collectAlipay: 0,
      collectOther: 0,
      stockCountLive: null,
    });
  }

  /** 交班 */
  async close(
    stationId: string,
    operatorId: string,
    shiftId: string,
    dto: CloseShiftDto,
  ) {
    const { data: shift, error } = await this.supabase
      .getClient()
      .from('ss_shifts')
      .select('id, status, started_at, operator_id')
      .eq('id', shiftId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询班次失败: ${error.message}`);
    if (!shift) throw new NotFoundException('班次不存在');
    if (shift.operator_id !== operatorId) {
      throw new BadRequestException('只能交自己的班');
    }
    if (shift.status !== 'open') {
      throw new BadRequestException('该班次已交班');
    }

    if (dto.handoverToUserId) {
      const { data: user } = await this.supabase
        .getClient()
        .from('ss_users')
        .select('id')
        .eq('id', dto.handoverToUserId)
        .maybeSingle();
      if (!user) throw new BadRequestException('接班人不存在');
    }

    const stats = await this.computeLiveStats(stationId, operatorId, shift.started_at);
    const endedAt = new Date().toISOString();

    const { data: closed, error: upErr } = await this.supabase
      .getClient()
      .from('ss_shifts')
      .update({
        status: 'closed',
        ended_at: endedAt,
        closing_note: (dto.closingNote || '').trim() || null,
        handover_to_user_id: dto.handoverToUserId || null,
        inbound_count: stats.inboundCount,
        outbound_count: stats.outboundCount,
        collect_paid_count: stats.collectPaidCount,
        collect_paid_total: stats.collectPaidTotal,
        collect_cash: stats.collectCash,
        collect_wechat: stats.collectWechat,
        collect_alipay: stats.collectAlipay,
        collect_other: stats.collectOther,
        stock_count: dto.stockCount !== undefined ? dto.stockCount : stats.stockCountLive,
      })
      .eq('id', shiftId)
      .eq('status', 'open')
      .select(
        `id, station_id, operator_id, status, started_at, ended_at, opening_note, closing_note,
         handover_to_user_id, inbound_count, outbound_count, collect_paid_count, collect_paid_total,
         collect_cash, collect_wechat, collect_alipay, collect_other, stock_count, created_at,
         operator:ss_users!ss_shifts_operator_id_fkey(id, username),
         handover_to:ss_users!ss_shifts_handover_to_user_id_fkey(id, username)`,
      )
      .maybeSingle();
    if (upErr) throw new Error(`交班失败: ${upErr.message}`);
    if (!closed) throw new ConflictException('交班失败，班次可能已关闭');
    return this.mapShift(closed);
  }

  /** 班次列表 */
  async list(stationId: string, q: ShiftListQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_shifts')
      .select(
        `id, station_id, operator_id, status, started_at, ended_at, opening_note, closing_note,
         handover_to_user_id, inbound_count, outbound_count, collect_paid_count, collect_paid_total,
         collect_cash, collect_wechat, collect_alipay, collect_other, stock_count, created_at,
         operator:ss_users!ss_shifts_operator_id_fkey(id, username),
         handover_to:ss_users!ss_shifts_handover_to_user_id_fkey(id, username)`,
        { count: 'exact' },
      )
      .eq('station_id', stationId);

    if (q.status) query = query.eq('status', q.status);
    if (q.startDate) query = query.gte('started_at', `${q.startDate}T00:00:00+08:00`);
    if (q.endDate) query = query.lte('started_at', `${q.endDate}T23:59:59.999+08:00`);

    query = query.order('started_at', { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) throw new Error(`查询班次失败: ${error.message}`);

    return {
      items: (data || []).map((r) => this.mapShift(r)),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  /** 员工绩效（按操作人汇总入库/出库/收款） */
  async staffPerformance(
    stationId: string,
    opts: { startDate?: string; endDate?: string },
  ) {
    const start = opts.startDate
      ? new Date(`${opts.startDate}T00:00:00+08:00`).toISOString()
      : new Date(Date.now() - 7 * 86400000).toISOString();
    const end = opts.endDate
      ? new Date(`${opts.endDate}T23:59:59.999+08:00`).toISOString()
      : new Date().toISOString();

    const client = this.supabase.getClient();
    const [inboundRes, outboundRes, collectRes, shiftsRes, usersRes] = await Promise.all([
      client
        .from('ss_parcels')
        .select('inbound_operator_id')
        .eq('station_id', stationId)
        .gte('inbound_at', start)
        .lte('inbound_at', end)
        .not('inbound_operator_id', 'is', null),
      client
        .from('ss_parcels')
        .select('outbound_operator_id')
        .eq('station_id', stationId)
        .eq('status', 'out_stock')
        .gte('outbound_at', start)
        .lte('outbound_at', end)
        .not('outbound_operator_id', 'is', null),
      client
        .from('ss_parcels')
        .select(
          'collect_paid_operator_id, freight_collect_amount, cod_amount, collect_paid_method',
        )
        .eq('station_id', stationId)
        .eq('collect_status', 'paid')
        .gte('collect_paid_at', start)
        .lte('collect_paid_at', end)
        .not('collect_paid_operator_id', 'is', null),
      client
        .from('ss_shifts')
        .select('operator_id, status, started_at, ended_at')
        .eq('station_id', stationId)
        .gte('started_at', start)
        .lte('started_at', end),
      client.from('ss_users').select('id, username').eq('status', 'active'),
    ]);

    if (inboundRes.error) throw new Error(`绩效入库统计失败: ${inboundRes.error.message}`);
    if (outboundRes.error) throw new Error(`绩效出库统计失败: ${outboundRes.error.message}`);
    if (collectRes.error) throw new Error(`绩效收款统计失败: ${collectRes.error.message}`);
    if (shiftsRes.error) throw new Error(`绩效班次统计失败: ${shiftsRes.error.message}`);

    type Acc = {
      userId: string;
      username: string;
      inboundCount: number;
      outboundCount: number;
      collectPaidCount: number;
      collectPaidTotal: number;
      shiftCount: number;
      shiftMinutes: number;
    };
    const map = new Map<string, Acc>();
    const nameOf = (id: string) => {
      const u = (usersRes.data || []).find((x: any) => x.id === id);
      return u?.username || id.slice(0, 8);
    };
    const ensure = (id: string) => {
      if (!map.has(id)) {
        map.set(id, {
          userId: id,
          username: nameOf(id),
          inboundCount: 0,
          outboundCount: 0,
          collectPaidCount: 0,
          collectPaidTotal: 0,
          shiftCount: 0,
          shiftMinutes: 0,
        });
      }
      return map.get(id)!;
    };

    for (const r of inboundRes.data || []) {
      if (r.inbound_operator_id) ensure(r.inbound_operator_id).inboundCount += 1;
    }
    for (const r of outboundRes.data || []) {
      if (r.outbound_operator_id) ensure(r.outbound_operator_id).outboundCount += 1;
    }
    for (const r of collectRes.data || []) {
      if (!r.collect_paid_operator_id) continue;
      const a = ensure(r.collect_paid_operator_id);
      a.collectPaidCount += 1;
      a.collectPaidTotal +=
        Math.round(
          (Number(r.freight_collect_amount || 0) + Number(r.cod_amount || 0)) * 100,
        ) / 100;
    }
    for (const r of shiftsRes.data || []) {
      const a = ensure(r.operator_id);
      a.shiftCount += 1;
      const startMs = new Date(r.started_at).getTime();
      const endMs = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
      a.shiftMinutes += Math.max(0, Math.round((endMs - startMs) / 60000));
    }

    const items = Array.from(map.values())
      .map((a) => ({
        ...a,
        collectPaidTotal: Math.round(a.collectPaidTotal * 100) / 100,
      }))
      .sort(
        (x, y) =>
          y.inboundCount + y.outboundCount - (x.inboundCount + x.outboundCount),
      );

    return {
      startDate: opts.startDate || start.slice(0, 10),
      endDate: opts.endDate || end.slice(0, 10),
      items,
    };
  }

  // ---- private ----

  private async computeLiveStats(
    stationId: string,
    operatorId: string,
    startedAt: string,
  ) {
    const client = this.supabase.getClient();
    const now = new Date().toISOString();
    const [inboundRes, outboundRes, collectRes, stockRes] = await Promise.all([
      client
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('inbound_operator_id', operatorId)
        .gte('inbound_at', startedAt)
        .lte('inbound_at', now),
      client
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('outbound_operator_id', operatorId)
        .eq('status', 'out_stock')
        .gte('outbound_at', startedAt)
        .lte('outbound_at', now),
      client
        .from('ss_parcels')
        .select('freight_collect_amount, cod_amount, collect_paid_method')
        .eq('station_id', stationId)
        .eq('collect_status', 'paid')
        .eq('collect_paid_operator_id', operatorId)
        .gte('collect_paid_at', startedAt)
        .lte('collect_paid_at', now),
      client
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .in('status', ['in_stock', 'overdue']),
    ]);

    let collectPaidTotal = 0;
    let collectCash = 0;
    let collectWechat = 0;
    let collectAlipay = 0;
    let collectOther = 0;
    for (const r of collectRes.data || []) {
      const amount =
        Math.round(
          (Number(r.freight_collect_amount || 0) + Number(r.cod_amount || 0)) * 100,
        ) / 100;
      collectPaidTotal += amount;
      const m = r.collect_paid_method || 'other';
      if (m === 'cash') collectCash += amount;
      else if (m === 'wechat') collectWechat += amount;
      else if (m === 'alipay') collectAlipay += amount;
      else collectOther += amount;
    }

    return {
      inboundCount: inboundRes.count || 0,
      outboundCount: outboundRes.count || 0,
      collectPaidCount: (collectRes.data || []).length,
      collectPaidTotal: Math.round(collectPaidTotal * 100) / 100,
      collectCash: Math.round(collectCash * 100) / 100,
      collectWechat: Math.round(collectWechat * 100) / 100,
      collectAlipay: Math.round(collectAlipay * 100) / 100,
      collectOther: Math.round(collectOther * 100) / 100,
      stockCountLive: stockRes.count ?? null,
    };
  }

  private mapShift(row: any, live?: {
    inboundCount: number;
    outboundCount: number;
    collectPaidCount: number;
    collectPaidTotal: number;
    collectCash: number;
    collectWechat: number;
    collectAlipay: number;
    collectOther: number;
    stockCountLive: number | null;
  }) {
    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    const isOpen = row.status === 'open';
    return {
      id: row.id,
      stationId: row.station_id,
      operatorId: row.operator_id,
      operatorName: flatten(row.operator)?.username ?? null,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      openingNote: row.opening_note,
      closingNote: row.closing_note,
      handoverToUserId: row.handover_to_user_id,
      handoverToName: flatten(row.handover_to)?.username ?? null,
      inboundCount: isOpen && live ? live.inboundCount : row.inbound_count,
      outboundCount: isOpen && live ? live.outboundCount : row.outbound_count,
      collectPaidCount: isOpen && live ? live.collectPaidCount : row.collect_paid_count,
      collectPaidTotal: isOpen && live ? live.collectPaidTotal : Number(row.collect_paid_total || 0),
      collectCash: isOpen && live ? live.collectCash : Number(row.collect_cash || 0),
      collectWechat: isOpen && live ? live.collectWechat : Number(row.collect_wechat || 0),
      collectAlipay: isOpen && live ? live.collectAlipay : Number(row.collect_alipay || 0),
      collectOther: isOpen && live ? live.collectOther : Number(row.collect_other || 0),
      stockCount: isOpen && live ? live.stockCountLive : row.stock_count,
      createdAt: row.created_at,
    };
  }
}
