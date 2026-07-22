import React, { useState } from 'react';
import * as outboundService from '@/services/outbound';
import { useInvalidateShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import { useInvalidateInventoryDetail, useInvalidateInventoryList } from '@/hooks/useInventoryData';
import { useInvalidateOutboundRecords, useOutboundRecords } from '@/hooks/useOutboundData';
import { notifyError } from '@/utils/notification';
import type {
  OutboundRecordQuery,
  OutboundSearchItem,
} from '@/types/outbound';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

type Tab = 'manual' | 'records';
type QueryTab = 'phone' | 'tracking' | 'code';

// 出库管理页：人工辅助出库（查询+确认两步流程）/ 出库记录列表
const Outbound: React.FC = () => {
  const [tab, setTab] = useState<Tab>('manual');

  return (
    <div className="w-full">
      <h1 className="mb-4 text-lg font-semibold text-gray-800">出库管理</h1>

      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {([
          { key: 'manual', label: '人工辅助出库' },
          { key: 'records', label: '出库记录' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'manual' && <ManualOutbound />}
      {tab === 'records' && <OutboundRecords />}
    </div>
  );
};

// ============ 人工辅助出库（查询 + 确认两步流程） ============
const ManualOutbound: React.FC = () => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryDetail = useInvalidateInventoryDetail();
  const invalidateInventoryList = useInvalidateInventoryList();
  const invalidateOutboundRecords = useInvalidateOutboundRecords();
  const [queryTab, setQueryTab] = useState<QueryTab>('phone');
  const [items, setItems] = useState<OutboundSearchItem[] | null>(null);
  const [confirming, setConfirming] = useState<OutboundSearchItem | null>(null);

  const handleResult = (res: { items?: OutboundSearchItem[] }) => {
    setItems(res.items || []);
  };

  const switchQueryTab = (t: QueryTab) => {
    setQueryTab(t);
    setItems(null);
  };

  // 确认出库
  const handleConfirmOutbound = async (item: OutboundSearchItem) => {
    try {
      await outboundService.manualOutbound({
        trackingNumber: item.trackingNumber,
        pickupCode: item.pickupCode || undefined,
      });
      invalidateShelves();
      invalidateDashboard();
      invalidateInventoryDetail();
      invalidateInventoryList();
      invalidateOutboundRecords();
      // 从列表移除
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      setConfirming(null);
    } catch {
      // 接口错误已由全局 notification 统一提示
      setConfirming(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 查询方式 Tab */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {([
          { key: 'phone', label: '手机号' },
          { key: 'tracking', label: '运单号' },
          { key: 'code', label: '取件码' },
        ] as { key: QueryTab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => switchQueryTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition-colors ${
              queryTab === t.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 查询表单 */}
      {queryTab === 'phone' && <PhoneSearchView onSubmit={handleResult} />}
      {queryTab === 'tracking' && <TrackingSearchView onSubmit={handleResult} />}
      {queryTab === 'code' && <CodeSearchView onSubmit={handleResult} />}

      {/* 查询结果 */}
      {items !== null && (
        <SearchResultList
          items={items}
          onOutbound={(item) => setConfirming(item)}
        />
      )}

      {/* 二次确认弹窗 */}
      {confirming && (
        <ConfirmDialog
          item={confirming}
          onConfirm={() => handleConfirmOutbound(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

    </div>
  );
};

// ============ 手机号查询 ============
const PhoneSearchView: React.FC<{
  onSubmit: (res: { items?: OutboundSearchItem[] }) => void;
}> = ({ onSubmit }) => {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^1\d{10}$/.test(phone)) {
      notifyError('请输入正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    try {
      const res = await outboundService.searchParcels({ phone });
      onSubmit(res);
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>手机号</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="收件人 11 位手机号"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={submitting}
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 运单号查询 ============
const TrackingSearchView: React.FC<{
  onSubmit: (res: { items?: OutboundSearchItem[] }) => void;
}> = ({ onSubmit }) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!trackingNumber.trim()) {
      notifyError('请输入运单号');
      return;
    }
    setSubmitting(true);
    try {
      const res = await outboundService.searchParcels({ trackingNumber: trackingNumber.trim() });
      onSubmit(res);
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>运单号</label>
        <input
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="扫描或输入运单号"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={submitting}
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 取件码查询 ============
const CodeSearchView: React.FC<{
  onSubmit: (res: { items?: OutboundSearchItem[] }) => void;
}> = ({ onSubmit }) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^\d{1,2}-[1-9]-\d{4}$/.test(code)) {
      notifyError('取件码格式不正确，如 22-9-2132');
      return;
    }
    setSubmitting(true);
    try {
      const res = await outboundService.searchParcels({ pickupCode: code });
      onSubmit(res);
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>取件码</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="如 22-9-2132"
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm tracking-wider outline-none focus:border-primary"
          disabled={submitting}
          autoComplete="off"
        />
      </div>
      <p className="text-xs text-gray-400">同一取件码错误 3 次将锁定 10 分钟</p>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 查询结果列表 ============
const SearchResultList: React.FC<{
  items: OutboundSearchItem[];
  onOutbound: (item: OutboundSearchItem) => void;
}> = ({ items, onOutbound }) => {
  if (items.length === 0) {
    return <EmptyState title="未查询到在库包裹" description="可能已出库或尚未到达" />;
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        找到 {items.length} 个在库包裹，核验后点击「确认出库」
      </div>
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm">
                  <span className="text-gray-500">运单号：</span>
                  <span className="font-medium text-gray-800">{item.trackingNumber}</span>
                </span>
                {item.pickupCode && (
                  <span className="text-sm">
                    <span className="text-gray-500">取件码：</span>
                    <span className="font-mono font-medium text-primary">{item.pickupCode}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm">
                <span className="text-gray-600">
                  收件人：<span className="text-gray-800">{item.recipientName}</span>
                </span>
                <span className="text-gray-600">
                  手机号：<span className="text-gray-800">{item.recipientPhone}</span>
                </span>
                <span className="text-gray-600">
                  快递：<span className="text-gray-800">{item.courierName || '-'}</span>
                </span>
              </div>
              <div className="flex gap-x-4 text-xs text-gray-400">
                <span>入库：{new Date(item.inboundAt).toLocaleString('zh-CN')}</span>
              </div>
            </div>
            <button
              onClick={() => onOutbound(item)}
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
            >
              确认出库
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ 二次确认弹窗 ============
const ConfirmDialog: React.FC<{
  item: OutboundSearchItem;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ item, onConfirm, onCancel }) => (
  <Modal
    open
    onClose={onCancel}
    widthClassName="max-w-sm"
    title={
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primaryLight text-primary">
          <Icon name="outbound" size={18} />
        </span>
        确认出库
      </span>
    }
    footer={
      <>
        <button
          onClick={onCancel}
          className="flex-1 rounded-md border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-white hover:bg-primaryHover"
        >
          确认出库
        </button>
      </>
    }
  >
    <p className="text-sm text-gray-600">
      确认将运单号 <span className="font-medium text-gray-800">{item.trackingNumber}</span>{' '}
      （收件人：{item.recipientName}）的包裹标记为已出库？
    </p>
  </Modal>
);

// ============ 出库记录列表 ============
const OutboundRecords: React.FC = () => {
  const [query, setQuery] = useState<OutboundRecordQuery>({ page: 1, pageSize: 20 });
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useOutboundRecords(query);
  const loading = isLoading && !data;
  const error = queryError ? (queryError instanceof Error ? queryError.message : '加载失败') : '';
  const [filterForm, setFilterForm] = useState({
    startDate: '',
    endDate: '',
    method: '',
  });

  const handleSearch = () => {
    setQuery({
      startDate: filterForm.startDate || undefined,
      endDate: filterForm.endDate || undefined,
      method: (filterForm.method || undefined) as 'manual' | 'self_service' | undefined,
      page: 1,
      pageSize: 20,
    });
  };

  const handleReset = () => {
    setFilterForm({ startDate: '', endDate: '', method: '' });
    setQuery({ page: 1, pageSize: 20 });
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <select
            value={filterForm.method}
            onChange={(e) => setFilterForm({ ...filterForm, method: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">全部方式</option>
            <option value="manual">人工辅助</option>
            <option value="self_service">自助扫描</option>
          </select>
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

      {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* 列表 */}
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
      ) : data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">运单号</th>
                <th className="px-3 py-2 text-left font-medium">收件人</th>
                <th className="px-3 py-2 text-left font-medium">手机号</th>
                <th className="px-3 py-2 text-left font-medium">取件码</th>
                <th className="px-3 py-2 text-left font-medium">快递公司</th>
                <th className="px-3 py-2 text-left font-medium">出库方式</th>
                <th className="px-3 py-2 text-left font-medium">操作人</th>
                <th className="px-3 py-2 text-left font-medium">出库时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{item.trackingNumber}</td>
                  <td className="px-3 py-2 text-gray-600">{item.recipientName}</td>
                  <td className="px-3 py-2 text-gray-600">{item.recipientPhone}</td>
                  <td className="px-3 py-2 font-mono text-primary">{item.pickupCode || '-'}</td>
                  <td className="px-3 py-2 text-gray-600">{item.courierName || '-'}</td>
                  <td className="px-3 py-2">
                    {item.outboundMethod === 'manual' ? (
                      <span className="rounded bg-info/10 px-2 py-0.5 text-xs text-info">人工</span>
                    ) : (
                      <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">
                        自助
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.operatorName || '-'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {item.outboundAt ? new Date(item.outboundAt).toLocaleString('zh-CN') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="暂无出库记录" description="还没有包裹出库" />
      )}

      {/* 分页 */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            共 {data.total} 条，第 {data.page}/{data.totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setQuery({ ...query, page: (query.page || 1) - 1 })}
              disabled={(query.page || 1) <= 1 || isFetching}
              className="rounded-md border border-gray-300 px-3 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              onClick={() => setQuery({ ...query, page: (query.page || 1) + 1 })}
              disabled={(query.page || 1) >= data.totalPages || isFetching}
              className="rounded-md border border-gray-300 px-3 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Outbound;
