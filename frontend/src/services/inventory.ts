// 库存 API 服务
import { get, post } from './api';
import type {
  InventoryQuery,
  InventoryListResult,
  ParcelDetail,
} from '@/types/inventory';
import type { Shelf, Station, CourierCompany } from '@/types/admin';

function buildQuery(q: InventoryQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (q.phone) params.phone = q.phone;
  if (q.trackingNumber) params.trackingNumber = q.trackingNumber;
  if (q.pickupCode) params.pickupCode = q.pickupCode;
  if (q.courierCompanyId) params.courierCompanyId = q.courierCompanyId;
  if (q.shelfId) params.shelfId = q.shelfId;
  if (q.status) params.status = q.status;
  if (q.collectStatus) params.collectStatus = q.collectStatus;
  if (q.startDate) params.startDate = q.startDate;
  if (q.endDate) params.endDate = q.endDate;
  if (q.page) params.page = String(q.page);
  if (q.pageSize) params.pageSize = String(q.pageSize);
  return params;
}

export function fetchInventory(q: InventoryQuery): Promise<InventoryListResult> {
  const search = new URLSearchParams(buildQuery(q)).toString();
  return get<InventoryListResult>(`/api/inventory?${search}`);
}

// 货架只读列表（店员可访问，供入库/库存页面使用；管理操作走 /api/admin/shelves）
export function fetchShelves(): Promise<Shelf[]> {
  return get<Shelf[]>('/api/inventory/shelves');
}

// 驿站信息只读（店员可访问，供系统管理页面查看；修改走 /api/admin/station）
export function fetchStation(): Promise<Station> {
  return get<Station>('/api/inventory/station');
}

// 快递公司只读列表（店员可访问，供入库/库存/系统管理页面使用；管理操作走 /api/admin/couriers）
export function fetchCouriers(): Promise<CourierCompany[]> {
  return get<CourierCompany[]>('/api/inventory/couriers');
}

export function fetchParcelDetail(id: string): Promise<ParcelDetail> {
  return get<ParcelDetail>(`/api/inventory/${id}`);
}

export function batchMarkException(ids: string[], reason: string): Promise<{ updated: number; skipped: number }> {
  return post<{ updated: number; skipped: number }>('/api/inventory/batch-exception', { ids, reason }, {
    successMessage: '异常标记已提交',
  });
}
