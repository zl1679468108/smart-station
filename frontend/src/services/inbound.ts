// 入库 API 服务
import { post } from './api';
import type {
  BatchInboundResult,
  CheckTrackingResult,
  InboundPayload,
  InboundResult,
} from '@/types/inbound';

/** 入库前运单预检 */
export function checkTracking(
  trackingNumber: string,
): Promise<CheckTrackingResult> {
  return post(
    '/api/inbound/check-tracking',
    { trackingNumber },
    { successMessage: false, notifyError: false, skipLoading: true },
  );
}

export function inbound(payload: InboundPayload): Promise<InboundResult> {
  return post<InboundResult>('/api/inbound', payload, { successMessage: '包裹已入库' });
}

export function batchInbound(items: InboundPayload[]): Promise<BatchInboundResult> {
  return post<BatchInboundResult>('/api/inbound/batch', { items }, { successMessage: '批量入库已完成' });
}

/** 补发到件通知（未绑定后绑定、失败重试） */
export function resendInboundNotice(id: string): Promise<{
  id: string;
  enabled: boolean;
  attempted: boolean;
  customerBound: boolean;
  customerPushed: boolean;
  customerChannels: string[];
  staffMessage: string;
  trackingNumber?: string;
  pickupCode?: string;
}> {
  return post(`/api/inbound/${id}/resend-notice`, undefined, {
    successMessage: false,
  });
}

