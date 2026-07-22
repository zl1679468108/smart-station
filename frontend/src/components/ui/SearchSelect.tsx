import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export interface SearchSelectOption {
  /** 选项值 */
  value: string;
  /** 主展示文案 */
  label: string;
  /** 次要说明（右侧灰字，可选） */
  hint?: string;
  /** 标签徽标（可选，如状态） */
  badge?: string;
}

export interface SearchSelectProps {
  /** 已选值 */
  value: string;
  /** 选中回调 */
  onChange: (value: string, option: SearchSelectOption) => void;
  /** 选项列表 */
  options: SearchSelectOption[];
  /** 占位提示 */
  placeholder?: string;
  /** 空结果文案 */
  emptyText?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否本地按关键字过滤（默认 true）；设为 false 时由外部控制 options */
  filterable?: boolean;
  /** 输入关键字变化回调（用于远程搜索） */
  onSearch?: (keyword: string) => void;
}

/**
 * 全局可搜索下拉组件
 * ---------------
 * 输入关键字筛选 + 键盘/点击选择，替代原生 select，用于选项较多或需搜索的场景。
 * 受控组件：value / onChange 由外部维护；options 可本地过滤或交给外部远程搜索。
 *
 * 用法：
 *   <SearchSelect value={id} onChange={setId} options={opts} placeholder="选择包裹" />
 */
const SearchSelect: React.FC<SearchSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择',
  emptyText = '无匹配项',
  disabled = false,
  filterable = true,
  onSearch,
}) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!filterable || !keyword.trim()) return options;
    const kw = keyword.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(kw) ||
        (o.hint || '').toLowerCase().includes(kw) ||
        (o.badge || '').toLowerCase().includes(kw),
    );
  }, [options, keyword, filterable]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [keyword, open]);

  const commit = (opt: SearchSelectOption) => {
    onChange(opt.value, opt);
    setOpen(false);
    setKeyword('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIndex]) commit(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
            : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" size={16} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
              <Icon name="search" size={14} className="text-gray-400" />
              <input
                autoFocus
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  onSearch?.(e.target.value);
                }}
                onKeyDown={onKeyDown}
                placeholder="输入关键字筛选"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-gray-400">{emptyText}</li>
            ) : (
              filtered.map((opt, idx) => {
                const active = idx === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <li key={opt.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => commit(opt)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                        active ? 'bg-primaryLight' : ''
                      } ${isSelected ? 'text-primary' : 'text-gray-700'}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                            {opt.badge}
                          </span>
                        )}
                      </span>
                      {opt.hint && (
                        <span className="shrink-0 text-xs text-gray-400">{opt.hint}</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchSelect;
