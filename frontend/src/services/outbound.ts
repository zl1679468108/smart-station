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
  return post<OutboundSearchResult>('/api/outbound/search', params, { notifySuccess: false });
}

/** 人工辅助出库（凭运单号或取件码） */
export function manualOutbound(payload: {
  trackingNumber?: string;
  pickupCode?: string;
  /** 收件人手机号后 4 位（取件人当面核验） */
  phoneTail: string;
  /** 可选核验备注 */
  verifyNote?: string;
  /** 可选拍照留证 base64 */
  evidenceImageBase64?: string;
}): Promise<OutboundResult> {
  return post<OutboundResult>('/api/outbound/manual', payload, { successMessage: '包裹已出库' });
}

/** 自助扫描出库（公开接口；可绑 VITE_KIOSK_STATION_ID 限定驿站） */
export function selfServiceOutbound(
  trackingNumber: string,
  stationId?: string,
): Promise<OutboundResult> {
  const payload: { trackingNumber: string; stationId?: string } = { trackingNumber };
  const envStation = import.meta.env.VITE_KIOSK_STATION_ID as string | undefined;
  const boundStationId = stationId || envStation;
  if (boundStationId) payload.stationId = boundStationId;
  return post<OutboundResult>('/api/outbound/self-service', payload, {
    successMessage: '包裹已出库',
  });
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
