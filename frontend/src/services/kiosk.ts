// Kiosk API 服务（公开接口，无 token 头）
import { get, post } from './api';
import type { SendCodeResult, KioskQueryResult, StationLayoutResponse } from '@/types/kiosk';

/**
 * 当前 Kiosk / 查询门户绑定的驿站
 * - 无登录端通过环境变量 VITE_KIOSK_STATION_ID 指定
 * - 未配置时后端回退第一个 active 驿站（单租户兼容）
 */
function kioskStationQuery(): string {
  const stationId = import.meta.env.VITE_KIOSK_STATION_ID as string | undefined;
  return stationId ? `?stationId=${encodeURIComponent(stationId)}` : '';
}

/**
 * 获取货架平面图数据 + 驿站户型配置
 * - 1.2.0 起返回 { shelves, station: { layoutConfig, name, ... } }
 */
export function getLayout(): Promise<StationLayoutResponse> {
  return get<StationLayoutResponse>(`/api/kiosk/station/layout${kioskStationQuery()}`);
}

/** 发送验证码（同手机号每小时 ≤5 次） */
export function sendCode(phone: string): Promise<SendCodeResult> {
  return post<SendCodeResult>(`/api/kiosk/send-code${kioskStationQuery()}`, { phone });
}

/** 手机号尾号 + 验证码查询 */
export function queryByPhone(phoneTail: string, code: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>(`/api/kiosk/query-by-phone${kioskStationQuery()}`, {
    phoneTail,
    code,
  });
}

/** 手机号直接查询（1.1.0 新增，无需验证码，用于 /query 门户） */
export function queryByPhoneDirect(phone: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>(`/api/kiosk/query-by-phone-direct${kioskStationQuery()}`, {
    phone,
  });
}

/** 运单号查询 */
export function queryByTracking(trackingNumber: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>(`/api/kiosk/query-by-tracking${kioskStationQuery()}`, {
    trackingNumber,
  });
}

/** 取件码查询（1.1.0 新增） */
export function queryByCode(code: string): Promise<KioskQueryResult> {
  return post<KioskQueryResult>(`/api/kiosk/query-by-code${kioskStationQuery()}`, { code });
}
