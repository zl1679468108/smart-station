import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import Icon from '@/components/ui/Icon';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotifyOptions {
  type?: NotificationType;
  title?: string;
  message: string;
  duration?: number;
}

interface NotificationItem extends Required<NotifyOptions> {
  id: number;
}

interface NotificationContextValue {
  notify: (options: NotifyOptions) => number | null;
  success: (message: string, title?: string) => number | null;
  error: (message: string, title?: string) => number | null;
  remove: (id: number) => void;
}

type NotificationHandlers = Pick<NotificationContextValue, 'notify' | 'success' | 'error'> | null;

let handlers: NotificationHandlers = null;
let nextId = 1;

const DEFAULT_DURATION = 4_000;
const MAX_NOTIFICATIONS = 4;

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function notify(options: NotifyOptions): number | null {
  return handlers?.notify(options) ?? null;
}

export function notifySuccess(message: string, title?: string): number | null {
  return handlers?.success(message, title) ?? null;
}

export function notifyError(message: string, title?: string): number | null {
  return handlers?.error(message, title) ?? null;
}

const titleByType: Record<NotificationType, string> = {
  success: '操作成功',
  error: '操作失败',
  info: '提示',
  warning: '请注意',
};

const iconByType: Record<NotificationType, 'check' | 'close'> = {
  success: 'check',
  error: 'close',
  info: 'check',
  warning: 'close',
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notifyImpl = useCallback((options: NotifyOptions): number => {
    const type = options.type ?? 'info';
    const id = nextId++;
    const item: NotificationItem = {
      id,
      type,
      title: options.title ?? titleByType[type],
      message: options.message,
      duration: options.duration ?? DEFAULT_DURATION,
    };

    setItems((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS));

    if (item.duration > 0) {
      window.setTimeout(() => remove(id), item.duration);
    }

    return id;
  }, [remove]);

  const success = useCallback(
    (message: string, title?: string) => notifyImpl({ type: 'success', title, message }),
    [notifyImpl],
  );

  const error = useCallback(
    (message: string, title?: string) => notifyImpl({ type: 'error', title, message }),
    [notifyImpl],
  );

  const value = useMemo(
    () => ({ notify: notifyImpl, success, error, remove }),
    [notifyImpl, success, error, remove],
  );

  useEffect(() => {
    handlers = { notify: notifyImpl, success, error };
    return () => {
      handlers = null;
    };
  }, [notifyImpl, success, error]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="ss-notification-region" role="region" aria-label="系统提醒">
        {items.map((item) => (
          <div
            key={item.id}
            className={`ss-notification ss-notification--${item.type}`}
            role={item.type === 'error' ? 'alert' : 'status'}
            aria-live={item.type === 'error' ? 'assertive' : 'polite'}
          >
            <span className="ss-notification-icon" aria-hidden="true">
              <Icon name={iconByType[item.type]} size={16} strokeWidth={2.4} />
            </span>
            <div className="ss-notification-content">
              <div className="ss-notification-title">{item.title}</div>
              <div className="ss-notification-message">{item.message}</div>
            </div>
            <button
              type="button"
              className="ss-notification-close"
              onClick={() => remove(item.id)}
              aria-label="关闭提醒"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification 必须在 NotificationProvider 内使用');
  }
  return ctx;
};
