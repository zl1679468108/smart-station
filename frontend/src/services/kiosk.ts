// Kiosk API 服务（公开接口，无 token 头）
import { get, post } from './api';
import type {
  SendCodeResult,
  KioskQueryResult,
  StationLayoutResponse,
  NotifyGuideResponse,
  BindNotifyResult,
  WxPusherBindStartResult,
  WxPusherBindPollResult,
  NotifyBindStatusResult,
} from '@/types/kiosk';

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

/** 通知绑定引导（公示） */
export function getNotifyGuide(): Promise<NotifyGuideResponse> {
  return get<NotifyGuideResponse>(`/api/kiosk/notify-guide${kioskStationQuery()}`);
}

/** 兼容：绑定个人 Server酱 */
export function bindNotify(payload: {
  phone: string;
  code: string;
  sendKey: string;
}): Promise<BindNotifyResult> {
  return post<BindNotifyResult>(`/api/kiosk/notify-bind${kioskStationQuery()}`, payload, {
    successMessage: '通知绑定成功',
  });
}

/** WxPusher：校验手机号后生成关注二维码 */
export function startWxPusherBind(payload: {
  phone: string;
  code: string;
}): Promise<WxPusherBindStartResult> {
  return post<WxPusherBindStartResult>(
    `/api/kiosk/notify-bind/wxpusher/start${kioskStationQuery()}`,
    payload,
    {
      // 页面内已有状态文案；避免全局 toast 刷屏
      successMessage: false,
      skipLoading: true,
    },
  );
}

/** WxPusher：轮询扫码绑定结果（建议间隔 ≥12s） */
export function pollWxPusherBind(payload: {
  qrCode: string;
}): Promise<WxPusherBindPollResult> {
  return post<WxPusherBindPollResult>(
    `/api/kiosk/notify-bind/wxpusher/poll${kioskStationQuery()}`,
    payload,
    {
      successMessage: false,
      errorMessage: false,
      skipLoading: true,
      skipNotify: true,
    },
  );
}

/** 解绑个人通知 */
export function unbindNotify(payload: {
  phone: string;
  code: string;
}): Promise<{ unbound: boolean }> {
  return post<{ unbound: boolean }>(`/api/kiosk/notify-unbind${kioskStationQuery()}`, payload, {
    successMessage: '已解绑通知',
  });
}

/** PushPlus token 绑定 */
export function bindPushPlus(payload: {
  phone: string;
  code: string;
  token: string;
}): Promise<BindNotifyResult> {
  return post<BindNotifyResult>(
    `/api/kiosk/notify-bind/pushplus${kioskStationQuery()}`,
    payload,
    { successMessage: false },
  );
}

/** 查询手机号是否已绑定通知（不含 token/UID） */
export function getNotifyBindStatus(phone: string): Promise<NotifyBindStatusResult> {
  return post<NotifyBindStatusResult>(
    `/api/kiosk/notify-bind-status${kioskStationQuery()}`,
    { phone },
    { successMessage: false, skipLoading: true, errorMessage: false },
  );
}
