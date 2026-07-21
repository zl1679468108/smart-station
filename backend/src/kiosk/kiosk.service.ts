import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  SendCodeDto,
  QueryByPhoneDto,
  QueryByPhoneDirectDto,
  QueryByTrackingDto,
  QueryByCodeDto,
} from './dto/kiosk.dto';

/**
 * Kiosk 取件自助查询服务
 * - 公开接口（@Public）
 * - 限流：同 IP 每分钟 ≤10 次（ThrottlerGuard）；直查接口更严
 * - 验证码：同手机号每小时 ≤5 次
 * - 脱敏：手机号仅尾号 4 位，姓名首字 + **
 * - 驿站隔离：查询强制 station_id（显式 stationId 或默认第一个 active 驿站）
 * - 取件码错误锁定：ss_pickup_code_attempts（与出库侧同表，多实例一致）
 */

const CODE_TTL_MINUTES = 5;
const MAX_SEND_PER_HOUR = 5;
const MAX_CODE_QUERY_ATTEMPTS = 5;
const CODE_QUERY_LOCK_MINUTES = 10;

@Injectable()
export class KioskService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 发送验证码（v1.0 仅写入数据库 + log，不真实发短信） */
  async sendCode(dto: SendCodeDto, ip?: string, _stationId?: string) {
    // 限流：同手机号 1 小时内 ≤5 次
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', dto.phone)
      .gte('created_at', oneHourAgo);
    if (countErr) throw new Error(`查询验证码次数失败: ${countErr.message}`);
    if ((count || 0) >= MAX_SEND_PER_HOUR) {
      throw new ForbiddenException('该手机号验证码请求过于频繁，请稍后再试');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error } = await this.supabase.getClient().from('ss_kiosk_codes').insert({
      phone: dto.phone,
      code,
      expires_at: expiresAt,
      ip_address: ip || null,
    });
    if (error) throw new Error(`验证码发送失败: ${error.message}`);

    // 生产环境应通过 NotifyService 调用第三方短信网关
    // eslint-disable-next-line no-console
    console.log(`[Kiosk] 验证码 -> ${dto.phone}: ${code}（${CODE_TTL_MINUTES} 分钟内有效）`);

    return { sent: true, ttlSeconds: CODE_TTL_MINUTES * 60 };
  }

  /** 手机号尾号 + 验证码查询 */
  async queryByPhone(dto: QueryByPhoneDto, stationId?: string) {
    const { data: codeRows, error: codeErr } = await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .select('id, phone, code, expires_at, used_at')
      .like('phone', `%${dto.phoneTail}`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (codeErr) throw new Error(`验证码查询失败: ${codeErr.message}`);

    const matched = (codeRows || []).find(
      (r: any) => r.code === dto.code && !r.used_at && new Date(r.expires_at).getTime() > Date.now(),
    );
    if (!matched) {
      throw new BadRequestException('验证码错误或已过期');
    }

    await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matched.id);

    const phone = (matched as any).phone as string;
    return this.queryInStockParcels({ recipientPhone: phone, stationId });
  }

  /** 运单号查询（无需验证码） */
  async queryByTracking(dto: QueryByTrackingDto, stationId?: string) {
    return this.queryInStockParcels({
      trackingNumber: dto.trackingNumber.trim().toUpperCase(),
      stationId,
    });
  }

  /** 手机号直接查询（脱敏返回） */
  async queryByPhoneDirect(dto: QueryByPhoneDirectDto, stationId?: string) {
    return this.queryInStockParcels({ recipientPhone: dto.phone, stationId });
  }

  /** 取件码查询（错误 5 次锁定 10 分钟，落库） */
  async queryByCode(dto: QueryByCodeDto, stationId?: string) {
    const resolvedStationId = await this.resolveStationId(stationId);
    await this.checkCodeQueryLock(resolvedStationId, dto.code);

    const result = await this.queryInStockParcels({
      pickupCode: dto.code,
      stationId: resolvedStationId,
    });

    if (result.total === 0) {
      await this.recordCodeQueryFailure(resolvedStationId, dto.code);
      throw new NotFoundException('未找到该取件码对应的在库包裹');
    }

    await this.clearCodeQueryFailures(resolvedStationId, dto.code);
    return result;
  }

  /**
   * 获取驿站货架平面图数据（公开接口）
   * - stationId 未传时取第一个 active 驿站（兼容单租户场景）
   */
  async getStationLayout(stationId?: string) {
    const client = this.supabase.getClient();
    const STATION_PUBLIC_FIELDS = 'id, name, address, contact_phone, business_hours, layout_config';

    const targetStationId = await this.resolveStationId(stationId);
    const { data: st, error: stErr } = await client
      .from('ss_stations')
      .select(STATION_PUBLIC_FIELDS)
      .eq('id', targetStationId)
      .maybeSingle();
    if (stErr) throw new Error(`查询驿站户型失败: ${stErr.message}`);
    const stationRow = (st as Record<string, unknown>) ?? null;

    const stationLayoutConfig =
      (stationRow?.layout_config as Record<string, unknown> | null) ?? null;

    const { data, error } = await client
      .from('ss_shelves')
      .select('number, size_type, layers, description, pos_x, pos_y, rotation, zone')
      .eq('station_id', targetStationId)
      .eq('status', 'active')
      .order('number', { ascending: true });
    if (error) throw new Error(`查询货架失败: ${error.message}`);

    const rawConfig = (stationLayoutConfig as Record<string, unknown> | null) || {};
    const publicLayoutConfig: Record<string, unknown> = {};
    if (rawConfig.bounds) publicLayoutConfig.bounds = rawConfig.bounds;
    if (rawConfig.doors) publicLayoutConfig.doors = rawConfig.doors;
    if (rawConfig.areas) publicLayoutConfig.areas = rawConfig.areas;

    return {
      shelves: (data || []).map((s: any) => ({
        number: s.number,
        sizeType: s.size_type,
        layers: s.layers,
        description: s.description ?? null,
        posX: s.pos_x ?? null,
        posY: s.pos_y ?? null,
        rotation: s.rotation ?? 0,
        zone: s.zone ?? null,
      })),
      station: {
        name: (stationRow?.name as string) ?? null,
        address: (stationRow?.address as string) ?? null,
        contactPhone: (stationRow?.contact_phone as string) ?? null,
        businessHours: (stationRow?.business_hours as string) ?? null,
        layoutConfig: publicLayoutConfig,
      },
    };
  }

  // ============ 取件码查询错误计数（持久化） ============

  private async checkCodeQueryLock(stationId: string, code: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('attempt_count, locked_until')
      .eq('station_id', stationId)
      .eq('pickup_code', code)
      .maybeSingle();
    if (data?.locked_until) {
      const until = new Date(data.locked_until).getTime();
      if (Date.now() < until) {
        const remainMin = Math.ceil((until - Date.now()) / 60000);
        throw new ForbiddenException(`该取件码查询错误次数过多，请 ${remainMin} 分钟后重试`);
      }
    }
  }

  private async recordCodeQueryFailure(stationId: string, code: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('id, attempt_count')
      .eq('station_id', stationId)
      .eq('pickup_code', code)
      .maybeSingle();

    const next = (data?.attempt_count || 0) + 1;
    const locked = next >= MAX_CODE_QUERY_ATTEMPTS;
    const patch: {
      attempt_count: number;
      last_attempt_at: string;
      locked_until?: string | null;
    } = {
      attempt_count: next,
      last_attempt_at: new Date().toISOString(),
    };
    if (locked) {
      patch.locked_until = new Date(
        Date.now() + CODE_QUERY_LOCK_MINUTES * 60 * 1000,
      ).toISOString();
    }

    if (data?.id) {
      await this.supabase
        .getClient()
        .from('ss_pickup_code_attempts')
        .update(patch)
        .eq('id', data.id);
    } else {
      await this.supabase.getClient().from('ss_pickup_code_attempts').insert({
        station_id: stationId,
        pickup_code: code,
        ...patch,
      });
    }
  }

  private async clearCodeQueryFailures(stationId: string, code: string) {
    await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .update({
        attempt_count: 0,
        locked_until: null,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('station_id', stationId)
      .eq('pickup_code', code);
  }

  // ============ 内部 ============

  /** 解析驿站：显式 ID 优先，否则取第一个 active 驿站 */
  private async resolveStationId(stationId?: string): Promise<string> {
    if (stationId) return stationId;
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`查询驿站失败: ${error.message}`);
    if (!data?.id) throw new NotFoundException('未找到可用驿站');
    return data.id as string;
  }

  private async queryInStockParcels(opts: {
    recipientPhone?: string;
    trackingNumber?: string;
    pickupCode?: string;
    stationId?: string;
  }) {
    const stationId = await this.resolveStationId(opts.stationId);

    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, shelf_layer, shelf_position, inbound_at, station:ss_stations!ss_parcels_station_id_fkey(name), shelf:ss_shelves!ss_parcels_shelf_id_fkey(number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(name, code)',
      )
      .eq('status', 'in_stock')
      .eq('station_id', stationId);

    if (opts.recipientPhone) {
      query = query.eq('recipient_phone', opts.recipientPhone);
    } else if (opts.trackingNumber) {
      query = query.eq('tracking_number', opts.trackingNumber);
    } else if (opts.pickupCode) {
      query = query.eq('pickup_code', opts.pickupCode);
    }

    const { data, error } = await query.order('inbound_at', { ascending: false });
    if (error) throw new Error(`查询包裹失败: ${error.message}`);

    if (!data || data.length === 0) {
      return { items: [], total: 0 };
    }

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      items: data.map((r: any) => {
        return {
          id: r.id,
          trackingNumber: r.tracking_number,
          recipientName: this.maskName(r.recipient_name),
          recipientPhoneTail: this.maskPhone(r.recipient_phone),
          pickupCode: r.pickup_code,
          inboundAt: r.inbound_at,
          stationName: flatten(r.station)?.name ?? null,
          courierName: flatten(r.courier)?.name ?? null,
        };
      }),
      total: data.length,
    };
  }

  private maskName(name: string): string {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name.charAt(0) + '*'.repeat(Math.min(name.length - 1, 2));
  }

  private maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return phone || '';
    return `****${phone.slice(-4)}`;
  }
}
