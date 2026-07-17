// 入库相关类型定义

export type ParcelSize = 'small' | 'medium' | 'large';

export interface InboundPayload {
  trackingNumber: string;
  courierCompanyId?: string;
  recipientName: string;
  recipientPhone: string;
  size: ParcelSize;
  shelfId?: string;
  note?: string;
  inboundMethod?: 'scan' | 'manual' | 'batch';
}

export interface InboundResult {
  id: string;
  trackingNumber: string;
  pickupCode: string;
  shelfNumber: number;
  shelfLayer: number;
  shelfPosition: number;
  inboundAt: string;
  courierCompanyCode: string | null;
  courierCompanyName: string | null;
}

export interface BatchInboundResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ index: number; result: InboundResult }>;
  errors: Array<{ index: number; error: string; item: InboundPayload }>;
}
