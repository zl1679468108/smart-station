import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { NotifyService } from '../notify/notify.service';
import { OverdueQueryDto } from './dto/overdue-query.dto';
import { ReturnActionDto } from './dto/return-action.dto';

type OverdueLevel = 'warn' | 'remind' | 'return';
type ReturnStage = 'none' | 'pending' | 'returning' | 'returned';

@Injectable()
export class OverdueService {
  private readonly logger = new Logger(OverdueService.name);

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  /** 每天 09:00 北京时间扫描全部活跃驿站 */
  @Cron('0 9 * * *', { timeZone: 'Asia/Shanghai' })
  async scheduledScanAll() {
    this.logger.log('开始定时滞留扫描...');
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
      for (const s of stations || []) {
        try {
          const r = await this.scanStation(s.id);
          this.logger.log(
            `驿站 ${s.id} 扫描完成 marked=${r.markedOverdue} remind=${r.reminded}`,
          );
        } catch (e: any) {
          this.logger.error(`驿站 ${s.id} 扫描失败: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`定时扫描异常: ${e?.message || e}`);
    }
  }

  async list(stationId: string, q: OverdueQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const client = this.supabase.getClient();

    const station = await this.getStationThresholds(stationId);
    const { data: parcels, error } = await client
      .from('ss_parcels')
      .select(
        `id, tracking_number, pickup_code, recipient_name, recipient_phone, inbound_at, status, note,
         shelf:ss_shelves(id, number, size_type),
         courier:ss_courier_companies(id, name, code)`,
      )
      .eq('station_id', stationId)
      .in('status', ['in_stock', 'overdue', 'returned'])
      .order('inbound_at', { ascending: true });

    if (error) throw new Error(`查询滞留列表失败: ${error.message}`);

    const parcelIds = (parcels || []).map((p: any) => p.id);
    const eventMap = await this.loadReturnEvents(parcelIds);

    let items = (parcels || [])
      .map((p: any) => this.toListItem(p, station, eventMap.get(p.id)))
      .filter((item) => {
        if (item.status === 'returned') return false;
        if (item.returnStage === 'returning') return true;
        return item.level !== null;
      });

    if (q.keyword?.trim()) {
      const kw = q.keyword.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.trackingNumber || '').toLowerCase().includes(kw) ||
          (i.pickupCode || '').toLowerCase().includes(kw) ||
          (i.recipientPhone || '').includes(kw) ||
          (i.recipientName || '').toLowerCase().includes(kw),
      );
    }

    // 各级别数量（在当前关键字过滤后、级别 Tab 过滤前统计，供前端 Tab 角标展示）
    const counts = {
      all: items.length,
      warn: items.filter((i) => i.level === 'warn').length,
      remind: items.filter((i) => i.level === 'remind').length,
      return: items.filter((i) => i.level === 'return' || i.returnStage === 'returning')
        .length,
    };

    if (q.level) {
      items = items.filter(
        (i) => i.level === q.level || (q.level === 'return' && i.returnStage === 'returning'),
      );
    }

    // 按级别严重程度 + 天数倒序
    const levelRank = { return: 3, remind: 2, warn: 1 };
    items.sort((a, b) => {
      const lr = (levelRank[b.level || 'warn'] || 0) - (levelRank[a.level || 'warn'] || 0);
      if (lr !== 0) return lr;
      return b.days - a.days;
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    return {
      items: pageItems,
      total,
      page,
      pageSize,
      counts,
      thresholds: {
        warnDays: station.warnDays,
        remindDays: station.remindDays,
        returnDays: station.returnDays,
      },
    };
  }

  async scan(stationId: string) {
    return this.scanStation(stationId);
  }

  /**
   * 单件补发滞留提醒（运营打磨）
   * - 不依赖是否已扫过「二次提醒」事件，店员可随时补发
   * - 失败不抛业务外错误；返回 staffMessage 白话
   */
  async remindOne(stationId: string, parcelId: string) {
    const client = this.supabase.getClient();
    const { data: parcel, error } = await client
      .from('ss_parcels')
      .select(
        'id, status, inbound_at, recipient_phone, recipient_name, pickup_code, tracking_number, station_id',
      )
      .eq('id', parcelId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询包裹失败: ${error.message}`);
    if (!parcel) throw new NotFoundException('包裹不存在');
    if (!['in_stock', 'overdue'].includes(String(parcel.status))) {
      throw new BadRequestException('仅在库/滞留包裹可发提醒');
    }
    if (!parcel.recipient_phone) {
      throw new BadRequestException('包裹无收件手机号，无法发提醒');
    }

    const station = await this.getStationThresholds(stationId);
    const days = parcel.inbound_at ? this.daysSince(parcel.inbound_at) : 0;
    if (days < station.warnDays) {
      throw new BadRequestException(
        `入库未满 ${station.warnDays} 天，尚未进入滞留预警，无需发滞留提醒`,
      );
    }

    // 可选：标记为 overdue
    if (parcel.status === 'in_stock') {
      await client.from('ss_parcels').update({ status: 'overdue' }).eq('id', parcelId);
    }

    await this.insertEvent(
      stationId,
      parcelId,
      'overdue_remind',
      `店员补发滞留提醒（已到 ${days} 天）`,
    );

    const nr = await this.notify.sendOverdueRemind({
      phone: String(parcel.recipient_phone),
      recipientName: parcel.recipient_name as string | null,
      days,
      pickupCode: parcel.pickup_code as string | undefined,
      parcelId,
      stationId,
      stationName: station.name,
    });

    return {
      id: parcelId,
      days,
      trackingNumber: parcel.tracking_number,
      pickupCode: parcel.pickup_code,
      customerBound: nr.customerBound,
      customerPushed: nr.customerPushed,
      staffMessage: nr.staffMessage,
    };
  }

  /**
   * 批量补发滞留提醒（运营打磨）
   * - 单条失败不阻断其余
   * - 最多 30 条
   */
  async remindBatch(stationId: string, ids: string[]) {
    const unique = Array.from(new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (unique.length === 0) {
      throw new BadRequestException('请选择要提醒的包裹');
    }
    if (unique.length > 30) {
      throw new BadRequestException('一次最多提醒 30 条');
    }

    const results: Array<{
      id: string;
      ok: boolean;
      customerBound?: boolean;
      customerPushed?: boolean;
      staffMessage: string;
    }> = [];

    let pushed = 0;
    let unbound = 0;
    let failed = 0;

    for (const id of unique) {
      try {
        const r = await this.remindOne(stationId, id);
        results.push({
          id,
          ok: true,
          customerBound: r.customerBound,
          customerPushed: r.customerPushed,
          staffMessage: r.staffMessage,
        });
        if (r.customerPushed) pushed += 1;
        else if (!r.customerBound) unbound += 1;
        else failed += 1;
      } catch (e: any) {
        failed += 1;
        results.push({
          id,
          ok: false,
          staffMessage: e?.message || '发送失败',
        });
      }
    }

    return {
      total: unique.length,
      pushed,
      unbound,
      failed,
      staffMessage: `批量提醒完成：已私信 ${pushed}，未绑定 ${unbound}，失败 ${failed}（共 ${unique.length} 条）`,
      results,
    };
  }

  async returnAction(stationId: string, parcelId: string, dto: ReturnActionDto, operatorId: string) {
    const client = this.supabase.getClient();
    const { data: parcel, error } = await client
      .from('ss_parcels')
      .select('id, status, tracking_number, pickup_code, station_id')
      .eq('id', parcelId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询包裹失败: ${error.message}`);
    if (!parcel) throw new NotFoundException('包裹不存在');

    if (dto.action === 'start') {
      if (parcel.status === 'returned') {
        throw new BadRequestException('包裹已退回');
      }
      if (!['in_stock', 'overdue', 'exception'].includes(parcel.status)) {
        throw new BadRequestException('当前状态不可发起退回');
      }
      // 确保为 overdue
      if (parcel.status === 'in_stock') {
        await client.from('ss_parcels').update({ status: 'overdue' }).eq('id', parcelId);
      }
      await client.from('ss_parcel_events').insert({
        parcel_id: parcelId,
        event_type: 'return_start',
        operator_id: operatorId,
        operator_type: 'staff',
        description: dto.note || '标记退回中',
        metadata: { trackingNumber: parcel.tracking_number, pickupCode: parcel.pickup_code },
      });
      return { id: parcelId, returnStage: 'returning' as ReturnStage };
    }

    // complete
    if (parcel.status === 'returned') {
      return { id: parcelId, returnStage: 'returned' as ReturnStage };
    }
    const { error: upErr } = await client
      .from('ss_parcels')
      .update({ status: 'returned' })
      .eq('id', parcelId)
      .eq('station_id', stationId);
    if (upErr) throw new Error(`完成退回失败: ${upErr.message}`);

    await client.from('ss_parcel_events').insert({
      parcel_id: parcelId,
      event_type: 'return_complete',
      operator_id: operatorId,
      operator_type: 'staff',
      description: dto.note || '已退回',
    });
    return { id: parcelId, returnStage: 'returned' as ReturnStage };
  }

  // ---- helpers ----

  private async scanStation(stationId: string) {
    const client = this.supabase.getClient();
    const station = await this.getStationThresholds(stationId);
    const { data: parcels, error } = await client
      .from('ss_parcels')
      .select('id, status, inbound_at, recipient_phone, recipient_name, pickup_code')
      .eq('station_id', stationId)
      .in('status', ['in_stock', 'overdue']);
    if (error) throw new Error(`扫描查询失败: ${error.message}`);

    let markedOverdue = 0;
    let warned = 0;
    let reminded = 0;
    let returnCandidates = 0;
    let customerNotified = 0;
    let customerUnbound = 0;
    const now = Date.now();

    const ids = (parcels || []).map((p) => p.id);
    const existingEvents = await this.loadEventTypes(ids);

    for (const p of parcels || []) {
      if (!p.inbound_at) continue;
      const days = this.daysSince(p.inbound_at, now);
      const level = this.computeLevel(days, station);
      if (!level) continue;

      if (p.status === 'in_stock' && days >= station.warnDays) {
        const { error: uErr } = await client
          .from('ss_parcels')
          .update({ status: 'overdue' })
          .eq('id', p.id);
        if (!uErr) markedOverdue += 1;
      }

      const types = existingEvents.get(p.id) || new Set<string>();
      if (level === 'warn' || level === 'remind' || level === 'return') {
        if (!types.has('overdue_warn') && days >= station.warnDays) {
          await this.insertEvent(stationId, p.id, 'overdue_warn', `超期 ${days} 天预警`);
          types.add('overdue_warn');
          warned += 1;
        }
      }
      if ((level === 'remind' || level === 'return') && !types.has('overdue_remind')) {
        await this.insertEvent(stationId, p.id, 'overdue_remind', `超期 ${days} 天二次提醒`);
        types.add('overdue_remind');
        reminded += 1;
        // 免费通道通知（console/wecom/serverchan），不阻断
        try {
          if (p.recipient_phone) {
            const nr = await this.notify.sendOverdueRemind({
              phone: p.recipient_phone,
              recipientName: p.recipient_name,
              days,
              pickupCode: p.pickup_code,
              parcelId: p.id,
              stationId,
              stationName: station.name,
            });
            if (nr.customerPushed) customerNotified += 1;
            else if (!nr.customerBound) customerUnbound += 1;
          }
        } catch {
          /* ignore */
        }
      }
      if (level === 'return') returnCandidates += 1;
    }

    return {
      scanned: (parcels || []).length,
      markedOverdue,
      warned,
      reminded,
      returnCandidates,
      customerNotified,
      customerUnbound,
    };
  }

  private async getStationThresholds(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id, name, overdue_warn_days, overdue_remind_days, overdue_return_days')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询驿站失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return {
      id: data.id as string,
      name: (data.name as string) || '驿站',
      warnDays: Number(data.overdue_warn_days) || 3,
      remindDays: Number(data.overdue_remind_days) || 7,
      returnDays: Number(data.overdue_return_days) || 15,
    };
  }

  private daysSince(inboundAt: string, nowMs = Date.now()): number {
    const t = new Date(inboundAt).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.floor((nowMs - t) / (24 * 3600 * 1000)));
  }

  private computeLevel(
    days: number,
    station: { warnDays: number; remindDays: number; returnDays: number },
  ): OverdueLevel | null {
    if (days >= station.returnDays) return 'return';
    if (days >= station.remindDays) return 'remind';
    if (days >= station.warnDays) return 'warn';
    return null;
  }

  private toListItem(
    p: any,
    station: { warnDays: number; remindDays: number; returnDays: number },
    events?: { hasStart: boolean; hasComplete: boolean },
  ) {
    const days = p.inbound_at ? this.daysSince(p.inbound_at) : 0;
    let level = this.computeLevel(days, station);
    if (p.status === 'overdue' && !level) level = 'warn';

    let returnStage: ReturnStage = 'none';
    if (p.status === 'returned' || events?.hasComplete) returnStage = 'returned';
    else if (events?.hasStart) returnStage = 'returning';
    else if (level === 'return') returnStage = 'pending';

    return {
      id: p.id as string,
      trackingNumber: p.tracking_number as string,
      pickupCode: p.pickup_code as string,
      recipientName: p.recipient_name as string,
      recipientPhone: p.recipient_phone as string,
      inboundAt: p.inbound_at as string,
      days,
      level,
      returnStage,
      status: p.status as string,
      note: p.note as string | null,
      shelf: p.shelf
        ? { id: p.shelf.id, number: p.shelf.number, sizeType: p.shelf.size_type }
        : null,
      courier: p.courier
        ? { id: p.courier.id, name: p.courier.name, code: p.courier.code }
        : null,
    };
  }

  private async loadReturnEvents(parcelIds: string[]) {
    const map = new Map<string, { hasStart: boolean; hasComplete: boolean }>();
    if (parcelIds.length === 0) return map;
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_parcel_events')
      .select('parcel_id, event_type')
      .in('parcel_id', parcelIds)
      .in('event_type', ['return_start', 'return_complete']);
    if (error) return map;
    for (const e of data || []) {
      const cur = map.get(e.parcel_id) || { hasStart: false, hasComplete: false };
      if (e.event_type === 'return_start') cur.hasStart = true;
      if (e.event_type === 'return_complete') cur.hasComplete = true;
      map.set(e.parcel_id, cur);
    }
    return map;
  }

  private async loadEventTypes(parcelIds: string[]) {
    const map = new Map<string, Set<string>>();
    if (parcelIds.length === 0) return map;
    const { data } = await this.supabase
      .getClient()
      .from('ss_parcel_events')
      .select('parcel_id, event_type')
      .in('parcel_id', parcelIds)
      .in('event_type', ['overdue_warn', 'overdue_remind']);
    for (const e of data || []) {
      if (!map.has(e.parcel_id)) map.set(e.parcel_id, new Set());
      map.get(e.parcel_id)!.add(e.event_type);
    }
    return map;
  }

  private async insertEvent(
    stationId: string,
    parcelId: string,
    eventType: string,
    note: string,
  ) {
    await this.supabase.getClient().from('ss_parcel_events').insert({
      parcel_id: parcelId,
      event_type: eventType,
      description: note,
      operator_type: 'staff',
    });
  }
}
