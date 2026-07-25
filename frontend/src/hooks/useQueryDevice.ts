import { useEffect, useState } from 'react';

/**
 * 查询门户自适应模式：
 * - portal：≥768px（PAD / Web）现场完整能力，虚拟键盘 + 空闲清空
 * - h5：<768px 远端手机，原生键盘、无虚拟键盘、无空闲清空
 *
 * 不再依赖 URL `?device=`，同一入口 `/query` 按视口自行适配。
 */
export type QueryDeviceMode = 'portal' | 'h5';

/** 与 Tailwind `sm` 断点一致：max-width 767px 视为 H5 */
const H5_MEDIA_QUERY = '(max-width: 767px)';

function readMode(): QueryDeviceMode {
  if (typeof window === 'undefined') return 'portal';
  return window.matchMedia(H5_MEDIA_QUERY).matches ? 'h5' : 'portal';
}

export function useQueryDevice(): QueryDeviceMode {
  const [mode, setMode] = useState<QueryDeviceMode>(() => readMode());

  useEffect(() => {
    const mql = window.matchMedia(H5_MEDIA_QUERY);
    const apply = () => setMode(mql.matches ? 'h5' : 'portal');
    apply();

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }

    // Safari < 14
    mql.addListener(apply);
    return () => mql.removeListener(apply);
  }, []);

  return mode;
}

/** portal 为现场沉浸：空闲清空 + 硬件键盘接管 */
export function isImmersiveQueryDevice(mode: QueryDeviceMode): boolean {
  return mode === 'portal';
}
