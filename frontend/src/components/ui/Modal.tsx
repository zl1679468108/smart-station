import React, { useEffect } from 'react';
import Icon from './Icon';

export interface ModalProps {
  /** 是否打开；关闭时子内容会被卸载，内部表单状态随之重置 */
  open: boolean;
  /** 关闭回调（点击遮罩、右上角关闭、Esc） */
  onClose: () => void;
  /** 标题 */
  title?: React.ReactNode;
  /** 顶部标题下的副标题/描述 */
  description?: React.ReactNode;
  /** 主体内容 */
  children: React.ReactNode;
  /** 底部操作区（通常放取消/提交按钮） */
  footer?: React.ReactNode;
  /** 最大宽度，默认 max-w-md */
  widthClassName?: string;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnBackdrop?: boolean;
  /** 是否展示右上角关闭按钮，默认 true */
  showClose?: boolean;
}

/**
 * 全局弹窗组件
 * ---------------
 * 统一的居中弹窗：遮罩 + 卡片 + 标题 + 内容 + 底部操作区。
 * 关闭时（open=false）子内容不渲染，因此表单在下次打开时始终是初始状态，
 * 无需页面手动重置。所有弹窗表单都应通过此组件承载，保持视觉与交互一致。
 *
 * 用法：
 *   <Modal open={show} onClose={() => setShow(false)} title="登记异常"
 *          footer={<>...按钮...</>}>
 *     ...表单字段...
 *   </Modal>
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClassName = 'max-w-md',
  closeOnBackdrop = true,
  showClose = true,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // 打开时禁止背景滚动
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClassName} rounded-xl bg-white p-5 shadow-xl`}
        role="dialog"
        aria-modal="true"
      >
        {(title || showClose) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
              {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
            </div>
            {showClose && (
              <button
                type="button"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                onClick={onClose}
                aria-label="关闭"
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="space-y-3">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
