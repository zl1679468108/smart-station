export type ExceptionType = 'lost' | 'damaged' | 'wrong_address' | 'refused' | 'other';
export type ExceptionStatus = 'registered' | 'processing' | 'resolved' | 'compensated';
export type ExceptionResolution = 'compensate' | 'return' | 'destroy' | 'redeliver';

export interface ExceptionParcelSummary {
  id: string;
  trackingNumber: string;
  pickupCode: string;
  recipientName: string;
  recipientPhone: string;
  status: string;
  inboundAt?: string;
}

export interface ExceptionItem {
  id: string;
  type: ExceptionType;
  description: string;
  status: ExceptionStatus;
  resolution?: ExceptionResolution | null;
  resolutionNote?: string | null;
  attachments: string[];
  responsibleUserId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  parcelId: string;
  parcel?: ExceptionParcelSummary | null;
}

export interface ExceptionListResult {
  items: ExceptionItem[];
  total: number;
  page: number;
  pageSize: number;
}
