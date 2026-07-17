import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as inventoryService from '@/services/inventory';
import { useCouriers, useShelves } from '@/hooks/useDictionary';
import { useAuth } from '@/utils/auth';
import { canWrite } from '@/utils/permission';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import type {
  InventoryQuery,
  InventoryListResult,
  ParcelListItem,
  ParcelStatus,
} from '@/types/inventory';

const STATUS_META: Record<ParcelStatus, { label: string; cls: string }> = {
  in_stock: { label: '在库', cls: 'bg-info/10 text-info' },
  out_stock: { label: '已出库', cls: 'bg-success/10 text-success' },
  overdue: { label: '滞留', cls: 'bg-warning/10 text-warning' },
  exception: { label: '异常', cls: 'bg-danger/10 text-danger' },
  returned: { label: '退回', cls: 'bg-gray-200 text-gray-600' },
};

// 库存查询页：筛选栏 + 表格 + 分页 + 批量操作
const Inventory: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // 只读角色（viewer）不显示选择框 / 批量操作栏 / 批量标记异常弹窗
  const writable = canWrite(user.role);
  const [query, setQuery] = useState<InventoryQuery>({ page: 1, pageSize: 20 });
  const [data, setData] = useState<InventoryListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 筛选项字典数据走 React Query 缓存（staleTime: Infinity），跨页面共享
  const { data: couriers = [] } = useCouriers();
  const { data: shelves = [] } = useShelves();
  const [showBatch, setShowBatch] = useState(false);
  const [batchReason, setBatchReason] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<{ updated: number; skipped: number } | null>(null);

  // 筛选表单临时状态
  const [filterForm, setFilterForm] = useState({
    phone: '',
    trackingNumber: '',
    pickupCode: '',
    courierCompanyId: '',
    shelfId: '',
    status: '',
    startDate: '',
    endDate: '',
  });

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    inventoryService
      .fetchInventory(query)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // 查询条件变化时重置选中
  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  const handleSearch = () => {
    setQuery({
      ...filterForm,
      status: (filterForm.status || undefined) as ParcelStatus | undefined,
      courierCompanyId: filterForm.courierCompanyId || undefined,
      shelfId: filterForm.shelfId || undefined,
      page: 1,
      pageSize: 20,
    });
  };

  const handleReset = () => {
    setFilterForm({
      phone: '',
      trackingNumber: '',
      pickupCode: '',
      courierCompanyId: '',
      shelfId: '',
      status: '',
      startDate: '',
      endDate: '',
    });
    setQuery({ page: 1, pageSize: 20 });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((i) => i.id)));
    }
  };

  const handleBatchException = async () => {
    if (batchSubmitting) return;
    setBatchResult(null);
    if (!batchReason.trim()) {
      alert('请输入异常原因');
      return;
    }
    setBatchSubmitting(true);
    try {
      const res = await inventoryService.batchMarkException(
        Array.from(selected),
        batchReason.trim(),
      );
      setBatchResult(res);
      setSelected(new Set());
      setShowBatch(false);
      setBatchReason('');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBatchSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-lg font-semibold text-gray-800">库存查询</h1>

      {/* 筛选栏 */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            type="text"
            value={filterForm.phone}
            onChange={(e) => setFilterForm({ ...filterForm, phone: e.target.value })}
            placeholder="手机号"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="text"
            value={filterForm.trackingNumber}
            onChange={(e) => setFilterForm({ ...filterForm, trackingNumber: e.target.value })}
            placeholder="运单号（模糊）"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="text"
            value={filterForm.pickupCode}
            onChange={(e) => setFilterForm({ ...filterForm, pickupCode: e.target.value })}
            placeholder="取件码"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={filterForm.status}
            onChange={(e) => setFilterForm({ ...filterForm, status: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select
            value={filterForm.courierCompanyId}
            onChange={(e) => setFilterForm({ ...filterForm, courierCompanyId: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">全部快递公司</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterForm.shelfId}
            onChange={(e) => setFilterForm({ ...filterForm, shelfId: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">全部货架</option>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number}号（{s.size_type === 'small' ? '小件' : s.size_type === 'medium' ? '中件' : '大件'}）
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterForm.startDate}
            onChange={(e) => setFilterForm({ ...filterForm, startDate: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="date"
            value={filterForm.endDate}
            onChange={(e) => setFilterForm({ ...filterForm, endDate: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSearch}
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-white hover:bg-primaryHover"
          >
            查询
          </button>
          <button
            onClick={handleReset}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            重置
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* 批量操作栏（仅 admin/clerk 可见，viewer 只读） */}
      {writable && selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md bg-primaryLight px-3 py-2 text-sm">
          <span className="text-primary">已选 {selected.size} 项</span>
          <button
            onClick={() => setShowBatch(true)}
            className="rounded bg-warning px-3 py-1 text-xs text-white hover:bg-warning/90"
          >
            批量标记异常
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:underline"
          >
            清除选择
          </button>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {writable && (
                  <th className="px-3 py-2 text-left font-medium">
                    <input
                      type="checkbox"
                      checked={data.items.length > 0 && selected.size === data.items.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left font-medium">运单号</th>
                <th className="px-3 py-2 text-left font-medium">收件人</th>
                <th className="px-3 py-2 text-left font-medium">手机号</th>
                <th className="px-3 py-2 text-left font-medium">取件码</th>
                <th className="px-3 py-2 text-left font-medium">快递公司</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">入库时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((item: ParcelListItem) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  {writable && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-gray-800">{item.trackingNumber}</td>
                  <td className="px-3 py-2 text-gray-600">{item.recipientName}</td>
                  <td className="px-3 py-2 text-gray-600">{item.recipientPhone}</td>
                  <td className="px-3 py-2 font-mono text-primary">{item.pickupCode || '-'}</td>
                  <td className="px-3 py-2 text-gray-600">{item.courier?.name || '-'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_META[item.status].cls}`}>
                      {STATUS_META[item.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {item.inboundAt ? new Date(item.inboundAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => navigate(`/admin/inventory/${item.id}`)}
                      className="text-xs text-primary hover:underline"
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="暂无数据" description="未查询到符合条件的包裹" />
      )}

      {/* 分页 */}
      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          disabled={loading}
          onChange={(p) => setQuery({ ...query, page: p })}
        />
      )}

      {/* 批量标记异常弹窗（仅 admin/clerk 可触发） */}
      {writable && showBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-medium text-gray-800">
              批量标记异常（{selected.size} 项）
            </h3>
            <textarea
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              rows={3}
              placeholder="请输入异常原因"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={batchSubmitting}
            />
            {batchResult && (
              <div className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                已更新 {batchResult.updated} 项，跳过 {batchResult.skipped} 项（非在库/滞留状态）
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBatch(false);
                  setBatchReason('');
                  setBatchResult(null);
                }}
                disabled={batchSubmitting}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchException}
                disabled={batchSubmitting}
                className="rounded-md bg-warning px-3 py-1.5 text-sm text-white hover:bg-warning/90 disabled:opacity-60"
              >
                {batchSubmitting ? '提交中...' : '确认标记'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
