import { get, post } from './api';
import type { OverdueListResult, OverdueScanResult, OverdueLevel } from '@/types/overdue';

export function fetchOverdueList(params: {
  level?: OverdueLevel | '';
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<OverdueListResult> {
  const q = new URLSearchParams();
  if (params.level) q.set('level', params.level);
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<OverdueListResult>(`/api/overdue${s ? `?${s}` : ''}`);
}

export function scanOverdue(): Promise<OverdueScanResult> {
  return post<OverdueScanResult>('/api/overdue/scan', undefined, { notifySuccess: false });
}

export function returnOverdue(
  id: string,
  action: 'start' | 'complete',
  note?: string,
): Promise<{ id: string; returnStage: string }> {
  return post(`/api/overdue/${id}/return`, { action, note }, {
    successMessage: action === 'start' ? '已标记退回中' : '已完成退回',
  });
}

/** 单件补发滞留提醒 */
export function remindOverdue(id: string): Promise<{
  id: string;
  days: number;
  trackingNumber?: string;
  pickupCode?: string;
  customerBound: boolean;
  customerPushed: boolean;
  staffMessage: string;
}> {
  return post(`/api/overdue/${id}/remind`, undefined, {
    successMessage: false,
  });
}

/** 本页批量补发滞留提醒（最多 30 条） */
export function remindOverdueBatch(ids: string[]): Promise<{
  total: number;
  pushed: number;
  unbound: number;
  failed: number;
  staffMessage: string;
  results: Array<{
    id: string;
    ok: boolean;
    customerBound?: boolean;
    customerPushed?: boolean;
    staffMessage: string;
  }>;
}> {
  return post('/api/overdue/remind-batch', { ids }, {
    successMessage: false,
  });
}

