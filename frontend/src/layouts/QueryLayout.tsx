import React, { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';

// 用户查询门户布局：三端响应式，90s 无操作刷新清空（通过 dispatch event）
const IDLE_TIMEOUT = 90_000;

const QueryLayout: React.FC = () => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // 超时派发自定义事件，页面监听后清空输入与结果
        window.dispatchEvent(new CustomEvent('query-idle-timeout'));
      }, IDLE_TIMEOUT);
    };

    const handleHardwareInput = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;

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
  }, []);

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <Outlet />
    </div>
  );
};

export default QueryLayout;
