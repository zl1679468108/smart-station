import { get, patch, post } from './api';
import type {
  AppointmentItem,
  AppointmentListResult,
  AppointmentSlotsResult,
  AppointmentStatus,
} from '@/types/appointment';

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

export function fetchAppointmentSlots(): Promise<AppointmentSlotsResult> {
  return get<AppointmentSlotsResult>('/api/appointments/slots');
}

export function createStaffAppointment(payload: {
  phone: string;
  recipientName?: string;
  slotDate: string;
  slotStart: string;
  slotEnd: string;
  note?: string;
}): Promise<AppointmentItem> {
  return post<AppointmentItem>('/api/appointments', payload, {
    successMessage: '代客预约已登记',
  });
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
