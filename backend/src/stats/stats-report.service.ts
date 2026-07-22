import { Inject, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * 统计报表服务（M26 / 数据统计）
 * - 业务量趋势（日/周/月入库出库）
 * - 转化漏斗（入库 → 出库 → 滞留 → 退回）
 * - 滞留率（总体 + 按快递公司）
 * - 取件高峰（8:00-22:00 出库小时分布）
 *
 * 说明：数据库存 UTC，服务端时区为北京时间，Date.getHours()/getDay() 即北京时间。
 * 所有查询按 station_id 隔离。
 */

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 22;

@Injectable()
export class StatsReportService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private fmtMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** ISO 周起始（周一）标签，如 2026-07-20 */
  private weekStart(d: Date): Date {
    const x = this.startOfDay(d);
    const day = (x.getDay() + 6) % 7; // 周一=0
    x.setDate(x.getDate() - day);
    return x;
  }

  /** 业务量趋势：按 day/week/month 分桶统计入库/出库 */
  async getTrend(stationId: string, granularity: 'day' | 'week' | 'month', span: number) {
    const now = new Date();
    // 计算窗口起点
    let windowStart: Date;
    if (granularity === 'day') {
      windowStart = this.startOfDay(now);
      windowStart.setDate(windowStart.getDate() - (span - 1));
    } else if (granularity === 'week') {
      windowStart = this.weekStart(now);
      windowStart.setDate(windowStart.getDate() - (span - 1) * 7);
    } else {
      windowStart = new Date(now.getFullYear(), now.getMonth() - (span - 1), 1);
    }

    const [inboundRes, outboundRes] = await Promise.all([
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('inbound_at')
        .eq('station_id', stationId)
        .gte('inbound_at', windowStart.toISOString()),
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('outbound_at')
        .eq('station_id', stationId)
        .eq('status', 'out_stock')
        .not('outbound_at', 'is', null)
        .gte('outbound_at', windowStart.toISOString()),
    ]);
    if (inboundRes.error) throw new Error(`查询入库趋势失败: ${inboundRes.error.message}`);
    if (outboundRes.error) throw new Error(`查询出库趋势失败: ${outboundRes.error.message}`);

    // 生成桶
    const buckets: Array<{ label: string; inbound: number; outbound: number }> = [];
    const index: Record<string, number> = {};
    const cursor = new Date(windowStart);
    for (let i = 0; i < span; i++) {
      let label: string;
      if (granularity === 'day') {
        label = this.fmtDate(cursor);
        cursor.setDate(cursor.getDate() + 1);
      } else if (granularity === 'week') {
        label = this.fmtDate(cursor);
        cursor.setDate(cursor.getDate() + 7);
      } else {
        label = this.fmtMonth(cursor);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      index[label] = buckets.length;
      buckets.push({ label, inbound: 0, outbound: 0 });
    }

    const labelOf = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (granularity === 'day') return this.fmtDate(d);
      if (granularity === 'week') return this.fmtDate(this.weekStart(d));
      return this.fmtMonth(d);
    };

    for (const r of (inboundRes.data as Array<{ inbound_at: string }>) || []) {
      const i = index[labelOf(r.inbound_at)];
      if (i !== undefined) buckets[i].inbound += 1;
    }
    for (const r of (outboundRes.data as Array<{ outbound_at: string }>) || []) {
      if (!r.outbound_at) continue;
      const i = index[labelOf(r.outbound_at)];
      if (i !== undefined) buckets[i].outbound += 1;
    }

    return { granularity, span, points: buckets };
  }

  /** 转化漏斗：窗口内入库总量 → 已出库 → 当前滞留 → 已退回 */
  async getFunnel(stationId: string, days: number) {
    const from = this.startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));
    const fromIso = from.toISOString();

    const client = this.supabase.getClient();
    const countBy = (build: (q: any) => any) =>
      build(
        client.from('ss_parcels').select('id', { count: 'exact', head: true }).eq('station_id', stationId),
      );

    const [inboundRes, outboundRes, overdueRes, returnedRes] = await Promise.all([
      countBy((q: any) => q.gte('inbound_at', fromIso)),
      countBy((q: any) => q.eq('status', 'out_stock').gte('inbound_at', fromIso)),
      countBy((q: any) => q.eq('status', 'overdue').gte('inbound_at', fromIso)),
      countBy((q: any) => q.eq('status', 'returned').gte('inbound_at', fromIso)),
    ]);
    if (inboundRes.error) throw new Error(`查询漏斗入库失败: ${inboundRes.error.message}`);

    const inbound = inboundRes.count || 0;
    const outbound = outboundRes.count || 0;
    const overdue = overdueRes.count || 0;
    const returned = returnedRes.count || 0;
    const pct = (n: number) => (inbound > 0 ? Math.round((n / inbound) * 1000) / 10 : 0);

    return {
      days,
      stages: [
        { key: 'inbound', label: '入库', count: inbound, percent: 100 },
        { key: 'outbound', label: '出库', count: outbound, percent: pct(outbound) },
        { key: 'overdue', label: '滞留', count: overdue, percent: pct(overdue) },
        { key: 'returned', label: '退回', count: returned, percent: pct(returned) },
      ],
    };
  }

  /** 滞留率：窗口内总体滞留率 + 按快递公司分组 */
  async getRetention(stationId: string, days: number) {
    const from = this.startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));
    const fromIso = from.toISOString();

    const [parcelsRes, couriersRes] = await Promise.all([
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('courier_company_id, status')
        .eq('station_id', stationId)
        .gte('inbound_at', fromIso),
      this.supabase
        .getClient()
        .from('ss_courier_companies')
        .select('id, name, code'),
    ]);
    if (parcelsRes.error) throw new Error(`查询滞留率失败: ${parcelsRes.error.message}`);

    const nameMap: Record<string, string> = {};
    for (const c of (couriersRes.data as Array<{ id: string; name: string }>) || []) {
      nameMap[c.id] = c.name;
    }

    let total = 0;
    let overdueTotal = 0;
    const byCourier: Record<string, { total: number; overdue: number }> = {};
    for (const p of (parcelsRes.data as Array<{ courier_company_id: string | null; status: string }>) || []) {
      total += 1;
      const isOverdue = p.status === 'overdue';
      if (isOverdue) overdueTotal += 1;
      const cid = p.courier_company_id || 'unknown';
      if (!byCourier[cid]) byCourier[cid] = { total: 0, overdue: 0 };
      byCourier[cid].total += 1;
      if (isOverdue) byCourier[cid].overdue += 1;
    }

    const rate = (o: number, t: number) => (t > 0 ? Math.round((o / t) * 1000) / 10 : 0);
    const couriers = Object.entries(byCourier)
      .map(([cid, v]) => ({
        courierCompanyId: cid === 'unknown' ? null : cid,
        courierName: nameMap[cid] || '未知',
        total: v.total,
        overdue: v.overdue,
        rate: rate(v.overdue, v.total),
      }))
      .sort((a, b) => b.rate - a.rate);

    return {
      days,
      total,
      overdue: overdueTotal,
      rate: rate(overdueTotal, total),
      couriers,
    };
  }

  /** 取件高峰：窗口内出库按小时（8-22）分布 + 按星期分布 */
  async getPeakHours(stationId: string, days: number) {
    const from = this.startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));

    const res = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select('outbound_at')
      .eq('station_id', stationId)
      .eq('status', 'out_stock')
      .not('outbound_at', 'is', null)
      .gte('outbound_at', from.toISOString());
    if (res.error) throw new Error(`查询取件高峰失败: ${res.error.message}`);

    const hours: Array<{ hour: number; count: number }> = [];
    for (let h = BUSINESS_START_HOUR; h <= BUSINESS_END_HOUR; h++) {
      hours.push({ hour: h, count: 0 });
    }
    const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekdays = weekdayLabels.map((label, i) => ({ weekday: i, label, count: 0 }));

    let total = 0;
    for (const r of (res.data as Array<{ outbound_at: string }>) || []) {
      if (!r.outbound_at) continue;
      const d = new Date(r.outbound_at);
      const h = d.getHours();
      const slot = hours.find((x) => x.hour === h);
      if (slot) slot.count += 1;
      weekdays[d.getDay()].count += 1;
      total += 1;
    }

    const peak = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]);

    return {
      days,
      total,
      peakHour: peak.count > 0 ? peak.hour : null,
      hours,
      weekdays,
    };
  }
}
