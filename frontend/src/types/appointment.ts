/** 预约状态 */
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface AppointmentItem {
  id: string;
  stationId: string;
  recipientPhone: string;
  recipientPhoneFull?: string;
  recipientName: string | null;
  slotDate: string;
  slotStart: string;
  slotEnd: string;
  slotLabel: string;
  note: string | null;
  status: AppointmentStatus;
  statusLabel: string;
  source: string;
  cancelReason: string | null;
  handledBy: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 创建后通知提示（客户可见白话） */
  notifyHint?: string | null;
}

export interface AppointmentSlot {
  start: string;
  end: string;
  label: string;
  booked: number;
  remaining: number;
  available: boolean;
  reason: string | null;
}

export interface AppointmentDay {
  date: string;
  weekday: string;
  isToday: boolean;
  slots: AppointmentSlot[];
}

export interface AppointmentSlotsResult {
  stationId: string;
  stationName: string | null;
  businessHours: string | null;
  address: string | null;
  contactPhone: string | null;
  maxPerSlot: number;
  days: AppointmentDay[];
}

export interface AppointmentListResult {
  items: AppointmentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
