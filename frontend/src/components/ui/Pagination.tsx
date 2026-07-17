import React from 'react';

/**
 * 全局分页组件
 * - 当总页数 ≤ 1 时不渲染
 * - 页码展示规则：
 *   总页数 ≤ 7：全部展示
 *   否则：首尾页 + 当前页前后 2 页 + 省略号
 */
export interface PaginationProps {
  /** 当前页（从 1 开始） */
  page: number;
  /** 总页数 */
  totalPages: number;
  /** 总条数 */
  total?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 页码变化回调 */
  onChange: (page: number) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
  disabled = false,
}) => {
  if (totalPages <= 1) return null;

  // 生成页码数组，-1 表示省略号占位
  const buildPages = (): number[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    const left = Math.max(2, page - 1);
    const right = Math.min(totalPages - 1, page + 1);
    if (left > 2) pages.push(-1);
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push(-1);
    pages.push(totalPages);
    return pages;
  };

  const pages = buildPages();

  const btnBase =
    'min-w-[32px] h-8 px-2 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const btnNormal = 'border border-gray-300 text-gray-600 hover:bg-gray-50';
  const btnActive = 'bg-primary text-white border border-primary';

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-gray-500">
        共 {total ?? '-'} 条
        {pageSize ? `，每页 ${pageSize} 条` : ''}
        ，第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          className={`${btnBase} ${btnNormal}`}
        >
          上一页
        </button>
        {pages.map((p, idx) =>
          p === -1 ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              disabled={disabled}
              className={`${btnBase} ${p === page ? btnActive : btnNormal}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className={`${btnBase} ${btnNormal}`}
        >
          下一页
        </button>
      </div>
    </div>
  );
};

export default Pagination;
