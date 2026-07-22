import { get, post, patch, del } from './api';
import type {
  ShippingListResult,
  ShippingItem,
  FreightBreakdown,
  AddressListResult,
  AddressItem,
  CreateShippingBody,
  ShippingStatus,
  AddressRole,
  AddressTag,
} from '@/types/shipping';

export function fetchShippingList(params: {
  status?: ShippingStatus | '';
  pickupType?: 'in_store' | 'door' | '';
  courierCompanyId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<ShippingListResult> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.pickupType) q.set('pickupType', params.pickupType);
  if (params.courierCompanyId) q.set('courierCompanyId', params.courierCompanyId);
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<ShippingListResult>(`/api/shipping/list${s ? `?${s}` : ''}`);
}

export function fetchShippingDetail(id: string): Promise<ShippingItem> {
  return get<ShippingItem>(`/api/shipping/${id}`);
}

export function estimateFreight(body: {
  courierCompanyId: string;
  weight: number;
  insuredAmount?: number;
}): Promise<FreightBreakdown> {
  return post<FreightBreakdown>('/api/shipping/estimate', body, { notifySuccess: false });
}

export function createShipping(body: CreateShippingBody): Promise<ShippingItem> {
  return post<ShippingItem>('/api/shipping/create', body, { successMessage: '寄件单已创建' });
}

export function updateShippingStatus(
  id: string,
  status: ShippingStatus,
  note?: string,
): Promise<ShippingItem> {
  return patch<ShippingItem>(`/api/shipping/${id}/status`, { status, note }, {
    successMessage: '状态已更新',
  });
}

// ===== 地址簿 =====

export function fetchAddressList(params: {
  role?: AddressRole | '';
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<AddressListResult> {
  const q = new URLSearchParams();
  if (params.role) q.set('role', params.role);
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<AddressListResult>(`/api/address-book${s ? `?${s}` : ''}`);
}

export function createAddress(body: {
  role: AddressRole;
  name: string;
  phone: string;
  address: string;
  tag?: AddressTag;
}): Promise<AddressItem> {
  return post<AddressItem>('/api/address-book', body, { successMessage: '地址已保存' });
}

export function updateAddress(
  id: string,
  body: Partial<{ role: AddressRole; name: string; phone: string; address: string; tag: AddressTag }>,
): Promise<AddressItem> {
  return patch<AddressItem>(`/api/address-book/${id}`, body, { successMessage: '地址已更新' });
}

export function deleteAddress(id: string): Promise<{ id: string }> {
  return del<{ id: string }>(`/api/address-book/${id}`, { successMessage: '地址已删除' });
}
