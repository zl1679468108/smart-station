import { Inject, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * 统计服务 - 工作台 Dashboard 数据
 * - 今日概览：入库/出库/在库/滞留/异常 计数
 * - 环比：与昨日入库/出库对比
 * - 今日小时趋势：8:00-22:00 入库/出库双折线
 * - 待办：超期待提醒 + 异常未处理
 */

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 22;

@Injectable()
export class StatsService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 工作台概览数据 */
  async getDashboard(stationId: string) {
    const { todayStart, todayEnd, yesterdayStart, yesterdayEnd } = this.getDateRange();

    // 并行查询：原 9 次串行 → 7 次并行
    // 入库数与入库趋势合并（一次 select inbound_at 既拿 count 又拿小时分布）
    // 出库数与出库趋势合并（一次 select outbound_at 既拿 count 又拿小时分布）
    const [
      todayInboundRes,
      todayOutboundRes,
      yesterdayInboundRes,
      yesterdayOutboundRes,
      inStockRes,
      overdueRes,
      exceptionRes,
    ] = await Promise.all([
      // 今日入库：count + inbound_at 数据（用于小时趋势）
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('inbound_at', { count: 'exact' })
        .eq('station_id', stationId)
        .gte('inbound_at', todayStart)
        .lt('inbound_at', todayEnd),
      // 今日出库：count + outbound_at 数据（用于小时趋势）
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('outbound_at', { count: 'exact' })
        .eq('station_id', stationId)
        .eq('status', 'out_stock')
        .gte('outbound_at', todayStart)
        .lt('outbound_at', todayEnd),
      // 昨日入库（环比）
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .gte('inbound_at', yesterdayStart)
        .lt('inbound_at', yesterdayEnd),
      // 昨日出库（环比）
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('status', 'out_stock')
        .gte('outbound_at', yesterdayStart)
        .lt('outbound_at', yesterdayEnd),
      // 当前在库
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('status', 'in_stock'),
      // 当前滞留
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('status', 'overdue'),
      // 当前异常
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', stationId)
        .eq('status', 'exception'),
    ]);

    if (todayInboundRes.error) throw new Error(`查询今日入库失败: ${todayInboundRes.error.message}`);
    if (todayOutboundRes.error) throw new Error(`查询今日出库失败: ${todayOutboundRes.error.message}`);

    const hourly = this.buildHourly(
      (todayInboundRes.data as Array<{ inbound_at: string }>) || [],
      (todayOutboundRes.data as Array<{ outbound_at: string | null }>) || [],
    );

    const todayInbound = todayInboundRes.count || 0;
    const todayOutbound = todayOutboundRes.count || 0;
    const inStock = inStockRes.count || 0;
    const overdue = overdueRes.count || 0;
    const exception = exceptionRes.count || 0;

    return {
      today: {
        inbound: todayInbound,
        outbound: todayOutbound,
        inStock,
        overdue,
        exception,
      },
      yesterday: {
        inbound: yesterdayInboundRes.count || 0,
        outbound: yesterdayOutboundRes.count || 0,
      },
      hourly,
      todo: {
        overdueWarn: overdue,
        exceptionUnresolved: exception,
      },
    };
  }

  private getDateRange() {
    // 数据库存储 UTC，北京时间 00:00 = UTC 16:00 前一天
    // 这里用本地时间（服务器默认北京时间）算边界，转 ISO 串给 supabase
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(24, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    return {
      todayStart: todayStart.toISOString(),
      todayEnd: todayEnd.toISOString(),
      yesterdayStart: yesterdayStart.toISOString(),
      yesterdayEnd: yesterdayEnd.toISOString(),
    };
  }

  /** 按小时聚合（北京时间 8-22 点） */
  private buildHourly(
    inbound: Array<{ inbound_at: string }>,
    outbound: Array<{ outbound_at: string | null }>,
  ) {
    const hours: Array<{ hour: number; inbound: number; outbound: number }> = [];
    for (let h = BUSINESS_START_HOUR; h <= BUSINESS_END_HOUR; h++) {
      hours.push({ hour: h, inbound: 0, outbound: 0 });
    }
    // 服务端时区为本地（北京时间），getHours() 即北京时间小时
    for (const r of inbound) {
      const h = new Date(r.inbound_at).getHours();
      const slot = hours.find((x) => x.hour === h);
      if (slot) slot.inbound += 1;
    }
    for (const r of outbound) {
      if (!r.outbound_at) continue;
      const h = new Date(r.outbound_at).getHours();
      const slot = hours.find((x) => x.hour === h);
      if (slot) slot.outbound += 1;
    }
    return hours;
  }
}
