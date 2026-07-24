export type OverdueLevel = 'warn' | 'remind' | 'return';
export type ReturnStage = 'none' | 'pending' | 'returning' | 'returned';

export interface OverdueItem {
  id: string;
  trackingNumber: string;
  pickupCode: string;
  recipientName: string;
  recipientPhone: string;
  inboundAt: string;
  days: number;
  level: OverdueLevel | null;
  returnStage: ReturnStage;
  status: string;
  note?: string | null;
  shelf?: { id: string; number: number; sizeType: string } | null;
  courier?: { id: string; name: string; code: string } | null;
}

export interface OverdueCounts {
  all: number;
  warn: number;
  remind: number;
  return: number;
}

export interface OverdueListResult {
  items: OverdueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: OverdueCounts;
  thresholds: { warnDays: number; remindDays: number; returnDays: number };
}

export interface OverdueScanResult {
  scanned: number;
  markedOverdue: number;
  warned: number;
  reminded: number;
  returnCandidates: number;
  /** 本次扫描成功私信到客户微信的件数 */
  customerNotified?: number;
  /** 本次扫描应提醒但客户未绑定的件数 */
  customerUnbound?: number;
}
