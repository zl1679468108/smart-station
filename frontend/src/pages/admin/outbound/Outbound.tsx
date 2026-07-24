import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as outboundService from '@/services/outbound';
import * as inventoryService from '@/services/inventory';
import { useInvalidateShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import { useInvalidateInventoryDetail, useInvalidateInventoryList } from '@/hooks/useInventoryData';
import { useInvalidateOutboundRecords, useOutboundRecords } from '@/hooks/useOutboundData';
import { notifyError, notifySuccess } from '@/utils/notification';
import { copyText } from '@/utils/stationVisit';
import {
  buildCollectReceiptScript,
  buildCollectWaiveScript,
} from '@/utils/staffScripts';
import type {
  OutboundRecordQuery,
  OutboundSearchItem,
} from '@/types/outbound';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import * as shiftService from '@/services/shift';

type Tab = 'manual' | 'records';
type QueryTab = 'phone' | 'tracking' | 'code';

// 出库管理页：人工辅助出库（查询+确认两步流程）/ 出库记录列表
const Outbound: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('manual');
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await shiftService.fetchCurrentShift();
        if (!cancelled) setShiftOpen(Boolean(s));
      } catch {
        if (!cancelled) setShiftOpen(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full">
      <PageHeader title="出库管理" className="mb-4" />

      {shiftOpen === false && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-900">
            你还没开班。待收款出库会计入本班收款，建议先开班再操作。
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/shifts')}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            去开班
          </button>
        </div>
      )}

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryDetail = useInvalidateInventoryDetail();
  const invalidateInventoryList = useInvalidateInventoryList();
  const invalidateOutboundRecords = useInvalidateOutboundRecords();
  const [queryTab, setQueryTab] = useState<QueryTab>('phone');
  const [items, setItems] = useState<OutboundSearchItem[] | null>(null);
  const [resultFilter, setResultFilter] = useState<'all' | 'unpaid'>('all');
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);
  const [confirming, setConfirming] = useState<OutboundSearchItem | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    title: string;
    script?: string;
    amountText?: string;
    parcelId: string;
    phone?: string;
    trackingNumber?: string;
    pickupCode?: string | null;
  } | null>(null);
  const unpaidAutoLoadKey = searchParams.get('unpaid');
  const trackingAutoKey = (searchParams.get('tracking') || '').trim();

  const handleResult = (res: { items?: OutboundSearchItem[] }) => {
    setItems(res.items || []);
    setResultFilter('all');
  };

  const switchQueryTab = (t: QueryTab) => {
    setQueryTab(t);
    setItems(null);
    setResultFilter('all');
  };

  const loadUnpaidParcels = async () => {
    if (loadingUnpaid) return;
    setLoadingUnpaid(true);
    try {
      const res = await inventoryService.fetchInventory({
        collectStatus: 'unpaid',
        page: 1,
        pageSize: 100,
      });
      const pickable = (res.items || []).filter(
        (p) => p.status === 'in_stock' || p.status === 'overdue',
      );
      const mapped: OutboundSearchItem[] = pickable.map((p) => ({
        id: p.id,
        trackingNumber: p.trackingNumber,
        recipientName: p.recipientName,
        recipientPhone: p.recipientPhone,
        pickupCode: p.pickupCode,
        status: p.status,
        inboundAt: p.inboundAt,
        courierName: p.courier?.name || null,
        freightCollectAmount: Number(p.freightCollectAmount || 0),
        codAmount: Number(p.codAmount || 0),
        collectStatus: p.collectStatus || 'unpaid',
        collectDueAmount: Number(
          p.collectDueAmount ??
            Number(p.freightCollectAmount || 0) + Number(p.codAmount || 0),
        ),
      }));
      setItems(mapped);
      setResultFilter('unpaid');
      if (mapped.length === 0) {
        notifyError('当前没有在库/滞留的待收款包裹');
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '加载待收款失败');
    } finally {
      setLoadingUnpaid(false);
    }
  };

  // 库存详情/列表深链：/admin/outbound?tracking=运单号 自动按运单查询
  useEffect(() => {
    if (!trackingAutoKey) return;
    let cancelled = false;
    setQueryTab('tracking');
    void (async () => {
      try {
        const res = await outboundService.searchParcels({
          trackingNumber: trackingAutoKey,
        });
        if (cancelled) return;
        setItems(res.items || []);
        setResultFilter('all');
        if (!(res.items || []).length) {
          notifyError('未找到可出库的包裹');
        }
      } catch (e) {
        if (!cancelled) {
          notifyError(e instanceof Error ? e.message : '查询失败');
        }
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete('tracking');
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅响应 tracking 深链
  }, [trackingAutoKey]);

  // 工作台/交班「待收款」深链：/admin/outbound?unpaid=1 自动加载在库待收款
  useEffect(() => {
    if (trackingAutoKey) return; // 运单深链优先
    if (unpaidAutoLoadKey !== '1') return;
    void loadUnpaidParcels();
    const next = new URLSearchParams(searchParams);
    next.delete('unpaid');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅响应 unpaid=1 深链
  }, [unpaidAutoLoadKey, trackingAutoKey]);

  const displayItems = (items || []).filter((it) => {
    if (resultFilter !== 'unpaid') return true;
    return (
      Number(it.collectDueAmount || 0) > 0 &&
      (it.collectStatus === 'unpaid' || !it.collectStatus)
    );
  });
  const unpaidCount = (items || []).filter(
    (it) =>
      Number(it.collectDueAmount || 0) > 0 &&
      (it.collectStatus === 'unpaid' || !it.collectStatus),
  ).length;

  // 确认出库（防连点 + 手机后4位身份核验）
  const handleConfirmOutbound = async (
    item: OutboundSearchItem,
    verify: {
      phoneTail: string;
      verifyNote?: string;
      evidenceImageBase64?: string;
      signatureImageBase64?: string;
      collectPaidMethod?: 'cash' | 'wechat' | 'alipay' | 'other';
      collectNote?: string;
      collectAction?: 'pay' | 'waive';
    },
  ) => {
    if (confirmLoading) return;
    const tail = verify.phoneTail.replace(/\D/g, '');
    if (!/^\d{4}$/.test(tail)) {
      notifyError('请输入 4 位数字手机后 4 位');
      return;
    }
    setConfirmLoading(true);
    try {
      await outboundService.manualOutbound({
        trackingNumber: item.trackingNumber,
        pickupCode: item.pickupCode || undefined,
        phoneTail: tail,
        verifyNote: verify.verifyNote,
        evidenceImageBase64: verify.evidenceImageBase64,
        signatureImageBase64: verify.signatureImageBase64,
        collectPaidMethod: verify.collectPaidMethod,
        collectNote: verify.collectNote,
        collectAction: verify.collectAction,
      });
      invalidateShelves();
      invalidateDashboard();
      invalidateInventoryDetail();
      invalidateInventoryList();
      invalidateOutboundRecords();

      const due = Number(item.collectDueAmount || 0);
      const needCollect =
        (item.collectStatus === 'unpaid' || (!item.collectStatus && due > 0)) && due > 0;
      if (needCollect) {
        if (verify.collectAction === 'waive') {
          const script = buildCollectWaiveScript({
            amount: due,
            note: verify.collectNote,
          });
          setLastReceipt({
            title: '已免收并出库',
            script,
            amountText: `原应收 ¥${due.toFixed(2)}（已免收）`,
            parcelId: item.id,
            phone: item.recipientPhone,
            trackingNumber: item.trackingNumber,
            pickupCode: item.pickupCode,
          });
          notifySuccess(`已免收 ¥${due.toFixed(2)} 并出库`);
        } else {
          const script = buildCollectReceiptScript({
            amount: due,
            method: verify.collectPaidMethod,
            trackingNumber: item.trackingNumber,
            pickupCode: item.pickupCode,
            recipientName: item.recipientName,
          });
          setLastReceipt({
            title: '收款出库成功',
            script,
            amountText: `已收 ¥${due.toFixed(2)}`,
            parcelId: item.id,
            phone: item.recipientPhone,
            trackingNumber: item.trackingNumber,
            pickupCode: item.pickupCode,
          });
          notifySuccess(`收款 ¥${due.toFixed(2)} 出库成功，可复制话术给客户`);
        }
      } else {
        setLastReceipt({
          title: '出库成功',
          amountText: item.pickupCode
            ? `取件码 ${item.pickupCode}`
            : item.trackingNumber,
          parcelId: item.id,
          phone: item.recipientPhone,
          trackingNumber: item.trackingNumber,
          pickupCode: item.pickupCode,
        });
        notifySuccess('出库成功');
      }

      // 从列表移除
      setItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
      setConfirming(null);
    } catch {
      // 接口错误已由全局 notification 统一提示；保留弹窗便于重试
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">按手机号/运单号/取件码查询，或一键加载待收款件。</p>
        <button
          type="button"
          onClick={() => void loadUnpaidParcels()}
          disabled={loadingUnpaid}
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
        >
          {loadingUnpaid ? '加载中…' : '加载在库待收款'}
        </button>
      </div>

      {lastReceipt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-900">{lastReceipt.title}</p>
              {lastReceipt.amountText && (
                <p className="mt-0.5 text-xs text-emerald-800">{lastReceipt.amountText}</p>
              )}
              {lastReceipt.trackingNumber && (
                <p className="mt-1 font-mono text-[11px] text-emerald-900/80">
                  运单 {lastReceipt.trackingNumber}
                  {lastReceipt.pickupCode ? ` · 码 ${lastReceipt.pickupCode}` : ''}
                </p>
              )}
              {lastReceipt.script && (
                <p className="mt-2 text-xs leading-relaxed text-emerald-900/90">
                  {lastReceipt.script}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {lastReceipt.script && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(lastReceipt.script || '');
                    if (ok) notifySuccess('已复制话术');
                    else notifyError('复制失败，请长按文字手动复制');
                  }}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  复制话术
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate(`/admin/inventory/${lastReceipt.parcelId}`)}
                className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-100/50"
              >
                看包裹
              </button>
              {lastReceipt.phone && (
                <button
                  type="button"
                  onClick={() => {
                    const phone = lastReceipt.phone!.replace(/\D/g, '').slice(0, 11);
                    navigate(
                      phone
                        ? `/admin/system?tab=notify&phone=${encodeURIComponent(phone)}`
                        : '/admin/system?tab=notify',
                    );
                  }}
                  className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-100/50"
                >
                  看通知
                </button>
              )}
              <button
                type="button"
                onClick={() => setLastReceipt(null)}
                className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-100/50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
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
      {queryTab === 'tracking' && (
        <TrackingSearchView onSubmit={handleResult} initialTracking={trackingAutoKey || undefined} />
      )}
      {queryTab === 'code' && <CodeSearchView onSubmit={handleResult} />}

      {/* 查询结果 */}
      {items !== null && (
        <div className="space-y-2">
          {(items.length > 0 || unpaidCount > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">结果筛选：</span>
              <button
                type="button"
                onClick={() => setResultFilter('all')}
                className={`rounded-full px-3 py-1 text-xs ${
                  resultFilter === 'all'
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                全部 {items.length}
              </button>
              <button
                type="button"
                onClick={() => setResultFilter('unpaid')}
                className={`rounded-full px-3 py-1 text-xs ${
                  resultFilter === 'unpaid'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50'
                }`}
              >
                待收款 {unpaidCount}
              </button>
            </div>
          )}
          <SearchResultList
            items={displayItems}
            onOutbound={(item) => setConfirming(item)}
            emptyHint={
              resultFilter === 'unpaid'
                ? '当前结果中没有待收款包裹'
                : undefined
            }
          />
        </div>
      )}

      {/* 二次确认弹窗 */}
      {confirming && (
        <ConfirmDialog
          item={confirming}
          loading={confirmLoading}
          onConfirm={(verify) => handleConfirmOutbound(confirming, verify)}
          onCancel={() => {
            if (!confirmLoading) setConfirming(null);
          }}
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
  initialTracking?: string;
}> = ({ onSubmit, initialTracking }) => {
  const [trackingNumber, setTrackingNumber] = useState(initialTracking || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialTracking) setTrackingNumber(initialTracking);
  }, [initialTracking]);

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
  emptyHint?: string;
}> = ({ items, onOutbound, emptyHint }) => {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyHint ? '没有符合筛选的包裹' : '未查询到可取件包裹'}
        description={emptyHint || '可能已出库、尚未到达，或不在本驿站'}
      />
    );
  }

  const overdueCount = items.filter((i) => i.status === 'overdue').length;

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        找到 {items.length} 个可取件包裹
        {overdueCount > 0 ? `（含 ${overdueCount} 件滞留）` : ''}
        ，核验身份后点击「确认出库」
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border bg-white p-4 ${
            Number(item.collectDueAmount || 0) > 0 && item.collectStatus === 'unpaid'
              ? 'border-rose-300 ring-1 ring-rose-100'
              : item.status === 'overdue'
                ? 'border-orange-200'
                : 'border-gray-200'
          }`}
        >
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
                {item.status === 'overdue' && (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                    滞留 · 仍可出库
                  </span>
                )}
                {Number(item.collectDueAmount || 0) > 0 && item.collectStatus === 'unpaid' && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                    待收款 ¥{Number(item.collectDueAmount || 0).toFixed(2)}
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
              className={`shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 ${
                Number(item.collectDueAmount || 0) > 0 && item.collectStatus === 'unpaid'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-primary hover:bg-primaryHover'
              }`}
            >
              {Number(item.collectDueAmount || 0) > 0 && item.collectStatus === 'unpaid'
                ? '收款出库'
                : '确认出库'}
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
  loading?: boolean;
  onConfirm: (verify: {
    phoneTail: string;
    verifyNote?: string;
    evidenceImageBase64?: string;
    signatureImageBase64?: string;
    collectPaidMethod?: 'cash' | 'wechat' | 'alipay' | 'other';
    collectNote?: string;
    collectAction?: 'pay' | 'waive';
  }) => void;
  onCancel: () => void;
}> = ({ item, loading, onConfirm, onCancel }) => {
  const [phoneTail, setPhoneTail] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [localError, setLocalError] = useState('');
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [evidenceBase64, setEvidenceBase64] = useState<string | undefined>();
  const [compressing, setCompressing] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | undefined>();
  const [hasSignature, setHasSignature] = useState(false);
  const [collectPaidMethod, setCollectPaidMethod] = useState<
    '' | 'cash' | 'wechat' | 'alipay' | 'other'
  >('');
  const [collectNote, setCollectNote] = useState('');
  const [collectAction, setCollectAction] = useState<'pay' | 'waive'>('pay');
  const [collectConfirmed, setCollectConfirmed] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // 确认弹窗故意不展示后 4 位，避免店员照抄屏幕
  const phoneMasked = (() => {
    const p = String(item.recipientPhone || '').replace(/\D/g, '');
    if (p.length >= 7) return `${p.slice(0, 3)}********`;
    return '***********';
  })();

  const collectDue = Number(item.collectDueAmount || 0);
  const needCollect =
    (item.collectStatus === 'unpaid' || (!item.collectStatus && collectDue > 0)) &&
    collectDue > 0;

  const initSignatureCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(Math.floor(rect.width), 280);
    const cssH = 140;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasDrawnRef.current = false;
    setHasSignature(false);
    setSignatureDataUrl(undefined);
  };

  useEffect(() => {
    initSignatureCanvas();
    const onResize = () => initSignatureCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (loading) return;
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const pt = pointFromEvent(e);
    if (!canvas || !ctx || !pt) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pt;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.01, pt.y + 0.01);
    ctx.stroke();
    hasDrawnRef.current = true;
    setHasSignature(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || loading) return;
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const pt = pointFromEvent(e);
    const last = lastPointRef.current;
    if (!ctx || !pt || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const canvas = sigCanvasRef.current;
    if (canvas && hasDrawnRef.current) {
      // jpeg 体积更小，适配 400KB 上传上限
      setSignatureDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    }
  };

  const clearSignature = () => {
    initSignatureCanvas();
  };

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxSide = 1280;
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            const scale = maxSide / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法压缩图片'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // jpeg 0.72，控制在约 400KB 内
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => reject(new Error('图片读取失败'));
        img.src = String(reader.result || '');
      };
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });

  const onPickEvidence = async (file: File | null) => {
    if (!file) {
      setEvidencePreview(null);
      setEvidenceBase64(undefined);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setLocalError('请选择图片文件');
      return;
    }
    setCompressing(true);
    setLocalError('');
    try {
      const dataUrl = await compressImage(file);
      setEvidencePreview(dataUrl);
      setEvidenceBase64(dataUrl);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : '图片处理失败');
      setEvidencePreview(null);
      setEvidenceBase64(undefined);
    } finally {
      setCompressing(false);
    }
  };

  const submit = () => {
    const tail = phoneTail.replace(/\D/g, '');
    if (!/^\d{4}$/.test(tail)) {
      setLocalError('请输入 4 位数字');
      return;
    }
    if (needCollect && collectAction === 'pay' && !collectPaidMethod) {
      setLocalError('该件需收款，请选择收款方式');
      return;
    }
    if (needCollect && collectAction === 'pay' && !collectConfirmed) {
      setLocalError('请勾选「已当面收妥」后再出库');
      return;
    }
    if (needCollect && collectAction === 'waive' && !collectNote.trim()) {
      setLocalError('免收须填写原因');
      return;
    }
    // 提交前再导出一次签名，避免最后一笔未 flush
    let sig = signatureDataUrl;
    if (hasDrawnRef.current && sigCanvasRef.current) {
      sig = sigCanvasRef.current.toDataURL('image/jpeg', 0.85);
    }
    setLocalError('');
    onConfirm({
      phoneTail: tail,
      verifyNote: verifyNote.trim() || undefined,
      evidenceImageBase64: evidenceBase64,
      signatureImageBase64: hasDrawnRef.current ? sig : undefined,
      collectPaidMethod:
        needCollect && collectAction === 'pay' ? collectPaidMethod || undefined : undefined,
      collectNote: needCollect ? collectNote.trim() || undefined : undefined,
      collectAction: needCollect ? collectAction : undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      widthClassName="max-w-md"
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primaryLight text-primary">
            <Icon name="outbound" size={18} />
          </span>
          确认出库 · 身份核验
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-md border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              loading ||
              compressing ||
              phoneTail.replace(/\D/g, '').length !== 4 ||
              (needCollect && collectAction === 'pay' && !collectPaidMethod) ||
              (needCollect && collectAction === 'pay' && !collectConfirmed) ||
              (needCollect && collectAction === 'waive' && !collectNote.trim())
            }
            className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {loading
              ? '出库中…'
              : compressing
                ? '处理图片…'
                : needCollect
                  ? collectAction === 'pay'
                    ? '收款核验并出库'
                    : '免收核验并出库'
                  : '核验并出库'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-gray-600">
        <p>
          运单 <span className="font-medium text-gray-800">{item.trackingNumber}</span>
          {item.pickupCode && (
            <>
              {' '}
              · 取件码 <span className="font-mono font-medium text-primary">{item.pickupCode}</span>
            </>
          )}
          {item.status === 'overdue' && (
            <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700">
              滞留件
            </span>
          )}
        </p>
        <p>
          收件人 <span className="font-medium text-gray-800">{item.recipientName}</span>
          <span className="ml-2 font-mono text-gray-500">{phoneMasked}</span>
        </p>
        <div className="rounded-md border border-orange-100 bg-orange-50/80 px-3 py-2 text-xs text-orange-900">
          防冒领：请当面询问取件人「手机号后 4 位是多少」，再填写下方。勿直接照抄屏幕号码。
        </div>
        {needCollect && (
          <div className="space-y-2 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-3">
            <p className="text-sm font-semibold text-rose-900">
              ⚠ 待收款 <span className="font-mono text-base">¥{collectDue.toFixed(2)}</span>
              {Number(item.freightCollectAmount || 0) > 0 && (
                <span className="ml-1 font-normal text-rose-700/90">
                  （到付¥{Number(item.freightCollectAmount || 0).toFixed(2)}
                  {Number(item.codAmount || 0) > 0
                    ? ` + 货款¥${Number(item.codAmount || 0).toFixed(2)}`
                    : ''}
                  ）
                </span>
              )}
              {Number(item.freightCollectAmount || 0) <= 0 && Number(item.codAmount || 0) > 0 && (
                <span className="ml-1 font-normal text-rose-700/90">
                  （代收货款¥{Number(item.codAmount || 0).toFixed(2)}）
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setCollectAction('pay');
                  setCollectConfirmed(false);
                  setLocalError('');
                }}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  collectAction === 'pay'
                    ? 'border-primary bg-primary text-white'
                    : 'border-rose-200 bg-white text-gray-700'
                }`}
              >
                已收款
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setCollectAction('waive');
                  setCollectPaidMethod('');
                  setCollectConfirmed(false);
                  setLocalError('');
                }}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  collectAction === 'waive'
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-rose-200 bg-white text-gray-700'
                }`}
              >
                免收
              </button>
            </div>
            {collectAction === 'pay' ? (
              <>
                <p className="text-[11px] text-rose-700/80">请先向取件人收款，再选择收款方式后出库。</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      { v: 'cash', l: '现金' },
                      { v: 'wechat', l: '微信' },
                      { v: 'alipay', l: '支付宝' },
                      { v: 'other', l: '其他' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setCollectPaidMethod(m.v);
                        setLocalError('');
                      }}
                      className={`rounded-md border px-2 py-2 text-xs ${
                        collectPaidMethod === m.v
                          ? 'border-primary bg-primary text-white'
                          : 'border-rose-200 bg-white text-gray-700 hover:border-primary/50'
                      }`}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value.slice(0, 100))}
                  placeholder="收款备注（可选）"
                  disabled={loading}
                  className="w-full rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-60"
                />
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-rose-200 bg-white px-2.5 py-2 text-xs text-rose-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-rose-300 text-primary focus:ring-primary"
                    checked={collectConfirmed}
                    disabled={loading}
                    onChange={(e) => {
                      setCollectConfirmed(e.target.checked);
                      setLocalError('');
                    }}
                  />
                  <span>
                    已当面收妥 <strong className="font-mono">¥{collectDue.toFixed(2)}</strong>
                    {collectPaidMethod
                      ? `（${
                          { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' }[
                            collectPaidMethod
                          ] || collectPaidMethod
                        }）`
                      : ''}
                    ，可继续核验出库
                  </span>
                </label>
              {collectPaidMethod && (
                <div className="mt-2 rounded-md border border-rose-100 bg-white/80 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] leading-relaxed text-rose-900/90">
                      {buildCollectReceiptScript({
                        amount: collectDue,
                        method: collectPaidMethod,
                        trackingNumber: item.trackingNumber,
                        pickupCode: item.pickupCode,
                        recipientName: item.recipientName,
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(
                          buildCollectReceiptScript({
                            amount: collectDue,
                            method: collectPaidMethod,
                            trackingNumber: item.trackingNumber,
                            pickupCode: item.pickupCode,
                            recipientName: item.recipientName,
                          }),
                        );
                        if (ok) notifySuccess('已复制收款话术');
                        else notifyError('复制失败');
                      }}
                      className="shrink-0 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}

              </>
            ) : (
              <>
                <p className="text-[11px] text-amber-800/90">免收须填写原因，便于店长复核。</p>
                <input
                  type="text"
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value.slice(0, 100))}
                  placeholder="免收原因（必填）"
                  disabled={loading}
                  className="w-full rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-60"
                />
              </>
            )}
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-gray-500">
            <span className="mr-0.5 text-danger">*</span>手机号后 4 位
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={phoneTail}
            onChange={(e) => {
              setPhoneTail(e.target.value.replace(/\D/g, '').slice(0, 4));
              setLocalError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="向取件人询问后填写"
            disabled={loading}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-base tracking-widest outline-none focus:border-primary disabled:opacity-60"
            autoFocus
          />
          {localError && <p className="mt-1 text-xs text-danger">{localError}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">核验备注（可选）</label>
          <input
            type="text"
            value={verifyNote}
            onChange={(e) => setVerifyNote(e.target.value.slice(0, 100))}
            placeholder="如：本人领取 / 代取已看证件"
            disabled={loading}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs text-gray-500">取件签名（大件推荐，可选）</label>
            <button
              type="button"
              disabled={loading || !hasSignature}
              onClick={clearSignature}
              className="text-[11px] text-gray-500 hover:text-danger disabled:opacity-40"
            >
              清除重签
            </button>
          </div>
          <div className="overflow-hidden rounded-md border border-dashed border-gray-300 bg-white">
            <canvas
              ref={sigCanvasRef}
              className="block w-full touch-none"
              style={{ height: 140, touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={(e) => {
                if (drawingRef.current) endStroke(e);
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            让取件人在框内手写签名（平板可直接手写）。大件建议签；普通件可跳过。
          </p>
          {hasSignature && (
            <p className="mt-0.5 text-[11px] text-emerald-600">已采集签名</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">拍照留证（可选）</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={loading || compressing}
            onChange={(e) => void onPickEvidence(e.target.files?.[0] || null)}
            className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:text-primary"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            建议拍取件人/面单；自动压缩。未配置云存储时仍可出库，仅跳过图片。
          </p>
          {evidencePreview && (
            <div className="mt-2 flex items-start gap-2">
              <img
                src={evidencePreview}
                alt="留证预览"
                className="h-20 w-20 rounded-md border border-gray-200 object-cover"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setEvidencePreview(null);
                  setEvidenceBase64(undefined);
                }}
                className="text-[11px] text-gray-500 hover:text-danger"
              >
                移除
              </button>
            </div>
          )}
          {compressing && <p className="mt-1 text-[11px] text-gray-500">图片压缩中…</p>}
        </div>
      </div>
    </Modal>
  );
};

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
