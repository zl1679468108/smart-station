// API 请求封装：基于原生 fetch，自动附加鉴权头并解包后端统一响应结构
// 后端响应格式：{ success, message, data }，request<T> 直接返回 data 部分

import { showGlobalLoading, hideGlobalLoading } from '@/utils/loading';
import { notifyError, notifySuccess } from '@/utils/notification';

const TOKEN_KEY = 'ss_token';
const STATION_ID_KEY = 'ss_station_id';
export const AUTH_EXPIRED_EVENT = 'smart-station:auth-expired';

// 短时去重：React Query 重试 / 多接口并发失败时避免刷屏
const ERROR_NOTIFY_DEDUP_MS = 2500;
let lastErrorNotifyAt = 0;
let lastErrorNotifyMessage = '';

function formatRequestError(err: unknown): string {
  if (!(err instanceof Error) || !err.message) {
    return '请求失败，请稍后重试';
  }
  const msg = err.message;
  // 浏览器原生网络错误（后端未启动、代理断开、DNS 失败等）
  if (
    msg === 'Failed to fetch' ||
    msg === 'NetworkError when attempting to fetch resource.' ||
    msg === 'Load failed' ||
    msg === 'Network request failed' ||
    /Failed to fetch/i.test(msg)
  ) {
    return '网络连接失败，请确认后端服务已启动（默认 3030）后重试';
  }
  if (err.name === 'AbortError' || /aborted/i.test(msg)) {
    return '请求已取消，请重试';
  }
  return msg;
}

/** 带业务 data 的 API 错误（如重复运单详情） */
export class ApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, opts?: { status?: number; data?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts?.status;
    this.data = opts?.data;
  }
}

function notifyRequestError(message: string): void {
  const now = Date.now();
  if (message === lastErrorNotifyMessage && now - lastErrorNotifyAt < ERROR_NOTIFY_DEDUP_MS) {
    return;
  }
  lastErrorNotifyAt = now;
  lastErrorNotifyMessage = message;
  notifyError(message);
}


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
  /** 设为 true 可对 GET 等读取请求也显示全局 loading toast（如切换 tab/筛选时） */
  forceLoading?: boolean;
  /** 设为 true 可跳过全局 notification（默认错误都提醒，写操作成功提醒） */
  skipNotify?: boolean;
  /** 覆盖成功提示文案；false 可关闭本次成功提示 */
  successMessage?: string | false;
  /** 覆盖错误提示文案；false 可关闭本次错误提示 */
  errorMessage?: string | false;
  /** GET 默认不提示成功；写操作默认提示成功，可用此项显式控制 */
  notifySuccess?: boolean;
  /** 默认所有接口错误都提示，可用此项显式控制 */
  notifyError?: boolean;
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
  const isMutation = MUTATION_METHODS.has(method);
  const shouldShowLoading = !options.skipLoading && (isMutation || Boolean(options.forceLoading));
  const shouldNotify = !options.skipNotify;
  if (shouldShowLoading) showGlobalLoading();

  try {
    const response = await fetch(`${baseUrl}${url}`, { ...options, headers });

    // 401 未授权：清除 token 并跳转登录页（HashRouter 用 hash 路径）
    if (response.status === 401) {
      clearToken();
      clearStationId();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      if (!window.location.hash.includes('/admin/login')) {
        window.location.hash = '#/admin/login';
      }
      throw new Error('未授权，请重新登录');
    }

    const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;

    if (!response.ok) {
      throw new ApiError(result?.message || `请求失败（${response.status}）`, {
        status: response.status,
        data: result?.data,
      });
    }

    if (!result || !result.success) {
      throw new ApiError(result?.message || '请求失败', {
        status: response.status,
        data: result?.data,
      });
    }

    const showSuccess = options.notifySuccess ?? isMutation;
    if (shouldNotify && showSuccess && options.successMessage !== false) {
      const message =
        options.successMessage ||
        (result.message && result.message !== 'success' ? result.message : '操作成功');
      notifySuccess(message);
    }

    return result.data;
  } catch (err) {
    const showError = options.notifyError ?? true;
    const friendly = formatRequestError(err);
    // 用友好文案重抛，页面内联 error 与 toast 一致（避免展示英文 Failed to fetch）
    if (shouldNotify && showError && options.errorMessage !== false) {
      notifyRequestError(options.errorMessage || friendly);
    }
    if (err instanceof ApiError) {
      throw new ApiError(friendly, { status: err.status, data: err.data });
    }
    throw new Error(friendly);
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
