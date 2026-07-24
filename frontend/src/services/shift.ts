import { get, post } from './api';
import type {
  ShiftItem,
  ShiftListResult,
  StaffPerformanceResult,
} from '@/types/shift';

export function fetchCurrentShift(): Promise<ShiftItem | null> {
  return get<ShiftItem | null>('/api/shifts/current', { notifyError: true });
}

export function openShift(openingNote?: string): Promise<ShiftItem> {
  return post<ShiftItem>(
    '/api/shifts/open',
    { openingNote },
    { successMessage: '已开班' },
  );
}

export function closeShift(
  id: string,
  body: { closingNote?: string; handoverToUserId?: string; stockCount?: number },
): Promise<ShiftItem> {
  return post<ShiftItem>(`/api/shifts/${id}/close`, body, {
    successMessage: '已交班',
  });
}

export function fetchShifts(params: {
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<ShiftListResult> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.startDate) q.set('startDate', params.startDate);
  if (params.endDate) q.set('endDate', params.endDate);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<ShiftListResult>(`/api/shifts${s ? `?${s}` : ''}`);
}

export function fetchStaffPerformance(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<StaffPerformanceResult> {
  const q = new URLSearchParams();
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  const s = q.toString();
  return get<StaffPerformanceResult>(`/api/shifts/performance${s ? `?${s}` : ''}`);
}
