import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as inventoryService from '@/services/inventory';
import * as overdueService from '@/services/overdue';
import * as inboundService from '@/services/inbound';
import { useCouriers, useShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import {
  useInventoryList,
  useInvalidateInventoryDetail,
  useInvalidateInventoryList,
} from '@/hooks/useInventoryData';
import { useAuth } from '@/utils/auth';
import { canWrite } from '@/utils/permission';
import { notifyError, notifySuccess } from '@/utils/notification';
import { buildBindShareScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { printPickupSlip, printPickupSlips } from '@/utils/printPickupSlip';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import NotifyReachBar from '@/components/NotifyReachBar';
import type {
  InventoryQuery,
  ParcelListItem,
  ParcelStatus,
} from '@/types/inventory';


const FILTER_PARAM_KEYS = [
  'phone',
  'trackingNumber',
  'pickupCode',
  'courierCompanyId',
  'shelfId',
  'status', 'collectStatus',
  'startDate',
  'endDate',
] as const;

type FilterFormState = {
  phone: string;
  trackingNumber: string;
  pickupCode: string;
  courierCompanyId: string;
  shelfId: string;
  status: string;
  collectStatus: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTER_FORM: FilterFormState = {
  phone: '',
  trackingNumber: '',
  pickupCode: '',
  courierCompanyId: '',
  shelfId: '',
  status: '',
  collectStatus: '',
  startDate: '',
  endDate: '',
};

function parseFiltersFromSearch(searchParams: URLSearchParams): FilterFormState {
  const form: FilterFormState = { ...EMPTY_FILTER_FORM };
  for (const key of FILTER_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value) form[key] = value;
  }
  return form;
}

function formToSearchParams(form: FilterFormState): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_PARAM_KEYS) {
    const value = form[key]?.trim();
    if (value) params.set(key, value);
  }
  return params;
}

function formToInventoryQuery(form: FilterFormState, page = 1): InventoryQuery {
  return {
    phone: form.phone.trim() || undefined,
    trackingNumber: form.trackingNumber.trim() || undefined,
    pickupCode: form.pickupCode.trim() || undefined,
    courierCompanyId: form.courierCompanyId || undefined,
    shelfId: form.shelfId || undefined,
    status: (form.status || undefined) as ParcelStatus | undefined,
    collectStatus: (form.collectStatus || undefined) as
      | 'none'
      | 'unpaid'
      | 'paid'
      | 'waived'
      | undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    page,
    pageSize: 20,
  };
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '智能快递驿站';
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryDetail = useInvalidateInventoryDetail();
  const invalidateInventoryList = useInvalidateInventoryList();
  // 只读角色（viewer）不显示选择框 / 批量操作栏 / 批量标记异常弹窗
  const writable = canWrite(user.role);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [resendingNoticeId, setResendingNoticeId] = useState<string | null>(null);
  const [batchReminding, setBatchReminding] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [lastNotifyReach, setLastNotifyReach] = useState<{
    kind: 'inbound_notice' | 'overdue_remind';
    title: string;
    staffMessage: string;
    pushed: number;
    unbound: number;
    failed: number;
    failedIds: string[];
  } | null>(null);

  const isRemindable = (item: ParcelListItem) =>
    item.status === 'overdue' ||
    (item.status === 'in_stock' && (item.daysInStock ?? 0) >= 3);

  const onRemindOverdue = async (item: ParcelListItem) => {
    if (!writable || remindingId || batchReminding || resendingNoticeId || retryingFailed) return;
    if (!isRemindable(item)) {
      notifyError('仅滞留件或在库满 3 天可发提醒');
      return;
    }
    const ok = window.confirm(
      `向客户补发滞留提醒？\n运单 ${item.trackingNumber}\n\n已绑定微信会私信取件码；未绑定仅旁路通知（不含取件码）。`,
    );
    if (!ok) return;
    setRemindingId(item.id);
    try {
      const r = await overdueService.remindOverdue(item.id);
      notifySuccess(r.staffMessage || '提醒已发送');
      setLastNotifyReach({
        kind: 'overdue_remind',
        title: '滞留提醒触达',
        staffMessage: r.staffMessage || '提醒已发送',
        pushed: r.customerPushed ? 1 : 0,
        unbound: r.customerBound ? 0 : 1,
        failed: r.customerBound && !r.customerPushed ? 1 : 0,
        failedIds: r.customerBound && !r.customerPushed ? [item.id] : [],
      });
    } catch (e: any) {
      notifyError(e?.message || '发送失败');
    } finally {
      setRemindingId(null);
    }
  };

  
  const canResendInboundNotice = (item: ParcelListItem) =>
    item.status === 'in_stock' || item.status === 'overdue';

  const onResendInboundNotice = async (item: ParcelListItem) => {
    if (!writable || resendingNoticeId || batchReminding || remindingId || retryingFailed) return;
    if (!canResendInboundNotice(item)) {
      notifyError('仅在库/滞留件可补发到件通知');
      return;
    }
    const ok = window.confirm(
      `补发到件通知？\n运单 ${item.trackingNumber}\n\n已绑定微信会私信取件码；未绑定请当面报码或引导绑定后再试。`,
    );
    if (!ok) return;
    setResendingNoticeId(item.id);
    try {
      const r = await inboundService.resendInboundNotice(item.id);
      notifySuccess(r.staffMessage || '已尝试补发');
      setLastNotifyReach({
        kind: 'inbound_notice',
        title: '到件补发触达',
        staffMessage: r.staffMessage || '已尝试补发',
        pushed: r.customerPushed ? 1 : 0,
        unbound: r.customerBound ? 0 : 1,
        failed: r.customerBound && !r.customerPushed ? 1 : 0,
        failedIds: r.customerBound && !r.customerPushed ? [item.id] : [],
      });
    } catch (e: any) {
      notifyError(e?.message || '补发失败');
    } finally {
      setResendingNoticeId(null);
    }
  };


  const onBatchResendInboundNotice = async () => {
    if (!writable || batchReminding || remindingId || resendingNoticeId || !data?.items?.length) return;
    const targets = data.items
      .filter((it) => selected.has(it.id) && canResendInboundNotice(it))
      .slice(0, 30);
    if (targets.length === 0) {
      notifyError('所选包裹中没有可补发到件的（需在库或滞留）');
      return;
    }
    const ok = window.confirm(
      `对已选 ${targets.length} 件批量补发到件通知？\n\n已绑定会私信取件码；未绑定请当面报码或引导绑定后再试。最多 30 件。`,
    );
    if (!ok) return;
    setResendingNoticeId('batch');
    try {
      const r = await inboundService.resendInboundNoticeBatch(targets.map((it) => it.id));
      const failedIds = (r.results || [])
        .filter((x) => !x.ok || (x.customerBound && !x.customerPushed))
        .map((x) => x.id);
      notifySuccess(r.staffMessage);
      setLastNotifyReach({
        kind: 'inbound_notice',
        title: `批量补发到件（${r.total} 件）`,
        staffMessage: r.staffMessage,
        pushed: r.pushed,
        unbound: r.unbound,
        failed: r.failed,
        failedIds: [...new Set(failedIds)],
      });
      setSelected(new Set());
    } catch (err) {
      notifyError(err instanceof Error ? err.message : '批量补发失败');
    } finally {
      setResendingNoticeId(null);
    }
  };

const onBatchRemindOverdue = async () => {
    if (!writable || batchReminding || remindingId || resendingNoticeId || !data?.items?.length) return;
    const ids = data.items
      .filter((it) => selected.has(it.id) && isRemindable(it))
      .map((it) => it.id)
      .slice(0, 30);
    if (ids.length === 0) {
      notifyError('所选包裹中没有可提醒的（需滞留或在库满 3 天）');
      return;
    }
    const ok = window.confirm(
      `对已选 ${ids.length} 件批量发滞留提醒？\n\n已绑定会私信取件码；未绑定仅旁路通知（不含取件码）。最多 30 件。`,
    );
    if (!ok) return;
    setBatchReminding(true);
    try {
      const r = await overdueService.remindOverdueBatch(ids);
      const failedIds = (r.results || [])
        .filter((x) => !x.ok || (x.customerBound && !x.customerPushed))
        .map((x) => x.id);
      notifySuccess(r.staffMessage || '批量提醒完成');
      setLastNotifyReach({
        kind: 'overdue_remind',
        title: `批量滞留提醒（${r.total} 件）`,
        staffMessage: r.staffMessage || '批量提醒完成',
        pushed: r.pushed,
        unbound: r.unbound,
        failed: r.failed,
        failedIds: [...new Set(failedIds)],
      });
      setSelected(new Set());
    } catch (e: any) {
      notifyError(e?.message || '批量提醒失败');
    } finally {
      setBatchReminding(false);
    }
  };

  const onRetryFailedNotify = async () => {
    const ids = (lastNotifyReach?.failedIds || []).filter(Boolean).slice(0, 30);
    if (
      ids.length === 0 ||
      retryingFailed ||
      batchReminding ||
      remindingId ||
      resendingNoticeId
    ) {
      return;
    }
    const kind = lastNotifyReach?.kind || 'inbound_notice';
    const ok = window.confirm(
      kind === 'overdue_remind'
        ? `对 ${ids.length} 条私信失败再发滞留提醒？\n\n会走自动短重试；成功后客户微信会收到取件码。`
        : `对 ${ids.length} 条私信失败再发到件通知？\n\n会走自动短重试；成功后客户微信会收到取件码。`,
    );
    if (!ok) return;
    setRetryingFailed(true);
    try {
      if (kind === 'overdue_remind') {
        const r =
          ids.length === 1
            ? await (async () => {
                const one = await overdueService.remindOverdue(ids[0]);
                return {
                  total: 1,
                  pushed: one.customerPushed ? 1 : 0,
                  unbound: one.customerBound ? 0 : 1,
                  failed: one.customerBound && !one.customerPushed ? 1 : 0,
                  staffMessage: one.staffMessage || '已再发',
                  results: [
                    {
                      id: ids[0],
                      ok: true,
                      customerBound: one.customerBound,
                      customerPushed: one.customerPushed,
                      staffMessage: one.staffMessage,
                    },
                  ],
                };
              })()
            : await overdueService.remindOverdueBatch(ids);
        const failedIds = (r.results || [])
          .filter((x) => !x.ok || (x.customerBound && !x.customerPushed))
          .map((x) => x.id);
        setLastNotifyReach({
          kind: 'overdue_remind',
          title: `失败再发滞留提醒（${r.total} 条）`,
          staffMessage: r.staffMessage || '再发完成',
          pushed: r.pushed,
          unbound: r.unbound,
          failed: r.failed,
          failedIds: [...new Set(failedIds)],
        });
        notifySuccess(r.staffMessage || '再发完成');
      } else {
        const r =
          ids.length === 1
            ? await (async () => {
                const one = await inboundService.resendInboundNotice(ids[0]);
                return {
                  total: 1,
                  pushed: one.customerPushed ? 1 : 0,
                  unbound: one.customerBound ? 0 : 1,
                  failed: one.customerBound && !one.customerPushed ? 1 : 0,
                  staffMessage: one.staffMessage || '已再发',
                  results: [
                    {
                      id: ids[0],
                      ok: true,
                      customerBound: one.customerBound,
                      customerPushed: one.customerPushed,
                      staffMessage: one.staffMessage,
                    },
                  ],
                };
              })()
            : await inboundService.resendInboundNoticeBatch(ids);
        const failedIds = (r.results || [])
          .filter((x) => !x.ok || (x.customerBound && !x.customerPushed))
          .map((x) => x.id);
        setLastNotifyReach({
          kind: 'inbound_notice',
          title: `失败再发到件（${r.total} 条）`,
          staffMessage: r.staffMessage || '再发完成',
          pushed: r.pushed,
          unbound: r.unbound,
          failed: r.failed,
          failedIds: [...new Set(failedIds)],
        });
        notifySuccess(r.staffMessage || '再发完成');
      }
    } catch (e: any) {
      notifyError(e?.message || '再发失败');
    } finally {
      setRetryingFailed(false);
    }
  };

  // URL 为筛选条件真相源（支持 Dashboard 深链 ?status=overdue 等）
  // 依赖 query string 文本，避免 searchParams 对象引用变化导致分页被反复重置
  const searchKey = searchParams.toString();
  const appliedFilters = useMemo(
    () => parseFiltersFromSearch(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const [page, setPage] = useState(1);
  const query = useMemo(
    () => formToInventoryQuery(appliedFilters, page),
    [appliedFilters, page],
  );
  const {
    data,
    isLoading,
    isFetching,
    error: queryError,
  } = useInventoryList(query);
  const loading = isLoading && !data;
  const error = queryError ? (queryError instanceof Error ? queryError.message : '加载失败') : '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 筛选项字典数据走 React Query 缓存（staleTime: Infinity），跨页面共享
  const { data: couriers = [] } = useCouriers();
  const { data: shelves = [] } = useShelves();
  const [showBatch, setShowBatch] = useState(false);
  const [batchReason, setBatchReason] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchResult, setBatchResult] = useState<{ updated: number; skipped: number } | null>(null);

  // 筛选表单草稿：编辑后点「查询」才写入 URL
  const [filterForm, setFilterForm] = useState<FilterFormState>(() =>
    parseFiltersFromSearch(searchParams),
  );

  // URL 变化（Dashboard 跳转 / 浏览器前进后退）时同步草稿并回到第 1 页
  useEffect(() => {
    setFilterForm(parseFiltersFromSearch(new URLSearchParams(searchKey)));
    setPage(1);
  }, [searchKey]);

  // 查询条件变化时重置选中
  useEffect(() => {
    setSelected(new Set());
  }, [query]);

  const commitFiltersToUrl = useCallback(
    (form: FilterFormState) => {
      setSearchParams(formToSearchParams(form), { replace: true });
      setPage(1);
    },
    [setSearchParams],
  );

  const handleSearch = () => {
    commitFiltersToUrl(filterForm);
  };

  const handleReset = () => {
    setFilterForm({ ...EMPTY_FILTER_FORM });
    setSearchParams({}, { replace: true });
    setPage(1);
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

  const toSlip = (item: ParcelListItem) => ({
    stationName,
    pickupCode: item.pickupCode || '',
    trackingNumber: item.trackingNumber,
    shelfNumber: item.shelf?.number,
    recipientName: item.recipientName,
    recipientPhone: item.recipientPhone,
    courierCompanyName: item.courier?.name,
    inboundAt: item.inboundAt,
    collectDueAmount: item.collectDueAmount,
  });

  const onPrintItem = (item: ParcelListItem) => {
    if (!item.pickupCode) {
      notifyError('该包裹没有取件码，无法打印');
      return;
    }
    const ok = printPickupSlip(toSlip(item));
    if (ok) notifySuccess('已打开打印预览');
    else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
  };

  const onBatchPrintSlips = () => {
    if (!data?.items?.length) return;
    const slips = data.items
      .filter((it) => selected.has(it.id) && it.pickupCode)
      .map(toSlip);
    if (slips.length === 0) {
      notifyError('所选包裹没有可打印的取件码');
      return;
    }
    const ok = printPickupSlips(slips);
    if (ok) notifySuccess(`已打开 ${slips.length} 张小票打印预览`);
    else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
  };

  const onPrintPageSlips = () => {
    if (!data?.items?.length) {
      notifyError('本页没有可打印的包裹');
      return;
    }
    const slips = data.items.filter((it) => it.pickupCode).map(toSlip);
    if (slips.length === 0) {
      notifyError('本页包裹没有取件码');
      return;
    }
    const ok = printPickupSlips(slips);
    if (ok) notifySuccess(`已打开本页 ${slips.length} 张小票打印预览`);
    else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
  };

  const handleBatchException = async () => {
    if (batchSubmitting) return;
    setBatchResult(null);
    if (!batchReason.trim()) {
      notifyError('请输入异常原因');
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
      invalidateDashboard();
      invalidateInventoryDetail();
      invalidateInventoryList();
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setBatchSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="库存查询"
        className="mb-4"
        description="在库/滞留可补发到件；滞留或满 3 天可发提醒。未绑定客户需当面报码。可按货架筛选后打印本页小票。"
        actions={
          <button
            type="button"
            onClick={onPrintPageSlips}
            disabled={!data?.items?.some((it) => it.pickupCode)}
            className="rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-orange-50 disabled:opacity-50"
          >
            打印本页小票
          </button>
        }
      />

      <NotifyReachBar className="mb-3" context="inventory" />

      {/* 筛选栏 */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            type="text"
            value={filterForm.phone}
            onChange={(e) => setFilterForm({ ...filterForm, phone: e.target.value })}
            placeholder="手机号或尾号4位"
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
            value={filterForm.collectStatus}
            onChange={(e) => setFilterForm({ ...filterForm, collectStatus: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">全部收款</option>
            <option value="unpaid">待收款</option>
            <option value="paid">已收款</option>
            <option value="none">无需收款</option>
            <option value="waived">已免收</option>
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
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-primaryLight px-3 py-2 text-sm">
          <span className="text-primary">已选 {selected.size} 项</span>
          <button
            type="button"
            onClick={() => void onBatchResendInboundNotice()}
            disabled={
              batchReminding ||
              retryingFailed ||
              Boolean(remindingId) ||
              Boolean(resendingNoticeId)
            }
            className="rounded bg-primary px-3 py-1 text-xs text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {resendingNoticeId === 'batch' ? '批量补发中…' : '批量补发到件'}
          </button>
          <button
            type="button"
            onClick={() => void onBatchRemindOverdue()}
            disabled={
              batchReminding ||
              retryingFailed ||
              Boolean(remindingId) ||
              Boolean(resendingNoticeId)
            }
            className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {batchReminding ? '批量提醒中…' : '批量发滞留提醒'}
          </button>
          <button
            type="button"
            onClick={() => setShowBatch(true)}
            disabled={batchReminding}
            className="rounded bg-warning px-3 py-1 text-xs text-white hover:bg-warning/90 disabled:opacity-60"
          >
            批量标记异常
          </button>
          <button
            type="button"
            onClick={onBatchPrintSlips}
            disabled={batchReminding}
            className="rounded border border-primary/30 bg-white px-3 py-1 text-xs font-medium text-primary hover:bg-orange-50 disabled:opacity-60"
          >
            打印取件码小票
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:underline"
          >
            清除选择
          </button>
        </div>
      )}

      {lastNotifyReach && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="min-w-0">
            <p className="font-medium text-amber-950">{lastNotifyReach.title}</p>
            <p className="mt-0.5">通知回执：{lastNotifyReach.staffMessage}</p>
            <p className="mt-1 text-[11px] text-amber-900/90">
              已私信 {lastNotifyReach.pushed} · 未绑定 {lastNotifyReach.unbound}
              {lastNotifyReach.failed > 0 ? ` · 失败 ${lastNotifyReach.failed}` : ''}
            </p>
            {(lastNotifyReach.failed > 0 || lastNotifyReach.unbound > 0) && (
              <p className="mt-1 text-[11px] text-amber-900/90">
                {lastNotifyReach.failed > 0 && lastNotifyReach.unbound === 0
                  ? '私信失败优先：先点「一键再发失败」，客户已绑定只需重试'
                  : lastNotifyReach.failed > 0
                    ? '有失败也有未绑定：先再发失败，再当面报码/发绑定链接'
                    : '催取时顺便绑：当面报码 → 复制绑定话术 → 客户查件页绑定后再补发。'}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {lastNotifyReach.failed > 0 && lastNotifyReach.failedIds.length > 0 && (
                <button
                  type="button"
                  disabled={
                    retryingFailed ||
                    batchReminding ||
                    Boolean(remindingId) ||
                    Boolean(resendingNoticeId)
                  }
                  className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  onClick={() => void onRetryFailedNotify()}
                >
                  {retryingFailed
                    ? '再发中…'
                    : `一键再发失败（${lastNotifyReach.failedIds.length}）`}
                </button>
              )}
              {lastNotifyReach.failed > 0 && (
                <button
                  type="button"
                  className="rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
                  onClick={() =>
                    navigate(
                      lastNotifyReach.kind === 'overdue_remind'
                        ? '/admin/system?tab=notify&filter=push_failed&days=1&template=overdue_remind'
                        : '/admin/system?tab=notify&filter=push_failed&days=1',
                    )
                  }
                >
                  通知页补发
                </button>
              )}
              <button
                type="button"
                className="rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
                onClick={() =>
                  navigate('/admin/system?tab=notify&filter=today&days=1')
                }
              >
                看今日通知
              </button>
              {lastNotifyReach.unbound > 0 && (
                <>
                  <button
                    type="button"
                    className="rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-950 hover:bg-amber-100"
                    onClick={() => {
                      void (async () => {
                        const ok = await copyText(buildBindShareScript());
                        if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                        else notifyError('复制失败');
                      })();
                    }}
                  >
                    复制绑定话术
                  </button>
                  <button
                    type="button"
                    className="rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
                    onClick={() =>
                      navigate('/admin/system?tab=notify&filter=unbound&view=byPhone&days=3')
                    }
                  >
                    近3日未绑定
                  </button>
                  <button
                    type="button"
                    className="rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
                    onClick={() =>
                      navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')
                    }
                  >
                    按手机号跟进
                  </button>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className="underline"
            onClick={() => setLastNotifyReach(null)}
          >
            关闭
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
                <th className="px-3 py-2 text-left font-medium">在库天数</th>
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
                    {item.collectStatus === 'unpaid' && Number(item.collectDueAmount || 0) > 0 && (
                      <span className="ml-1 rounded px-2 py-0.5 text-xs bg-rose-100 text-rose-700">
                        待收¥{Number(item.collectDueAmount || 0).toFixed(2)}
                      </span>
                    )}
                    {item.collectStatus === 'paid' && (
                      <span className="ml-1 rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700">
                        已收款
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.status === 'in_stock' || item.status === 'overdue' ? (
                      <span
                        className={
                          (item.daysInStock ?? 0) >= 7
                            ? 'font-medium text-orange-600'
                            : (item.daysInStock ?? 0) >= 3
                              ? 'text-amber-600'
                              : 'text-gray-600'
                        }
                      >
                        {item.daysInStock ?? 0} 天
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {item.inboundAt ? new Date(item.inboundAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.collectStatus === 'unpaid' &&
                        Number(item.collectDueAmount || 0) > 0 &&
                        (item.status === 'in_stock' || item.status === 'overdue') && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/admin/outbound?tracking=${encodeURIComponent(item.trackingNumber)}`,
                              )
                            }
                            className="text-xs font-medium text-rose-700 hover:underline"
                          >
                            收款出库
                          </button>
                        )}
                      {writable && canResendInboundNotice(item) && (
                          <button
                            type="button"
                            disabled={
                              resendingNoticeId === item.id ||
                              !!remindingId ||
                              batchReminding
                            }
                            onClick={() => void onResendInboundNotice(item)}
                            className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                          >
                            {resendingNoticeId === item.id ? '补发中…' : '补发到件'}
                          </button>
                        )}
                      {writable && isRemindable(item) && (
                          <button
                            type="button"
                            disabled={
                              remindingId === item.id ||
                              batchReminding ||
                              !!resendingNoticeId
                            }
                            onClick={() => void onRemindOverdue(item)}
                            className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-60"
                          >
                            {remindingId === item.id ? '提醒中…' : '发提醒'}
                          </button>
                        )}
                      {item.pickupCode && (
                        <button
                          type="button"
                          onClick={() => onPrintItem(item)}
                          className="text-xs text-gray-600 hover:underline"
                        >
                          打印
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/inventory/${item.id}`)}
                        className="text-xs text-primary hover:underline"
                      >
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="暂无数据"
          description={
            appliedFilters.status === 'overdue'
              ? '暂无滞留包裹，可在滞留件页立即扫描'
              : appliedFilters.status === 'exception'
                ? '暂无异常包裹，可在列表中批量标记异常'
                : '未查询到符合条件的包裹'
          }
        />
      )}

      {/* 分页 */}
      {data && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          pageSize={data.pageSize}
          disabled={isFetching}
          onChange={(p) => setPage(p)}
        />
      )}

      {/* 批量标记异常弹窗（仅 admin/clerk 可触发） */}
      <Modal
        open={writable && showBatch}
        onClose={() => {
          setShowBatch(false);
          setBatchReason('');
          setBatchResult(null);
        }}
        title={`批量标记异常（${selected.size} 项）`}
        closeOnBackdrop={!batchSubmitting}
        footer={
          <>
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
          </>
        }
      >
        <label className="mb-1 block text-sm text-gray-600">
          <span className="mr-0.5 text-danger">*</span>异常原因
        </label>
        <textarea
          value={batchReason}
          onChange={(e) => setBatchReason(e.target.value)}
          rows={3}
          placeholder="请输入异常原因"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          disabled={batchSubmitting}
        />
        {batchResult && (
          <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            已更新 {batchResult.updated} 项，跳过 {batchResult.skipped} 项（非在库/滞留状态）
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Inventory;
