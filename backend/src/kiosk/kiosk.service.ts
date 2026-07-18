import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SendCodeDto, QueryByPhoneDto, QueryByPhoneDirectDto, QueryByTrackingDto, QueryByCodeDto } from './dto/kiosk.dto';

/**
 * Kiosk 取件自助查询服务
 * - 公开接口（@Public）
 * - 限流：同 IP 每分钟 ≤10 次（ThrottlerGuard）
 * - 验证码：同手机号每小时 ≤5 次
 * - 脱敏：手机号仅尾号 4 位，姓名首字 + **
 * - 取件码查询：同码连续错误 5 次锁 10 分钟（进程内 Map，单实例）
 */

const CODE_TTL_MINUTES = 5;
const MAX_SEND_PER_HOUR = 5;
const MAX_CODE_QUERY_ATTEMPTS = 5;
const CODE_QUERY_LOCK_MS = 10 * 60 * 1000;

@Injectable()
export class KioskService {
  // 取件码查询错误计数（进程内，单实例；key=pickup_code）
  private codeQueryAttempts = new Map<string, { count: number; lockedUntil: number | null }>();

  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 发送验证码（v1.0 仅写入数据库 + log，不真实发短信） */
  async sendCode(dto: SendCodeDto, ip?: string) {
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

    // 生成 6 位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error } = await this.supabase.getClient().from('ss_kiosk_codes').insert({
      phone: dto.phone,
      code,
      expires_at: expiresAt,
      ip_address: ip || null,
    });
    if (error) throw new Error(`验证码发送失败: ${error.message}`);

    // v1.0 不接入真实短信，控制台输出便于联调
    // 生产环境应通过 NotifyService 调用第三方短信网关
    // eslint-disable-next-line no-console
    console.log(`[Kiosk] 验证码 -> ${dto.phone}: ${code}（${CODE_TTL_MINUTES} 分钟内有效）`);

    return { sent: true, ttlSeconds: CODE_TTL_MINUTES * 60 };
  }

  /** 手机号尾号 + 验证码查询 */
  async queryByPhone(dto: QueryByPhoneDto) {
    // 1. 校验验证码：查最近有效记录，需匹配尾号 4 位的某个手机号
    // 取件自助查询是公开场景，验证码与手机号绑定，校验时先按尾号模糊查可能的手机号，
    // 再核验该手机号是否有匹配的未使用未过期验证码
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

    // 2. 标记验证码已使用
    await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matched.id);

    // 3. 查该手机号在库包裹（所有驿站）
    const phone = (matched as any).phone as string;
    return this.queryInStockParcels({ recipientPhone: phone });
  }

  /** 运单号查询（无需验证码） */
  async queryByTracking(dto: QueryByTrackingDto) {
    return this.queryInStockParcels({ trackingNumber: dto.trackingNumber.trim().toUpperCase() });
  }

  /** 手机号直接查询（1.1.0 新增，无需验证码，用于 /query 门户，脱敏返回） */
  async queryByPhoneDirect(dto: QueryByPhoneDirectDto) {
    return this.queryInStockParcels({ recipientPhone: dto.phone });
  }

  /** 取件码查询（无需验证码，错误 5 次锁定 10 分钟） */
  async queryByCode(dto: QueryByCodeDto) {
    // 检查取件码是否被锁定
    this.checkCodeQueryLock(dto.code);

    const result = await this.queryInStockParcels({ pickupCode: dto.code });

    if (result.total === 0) {
      // 查询失败，记录错误
      this.recordCodeQueryFailure(dto.code);
      throw new NotFoundException('未找到该取件码对应的在库包裹');
    }

    // 查询成功，清零错误计数
    this.clearCodeQueryFailures(dto.code);
    return result;
  }

  // ============ 货架平面图 ============

  /**
   * 获取驿站货架平面图数据（公开接口）
   * - 用于 Kiosk 端取件引导：按 size_type 自动分 A/B/C 区
   * - 仅返回 active 货架的基础信息，不含库存数等敏感数据
   * - stationId 未传时取第一个 active 驿站（兼容单租户场景）
   */
  async getStationLayout(stationId?: string) {
    const client = this.supabase.getClient();

    // 公开字段：仅返回 /query 门户展示所需的驿站基础信息（不含 overdue 规则、sms 开关等内部配置）
    const STATION_PUBLIC_FIELDS = 'id, name, address, contact_phone, business_hours, layout_config';

    let targetStationId = stationId;
    let stationRow: Record<string, unknown> | null = null;
    if (!targetStationId) {
      const { data: firstStation, error: stationErr } = await client
        .from('ss_stations')
        .select(STATION_PUBLIC_FIELDS)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (stationErr) throw new Error(`查询驿站失败: ${stationErr.message}`);
      if (!firstStation) throw new NotFoundException('未找到可用驿站');
      targetStationId = firstStation.id;
      stationRow = firstStation as Record<string, unknown>;
    } else {
      const { data: st, error: stErr } = await client
        .from('ss_stations')
        .select(STATION_PUBLIC_FIELDS)
        .eq('id', targetStationId)
        .maybeSingle();
      if (stErr) throw new Error(`查询驿站户型失败: ${stErr.message}`);
      stationRow = (st as Record<string, unknown>) ?? null;
    }

    const stationLayoutConfig =
      (stationRow?.layout_config as Record<string, unknown> | null) ?? null;

    const { data, error } = await client
      .from('ss_shelves')
      .select('number, size_type, layers, description, pos_x, pos_y, rotation, zone')
      .eq('station_id', targetStationId)
      .eq('status', 'active')
      .order('number', { ascending: true });
    if (error) throw new Error(`查询货架失败: ${error.message}`);

    // 公开返回的 layoutConfig 仅含 bounds + doors + areas，过滤 obstacles 等内部细节
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
        // 驿站公开基础信息（供 /query 门户顶部展示）
        name: (stationRow?.name as string) ?? null,
        address: (stationRow?.address as string) ?? null,
        contactPhone: (stationRow?.contact_phone as string) ?? null,
        businessHours: (stationRow?.business_hours as string) ?? null,
        layoutConfig: publicLayoutConfig,
      },
    };
  }

  // ============ 取件码查询错误计数（进程内） ============

  private checkCodeQueryLock(code: string) {
    const rec = this.codeQueryAttempts.get(code);
    if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
      const remainMin = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
      throw new ForbiddenException(`该取件码查询错误次数过多，请 ${remainMin} 分钟后重试`);
    }
  }

  private recordCodeQueryFailure(code: string) {
    const rec = this.codeQueryAttempts.get(code) || { count: 0, lockedUntil: null };
    rec.count += 1;
    if (rec.count >= MAX_CODE_QUERY_ATTEMPTS) {
      rec.lockedUntil = Date.now() + CODE_QUERY_LOCK_MS;
    }
    this.codeQueryAttempts.set(code, rec);
  }

  private clearCodeQueryFailures(code: string) {
    this.codeQueryAttempts.delete(code);
  }

  // ============ 内部 ============

  private async queryInStockParcels(opts: {
    recipientPhone?: string;
    trackingNumber?: string;
    pickupCode?: string;
  }) {
    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, shelf_layer, shelf_position, inbound_at, station:ss_stations!ss_parcels_station_id_fkey(name), shelf:ss_shelves!ss_parcels_shelf_id_fkey(number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(name, code)',
      )
      .eq('status', 'in_stock');

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
          // 脱敏：姓名首字 + **
          recipientName: this.maskName(r.recipient_name),
          // 脱敏：手机号尾号 4 位
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

  /** 脱敏：姓名首字 + ** */
  private maskName(name: string): string {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name.charAt(0) + '*'.repeat(Math.min(name.length - 1, 2));
  }

  /** 脱敏：手机号仅尾号 4 位 */
  private maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return phone || '';
    return `****${phone.slice(-4)}`;
  }
}
