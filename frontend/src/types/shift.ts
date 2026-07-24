export type ShiftStatus = 'open' | 'closed';

export interface ShiftItem {
  id: string;
  stationId: string;
  operatorId: string;
  operatorName: string | null;
  status: ShiftStatus;
  startedAt: string;
  endedAt: string | null;
  openingNote: string | null;
  closingNote: string | null;
  handoverToUserId: string | null;
  handoverToName: string | null;
  inboundCount: number;
  outboundCount: number;
  collectPaidCount: number;
  collectPaidTotal: number;
  collectCash: number;
  collectWechat: number;
  collectAlipay: number;
  collectOther: number;
  stockCount: number | null;
  createdAt?: string;
}

export interface ShiftListResult {
  items: ShiftItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface StaffPerformanceItem {
  userId: string;
  username: string;
  inboundCount: number;
  outboundCount: number;
  collectPaidCount: number;
  collectPaidTotal: number;
  shiftCount: number;
  shiftMinutes: number;
}

export interface StaffPerformanceResult {
  startDate: string;
  endDate: string;
  items: StaffPerformanceItem[];
}
