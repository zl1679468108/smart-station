import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotifyService } from '../notify/notify.service';
import { InboundDto } from './dto/inbound.dto';

/**
 * 入库服务
 * - 单件入库：校验 → 识别快递公司（必须有前缀） → 自动分配货架 → 生成取件码（=位置 货架-层-件号） → 写事件轨迹 → 触发通知
 * - 批量入库：循环单件，收集成功/失败行
 */
@Injectable()
export class InboundService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    private readonly notifyService: NotifyService,
  ) {}

  /** 单件入库 */
  async inbound(
    dto: InboundDto,
    ctx: { stationId: string; operatorId: string; method: 'scan' | 'manual' | 'batch' },
  ) {
    const { stationId, operatorId, method } = ctx;

    // 运单号统一转大写存储与查询
    const trackingNumber = dto.trackingNumber.trim().toUpperCase();

    // 1. 校验运单号在同驿站是否在库（避免重复入库）
    const { data: exist } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select('id, status')
      .eq('tracking_number', trackingNumber)
      .eq('station_id', stationId)
      .in('status', ['in_stock', 'overdue', 'exception'])
      .maybeSingle();
    if (exist) {
      throw new ConflictException('该运单号在当前驿站已入库且未出库，不可重复入库');
    }

    // 2. 快递公司：显式 > 前缀识别；运单号必须能识别出快递公司
    let courierCompanyId = dto.courierCompanyId;
    let courierCompanyCode: string | null = null;
    let courierCompanyName: string | null = null;
    if (courierCompanyId) {
      const { data: c } = await this.supabase
        .getClient()
        .from('ss_courier_companies')
        .select('id, code, name')
        .eq('id', courierCompanyId)
        .maybeSingle();
      if (!c) throw new BadRequestException('快递公司不存在');
      courierCompanyCode = c.code;
      courierCompanyName = c.name;
    } else {
      const matched = await this.identifyCourier(trackingNumber);
      if (!matched) {
        throw new BadRequestException(
          '运单号无法识别快递公司，请确认运单号包含正确的快递公司前缀或手动选择快递公司',
        );
      }
      courierCompanyId = matched.id;
      courierCompanyCode = matched.code;
      courierCompanyName = matched.name;
    }

    // 3. 货架分配：显式 > 按 size 自动分配
    // 返回 shelfId + shelfNumber + shelfLayer + shelfPosition + pickupCode（取件码即位置：货架号-层号-件号）
    const allocation = await this.allocateShelfPosition(stationId, dto.size, dto.shelfId);
    if (!allocation) {
      throw new BadRequestException(
        `当前驿站无可用的${dto.size === 'small' ? '小件' : dto.size === 'medium' ? '中件' : '大件'}货架，请先在系统管理中新增`,
      );
    }
    const { shelfId, shelfNumber, shelfLayer, shelfPosition, pickupCode } = allocation;

    // 到付 / 代收货款（对用户收款）
    const freightCollectAmount = this.normalizeMoney(dto.freightCollectAmount);
    const codAmount = this.normalizeMoney(dto.codAmount);
    const collectDue = Math.round((freightCollectAmount + codAmount) * 100) / 100;
    const collectStatus = collectDue > 0 ? 'unpaid' : 'none';

    // 4. 写 ss_parcels（取件码 = 货架号-层号-件号，如 3-2-9903）
    const { data: parcel, error } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .insert({
        tracking_number: trackingNumber,
        courier_company_id: courierCompanyId,
        recipient_name: dto.recipientName,
        recipient_phone: dto.recipientPhone,
        station_id: stationId,
        shelf_id: shelfId,
        size: dto.size,
        shelf_layer: shelfLayer,
        shelf_position: shelfPosition,
        pickup_code: pickupCode,
        status: 'in_stock',
        inbound_at: new Date().toISOString(),
        inbound_operator_id: operatorId,
        inbound_method: method,
        note: dto.note ?? null,
        freight_collect_amount: freightCollectAmount,
        cod_amount: codAmount,
        collect_status: collectStatus,
      })
      .select('id, pickup_code, inbound_at, tracking_number')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        // 取件码唯一约束冲突（并发分配同位置），重试一次
        return this.inbound(dto, ctx);
      }
      throw new Error(`入库失败: ${error.message}`);
    }
    if (!parcel) throw new Error('入库失败：未返回数据');

    // 5. 写 ss_parcel_events（取件码即位置：货架号-层号-件号）
    let inboundDesc = `入库，取件码 ${pickupCode}`;
    if (collectDue > 0) {
      const parts: string[] = [];
      if (freightCollectAmount > 0) parts.push(`到付¥${freightCollectAmount.toFixed(2)}`);
      if (codAmount > 0) parts.push(`代收货款¥${codAmount.toFixed(2)}`);
      inboundDesc += `，待收款 ${parts.join(' + ')}`;
    }
    await this.supabase.getClient().from('ss_parcel_events').insert({
      parcel_id: parcel.id,
      event_type: 'inbound',
      operator_id: operatorId,
      operator_type: 'staff',
      description: inboundDesc,
      metadata: {
        method,
        pickup_code: pickupCode,
        shelf_number: shelfNumber,
        shelf_layer: shelfLayer,
        shelf_position: shelfPosition,
        courier_code: courierCompanyCode,
        freightCollectAmount,
        codAmount,
        collectStatus,
      },
    });

    // 6. 触发通知（若驿站开启 sms_enabled；免费通道见 NotifyService）
    const station = await this.getStation(stationId);
    let notify: {
      enabled: boolean;
      attempted: boolean;
      customerBound: boolean;
      customerPushed: boolean;
      customerChannels: string[];
      staffMessage: string;
    };
    if (station.sms_enabled) {
      try {
        const r = await this.notifyService.sendInboundNotice({
          stationName: station.name,
          phone: dto.recipientPhone,
          recipientName: dto.recipientName,
          pickupCode,
          parcelId: parcel.id,
          stationId,
        });
        notify = {
          enabled: true,
          attempted: r.attempted,
          customerBound: r.customerBound,
          customerPushed: r.customerPushed,
          customerChannels: r.customerChannels,
          staffMessage: r.staffMessage,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notify = {
          enabled: true,
          attempted: true,
          customerBound: false,
          customerPushed: false,
          customerChannels: [],
          staffMessage: `通知发送异常：${msg}（入库已成功，不影响取件）`,
        };
      }
    } else {
      notify = {
        enabled: false,
        attempted: false,
        customerBound: false,
        customerPushed: false,
        customerChannels: [],
        staffMessage: '到件通知已关闭（系统管理可开启）',
      };
    }

    return {
      id: parcel.id,
      trackingNumber: parcel.tracking_number,
      pickupCode: parcel.pickup_code,
      shelfNumber,
      shelfLayer,
      shelfPosition,
      inboundAt: parcel.inbound_at,
      courierCompanyCode,
      courierCompanyName,
      recipientPhone: dto.recipientPhone,
      freightCollectAmount,
      codAmount,
      collectStatus,
      collectDueAmount: collectDue,
      notify,
    };
  }

  /** 批量入库 */
  async batchInbound(
    items: InboundDto[],
    ctx: { stationId: string; operatorId: string },
  ) {
    const succeeded: Array<{ index: number; result: any }> = [];
    const failed: Array<{ index: number; error: string; item: InboundDto }> = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const result = await this.inbound(item, {
          stationId: ctx.stationId,
          operatorId: ctx.operatorId,
          method: 'batch',
        });
        succeeded.push({ index: i, result });
      } catch (err) {
        failed.push({
          index: i,
          error: err instanceof Error ? err.message : '未知错误',
          item,
        });
      }
    }
    // 汇总通知触达，方便店员一眼看清「多少人收到私信 / 多少人未绑定」
    let notifyEnabled = 0;
    let notifyDisabled = 0;
    let customerBound = 0;
    let customerPushed = 0;
    let customerUnbound = 0;
    let customerPushFailed = 0;
    for (const row of succeeded) {
      const n = row?.result?.notify;
      if (!n) continue;
      if (!n.enabled) {
        notifyDisabled += 1;
        continue;
      }
      notifyEnabled += 1;
      if (n.customerPushed) customerPushed += 1;
      else if (n.customerBound) customerPushFailed += 1;
      else customerUnbound += 1;
      if (n.customerBound) customerBound += 1;
    }

    const summaryParts: string[] = [];
    if (succeeded.length === 0) {
      summaryParts.push('无成功入库，未发送通知');
    } else if (notifyDisabled > 0 && notifyEnabled === 0) {
      summaryParts.push(`到件通知已关闭（${notifyDisabled} 件）`);
    } else {
      if (customerPushed > 0) summaryParts.push(`已私信 ${customerPushed}`);
      if (customerUnbound > 0) summaryParts.push(`未绑定 ${customerUnbound}`);
      if (customerPushFailed > 0) summaryParts.push(`私信失败 ${customerPushFailed}`);
      if (notifyDisabled > 0) summaryParts.push(`通知已关 ${notifyDisabled}`);
      if (summaryParts.length === 0) summaryParts.push('通知已处理');
    }

    return {
      total: items.length,
      succeeded: succeeded.length,
      failed: failed.length,
      results: succeeded,
      errors: failed,
      notifySummary: {
        notifyEnabled,
        notifyDisabled,
        customerBound,
        customerPushed,
        customerUnbound,
        customerPushFailed,
        staffMessage: summaryParts.join('；'),
      },
    };
  }

  // ============ 辅助 ============

  /** 金额规范化：空/undefined → 0，最多两位小数 */
  private normalizeMoney(v: unknown): number {
    if (v === undefined || v === null || v === '') return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('金额须为非负数');
    }
    return Math.round(n * 100) / 100;
  }

  /** 按运单号前缀识别快递公司 */
  private async identifyCourier(trackingNumber: string) {
    const upper = trackingNumber.toUpperCase();
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_companies')
      .select('id, code, name, tracking_prefixes')
      .eq('status', 'active');
    if (error || !data) return null;
    for (const c of data) {
      const prefixes: string[] = c.tracking_prefixes || [];
      if (prefixes.some((p) => p && upper.startsWith(p.toUpperCase()))) {
        return { id: c.id, code: c.code, name: c.name };
      }
    }
    return null;
  }

  /**
   * 货架位置分配：按 size_type 匹配货架 → 在选中货架内找负载最低的层 → 分配随机4位件号
   * - 若指定 shelfId，校验该货架存在且 size_type 匹配，直接在该货架内分配层+件号
   * - 若未指定，按 size 过滤 active 货架，选总负载率最低的货架
   * - 取件码 = 位置：{number}-{layer}-{position}，如 3-2-9903 = 第3号货架第2层第9903号
   * - position = 随机4位数（0001-9999），同货架同层在库不可重复（查表防重，冲突重试最多 100 次）
   */
  private async allocateShelfPosition(
    stationId: string,
    size: 'small' | 'medium' | 'large',
    shelfId?: string,
  ): Promise<{
    shelfId: string;
    shelfNumber: number;
    shelfLayer: number;
    shelfPosition: number;
    pickupCode: string;
  } | null> {
    // 1. 确定目标货架
    let targetShelf: { id: string; number: number; layers: number; capacity_per_layer: number } | null = null;

    if (shelfId) {
      // 显式指定货架：校验存在 + active + size_type 匹配
      const { data: sh, error } = await this.supabase
        .getClient()
        .from('ss_shelves')
        .select('id, number, layers, capacity_per_layer, size_type, status')
        .eq('id', shelfId)
        .eq('station_id', stationId)
        .maybeSingle();
      if (error || !sh) throw new BadRequestException('货架不存在');
      if (sh.status !== 'active') throw new BadRequestException('货架已禁用');
      if (sh.size_type !== size) {
        throw new BadRequestException(
          `货架大小不匹配：该货架为${sh.size_type === 'small' ? '小件' : sh.size_type === 'medium' ? '中件' : '大件'}货架，包裹为${size === 'small' ? '小件' : size === 'medium' ? '中件' : '大件'}`,
        );
      }
      targetShelf = {
        id: sh.id,
        number: sh.number,
        layers: sh.layers,
        capacity_per_layer: sh.capacity_per_layer,
      };
    } else {
      // 自动分配：按 size_type 过滤，选总负载率最低的货架
      const { data: shelves, error } = await this.supabase
        .getClient()
        .from('ss_shelves')
        .select('id, number, layers, capacity_per_layer')
        .eq('station_id', stationId)
        .eq('status', 'active')
        .eq('size_type', size)
        .order('number', { ascending: true });
      if (error || !shelves || shelves.length === 0) return null;

      // 查各货架在库件数
      const { data: counts } = await this.supabase
        .getClient()
        .from('ss_parcels')
        .select('shelf_id')
        .eq('station_id', stationId)
        .eq('status', 'in_stock');
      const countMap = new Map<string, number>();
      (counts || []).forEach((r: any) => {
        if (r.shelf_id) countMap.set(r.shelf_id, (countMap.get(r.shelf_id) || 0) + 1);
      });

      // 选负载率最低的货架
      let bestRatio = Infinity;
      for (const s of shelves) {
        const cur = countMap.get(s.id) || 0;
        const totalCap = s.layers * s.capacity_per_layer;
        const ratio = cur / totalCap;
        if (ratio < bestRatio) {
          bestRatio = ratio;
          targetShelf = {
            id: s.id,
            number: s.number,
            layers: s.layers,
            capacity_per_layer: s.capacity_per_layer,
          };
        }
      }
      if (!targetShelf) return null;
    }

    // 2. 在目标货架内分配层 + 件号
    // 查该货架各层的在库件数（用于选负载最低的层）
    const { data: layerCounts } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select('shelf_layer')
      .eq('shelf_id', targetShelf.id)
      .eq('status', 'in_stock')
      .not('shelf_layer', 'is', null);
    const layerCountMap = new Map<number, number>();
    (layerCounts || []).forEach((r: any) => {
      const layer = r.shelf_layer as number;
      layerCountMap.set(layer, (layerCountMap.get(layer) || 0) + 1);
    });

    // 选在库件数最少且未满的层（优先低层）
    let bestLayer = -1;
    let bestLayerCount = Infinity;
    for (let layer = 1; layer <= targetShelf.layers; layer++) {
      const cur = layerCountMap.get(layer) || 0;
      if (cur >= targetShelf.capacity_per_layer) continue; // 该层已满
      if (cur < bestLayerCount) {
        bestLayerCount = cur;
        bestLayer = layer;
      }
    }
    if (bestLayer === -1) {
      // 所有层都满了
      throw new BadRequestException(
        `货架 ${targetShelf.number} 已满（${targetShelf.layers} 层 × ${targetShelf.capacity_per_layer} 件/层）`,
      );
    }

    // 件号 = 随机4位数（1-9999），同货架同层在库不可重复
    // 查该层在库件号集合用于本地去重
    const { data: usedPositions } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select('shelf_position')
      .eq('shelf_id', targetShelf.id)
      .eq('shelf_layer', bestLayer)
      .eq('status', 'in_stock')
      .not('shelf_position', 'is', null);
    const usedSet = new Set((usedPositions || []).map((r: any) => r.shelf_position as number));

    // 重试生成随机4位数直到未占用（最多 100 次）
    let shelfPosition = 0;
    for (let seq = 0; seq < 100; seq++) {
      const candidate = Math.floor(Math.random() * 9999) + 1; // 1-9999
      if (!usedSet.has(candidate)) {
        shelfPosition = candidate;
        break;
      }
    }
    if (shelfPosition === 0) {
      throw new BadRequestException(
        `货架 ${targetShelf.number} 第 ${bestLayer} 层件号池耗尽，请稍后重试或新增货架`,
      );
    }

    // 取件码 = 货架号-层号-件号（直观反映包裹位置）
    const pickupCode = `${targetShelf.number}-${bestLayer}-${shelfPosition}`;

    return {
      shelfId: targetShelf.id,
      shelfNumber: targetShelf.number,
      shelfLayer: bestLayer,
      shelfPosition,
      pickupCode,
    };
  }


  /**
   * 入库后补发到件通知（运营打磨）
   * - 客户后来绑定了微信 / 上次私信失败 / 未绑定时口头提醒后再次尝试
   * - 仅在库/滞留可补发
   */
  async resendInboundNotice(stationId: string, parcelId: string) {
    const { data: parcel, error } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, status, tracking_number, pickup_code, recipient_phone, recipient_name, station_id',
      )
      .eq('id', parcelId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询包裹失败: ${error.message}`);
    if (!parcel) throw new NotFoundException('包裹不存在');
    if (!['in_stock', 'overdue'].includes(String(parcel.status))) {
      throw new BadRequestException('仅在库/滞留包裹可补发到件通知');
    }
    if (!parcel.recipient_phone) {
      throw new BadRequestException('包裹无收件手机号，无法发通知');
    }
    if (!parcel.pickup_code) {
      throw new BadRequestException('包裹无取件码，无法发通知');
    }

    const station = await this.getStation(stationId);
    if (!station.sms_enabled) {
      return {
        id: parcel.id,
        enabled: false,
        attempted: false,
        customerBound: false,
        customerPushed: false,
        customerChannels: [] as string[],
        staffMessage: '到件通知已关闭（系统管理可开启）',
        trackingNumber: parcel.tracking_number,
        pickupCode: parcel.pickup_code,
      };
    }

    try {
      const r = await this.notifyService.sendInboundNotice({
        stationName: station.name,
        phone: String(parcel.recipient_phone),
        recipientName: parcel.recipient_name as string | null,
        pickupCode: String(parcel.pickup_code),
        parcelId: parcel.id,
        stationId,
      });
      return {
        id: parcel.id,
        enabled: true,
        attempted: r.attempted,
        customerBound: r.customerBound,
        customerPushed: r.customerPushed,
        customerChannels: r.customerChannels,
        staffMessage: r.staffMessage,
        trackingNumber: parcel.tracking_number,
        pickupCode: parcel.pickup_code,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`补发失败：${msg}`);
    }
  }

  private async getStation(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id, name, sms_enabled')
      .eq('id', stationId)
      .maybeSingle();
    if (error || !data) throw new NotFoundException('驿站不存在');
    return data;
  }
}
