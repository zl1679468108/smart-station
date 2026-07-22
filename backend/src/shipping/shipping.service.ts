import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateShippingDto } from './dto/create-shipping.dto';
import { ShippingQueryDto } from './dto/shipping-query.dto';
import { EstimateFreightDto } from './dto/estimate-freight.dto';
import { UpdateShippingStatusDto } from './dto/update-shipping-status.dto';
import {
  AddressQueryDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './dto/address-book.dto';

interface FreightBreakdown {
  firstWeightPrice: number;
  additionalPrice: number;
  firstWeightKg: number;
  additionalWeight: number;
  freightBeforeInsure: number;
  insureRate: number;
  insureFee: number;
  freight: number;
  effectiveMonth: string | null;
  usedDefaultRate: boolean;
}

// 无费率配置时的兜底默认值（元），保证运费试算与寄件下单可用
const DEFAULT_RATE = {
  first_weight_price: 12,
  additional_price: 2,
  first_weight_kg: 1,
  insure_rate: 0.005,
};

@Injectable()
export class ShippingService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  private currentMonth(): string {
    // 北京时间当前月份 YYYY-MM
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    return now.toISOString().slice(0, 7);
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private async findRate(stationId: string, courierCompanyId: string) {
    const month = this.currentMonth();
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_courier_rates')
      .select(
        'first_weight_price, additional_price, first_weight_kg, insure_rate, effective_month',
      )
      .eq('station_id', stationId)
      .eq('courier_company_id', courierCompanyId)
      .lte('effective_month', month)
      .order('effective_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`查询费率失败: ${error.message}`);
    return data;
  }

  private computeFreight(
    rate: {
      first_weight_price: number;
      additional_price: number;
      first_weight_kg: number;
      insure_rate: number;
      effective_month?: string;
    } | null,
    weight: number,
    insuredAmount: number,
  ): FreightBreakdown {
    const usedDefaultRate = !rate;
    const r = rate || DEFAULT_RATE;
    const firstWeightKg = Number(r.first_weight_kg) || 1;
    const firstWeightPrice = Number(r.first_weight_price) || 0;
    const additionalPrice = Number(r.additional_price) || 0;
    const insureRate = Number(r.insure_rate) || 0;

    const additionalWeight = Math.max(0, Math.ceil(weight - firstWeightKg));
    const freightBeforeInsure = this.round2(
      firstWeightPrice + additionalWeight * additionalPrice,
    );
    const insureFee = this.round2((insuredAmount || 0) * insureRate);
    const freight = this.round2(freightBeforeInsure + insureFee);

    return {
      firstWeightPrice,
      additionalPrice,
      firstWeightKg,
      additionalWeight,
      freightBeforeInsure,
      insureRate,
      insureFee,
      freight,
      effectiveMonth: rate ? rate.effective_month || null : null,
      usedDefaultRate,
    };
  }

  async estimate(stationId: string, dto: EstimateFreightDto) {
    const rate = await this.findRate(stationId, dto.courierCompanyId);
    return this.computeFreight(rate, dto.weight, dto.insuredAmount || 0);
  }

  private async generateShippingNo(stationId: string): Promise<string> {
    const client = this.supabase.getClient();
    for (let i = 0; i < 50; i++) {
      const rand = Math.floor(100000 + Math.random() * 900000);
      const stamp = new Date(Date.now() + 8 * 3600 * 1000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, '');
      const shippingNo = `JJ${stamp}${rand}`;
      const { data, error } = await client
        .from('ss_shippings')
        .select('id')
        .eq('station_id', stationId)
        .eq('shipping_no', shippingNo)
        .maybeSingle();
      if (error) throw new Error(`生成寄件单号失败: ${error.message}`);
      if (!data) return shippingNo;
    }
    throw new Error('生成寄件单号冲突次数过多，请重试');
  }

  async create(stationId: string, dto: CreateShippingDto, operatorId: string) {
    const client = this.supabase.getClient();

    let freight = 0;
    if (dto.courierCompanyId) {
      const rate = await this.findRate(stationId, dto.courierCompanyId);
      freight = this.computeFreight(rate, dto.weight, dto.insuredAmount || 0).freight;
    }

    const shippingNo = await this.generateShippingNo(stationId);
    const { data: row, error } = await client
      .from('ss_shippings')
      .insert({
        station_id: stationId,
        shipping_no: shippingNo,
        courier_company_id: dto.courierCompanyId || null,
        pickup_type: dto.pickupType || 'in_store',
        pickup_time: dto.pickupTime || null,
        pickup_address: dto.pickupAddress || null,
        sender_name: dto.senderName,
        sender_phone: dto.senderPhone,
        sender_address: dto.senderAddress,
        receiver_name: dto.receiverName,
        receiver_phone: dto.receiverPhone,
        receiver_address: dto.receiverAddress,
        item_type: dto.itemType || null,
        weight: dto.weight,
        insured_amount: dto.insuredAmount || 0,
        freight,
        status: 'pending',
        note: dto.note || null,
        created_by: operatorId,
      })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`创建寄件单失败: ${error.message}`);
    return this.detail(stationId, row.id);
  }

  async list(stationId: string, q: ShippingQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_shippings')
      .select(
        `id, shipping_no, pickup_type, pickup_time, pickup_address,
         sender_name, sender_phone, sender_address,
         receiver_name, receiver_phone, receiver_address,
         item_type, weight, insured_amount, freight, status, note,
         created_at, updated_at, courier_company_id,
         courier:ss_courier_companies(id, name, code)`,
        { count: 'exact' },
      )
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.status) query = query.eq('status', q.status);
    if (q.pickupType) query = query.eq('pickup_type', q.pickupType);
    if (q.courierCompanyId) query = query.eq('courier_company_id', q.courierCompanyId);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询寄件单失败: ${error.message}`);

    let items = (data || []).map((row) => this.mapShipping(row));
    if (q.keyword?.trim()) {
      const kw = q.keyword.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.shippingNo || '').toLowerCase().includes(kw) ||
          (i.senderPhone || '').includes(kw) ||
          (i.receiverPhone || '').includes(kw) ||
          (i.senderName || '').toLowerCase().includes(kw) ||
          (i.receiverName || '').toLowerCase().includes(kw),
      );
    }

    return { items, total: count ?? items.length, page, pageSize };
  }

  async detail(stationId: string, id: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_shippings')
      .select(
        `id, shipping_no, pickup_type, pickup_time, pickup_address,
         sender_name, sender_phone, sender_address,
         receiver_name, receiver_phone, receiver_address,
         item_type, weight, insured_amount, freight, status, note,
         created_at, updated_at, courier_company_id,
         courier:ss_courier_companies(id, name, code)`,
      )
      .eq('station_id', stationId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`查询寄件单详情失败: ${error.message}`);
    if (!data) throw new NotFoundException('寄件单不存在');
    return this.mapShipping(data);
  }

  async updateStatus(stationId: string, id: string, dto: UpdateShippingStatusDto) {
    const client = this.supabase.getClient();
    const { data: existing, error } = await client
      .from('ss_shippings')
      .select('id, status')
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询寄件单失败: ${error.message}`);
    if (!existing) throw new NotFoundException('寄件单不存在');
    if (existing.status === 'shipped' || existing.status === 'cancelled') {
      throw new BadRequestException('已发出或已取消的寄件单不可再变更状态');
    }

    const patch: Record<string, unknown> = {
      status: dto.status,
      updated_at: new Date().toISOString(),
    };
    if (dto.note !== undefined) patch.note = dto.note;

    const { error: uErr } = await client.from('ss_shippings').update(patch).eq('id', id);
    if (uErr) throw new Error(`更新寄件单状态失败: ${uErr.message}`);
    return this.detail(stationId, id);
  }

  private mapShipping(row: any) {
    const courier = row.courier
      ? { id: row.courier.id, name: row.courier.name, code: row.courier.code }
      : null;
    return {
      id: row.id,
      shippingNo: row.shipping_no,
      pickupType: row.pickup_type,
      pickupTime: row.pickup_time,
      pickupAddress: row.pickup_address,
      senderName: row.sender_name,
      senderPhone: row.sender_phone,
      senderAddress: row.sender_address,
      receiverName: row.receiver_name,
      receiverPhone: row.receiver_phone,
      receiverAddress: row.receiver_address,
      itemType: row.item_type,
      weight: row.weight,
      insuredAmount: row.insured_amount,
      freight: row.freight,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      courierCompanyId: row.courier_company_id,
      courier,
    };
  }

  // ===== 地址簿 =====

  async listAddresses(stationId: string, q: AddressQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .getClient()
      .from('ss_address_book')
      .select('id, role, name, phone, address, tag, created_at, updated_at', { count: 'exact' })
      .eq('station_id', stationId)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (q.role) query = query.eq('role', q.role);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询地址簿失败: ${error.message}`);

    let items = (data || []).map((row) => this.mapAddress(row));
    if (q.keyword?.trim()) {
      const kw = q.keyword.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(kw) ||
          (i.phone || '').includes(kw) ||
          (i.address || '').toLowerCase().includes(kw),
      );
    }

    return { items, total: count ?? items.length, page, pageSize };
  }

  async createAddress(stationId: string, dto: CreateAddressDto, operatorId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_address_book')
      .insert({
        station_id: stationId,
        role: dto.role,
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        tag: dto.tag || null,
        created_by: operatorId,
      })
      .select('id, role, name, phone, address, tag, created_at, updated_at')
      .maybeSingle();
    if (error) throw new Error(`新增地址失败: ${error.message}`);
    return this.mapAddress(data);
  }

  async updateAddress(stationId: string, id: string, dto: UpdateAddressDto) {
    const client = this.supabase.getClient();
    const { data: existing, error } = await client
      .from('ss_address_book')
      .select('id')
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询地址失败: ${error.message}`);
    if (!existing) throw new NotFoundException('地址不存在');

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.tag !== undefined) patch.tag = dto.tag;

    const { data, error: uErr } = await client
      .from('ss_address_book')
      .update(patch)
      .eq('id', id)
      .select('id, role, name, phone, address, tag, created_at, updated_at')
      .maybeSingle();
    if (uErr) throw new Error(`更新地址失败: ${uErr.message}`);
    return this.mapAddress(data);
  }

  async deleteAddress(stationId: string, id: string) {
    const client = this.supabase.getClient();
    const { data: existing, error } = await client
      .from('ss_address_book')
      .select('id')
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询地址失败: ${error.message}`);
    if (!existing) throw new NotFoundException('地址不存在');
    const { error: dErr } = await client.from('ss_address_book').delete().eq('id', id);
    if (dErr) throw new Error(`删除地址失败: ${dErr.message}`);
    return { id };
  }

  private mapAddress(row: any) {
    return {
      id: row.id,
      role: row.role,
      name: row.name,
      phone: row.phone,
      address: row.address,
      tag: row.tag,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
