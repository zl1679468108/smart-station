import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { InventoryQueryDto } from './dto/inventory-query.dto';

/**
 * 库存查询服务
 * - 列表：分页 + 多维度筛选，按入库时间倒序
 * - 详情：基础信息 + 状态轨迹时间线
 * - 批量操作：出库（依赖 OutboundService 不在此实现，仅改状态）、标记异常、导出
 */
@Injectable()
export class InventoryService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /**
   * 驿站信息只读查询（供店员系统管理页面查看，不含写操作）
   */
  async getStation(stationId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('*')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询驿站失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return data;
  }

  /**
   * 快递公司只读列表（供店员入库/库存/系统管理页面使用）
   */
  async listCouriers() {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_companies')
      .select(
        'id, name, code, service_phone, tracking_prefixes, status, sort_order, created_at',
      )
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`查询快递公司失败: ${error.message}`);
    return data || [];
  }

  /**
   * 货架只读列表（供店员入库/库存页面使用）
   * 返回货架基础信息 + 在库包裹数 + 剩余容量，不含管理操作
   */
  async listShelves(stationId: string) {
    const client = this.supabase.getClient();
    const [shelvesRes, parcelsRes] = await Promise.all([
      client
        .from('ss_shelves')
        .select(
          'id, number, size_type, layers, capacity_per_layer, description, status, pos_x, pos_y, rotation, zone, created_at',
        )
        .eq('station_id', stationId)
        .order('number', { ascending: true }),
      client
        .from('ss_parcels')
        .select('shelf_id')
        .eq('station_id', stationId)
        .in('status', ['in_stock', 'overdue']),
    ]);
    if (shelvesRes.error) {
      console.error('[listShelves] shelves query error:', {
        stationId,
        message: shelvesRes.error.message,
        code: shelvesRes.error.code,
        details: shelvesRes.error.details,
      });
      throw new Error(`查询货架失败: ${shelvesRes.error.message}`);
    }
    if (parcelsRes.error) {
      console.error('[listShelves] parcels query error:', {
        stationId,
        message: parcelsRes.error.message,
        code: parcelsRes.error.code,
        details: parcelsRes.error.details,
      });
      throw new Error(`查询在库包裹失败: ${parcelsRes.error.message}`);
    }

    const countMap = new Map<string, number>();
    for (const p of parcelsRes.data || []) {
      if (p.shelf_id) countMap.set(p.shelf_id, (countMap.get(p.shelf_id) || 0) + 1);
    }

    return (shelvesRes.data || []).map((s: any) => {
      const inStockCount = countMap.get(s.id) || 0;
      const totalCapacity = s.layers * s.capacity_per_layer;
      return {
        ...s,
        in_stock_count: inStockCount,
        remaining_capacity: totalCapacity - inStockCount,
      };
    });
  }

  /** 列表查询 */
  async list(stationId: string, q: InventoryQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, inbound_at, outbound_at, shelf_id, shelf_layer, shelf_position, size, note, courier_company_id, courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code), shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number, size_type, layers, capacity_per_layer)',
        { count: 'exact' },
      )
      .eq('station_id', stationId);

    if (q.phone) query = query.eq('recipient_phone', q.phone);
    if (q.trackingNumber) query = query.ilike('tracking_number', `%${q.trackingNumber.trim().toUpperCase()}%`);
    if (q.pickupCode) query = query.eq('pickup_code', q.pickupCode);
    if (q.courierCompanyId) query = query.eq('courier_company_id', q.courierCompanyId);
    if (q.shelfId) query = query.eq('shelf_id', q.shelfId);
    if (q.status) query = query.eq('status', q.status);
    if (q.startDate) query = query.gte('inbound_at', `${q.startDate}T00:00:00Z`);
    if (q.endDate) query = query.lte('inbound_at', `${q.endDate}T23:59:59Z`);

    query = query.order('inbound_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询库存失败: ${error.message}`);

    const items = (data || []).map((row: any) => {
      return {
        id: row.id,
        trackingNumber: row.tracking_number,
        recipientName: row.recipient_name,
        recipientPhone: row.recipient_phone,
        pickupCode: row.pickup_code,
        status: row.status,
        size: row.size,
        inboundAt: row.inbound_at,
        outboundAt: row.outbound_at,
        note: row.note,
        courier: row.courier
          ? { id: row.courier.id, name: row.courier.name, code: row.courier.code }
          : null,
        shelf: row.shelf
          ? {
              id: row.shelf.id,
              number: row.shelf.number,
              sizeType: row.shelf.size_type,
              layers: row.shelf.layers,
              capacityPerLayer: row.shelf.capacity_per_layer,
            }
          : null,
      };
    });

    return {
      items,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  /** 详情：基础信息 + 状态轨迹 */
  async detail(stationId: string, id: string) {
    const { data: parcel, error } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, size, shelf_layer, shelf_position, inbound_at, outbound_at, returned_at, return_tracking_number, inbound_method, outbound_method, note, created_at, updated_at, courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(id, name, code, service_phone), shelf:ss_shelves!ss_parcels_shelf_id_fkey(id, number, size_type, layers, capacity_per_layer), inbound_operator:ss_users!ss_parcels_inbound_operator_id_fkey(id, username), outbound_operator:ss_users!ss_parcels_outbound_operator_id_fkey(id, username)',
      )
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询详情失败: ${error.message}`);
    if (!parcel) throw new NotFoundException('包裹不存在');

    // 状态轨迹
    const { data: events, error: evErr } = await this.supabase
      .getClient()
      .from('ss_parcel_events')
      .select(
        'id, event_type, operator_id, operator_type, description, metadata, created_at, operator:ss_users!ss_parcel_events_operator_id_fkey(id, username)',
      )
      .eq('parcel_id', id)
      .order('created_at', { ascending: true });
    if (evErr) throw new Error(`查询轨迹失败: ${evErr.message}`);

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    const shelfData = flatten(parcel.shelf);
    return {
      id: parcel.id,
      trackingNumber: parcel.tracking_number,
      recipientName: parcel.recipient_name,
      recipientPhone: parcel.recipient_phone,
      pickupCode: parcel.pickup_code,
      status: parcel.status,
      size: parcel.size,
      shelfLayer: parcel.shelf_layer,
      shelfPosition: parcel.shelf_position,
      inboundAt: parcel.inbound_at,
      outboundAt: parcel.outbound_at,
      returnedAt: parcel.returned_at,
      returnTrackingNumber: parcel.return_tracking_number,
      inboundMethod: parcel.inbound_method,
      outboundMethod: parcel.outbound_method,
      note: parcel.note,
      createdAt: parcel.created_at,
      updatedAt: parcel.updated_at,
      courier: flatten(parcel.courier)
        ? {
            id: flatten(parcel.courier).id,
            name: flatten(parcel.courier).name,
            code: flatten(parcel.courier).code,
            servicePhone: flatten(parcel.courier).service_phone,
          }
        : null,
      shelf: shelfData
        ? {
            id: shelfData.id,
            number: shelfData.number,
            sizeType: shelfData.size_type,
            layers: shelfData.layers,
            capacityPerLayer: shelfData.capacity_per_layer,
          }
        : null,
      inboundOperator: flatten(parcel.inbound_operator)?.username ?? null,
      outboundOperator: flatten(parcel.outbound_operator)?.username ?? null,
      events: (events || []).map((ev: any) => ({
        id: ev.id,
        eventType: ev.event_type,
        operatorType: ev.operator_type,
        operatorName: flatten(ev.operator)?.username ?? null,
        description: ev.description,
        metadata: ev.metadata,
        createdAt: ev.created_at,
      })),
    };
  }

  /** 批量标记异常 */
  async markException(stationId: string, ids: string[], reason: string, operatorId: string) {
    if (!ids.length) throw new BadRequestException('未选择包裹');
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_parcels')
      .update({ status: 'exception', note: reason })
      .in('id', ids)
      .eq('station_id', stationId)
      .in('status', ['in_stock', 'overdue']) // 仅在库/滞留可标记异常
      .select('id');
    if (error) throw new Error(`标记异常失败: ${error.message}`);
    const updatedIds = (data || []).map((r: any) => r.id);
    // 写事件
    if (updatedIds.length > 0) {
      await this.supabase.getClient().from('ss_parcel_events').insert(
        updatedIds.map((pid: string) => ({
          parcel_id: pid,
          event_type: 'exception_register',
          operator_id: operatorId,
          operator_type: 'staff',
          description: reason,
        })),
      );
    }
    return { updated: updatedIds.length, skipped: ids.length - updatedIds.length };
  }
}
