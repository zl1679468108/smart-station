import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ExceptionQueryDto } from './dto/exception-query.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { UpdateExceptionDto } from './dto/update-exception.dto';

@Injectable()
export class ExceptionService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  async list(stationId: string, q: ExceptionQueryDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = this.supabase
      .getClient()
      .from('ss_exceptions')
      .select(
        `id, type, description, status, resolution, resolution_note, attachments,
         responsible_user_id, created_by, created_at, updated_at, resolved_at, parcel_id,
         parcel:ss_parcels(id, tracking_number, pickup_code, recipient_name, recipient_phone, status)`,
        { count: 'exact' },
      )
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (q.status) query = query.eq('status', q.status);
    if (q.type) query = query.eq('type', q.type);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询异常件失败: ${error.message}`);

    let items = (data || []).map((row) => this.mapRow(row));
    if (q.keyword?.trim()) {
      const kw = q.keyword.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.parcel?.trackingNumber || '').toLowerCase().includes(kw) ||
          (i.parcel?.pickupCode || '').toLowerCase().includes(kw) ||
          (i.parcel?.recipientPhone || '').includes(kw) ||
          (i.description || '').toLowerCase().includes(kw),
      );
    }

    return { items, total: count ?? items.length, page, pageSize };
  }

  async detail(stationId: string, id: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_exceptions')
      .select(
        `id, type, description, status, resolution, resolution_note, attachments,
         responsible_user_id, created_by, created_at, updated_at, resolved_at, parcel_id,
         parcel:ss_parcels(id, tracking_number, pickup_code, recipient_name, recipient_phone, status, inbound_at)`,
      )
      .eq('station_id', stationId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`查询异常件详情失败: ${error.message}`);
    if (!data) throw new NotFoundException('异常记录不存在');
    return this.mapRow(data);
  }

  async create(stationId: string, dto: CreateExceptionDto, operatorId: string) {
    const client = this.supabase.getClient();
    const { data: parcel, error: pErr } = await client
      .from('ss_parcels')
      .select('id, status')
      .eq('id', dto.parcelId)
      .eq('station_id', stationId)
      .maybeSingle();
    if (pErr) throw new Error(`查询包裹失败: ${pErr.message}`);
    if (!parcel) throw new NotFoundException('包裹不存在');
    if (!['in_stock', 'overdue', 'exception'].includes(parcel.status)) {
      throw new BadRequestException('仅在库/滞留/已异常包裹可登记异常');
    }

    const attachments = (dto.attachments || []).slice(0, 5);
    const { data: row, error } = await client
      .from('ss_exceptions')
      .insert({
        station_id: stationId,
        parcel_id: dto.parcelId,
        type: dto.type,
        description: dto.description || '',
        responsible_user_id: dto.responsibleUserId || null,
        status: 'registered',
        attachments,
        created_by: operatorId,
      })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`登记异常失败: ${error.message}`);

    if (parcel.status !== 'exception') {
      await client
        .from('ss_parcels')
        .update({ status: 'exception', note: dto.description || '异常件' })
        .eq('id', dto.parcelId);
    }

    await client.from('ss_parcel_events').insert({
      parcel_id: dto.parcelId,
      event_type: 'exception_register',
      operator_id: operatorId,
      operator_type: 'staff',
      description: dto.description || dto.type,
      metadata: { exceptionId: row?.id, type: dto.type },
    });

    return this.detail(stationId, row.id);
  }

  async update(stationId: string, id: string, dto: UpdateExceptionDto, operatorId: string) {
    const client = this.supabase.getClient();
    const { data: existing, error } = await client
      .from('ss_exceptions')
      .select('id, parcel_id, status')
      .eq('id', id)
      .eq('station_id', stationId)
      .maybeSingle();
    if (error) throw new Error(`查询异常失败: ${error.message}`);
    if (!existing) throw new NotFoundException('异常记录不存在');

    const nextStatus = dto.status || existing.status;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.status) patch.status = dto.status;
    if (dto.resolution !== undefined) patch.resolution = dto.resolution;
    if (dto.resolutionNote !== undefined) patch.resolution_note = dto.resolutionNote;
    if (nextStatus === 'resolved' || nextStatus === 'compensated') {
      patch.resolved_at = new Date().toISOString();
      if (!dto.status) patch.status = nextStatus;
    }

    const { error: uErr } = await client.from('ss_exceptions').update(patch).eq('id', id);
    if (uErr) throw new Error(`更新异常失败: ${uErr.message}`);

    if (nextStatus === 'resolved' || nextStatus === 'compensated') {
      await client.from('ss_parcel_events').insert({
        parcel_id: existing.parcel_id,
        event_type: 'exception_resolve',
        operator_id: operatorId,
        operator_type: 'staff',
        description: dto.resolutionNote || dto.resolution || nextStatus,
        metadata: { exceptionId: id, resolution: dto.resolution, status: nextStatus },
      });
      if (dto.resolution === 'return') {
        await client
          .from('ss_parcels')
          .update({ status: 'returned' })
          .eq('id', existing.parcel_id);
      }
    } else if (dto.status === 'processing') {
      // no parcel change
    }

    return this.detail(stationId, id);
  }

  private mapRow(row: any) {
    const parcel = row.parcel
      ? {
          id: row.parcel.id,
          trackingNumber: row.parcel.tracking_number,
          pickupCode: row.parcel.pickup_code,
          recipientName: row.parcel.recipient_name,
          recipientPhone: row.parcel.recipient_phone,
          status: row.parcel.status,
          inboundAt: row.parcel.inbound_at,
        }
      : null;
    return {
      id: row.id,
      type: row.type,
      description: row.description,
      status: row.status,
      resolution: row.resolution,
      resolutionNote: row.resolution_note,
      attachments: row.attachments || [],
      responsibleUserId: row.responsible_user_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      parcelId: row.parcel_id,
      parcel,
    };
  }
}
