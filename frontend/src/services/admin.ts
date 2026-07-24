// 系统管理 API 服务
import { get, post, put, patch } from './api';
import type {
  Station,
  Staff,
  StaffWithPassword,
  Shelf,
  CourierCompany,
  StationLayoutConfig,
  LayoutDoor,
  LayoutArea,
  NotifyBindingItem,
  NotifyLogItem,
  NotifyResendResult,
} from '@/types/admin';

// ===== 驿站 =====
export function fetchStation(): Promise<Station> {
  return get<Station>('/api/admin/station');
}

export function updateStation(
  payload: Record<string, unknown>,
): Promise<Station> {
  return put<Station>('/api/admin/station', payload, { successMessage: '驿站信息已保存' });
}

// ===== 仓库 3D 布局配置 =====
export function fetchLayoutConfig(): Promise<{
  stationId: string;
  stationName: string;
  layoutConfig: StationLayoutConfig;
}> {
  return get('/api/admin/station/layout-config');
}

export function updateLayoutConfig(
  payload: Partial<StationLayoutConfig>,
): Promise<{ stationId: string; stationName: string; layoutConfig: StationLayoutConfig }> {
  return put('/api/admin/station/layout-config', payload, { successMessage: '门店布局配置已保存' });
}

/**
 * 仓库 3D 布局统一保存（单接口）
 * 一次性提交：货架位置批量更新 + 仓库尺寸 + 门口列表 + 区域列表
 */
export interface ShelfPositionItem {
  id: string;
  posX?: number | null;
  posY?: number | null;
  rotation?: number;
  zone?: string | null;
}

export function saveStationLayout(payload: {
  shelves?: ShelfPositionItem[];
  bounds?: { width: number; depth: number; height?: number };
  doors?: LayoutDoor[];
  areas?: LayoutArea[];
}): Promise<{ shelvesUpdated: number; layoutConfig: StationLayoutConfig }> {
  return put('/api/admin/station/layout', payload, { successMessage: '门店布局已保存' });
}

// ===== 员工 =====
export function listStaff(): Promise<Staff[]> {
  return get<Staff[]>('/api/admin/staff');
}

export function createStaff(payload: {
  phone: string;
  username?: string;
  password?: string;
  role: 'admin' | 'clerk' | 'viewer';
}): Promise<StaffWithPassword> {
  return post<StaffWithPassword>('/api/admin/staff', payload, { successMessage: '员工已添加' });
}

export function updateStaff(
  id: string,
  payload: { role?: 'admin' | 'clerk' | 'viewer'; username?: string },
): Promise<Staff | undefined> {
  return put<Staff | undefined>(`/api/admin/staff/${id}`, payload, { successMessage: '员工信息已保存' });
}

export function setStaffStatus(
  id: string,
  status: 'active' | 'disabled',
): Promise<{ id: string; status: string }> {
  return patch<{ id: string; status: string }>(`/api/admin/staff/${id}/status`, { status }, {
    successMessage: status === 'active' ? '员工已启用' : '员工已禁用',
  });
}

export function resetStaffPassword(
  id: string,
  payload: { password?: string },
): Promise<{ id: string; newPassword: string }> {
  return patch<{ id: string; newPassword: string }>(
    `/api/admin/staff/${id}/reset-password`,
    payload,
    { successMessage: '员工密码已重置' },
  );
}

// ===== 货架 =====
export function listShelves(): Promise<Shelf[]> {
  return get<Shelf[]>('/api/admin/shelves');
}

export function createShelf(payload: {
  number: number;
  sizeType: 'small' | 'medium' | 'large';
  layers?: number;
  capacityPerLayer?: number;
  description?: string;
}): Promise<Shelf> {
  return post<Shelf>('/api/admin/shelves', payload, { successMessage: '货架已新增' });
}

export function updateShelf(
  id: string,
  payload: {
    number?: number;
    sizeType?: 'small' | 'medium' | 'large';
    layers?: number;
    capacityPerLayer?: number;
    description?: string;
    status?: 'active' | 'disabled';
    posX?: number | null;
    posY?: number | null;
    rotation?: number;
    zone?: string | null;
  },
): Promise<Shelf> {
  return put<Shelf>(`/api/admin/shelves/${id}`, payload, { successMessage: '货架信息已保存' });
}

/** 更新货架位置（拖拽高频调用专用） */
export function updateShelfPosition(
  id: string,
  payload: {
    posX?: number | null;
    posY?: number | null;
    rotation?: number;
    zone?: string | null;
  },
): Promise<Shelf> {
  return put<Shelf>(`/api/admin/shelves/${id}/position`, payload, {
    skipLoading: true,
    skipNotify: true,
  });
}

// ===== 快递公司 =====
export function listCouriers(): Promise<CourierCompany[]> {
  return get<CourierCompany[]>('/api/admin/couriers');
}

export function createCourier(payload: {
  name: string;
  code: string;
  servicePhone?: string;
  trackingPrefixes?: string[];
  sortOrder?: number;
}): Promise<CourierCompany> {
  return post<CourierCompany>('/api/admin/couriers', payload, { successMessage: '快递公司已新增' });
}

export function updateCourier(
  id: string,
  payload: Partial<Pick<CourierCompany, 'name' | 'service_phone' | 'tracking_prefixes' | 'sort_order' | 'status'>>,
): Promise<CourierCompany> {
  return put<CourierCompany>(`/api/admin/couriers/${id}`, payload, {
    successMessage: '快递公司信息已保存',
  });
}

// ===== 通知可观测 =====
export function listNotifyBindings(opts?: {
  limit?: number;
  phone?: string;
}): Promise<{
  items: NotifyBindingItem[];
  total: number;
  message?: string;
}> {
  const limit = opts?.limit ?? 50;
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.phone) params.set('phone', opts.phone);
  return get(`/api/admin/notify/bindings?${params.toString()}`);
}

export function listNotifyLogs(opts?: {
  limit?: number;
  page?: number;
  phone?: string;
  status?: string;
  templateCode?: string;
  todayOnly?: boolean;
  /** unbound | pushed | push_failed */
  reach?: string;
}): Promise<{
  items: NotifyLogItem[];
  total: number;
  page?: number;
  pageSize?: number;
}> {
  const limit = opts?.limit ?? 50;
  const page = opts?.page ?? 1;
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  });
  if (opts?.phone) params.set('phone', opts.phone);
  if (opts?.status) params.set('status', opts.status);
  if (opts?.templateCode) params.set('templateCode', opts.templateCode);
  if (opts?.todayOnly) params.set('todayOnly', '1');
  if (opts?.reach) params.set('reach', opts.reach);
  return get(`/api/admin/notify/logs?${params.toString()}`);
}

export function resendNotifyLog(id: string): Promise<NotifyResendResult> {
  return post(`/api/admin/notify/logs/${encodeURIComponent(id)}/resend`, undefined, {
    successMessage: '已重新发送通知',
  });
}
