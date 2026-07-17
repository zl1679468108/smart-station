// API 请求封装：基于原生 fetch，自动附加鉴权头并解包后端统一响应结构
// 后端响应格式：{ success, message, data }，request<T> 直接返回 data 部分

import { showGlobalLoading, hideGlobalLoading } from '@/utils/loading';

const TOKEN_KEY = 'ss_token';
const STATION_ID_KEY = 'ss_station_id';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// 会触发 loading toast 的方法（提交/变更数据），GET 不在内
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 扩展 RequestInit，支持跳过全局 loading（个别轮询/后台同步接口可用）
export interface RequestOptions extends RequestInit {
  /** 设为 true 可跳过全局 loading toast（默认对 POST/PUT/PATCH/DELETE 自动显示） */
  skipLoading?: boolean;
}

// ===== Token 与驿站 ID 管理 =====

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStationId(): string | null {
  return localStorage.getItem(STATION_ID_KEY);
}

export function setStationId(stationId: string): void {
  localStorage.setItem(STATION_ID_KEY, stationId);
}

export function clearStationId(): void {
  localStorage.removeItem(STATION_ID_KEY);
}

// ===== 核心请求函数 =====

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const token = getToken();
  const stationId = getStationId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // 自动附加鉴权与当前驿站头
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (stationId) {
    headers['x-station-id'] = stationId;
  }

  // 对变更类方法（POST/PUT/PATCH/DELETE）自动显示全局 loading toast
  const method = (options.method || 'GET').toUpperCase();
  const shouldShowLoading = !options.skipLoading && MUTATION_METHODS.has(method);
  if (shouldShowLoading) showGlobalLoading();

  try {
    const response = await fetch(`${baseUrl}${url}`, { ...options, headers });

    // 401 未授权：清除 token 并跳转登录页（HashRouter 用 hash 路径）
    if (response.status === 401) {
      clearToken();
      if (!window.location.hash.includes('/admin/login')) {
        window.location.hash = '#/admin/login';
      }
      throw new Error('未授权，请重新登录');
    }

    const result: ApiResponse<T> = await response.json();

    if (!result.success) {
      throw new Error(result.message || '请求失败');
    }

    return result.data;
  } finally {
    if (shouldShowLoading) hideGlobalLoading();
  }
}

// ===== 请求方法辅助函数 =====

export const get = <T>(url: string, options?: RequestOptions): Promise<T> =>
  request<T>(url, { ...options, method: 'GET' });

export const post = <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
  request<T>(url, {
    ...options,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const put = <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
  request<T>(url, {
    ...options,
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

export const del = <T>(url: string, options?: RequestOptions): Promise<T> =>
  request<T>(url, { ...options, method: 'DELETE' });

export const patch = <T>(url: string, body?: unknown, options?: RequestOptions): Promise<T> =>
  request<T>(url, {
    ...options,
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
