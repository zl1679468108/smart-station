/** 入库运单预检：已在库包裹摘要 */
export interface DuplicateParcelInfo {
  id: string;
  trackingNumber: string;
  pickupCode: string;
  status: string;
  statusLabel: string;
  recipientName?: string | null;
  recipientPhoneMasked?: string | null;
  shelfNumber?: number | null;
  shelfLayer?: number | null;
  shelfPosition?: number | null;
  inboundAt?: string | null;
}

export interface CheckTrackingResult {
  exists: boolean;
  trackingNumber: string;
  message: string;
  parcel?: DuplicateParcelInfo;
}

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
  /** 到付运费（元） */
  freightCollectAmount?: number;
  /** 代收货款（元） */
  codAmount?: number;
  inboundMethod?: 'scan' | 'manual' | 'batch';
}

export interface InboundNotifyFeedback {
  enabled: boolean;
  attempted: boolean;
  customerBound: boolean;
  customerPushed: boolean;
  customerChannels: string[];
  staffMessage: string;
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
  recipientPhone?: string;
  freightCollectAmount?: number;
  codAmount?: number;
  collectStatus?: string;
  collectDueAmount?: number;
  notify?: InboundNotifyFeedback;
}

export interface BatchNotifySummary {
  notifyEnabled: number;
  notifyDisabled: number;
  customerBound: number;
  customerPushed: number;
  customerUnbound: number;
  customerPushFailed: number;
  staffMessage: string;
}

export interface BatchInboundResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ index: number; result: InboundResult }>;
  errors: Array<{ index: number; error: string; item: InboundPayload }>;
  notifySummary?: BatchNotifySummary;
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
