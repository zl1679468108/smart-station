import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ManualOutboundDto, SelfServiceOutboundDto, OutboundSearchDto } from './dto/outbound.dto';

/**
 * 出库服务
 * - 人工辅助出库：工作人员凭运单号或取件码出库
 * - 自助扫描出库：扫描机凭运单号出库（公开接口）
 * - 取件码错误锁定：同取件码错误 3 次锁 10 分钟
 */

const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 10;

@Injectable()
export class OutboundService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 出库前查询在库包裹（1.1.0 新增，不脱敏，工作人员核验用） */
  async searchParcels(dto: OutboundSearchDto, stationId: string) {
    if (!dto.phone && !dto.trackingNumber && !dto.pickupCode) {
      throw new BadRequestException('请至少输入一种查询条件');
    }

    // 取件码查询需先检查锁定
    if (dto.pickupCode) {
      await this.checkPickupCodeLock(stationId, dto.pickupCode);
    }

    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, inbound_at, shelf_layer, shelf_position, shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code)',
      )
      .eq('station_id', stationId)
      .eq('status', 'in_stock');

    if (dto.phone) {
      query = query.eq('recipient_phone', dto.phone);
    } else if (dto.trackingNumber) {
      query = query.eq('tracking_number', dto.trackingNumber.trim().toUpperCase());
    } else if (dto.pickupCode) {
      query = query.eq('pickup_code', dto.pickupCode);
    }

    const { data, error } = await query.order('inbound_at', { ascending: false });
    if (error) throw new Error(`查询包裹失败: ${error.message}`);

    // 取件码查询未命中时记录错误（与 manual 共用锁定计数）
    if (dto.pickupCode && (!data || data.length === 0)) {
      await this.recordPickupCodeFailure(stationId, dto.pickupCode);
    }

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      items: (data || []).map((r: any) => {
        return {
          id: r.id,
          trackingNumber: r.tracking_number,
          recipientName: r.recipient_name,
          recipientPhone: r.recipient_phone,
          pickupCode: r.pickup_code,
          inboundAt: r.inbound_at,
          courierName: flatten(r.courier)?.name ?? null,
        };
      }),
      total: (data || []).length,
    };
  }

  /** 人工辅助出库 */
  async manualOutbound(
    dto: ManualOutboundDto,
    ctx: { stationId: string; operatorId: string },
  ) {
    if (!dto.trackingNumber && !dto.pickupCode) {
      throw new BadRequestException('运单号与取件码不能同时为空');
    }

    // 取件码锁定校验
    if (dto.pickupCode) {
      await this.checkPickupCodeLock(ctx.stationId, dto.pickupCode);
    }

    // 查包裹
    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, inbound_at, shelf_id, shelf_layer, shelf_position, shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code)',
      )
      .eq('station_id', ctx.stationId);

    if (dto.trackingNumber) {
      query = query.eq('tracking_number', dto.trackingNumber.trim().toUpperCase());
    } else if (dto.pickupCode) {
      query = query.eq('pickup_code', dto.pickupCode);
    }

    const { data: parcel, error } = await query.maybeSingle();
    if (error || !parcel) {
      if (dto.pickupCode) {
        await this.recordPickupCodeFailure(ctx.stationId, dto.pickupCode);
      }
      throw new NotFoundException('未找到匹配的在库包裹');
    }

    // 状态校验
    if (parcel.status !== 'in_stock') {
      throw new BadRequestException(`包裹状态为 ${parcel.status}，不可出库`);
    }

    // 取件码匹配校验（若用运单号查，但提供了取件码，需校验一致）
    if (dto.pickupCode && parcel.pickup_code !== dto.pickupCode) {
      await this.recordPickupCodeFailure(ctx.stationId, dto.pickupCode);
      throw new BadRequestException('取件码不匹配');
    }

    // 取件人身份核验：手机号后 4 位（防冒领）
    const expectedTail = String(parcel.recipient_phone || '').replace(/\D/g, '').slice(-4);
    const givenTail = String(dto.phoneTail || '').replace(/\D/g, '');
    if (!expectedTail || expectedTail.length !== 4) {
      throw new BadRequestException('包裹手机号异常，无法核验，请联系管理员');
    }
    if (givenTail !== expectedTail) {
      throw new BadRequestException('手机号后 4 位不正确，请向取件人重新确认');
    }

    // 执行出库
    return this.executeOutbound(parcel, {
      stationId: ctx.stationId,
      operatorId: ctx.operatorId,
      method: 'manual',
      pickupCode: dto.pickupCode,
      verify: {
        type: 'phone_tail',
        phoneTail: givenTail,
        note: (dto.verifyNote || '').trim() || undefined,
      },
    });
  }

  /** 自助扫描出库（公开接口） */
  async selfServiceOutbound(dto: SelfServiceOutboundDto) {
    // 扫描机可绑定驿站（stationId）；未绑定时兼容单租户跨站运单匹配
    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, inbound_at, station_id, shelf_layer, shelf_position, shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code)',
      )
      .eq('tracking_number', dto.trackingNumber.trim().toUpperCase())
      .eq('status', 'in_stock');

    if (dto.stationId) {
      query = query.eq('station_id', dto.stationId);
    }

    const { data: parcel, error } = await query.maybeSingle();
    if (error || !parcel) {
      throw new NotFoundException(
        dto.stationId ? '未找到本驿站匹配的在库包裹' : '未找到匹配的在库包裹',
      );
    }

    return this.executeOutbound(parcel, {
      stationId: parcel.station_id,
      operatorId: null,
      method: 'self_service',
    });
  }

  /** 出库记录列表 */
  async listOutboundRecords(
    stationId: string,
    opts: { startDate?: string; endDate?: string; method?: string; page?: number; pageSize?: number },
  ) {
    const page = opts.page || 1;
    const pageSize = opts.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, outbound_at, outbound_method, inbound_at, shelf_layer, shelf_position, outbound_operator:ss_users!ss_parcels_outbound_operator_id_fkey(id, username), shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code)',
        { count: 'exact' },
      )
      .eq('station_id', stationId)
      .eq('status', 'out_stock')
      .not('outbound_at', 'is', null);

    if (opts.startDate) query = query.gte('outbound_at', `${opts.startDate}T00:00:00Z`);
    if (opts.endDate) query = query.lte('outbound_at', `${opts.endDate}T23:59:59Z`);
    if (opts.method) query = query.eq('outbound_method', opts.method);

    query = query.order('outbound_at', { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) throw new Error(`查询出库记录失败: ${error.message}`);

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      items: (data || []).map((r: any) => {
        return {
          id: r.id,
          trackingNumber: r.tracking_number,
          recipientName: r.recipient_name,
          recipientPhone: r.recipient_phone,
          pickupCode: r.pickup_code,
          outboundAt: r.outbound_at,
          outboundMethod: r.outbound_method,
          inboundAt: r.inbound_at,
          operatorName: flatten(r.outbound_operator)?.username ?? null,
          courierName: flatten(r.courier)?.name ?? null,
        };
      }),
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // ============ 内部 ============

  private async executeOutbound(
    parcel: any,
    opts: {
      stationId: string;
      operatorId: string | null;
      method: 'manual' | 'self_service';
      pickupCode?: string;
      verify?: {
        type: 'phone_tail' | 'none';
        phoneTail?: string;
        note?: string;
      };
    },
  ) {
    const { error } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .update({
        status: 'out_stock',
        outbound_at: new Date().toISOString(),
        outbound_operator_id: opts.operatorId,
        outbound_method: opts.method,
      })
      .eq('id', parcel.id);
    if (error) throw new Error(`出库失败: ${error.message}`);

    // 写事件轨迹（含身份核验留证，便于纠纷回溯）
    const methodLabel = opts.method === 'manual' ? '人工辅助' : '自助扫描';
    let description = `${methodLabel}出库`;
    if (opts.verify?.type === 'phone_tail') {
      description += '（已核验手机后4位）';
      if (opts.verify.note) description += `：${opts.verify.note}`;
    }
    await this.supabase.getClient().from('ss_parcel_events').insert({
      parcel_id: parcel.id,
      event_type: 'outbound',
      operator_id: opts.operatorId,
      operator_type: opts.method === 'manual' ? 'staff' : 'self_service',
      description,
      metadata: {
        method: opts.method,
        verify: opts.verify
          ? {
              type: opts.verify.type,
              // 仅存后4位，不落完整手机号
              phoneTail: opts.verify.phoneTail || null,
              note: opts.verify.note || null,
              verifiedAt: new Date().toISOString(),
            }
          : { type: 'none' },
      },
    });

    // 取件码成功后清零错误计数
    if (opts.pickupCode) {
      await this.clearPickupCodeFailures(opts.stationId, opts.pickupCode);
    }

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      id: parcel.id,
      trackingNumber: parcel.tracking_number,
      recipientName: parcel.recipient_name,
      recipientPhone: parcel.recipient_phone,
      pickupCode: parcel.pickup_code,
      courierName: flatten(parcel.courier)?.name ?? null,
      outboundAt: new Date().toISOString(),
      outboundMethod: opts.method,
    };
  }

  /** 检查取件码是否被锁定 */
  private async checkPickupCodeLock(stationId: string, pickupCode: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('attempt_count, locked_until')
      .eq('station_id', stationId)
      .eq('pickup_code', pickupCode)
      .maybeSingle();
    if (data?.locked_until) {
      const until = new Date(data.locked_until).getTime();
      if (Date.now() < until) {
        const remainMin = Math.ceil((until - Date.now()) / 60000);
        throw new ForbiddenException(`取件码错误次数过多，已锁定，请 ${remainMin} 分钟后重试`);
      }
    }
  }

  /** 记录取件码错误，达阈值锁定 */
  private async recordPickupCodeFailure(stationId: string, pickupCode: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('id, attempt_count')
      .eq('station_id', stationId)
      .eq('pickup_code', pickupCode)
      .maybeSingle();

    const next = (data?.attempt_count || 0) + 1;
    const locked = next >= MAX_ATTEMPTS;
    const patch: { attempt_count: number; last_attempt_at: string; locked_until?: string | null } = {
      attempt_count: next,
      last_attempt_at: new Date().toISOString(),
    };
    if (locked) {
      patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
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
        pickup_code: pickupCode,
        ...patch,
      });
    }
  }

  /** 成功后清零错误计数与锁定 */
  private async clearPickupCodeFailures(stationId: string, pickupCode: string) {
    await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .update({ attempt_count: 0, locked_until: null, last_attempt_at: new Date().toISOString() })
      .eq('station_id', stationId)
      .eq('pickup_code', pickupCode);
  }
}
