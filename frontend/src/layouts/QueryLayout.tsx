import React, { useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { isImmersiveQueryDevice, useQueryDevice } from '@/hooks/useQueryDevice';
import { isNativeEditableTarget } from '@/utils/keypadTarget';

// 用户查询门户布局：
// - portal / kiosk：90s 无操作清空 + 实体键盘/扫码枪接管
// - h5：远端手机模式，保留系统返回，不强制空闲清空与硬件键盘接管
const IDLE_TIMEOUT = 90_000;

const QueryLayout: React.FC = () => {
  const device = useQueryDevice();
  const immersive = isImmersiveQueryDevice(device);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!immersive) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('query-idle-timeout'));
      }, IDLE_TIMEOUT);
    };

    const handleHardwareInput = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;

      // 通知绑定等可编辑表单需要原生键盘；只读查询框仍走 keypad-input
      if (isNativeEditableTarget(event.target)) return;

      if (event.key === 'Backspace') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('keypad-input', { detail: { type: 'backspace' } }));
        return;
      }

      if (event.key.length === 1 && /^[a-zA-Z0-9-]$/.test(event.key)) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent('keypad-input', {
            detail: { type: 'input', payload: event.key.toUpperCase() },
          }),
        );
      }
    };

    const events = ['mousedown', 'touchstart', 'keydown'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    window.addEventListener('keydown', handleHardwareInput);
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      window.removeEventListener('keydown', handleHardwareInput);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [immersive]);

  if (device === 'h5') {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="flex h-12 shrink-0 items-center border-b border-gray-200 bg-white px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex min-h-[44px] items-center gap-1 pr-3 text-sm text-gray-600"
          >
            <span>‹</span>
            <span>返回</span>
          </button>
          <span className="text-sm font-medium text-gray-800">远端查件</span>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <Outlet />
    </div>
  );
};

export default QueryLayout;
