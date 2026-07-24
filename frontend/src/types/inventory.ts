// 库存相关类型定义

import type { ParcelSize } from './inbound';

export type ParcelStatus = 'in_stock' | 'out_stock' | 'overdue' | 'exception' | 'returned';

export interface ParcelListItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  pickupCode: string | null;
  status: ParcelStatus;
  size: ParcelSize | null;
  inboundAt: string;
  /** 入库日起算在库天数 */
  daysInStock?: number;
  outboundAt: string | null;
  note: string | null;
  courier: { id: string; name: string; code: string } | null;
  shelf: {
    id: string;
    number: number;
    sizeType: 'small' | 'medium' | 'large';
    layers: number;
    capacityPerLayer: number;
  } | null;
}

export interface ParcelEvent {
  id: string;
  eventType: string;
  operatorType: string | null;
  operatorName: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ParcelDetail extends ParcelListItem {
  shelfLayer: number | null;
  shelfPosition: number | null;
  returnedAt: string | null;
  returnTrackingNumber: string | null;
  inboundMethod: string | null;
  outboundMethod: string | null;
  createdAt: string;
  updatedAt: string;
  courier: { id: string; name: string; code: string; servicePhone: string | null } | null;
  inboundOperator: string | null;
  outboundOperator: string | null;
  events: ParcelEvent[];
}

export interface InventoryListResult {
  items: ParcelListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InventoryQuery {
  phone?: string;
  trackingNumber?: string;
  pickupCode?: string;
  courierCompanyId?: string;
  shelfId?: string;
  status?: ParcelStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
