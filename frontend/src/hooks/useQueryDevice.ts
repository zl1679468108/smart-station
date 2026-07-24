import { useSearchParams } from 'react-router-dom';

/** 查询门户设备模式：portal 默认全功能；h5 远端轻量；kiosk 现场沉浸 */
export type QueryDeviceMode = 'portal' | 'h5' | 'kiosk';

/**
 * 从 URL `?device=` 解析查询端模式。
 * - 缺省 / 未知值 → portal（三端响应式完整门户）
 * - h5 → 远端手机：原生键盘、无常驻虚拟键盘、无空闲清空
 * - kiosk → 现场 PAD 沉浸：虚拟键盘 + 空闲清空（与 portal 同能力，预留扩展）
 */
export function useQueryDevice(): QueryDeviceMode {
  const [params] = useSearchParams();
  const device = (params.get('device') || '').toLowerCase();
  if (device === 'h5' || device === 'kiosk') return device;
  return 'portal';
}

export function isImmersiveQueryDevice(mode: QueryDeviceMode): boolean {
  return mode === 'portal' || mode === 'kiosk';
}
