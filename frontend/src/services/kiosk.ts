// Kiosk API 服务（公开接口，无 token 头）
import { get, post } from './api';
import type { SendCodeResult, KioskQueryResult, StationLayoutResponse } from '@/types/kiosk';

/**
 * 获取货架平面图数据 + 驿站户型配置
 * - Kiosk 端无登录，通过环境变量 VITE_KIOSK_STATION_ID 指定当前驿站
 * - 未配置时后端返回第一个 active 驿站（兼容单租户）
 * - 1.2.0 起返回 { shelves, station: { layoutConfig } }
 */
export function getLayout(): Promise<StationLayoutResponse> {
  const stationId = import.meta.env.VITE_KIOSK_STATION_ID as string | undefined;
  const query = stationId ? `?stationId=${encodeURIComponent(stationId)}` : '';
  return get<StationLayoutResponse>(`/api/kiosk/station/layout${query}`);
}

/** 发送验证码（同手机号每小时 ≤5 次） */
export function sendCode(phone: string): Promise<SendCodeResult> {
  return post<SendCodeResult>('/api/kiosk/send-code', { phone });
}

/** 手机号尾号 + 验证码查询 */
export function queryByPhone(phoneTail: string, code: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>('/api/kiosk/query-by-phone', { phoneTail, code });
}

/** 手机号直接查询（1.1.0 新增，无需验证码，用于 /query 门户） */
export function queryByPhoneDirect(phone: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>('/api/kiosk/query-by-phone-direct', { phone });
}

/** 运单号查询 */
export function queryByTracking(trackingNumber: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>('/api/kiosk/query-by-tracking', { trackingNumber });
}

/** 取件码查询（1.1.0 新增） */
export function queryByCode(code: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>('/api/kiosk/query-by-code', { code });
}
