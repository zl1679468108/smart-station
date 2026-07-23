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

// 面单 OCR 识别结果（P1 智能入库）
export interface WaybillOcrResult {
  trackingNumber: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  rawLines: string[];
  matched: {
    trackingNumber: boolean;
    recipientName: boolean;
    recipientPhone: boolean;
  };
  // 本月 OCR 额度使用情况，用于前端提示剩余次数（免费额度防超额）
  quota: {
    used: number;
    limit: number;
    remaining: number;
    warning: boolean;
  };
}
