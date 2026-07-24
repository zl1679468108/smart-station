import { get, patch } from './api';
import type { AppointmentItem, AppointmentListResult, AppointmentStatus } from '@/types/appointment';

export function fetchAppointments(params: {
  slotDate?: string;
  status?: string;
  phone?: string;
  page?: number;
  pageSize?: number;
}): Promise<AppointmentListResult> {
  const q = new URLSearchParams();
  if (params.slotDate) q.set('slotDate', params.slotDate);
  if (params.status) q.set('status', params.status);
  if (params.phone) q.set('phone', params.phone);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<AppointmentListResult>(`/api/appointments${s ? `?${s}` : ''}`);
}

export function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  cancelReason?: string,
): Promise<AppointmentItem> {
  return patch<AppointmentItem>(
    `/api/appointments/${id}/status`,
    { status, cancelReason },
    { successMessage: '状态已更新' },
  );
}
