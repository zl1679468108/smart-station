// 出库相关类型定义

export interface OutboundResult {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  pickupCode: string | null;
  courierName: string | null;
  outboundAt: string;
  outboundMethod: 'manual' | 'self_service';
}

/** 出库前查询参数（1.1.0 新增） */
export interface OutboundSearchParams {
  phone?: string;
  trackingNumber?: string;
  pickupCode?: string;
}

/** 出库前查询结果项（不脱敏，工作人员核验用） */
export interface OutboundSearchItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  pickupCode: string | null;
  /** in_stock | overdue */
  status?: string;
  inboundAt: string;
  courierName: string | null;
}

/** 出库前查询结果 */
export interface OutboundSearchResult {
  items: OutboundSearchItem[];
  total: number;
}

export interface OutboundRecordItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  pickupCode: string | null;
  outboundAt: string;
  outboundMethod: 'manual' | 'self_service' | null;
  inboundAt: string;
  operatorName: string | null;
  courierName: string | null;
}

export interface OutboundRecordListResult {
  items: OutboundRecordItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OutboundRecordQuery {
  startDate?: string;
  endDate?: string;
  method?: 'manual' | 'self_service';
  page?: number;
  pageSize?: number;
}
