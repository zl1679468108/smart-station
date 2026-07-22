import React from 'react';

interface PageHeaderProps {
  /** 页面标题（必填） */
  title: React.ReactNode;
  /** 副标题/描述文案（可选） */
  description?: React.ReactNode;
  /** 右侧操作区（可选，传入按钮等 ReactNode） */
  actions?: React.ReactNode;
  /** 额外容器类名（可选，用于间距/分割线等场景，如 mb-4、border-b pb-3） */
  className?: string;
}

/**
 * 全局页面标题组件
 * ---------------
 * 统一各页面顶部的标题区：标题 + 可选描述 + 可选右侧操作。
 * 所有管理页（admin/*）的页面标题都应使用此组件，保证字号、颜色、布局一致。
 *
 * 布局约定：
 *   - 页面根节点只用 `w-full`（配合 `space-y-*`）承载内容，四周留白由布局层
 *     `page-layout-main` 统一提供，页面内不要再叠 `p-*` / `mx-auto max-w-*` 外层留白。
 *   - 页面根节点用 `space-y-*` 时无需再传 className；否则用 `className="mb-4"` 控制底部间距。
 *
 * 用法：
 *   <PageHeader title="库存查询" className="mb-4" />
 *   <PageHeader title="滞留件管理" description="阈值：预警 3 天…" actions={<button>立即扫描</button>} />
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, className = '' }) => {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3${className ? ` ${className}` : ''}`}
    >
      <div>
        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
};

export default PageHeader;
