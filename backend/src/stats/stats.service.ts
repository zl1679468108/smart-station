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

    // 寄件待办 + 今日到件通知触达（并行，失败不拖垮工作台）
    const [shippingTodo, notify] = await Promise.all([
      this.getShippingTodo(stationId),
      this.getNotifyReach(stationId, todayStart, todayEnd),
    ]);

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
        shippingPending: shippingTodo.pending,
        shippingPicked: shippingTodo.picked,
      },
      notify,
    };
  }

  /** 寄件运营待办：待处理 / 已取件待发出 */
  private async getShippingTodo(stationId: string) {
    const empty = { pending: 0, picked: 0 };
    try {
      const [pendingRes, pickedRes] = await Promise.all([
        this.supabase
          .getClient()
          .from('ss_shippings')
          .select('id', { count: 'exact', head: true })
          .eq('station_id', stationId)
          .eq('status', 'pending'),
        this.supabase
          .getClient()
          .from('ss_shippings')
          .select('id', { count: 'exact', head: true })
          .eq('station_id', stationId)
          .eq('status', 'picked'),
      ]);
      if (pendingRes.error || pickedRes.error) {
        const msg = String(pendingRes.error?.message || pickedRes.error?.message || '');
        if (msg.includes('ss_shippings') || msg.includes('does not exist')) return empty;
        // eslint-disable-next-line no-console
        console.warn('[Stats] 寄件待办查询失败:', msg);
        return empty;
      }
      return {
        pending: pendingRes.count || 0,
        picked: pickedRes.count || 0,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Stats] 寄件待办异常:', err);
      return empty;
    }
  }

  /**
   * 今日到件通知触达统计（运营可观测）
   * - customerPushed：至少一条客户绑定通道发送成功
   * - customerUnbound：无任何客户绑定通道（未绑定）
   * - customerPushFailed：有绑定但全部失败
   * - sendFailed：整条通知 status=failed
   * - activeBindings：当前有效绑定人数
   */
  private async getNotifyReach(stationId: string, todayStart: string, todayEnd: string) {
    const empty = {
      inboundNotices: 0,
      customerPushed: 0,
      customerUnbound: 0,
      customerPushFailed: 0,
      sendFailed: 0,
      activeBindings: 0,
    };

    try {
      const [logsRes, bindRes] = await Promise.all([
        this.supabase
          .getClient()
          .from('ss_sms_logs')
          .select('status, params')
          .eq('station_id', stationId)
          .eq('template_code', 'inbound_notice')
          .gte('created_at', todayStart)
          .lt('created_at', todayEnd)
          .limit(2000),
        this.supabase
          .getClient()
          .from('ss_notify_bindings')
          .select('id', { count: 'exact', head: true })
          .eq('station_id', stationId)
          .eq('status', 'active'),
      ]);

      // 表未迁移时不阻断工作台
      if (logsRes.error) {
        const msg = String(logsRes.error.message || '');
        if (msg.includes('ss_sms_logs') || msg.includes('does not exist')) {
          return empty;
        }
        // 其他错误：返回空统计，不抛，避免拖垮 Dashboard
        // eslint-disable-next-line no-console
        console.warn('[Stats] 今日通知统计查询失败:', msg);
        return empty;
      }

      let customerPushed = 0;
      let customerUnbound = 0;
      let customerPushFailed = 0;
      let sendFailed = 0;
      const rows = (logsRes.data || []) as Array<{ status?: string; params?: unknown }>;

      for (const row of rows) {
        if (row.status === 'failed') {
          sendFailed += 1;
        }
        const params =
          row.params && typeof row.params === 'object'
            ? (row.params as Record<string, unknown>)
            : {};
        const channelResults = Array.isArray(params.channelResults)
          ? (params.channelResults as Array<{ channel?: string; ok?: boolean }>)
          : [];
        const customerResults = channelResults.filter((c) =>
          String(c.channel || '').startsWith('binding:'),
        );
        if (customerResults.length === 0) {
          customerUnbound += 1;
        } else if (customerResults.some((c) => c.ok)) {
          customerPushed += 1;
        } else {
          customerPushFailed += 1;
        }
      }

      let activeBindings = 0;
      if (!bindRes.error) {
        activeBindings = bindRes.count || 0;
      }

      return {
        inboundNotices: rows.length,
        customerPushed,
        customerUnbound,
        customerPushFailed,
        sendFailed,
        activeBindings,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Stats] 今日通知统计异常:', err);
      return empty;
    }
  }


  /**
   * 大屏实时动态：优先读 ss_parcel_events（按驿站过滤），
   * 无事件时回退到今日入库/出库包裹合成动态。
   */
  async getRecentEvents(stationId: string, limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

    // 1) 轨迹表（inner join 包裹以按 station 过滤）
    const eventsRes = await this.supabase
      .getClient()
      .from('ss_parcel_events')
      .select(
        `id, event_type, description, created_at, metadata,
         parcel:ss_parcels!inner(
           id, tracking_number, pickup_code, station_id, status,
           shelf:ss_shelves(number)
         )`,
      )
      .eq('parcel.station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (!eventsRes.error && eventsRes.data && eventsRes.data.length > 0) {
      return (eventsRes.data as any[]).map((row) => {
        const parcel = Array.isArray(row.parcel) ? row.parcel[0] : row.parcel;
        const shelf = parcel?.shelf
          ? Array.isArray(parcel.shelf)
            ? parcel.shelf[0]
            : parcel.shelf
          : null;
        return this.normalizeEvent({
          id: row.id,
          eventType: row.event_type,
          description: row.description,
          createdAt: row.created_at,
          trackingNumber: parcel?.tracking_number ?? null,
          pickupCode: parcel?.pickup_code ?? row.metadata?.pickup_code ?? null,
          shelfNumber: shelf?.number ?? row.metadata?.shelf_number ?? null,
          metadata: row.metadata ?? null,
        });
      });
    }

    // 2) 回退：最近入库/出库包裹
    const { todayStart } = this.getDateRange();
    const [inboundRes, outboundRes] = await Promise.all([
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select(
          'id, tracking_number, pickup_code, inbound_at, status, shelf:ss_shelves(number)',
        )
        .eq('station_id', stationId)
        .gte('inbound_at', todayStart)
        .order('inbound_at', { ascending: false })
        .limit(safeLimit),
      this.supabase
        .getClient()
        .from('ss_parcels')
        .select(
          'id, tracking_number, pickup_code, outbound_at, status, shelf:ss_shelves(number)',
        )
        .eq('station_id', stationId)
        .eq('status', 'out_stock')
        .not('outbound_at', 'is', null)
        .gte('outbound_at', todayStart)
        .order('outbound_at', { ascending: false })
        .limit(safeLimit),
    ]);

    const merged: any[] = [];
    for (const row of (inboundRes.data as any[]) || []) {
      const shelf = Array.isArray(row.shelf) ? row.shelf[0] : row.shelf;
      merged.push(
        this.normalizeEvent({
          id: `in-${row.id}`,
          eventType: 'inbound',
          description: `入库，取件码 ${row.pickup_code || '-'}`,
          createdAt: row.inbound_at,
          trackingNumber: row.tracking_number,
          pickupCode: row.pickup_code,
          shelfNumber: shelf?.number ?? null,
          metadata: null,
        }),
      );
    }
    for (const row of (outboundRes.data as any[]) || []) {
      const shelf = Array.isArray(row.shelf) ? row.shelf[0] : row.shelf;
      merged.push(
        this.normalizeEvent({
          id: `out-${row.id}`,
          eventType: 'outbound',
          description: `出库，取件码 ${row.pickup_code || '-'}`,
          createdAt: row.outbound_at,
          trackingNumber: row.tracking_number,
          pickupCode: row.pickup_code,
          shelfNumber: shelf?.number ?? null,
          metadata: null,
        }),
      );
    }

    merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return merged.slice(0, safeLimit);
  }

  private normalizeEvent(input: {
    id: string;
    eventType: string;
    description: string | null;
    createdAt: string;
    trackingNumber: string | null;
    pickupCode: string | null;
    shelfNumber: number | null;
    metadata: any;
  }) {
    const tone = this.eventTone(input.eventType);
    const text =
      input.description ||
      this.defaultEventText(input.eventType, input.pickupCode, input.shelfNumber);
    return {
      id: input.id,
      eventType: input.eventType,
      tone,
      text,
      createdAt: input.createdAt,
      trackingNumber: input.trackingNumber,
      pickupCode: input.pickupCode,
      shelfNumber: input.shelfNumber,
    };
  }

  private eventTone(eventType: string): 'ok' | 'warn' | 'danger' | 'info' {
    if (eventType === 'outbound') return 'ok';
    if (eventType === 'inbound') return 'info';
    if (eventType?.startsWith('overdue')) return 'warn';
    if (eventType?.startsWith('exception') || eventType?.startsWith('return')) return 'danger';
    return 'info';
  }

  private defaultEventText(
    eventType: string,
    pickupCode: string | null,
    shelfNumber: number | null,
  ) {
    const code = pickupCode || '-';
    const shelf = shelfNumber != null ? `#${shelfNumber}` : '货架';
    switch (eventType) {
      case 'inbound':
        return `入库 ${code} → ${shelf}`;
      case 'outbound':
        return `出库 ${code}`;
      case 'overdue_warn':
        return `超期预警 ${code}`;
      case 'overdue_remind':
        return `超期提醒 ${code}`;
      case 'exception_register':
        return `异常登记 ${code}`;
      case 'exception_resolve':
        return `异常处理完成 ${code}`;
      default:
        return eventType || '业务动态';
    }
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
