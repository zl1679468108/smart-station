// 入库 API 服务
import { post } from './api';
import type { InboundPayload, InboundResult, BatchInboundResult } from '@/types/inbound';

export function inbound(payload: InboundPayload): Promise<InboundResult> {
  return post<InboundResult>('/api/inbound', payload, { successMessage: '包裹已入库' });
}

export function batchInbound(items: InboundPayload[]): Promise<BatchInboundResult> {
  return post<BatchInboundResult>('/api/inbound/batch', { items }, { successMessage: '批量入库已完成' });
}
