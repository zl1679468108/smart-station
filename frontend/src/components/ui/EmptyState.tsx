import React from 'react';
import Icon from './Icon';

interface EmptyStateProps {
  /** 标题（必填） */
  title: string;
  /** 描述文案（可选） */
  description?: string;
  /** 图标名，默认 empty（空盒子） */
  icon?: React.ComponentProps<typeof Icon>['name'];
  /** 图标颜色类，默认 text-gray-300 */
  iconClassName?: string;
  /** 操作按钮（可选，传入 ReactNode） */
  action?: React.ReactNode;
  /** 容器内边距，默认 py-16 */
  className?: string;
}

/**
 * 全局空状态组件
 * ---------------
 * 统一的空状态展示：图标 + 标题 + 描述 + 可选操作按钮。
 * 所有列表页的空状态都应使用此组件，仅通过 title/description 区分文案。
 *
 * 用法：
 *   <EmptyState title="暂无在库包裹" description="未查询到您的包裹" />
 *   <EmptyState title="暂无数据" action={<button>新增</button>} />
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = 'empty',
  iconClassName = 'text-gray-300',
  action,
  className = 'py-12',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div
        className={`mb-3 flex w-20 items-center justify-center rounded-full bg-gray-50 ${iconClassName}`}
      >
        <Icon name={icon} size={40} />
      </div>
      <h3 className="text-lg font-medium text-gray-700">{title}</h3>
      {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};

export default EmptyState;
