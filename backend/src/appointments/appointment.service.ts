import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotifyService } from '../notify/notify.service';
import {
  AppointmentListQueryDto,
  CreateAppointmentDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';

/** 默认可选时段（营业高峰友好，轻量固定档） */
const DEFAULT_SLOTS: { start: string; end: string; label: string }[] = [
  { start: '10:00', end: '12:00', label: '上午 10-12 点' },
  { start: '14:00', end: '16:00', label: '下午 14-16 点' },
  { start: '16:00', end: '18:00', label: '傍晚 16-18 点' },
  { start: '18:00', end: '20:00', label: '晚上 18-20 点' },
  { start: '20:00', end: '21:00', label: '晚间 20-21 点' },
];

/** 每个时段最多预约数（防挤兑，试验期宽松） */
const MAX_PER_SLOT = 30;
/** 同一手机号最多挂着的未完成预约 */
const MAX_ACTIVE_PER_PHONE = 3;
/** 可预约未来天数（含今天） */
const DAYS_AHEAD = 3;

/**
 * 轻量预约取件
 * - 客户：选日 + 选时段 + 留手机号
 * - 店员：列表确认 / 到店完成 / 取消 / 爽约
 */
@Injectable()
export class AppointmentService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  /** 解析驿站 ID：显式优先，否则第一个 active */
  async resolveStationId(stationId?: string): Promise<string> {
    if (stationId) return stationId;
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`解析驿站失败: ${error.message}`);
    if (!data?.id) throw new BadRequestException('暂无可用驿站');
    return data.id as string;
  }

  /** 可预约日期 + 时段（含余量） */
  async getSlots(stationId?: string) {
    const sid = await this.resolveStationId(stationId);
    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id, name, address, contact_phone, business_hours')
      .eq('id', sid)
      .maybeSingle();

    const today = this.beijingToday();
    const nowHm = this.beijingNowHm();
    const dates: string[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      dates.push(this.addDays(today, i));
    }

    // 拉取这几天的有效预约计数
    const { data: rows, error } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select('slot_date, slot_start, status')
      .eq('station_id', sid)
      .in('slot_date', dates)
      .in('status', ['pending', 'confirmed']);
    if (error) throw new Error(`查询预约时段失败: ${error.message}`);

    const countMap = new Map<string, number>();
    for (const r of rows || []) {
      const d = String(r.slot_date).slice(0, 10);
      const s = String(r.slot_start).slice(0, 5);
      const key = `${d}|${s}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    const days = dates.map((date) => {
      const isToday = date === today;
      const slots = DEFAULT_SLOTS.map((slot) => {
        const booked = countMap.get(`${date}|${slot.start}`) || 0;
        const remaining = Math.max(0, MAX_PER_SLOT - booked);
        // 今天已过的时段不可选
        const past = isToday && slot.end <= nowHm;
        const available = !past && remaining > 0;
        return {
          start: slot.start,
          end: slot.end,
          label: slot.label,
          booked,
          remaining,
          available,
          reason: past ? '已过时' : remaining <= 0 ? '已约满' : null,
        };
      });
      return {
        date,
        weekday: this.weekdayLabel(date),
        isToday,
        slots,
      };
    });

    return {
      stationId: sid,
      stationName: (station?.name as string) || null,
      businessHours: (station?.business_hours as string) || null,
      address: (station?.address as string) || null,
      contactPhone: (station?.contact_phone as string) || null,
      maxPerSlot: MAX_PER_SLOT,
      days,
    };
  }

  /** 客户提交预约 */
  async createPublic(dto: CreateAppointmentDto, stationId?: string) {
    const sid = await this.resolveStationId(stationId);
    const item = await this.createInternal(sid, dto, 'query');
    const notifyHint = await this.notifyAppointmentCreated(sid, item);
    return { ...item, notifyHint };
  }

  /** 内部创建 */
  private async createInternal(
    stationId: string,
    dto: CreateAppointmentDto,
    source: 'query' | 'admin',
  ) {
    const slotDate = dto.slotDate.slice(0, 10);
    const slotStart = dto.slotStart.slice(0, 5);
    const slotEnd = dto.slotEnd.slice(0, 5);
    this.assertValidSlot(slotDate, slotStart, slotEnd);

    // 同手机号未完成预约上限
    const { count: activeCount, error: cErr } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('station_id', stationId)
      .eq('recipient_phone', dto.phone)
      .in('status', ['pending', 'confirmed']);
    if (cErr) throw new Error(`校验预约失败: ${cErr.message}`);
    if ((activeCount || 0) >= MAX_ACTIVE_PER_PHONE) {
      throw new BadRequestException(
        `您已有 ${MAX_ACTIVE_PER_PHONE} 条未完成预约，请先到店取件或取消后再约`,
      );
    }

    // 时段余量
    const { count: slotCount, error: sErr } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('station_id', stationId)
      .eq('slot_date', slotDate)
      .eq('slot_start', `${slotStart}:00`)
      .in('status', ['pending', 'confirmed']);
    if (sErr) throw new Error(`校验时段失败: ${sErr.message}`);
    if ((slotCount || 0) >= MAX_PER_SLOT) {
      throw new BadRequestException('该时段已约满，请换其他时段');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .insert({
        station_id: stationId,
        recipient_phone: dto.phone,
        recipient_name: (dto.recipientName || '').trim() || null,
        slot_date: slotDate,
        slot_start: `${slotStart}:00`,
        slot_end: `${slotEnd}:00`,
        note: (dto.note || '').trim() || null,
        status: 'pending',
        source,
      })
      .select(
        `id, station_id, recipient_phone, recipient_name, slot_date, slot_start, slot_end,
         note, status, source, cancel_reason, handled_by, handled_at, created_at, updated_at`,
      )
      .maybeSingle();
    if (error) throw new Error(`提交预约失败: ${error.message}`);
    if (!data) throw new Error('提交预约失败：未返回数据');
    return this.mapRow(data);
  }

  /** 客户查自己的预约（最近 10 条） */
  async listMine(phone: string, stationId?: string) {
    const sid = await this.resolveStationId(stationId);
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select(
        `id, station_id, recipient_phone, recipient_name, slot_date, slot_start, slot_end,
         note, status, source, cancel_reason, handled_by, handled_at, created_at, updated_at`,
      )
      .eq('station_id', sid)
      .eq('recipient_phone', phone)
      .order('slot_date', { ascending: false })
      .order('slot_start', { ascending: false })
      .limit(10);
    if (error) throw new Error(`查询我的预约失败: ${error.message}`);
    return {
      items: (data || []).map((r) => this.mapRow(r, true)),
    };
  }

  /** 客户取消自己的预约 */
  async cancelMine(id: string, phone: string, stationId?: string) {
    const sid = await this.resolveStationId(stationId);
    const { data: row, error } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select('id, status, recipient_phone, station_id')
      .eq('id', id)
      .eq('station_id', sid)
      .maybeSingle();
    if (error) throw new Error(`查询预约失败: ${error.message}`);
    if (!row) throw new NotFoundException('预约不存在');
    if (row.recipient_phone !== phone) {
      throw new BadRequestException('手机号与预约不匹配');
    }
    if (!['pending', 'confirmed'].includes(row.status)) {
      throw new BadRequestException('该预约已结束，无法取消');
    }

    const { data, error: uErr } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .update({
        status: 'cancelled',
        cancel_reason: '客户自行取消',
        handled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `id, station_id, recipient_phone, recipient_name, slot_date, slot_start, slot_end,
         note, status, source, cancel_reason, handled_by, handled_at, created_at, updated_at`,
      )
      .maybeSingle();
    if (uErr) throw new Error(`取消预约失败: ${uErr.message}`);
    if (!data) throw new Error('取消预约失败：未返回数据');
    return this.mapRow(data, true);
  }

  /** 店员列表 */
  async listStaff(stationId: string, q: AppointmentListQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select(
        `id, station_id, recipient_phone, recipient_name, slot_date, slot_start, slot_end,
         note, status, source, cancel_reason, handled_by, handled_at, created_at, updated_at`,
        { count: 'exact' },
      )
      .eq('station_id', stationId);

    if (q.slotDate) query = query.eq('slot_date', q.slotDate.slice(0, 10));
    if (q.status) query = query.eq('status', q.status);
    if (q.phone) {
      const p = q.phone.trim();
      if (p) query = query.ilike('recipient_phone', `%${p}%`);
    }

    query = query
      .order('slot_date', { ascending: true })
      .order('slot_start', { ascending: true })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询预约列表失败: ${error.message}`);

    return {
      items: (data || []).map((r) => this.mapRow(r, false)),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  /** 店员更新状态 */
  async updateStatus(
    stationId: string,
    operatorId: string,
    id: string,
    dto: UpdateAppointmentStatusDto,
  ) {
    const { data: row, error } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .select('id, status, station_id')
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询预约失败: ${error.message}`);
    if (!row) throw new NotFoundException('预约不存在');

    const patch: Record<string, unknown> = {
      status: dto.status,
      handled_by: operatorId,
      handled_at: new Date().toISOString(),
    };
    if (dto.status === 'cancelled') {
      patch.cancel_reason = (dto.cancelReason || '').trim() || '店员取消';
    }

    const { data, error: uErr } = await this.supabase
      .getClient()
      .from('ss_pickup_appointments')
      .update(patch)
      .eq('id', id)
      .eq('station_id', stationId)
      .select(
        `id, station_id, recipient_phone, recipient_name, slot_date, slot_start, slot_end,
         note, status, source, cancel_reason, handled_by, handled_at, created_at, updated_at`,
      )
      .maybeSingle();
    if (uErr) throw new Error(`更新预约失败: ${uErr.message}`);
    if (!data) throw new Error('更新预约失败：未返回数据');
    const mapped = this.mapRow(data, false);
    if (dto.status === 'confirmed') {
      // 失败不阻断状态更新
      try {
        await this.notifyAppointmentConfirmed(stationId, {
          recipientPhone: String(data.recipient_phone || mapped.recipientPhone),
          recipientName: mapped.recipientName,
          slotDate: mapped.slotDate,
          slotLabel: mapped.slotLabel,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Appointment] 确认通知失败:', e instanceof Error ? e.message : e);
      }
    }
    return mapped;
  }

  // ---------- helpers ----------


  private async getStationName(stationId: string): Promise<string> {
    const { data } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('name')
      .eq('id', stationId)
      .maybeSingle();
    return (data?.name as string) || '智能快递驿站';
  }

  private async notifyAppointmentCreated(
    stationId: string,
    item: {
      recipientPhone: string;
      recipientName: string | null;
      slotDate: string;
      slotLabel: string;
    },
  ): Promise<string | null> {
    try {
      const stationName = await this.getStationName(stationId);
      const res = await this.notify.sendAppointmentCreated({
        stationName,
        phone: item.recipientPhone,
        recipientName: item.recipientName,
        slotDate: item.slotDate,
        slotLabel: item.slotLabel,
        stationId,
      });
      if (res.customerPushed) return '预约提醒已发到您绑定的微信，请注意查收';
      if (!res.customerBound) {
        return '预约已登记。绑定微信通知后可自动收提醒；也可在本页「查我的预约」查看';
      }
      return '预约已登记，微信提醒发送失败，请以本页预约记录为准';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Appointment] 创建通知失败:', e instanceof Error ? e.message : e);
      return '预约已登记（提醒通道暂不可用，请记住时段到店）';
    }
  }

  private async notifyAppointmentConfirmed(
    stationId: string,
    item: {
      recipientPhone: string;
      recipientName: string | null;
      slotDate: string;
      slotLabel: string;
    },
  ): Promise<void> {
    const stationName = await this.getStationName(stationId);
    await this.notify.sendAppointmentConfirmed({
      stationName,
      phone: item.recipientPhone,
      recipientName: item.recipientName,
      slotDate: item.slotDate,
      slotLabel: item.slotLabel,
      stationId,
    });
  }

  private assertValidSlot(slotDate: string, slotStart: string, slotEnd: string) {
    const today = this.beijingToday();
    const maxDate = this.addDays(today, DAYS_AHEAD - 1);
    if (slotDate < today || slotDate > maxDate) {
      throw new BadRequestException(`只能预约今天起 ${DAYS_AHEAD} 天内的时段`);
    }
    const matched = DEFAULT_SLOTS.find((s) => s.start === slotStart && s.end === slotEnd);
    if (!matched) {
      throw new BadRequestException('所选时段无效，请重新选择');
    }
    if (slotDate === today && slotEnd <= this.beijingNowHm()) {
      throw new BadRequestException('该时段已过，请选其他时段');
    }
  }

  private mapRow(row: any, maskPhone = false) {
    const phone = String(row.recipient_phone || '');
    const handler = Array.isArray(row.handler) ? row.handler[0] : row.handler;
    return {
      id: row.id,
      stationId: row.station_id,
      recipientPhone: maskPhone && phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone,
      recipientPhoneFull: maskPhone ? undefined : phone,
      recipientName: row.recipient_name || null,
      slotDate: String(row.slot_date).slice(0, 10),
      slotStart: String(row.slot_start).slice(0, 5),
      slotEnd: String(row.slot_end).slice(0, 5),
      slotLabel: this.slotLabel(String(row.slot_start).slice(0, 5), String(row.slot_end).slice(0, 5)),
      note: row.note || null,
      status: row.status,
      statusLabel: this.statusLabel(row.status),
      source: row.source,
      cancelReason: row.cancel_reason || null,
      handledBy: row.handled_by || null,
      handledByName: handler?.username || null,
      handledAt: row.handled_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private slotLabel(start: string, end: string): string {
    const found = DEFAULT_SLOTS.find((s) => s.start === start && s.end === end);
    return found?.label || `${start}-${end}`;
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: '待确认',
      confirmed: '已确认',
      completed: '已到店',
      cancelled: '已取消',
      no_show: '未到店',
    };
    return map[status] || status;
  }

  /** 北京时间今天 YYYY-MM-DD */
  private beijingToday(): string {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
      now.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  /** 北京时间当前 HH:mm */
  private beijingNowHm(): string {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }

  private addDays(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
      dt.getUTCDate(),
    ).padStart(2, '0')}`;
  }

  private weekdayLabel(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const map = ['日', '一', '二', '三', '四', '五', '六'];
    return `周${map[dt.getUTCDay()]}`;
  }
}
