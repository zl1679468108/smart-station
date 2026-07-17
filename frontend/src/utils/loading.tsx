import React, { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';

/**
 * 全局 Loading Toast
 * ------------------
 * 用于提交/变更数据接口（POST/PUT/DELETE/PATCH）时的统一 loading 提示。
 * 形态类似移动端 toast：屏幕居中的半透明卡片 + spinner + 文案，带遮罩。
 *
 * 设计要点：
 * - 引用计数：多个并发请求叠加，全部完成才隐藏
 * - 200ms 防抖显示：避免快速请求导致闪烁
 * - 模块级注册：让非 React 模块（如 services/api.ts）也能触发
 * - 自动兜底：超过 10s 强制关闭，防止异常卡死
 */

type LoadingHandlers = { show: () => void; hide: () => void } | null;

let handlers: LoadingHandlers = null;

const SHOW_DEBOUNCE_MS = 200;
const SAFETY_TIMEOUT_MS = 10_000;

export function showGlobalLoading(): void {
  handlers?.show();
}

export function hideGlobalLoading(): void {
  handlers?.hide();
}

interface LoadingContextValue {
  show: () => void;
  hide: () => void;
}

const LoadingContext = createContext<LoadingContextValue | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 引用计数：>0 时应当显示 loading
  const countRef = useRef(0);
  // 防抖定时器：延迟实际显示
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 安全兜底定时器：超过 10s 强制关闭
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 是否已经实际渲染了浮层
  const [visible, setVisible] = useState(false);

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };
  const clearSafetyTimer = () => {
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const show = useCallback(() => {
    countRef.current += 1;
    if (countRef.current === 1) {
      // 首次进入 loading：启动防抖显示与安全兜底
      clearShowTimer();
      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        clearSafetyTimer();
        safetyTimerRef.current = setTimeout(() => {
          // 兜底：超过 10s 仍未关闭，强制清空并隐藏
          countRef.current = 0;
          setVisible(false);
        }, SAFETY_TIMEOUT_MS);
      }, SHOW_DEBOUNCE_MS);
    }
  }, []);

  const hide = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) {
      clearShowTimer();
      clearSafetyTimer();
      setVisible(false);
    }
  }, []);

  // 注册/反注册模块级处理器，让 services/api.ts 能直接触发
  React.useEffect(() => {
    handlers = { show, hide };
    return () => {
      handlers = null;
      clearShowTimer();
      clearSafetyTimer();
    };
  }, [show, hide]);

  return (
    <LoadingContext.Provider value={{ show, hide }}>
      {children}
      {visible && (
        <div
          className="ss-loading-mask"
          role="status"
          aria-live="polite"
          aria-label="加载中"
        >
          <div className="ss-loading-toast">
            <span className="ss-loading-spinner" aria-hidden="true" />
            <span className="ss-loading-text">处理中…</span>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextValue => {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    throw new Error('useLoading 必须在 LoadingProvider 内使用');
  }
  return ctx;
};
