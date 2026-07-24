export type BillStatus = 'unreconciled' | 'reconciled' | 'discrepancy';
export type FinanceItemType = 'collect' | 'deliver' | 'shipping' | 'insure';
export type FinanceDirection = 'receivable' | 'payable';

export interface CourierRef {
  id: string;
  name: string;
  code: string;
}

export interface CourierRate {
  id: string;
  courierCompanyId: string;
  courier: CourierRef | null;
  effectiveMonth: string;
  firstWeightPrice: number;
  additionalPrice: number;
  firstWeightKg: number;
  collectRate: number;
  deliverRate: number;
  insureRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceBill {
  id: string;
  courierCompanyId: string;
  courier: CourierRef | null;
  billMonth: string;
  collectCount: number;
  deliverCount: number;
  shippingCount: number;
  receivable: number;
  payable: number;
  netAmount: number;
  status: BillStatus;
  reconciledAmount: number | null;
  reconciledNote: string | null;
  generatedAt: string;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceBillListResult {
  items: FinanceBill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FinanceBillItem {
  id: string;
  itemType: FinanceItemType;
  quantity: number;
  amount: number;
  direction: FinanceDirection;
  parcelId: string | null;
  shippingId: string | null;
  createdAt: string;
}

export interface UpsertRateBody {
  courierCompanyId: string;
  effectiveMonth: string;
  firstWeightPrice: number;
  additionalPrice: number;
  firstWeightKg?: number;
  collectRate: number;
  deliverRate: number;
  insureRate?: number;
}

export interface GenerateBillsResult {
  month: string;
  generated: number;
  skipped: number;
  couriers: number;
}


/** 对用户收款日结 */
export interface CashDayItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  pickupCode: string | null;
  freightCollectAmount: number;
  codAmount: number;
  amount: number;
  collectPaidMethod: string;
  collectPaidAt: string;
  outboundAt: string | null;
}

export interface CashDaySummary {
  date: string;
  total: number;
  freightTotal: number;
  codTotal: number;
  byMethod: { cash: number; wechat: number; alipay: number; other: number };
  paidCount: number;
  unpaidInStock: number;
  items: CashDayItem[];
}
