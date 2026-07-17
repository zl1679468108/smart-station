// 出库 API 服务
import { get, post } from './api';
import type {
  OutboundResult,
  OutboundRecordListResult,
  OutboundRecordQuery,
  OutboundSearchResult,
  OutboundSearchParams,
} from '@/types/outbound';

/** 出库前查询在库包裹（1.1.0 新增，不脱敏，工作人员核验用） */
export function searchParcels(params: OutboundSearchParams): Promise<OutboundSearchResult> {
  return post<OutboundSearchResult>('/api/outbound/search', params);
}

/** 人工辅助出库（凭运单号或取件码） */
export function manualOutbound(payload: {
  trackingNumber?: string;
  pickupCode?: string;
}): Promise<OutboundResult> {
  return post<OutboundResult>('/api/outbound/manual', payload);
}

/** 自助扫描出库（公开接口，仅凭运单号） */
export function selfServiceOutbound(trackingNumber: string): Promise<OutboundResult> {
  return post<OutboundResult>('/api/outbound/self-service', { trackingNumber });
}

/** 出库记录列表 */
export function listOutboundRecords(q: OutboundRecordQuery): Promise<OutboundRecordListResult> {
  const params: Record<string, string> = {};
  if (q.startDate) params.startDate = q.startDate;
  if (q.endDate) params.endDate = q.endDate;
  if (q.method) params.method = q.method;
  if (q.page) params.page = String(q.page);
  if (q.pageSize) params.pageSize = String(q.pageSize);
  const search = new URLSearchParams(params).toString();
  return get<OutboundRecordListResult>(`/api/outbound/records?${search}`);
}
