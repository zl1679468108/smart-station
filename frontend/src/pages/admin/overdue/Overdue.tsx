import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as overdueService from '@/services/overdue';
import { useOverdueList, useInvalidateOverdueList } from '@/hooks/useOverdueData';
import type { OverdueCounts, OverdueItem, OverdueLevel } from '@/types/overdue';
import { useAuth } from '@/utils/auth';
import { canWrite } from '@/utils/permission';
import { notifyError, notifySuccess } from '@/utils/notification';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import NotifyReachBar from '@/components/NotifyReachBar';
import { copyText } from '@/utils/stationVisit';
import { buildFacePickupScript } from '@/utils/staffScripts';
import Pagination from '@/components/ui/Pagination';

const LEVEL_TABS: { key: '' | OverdueLevel; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'warn', label: '预警' },
  { key: 'remind', label: '提醒' },
  { key: 'return', label: '待退回' },
];

const levelStyle: Record<string, string> = {
  warn: 'border-l-4 border-amber-400 bg-amber-50',
  remind: 'border-l-4 border-orange-500 bg-orange-50',
  return: 'border-l-4 border-red-500 bg-red-50',
};

const levelBadge: Record<string, string> = {
  warn: 'bg-amber-100 text-amber-800',
  remind: 'bg-orange-100 text-orange-800',
  return: 'bg-red-100 text-red-800',
};

const levelLabel: Record<string, string> = {
  warn: '预警',
  remind: '提醒',
  return: '待退回',
};

const OverduePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const writable = canWrite(user?.role);

  const [level, setLevel] = useState<'' | OverdueLevel>(
    (searchParams.get('level') as OverdueLevel) || '',
  );
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [page, setPage] = useState(1);
  const [submittedKeyword, setSubmittedKeyword] = useState(searchParams.get('keyword') || '');
  const [scanning, setScanning] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [batchReminding, setBatchReminding] = useState(false);
  /** 最近一次扫描/批量提醒触达回执，便于店员看清私信情况 */
  const [lastReach, setLastReach] = useState<{
    source: 'scan' | 'batch' | 'single';
    title: string;
    customerPushed: number;
    customerUnbound: number;
    failed?: number;
    staffMessage: string;
  } | null>(null);
  const pageSize = 20;
  const fromDashboard = searchParams.get('from') === 'dashboard';

  const { data, isLoading, refetch } = useOverdueList({
    level: level || undefined,
    keyword: submittedKeyword || undefined,
    page,
    pageSize,
  });
  const invalidateOverdue = useInvalidateOverdueList();

  const loading = isLoading;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts ?? { all: 0, warn: 0, remind: 0, return: 0 };
  const thresholds = data?.thresholds ?? { warnDays: 3, remindDays: 7, returnDays: 15 };

  const onTab = (key: '' | OverdueLevel) => {
    setLevel(key);
    setPage(1);
    const p = new URLSearchParams();
    if (key) p.set('level', key);
    if (keyword) p.set('keyword', keyword);
    setSearchParams(p);
  };

  const onScan = async () => {
    setScanning(true);
    try {
      const r = await overdueService.scanOverdue();
      const pushed = Number(r.customerNotified || 0);
      const unbound = Number(r.customerUnbound || 0);
      const extra =
        r.customerNotified != null
          ? `；客户私信 ${pushed}，未绑定 ${unbound}`
          : '';
      const msg = `扫描完成：标记滞留 ${r.markedOverdue}，预警 ${r.warned}，提醒 ${r.reminded}，待退回 ${r.returnCandidates}${extra}`;
      notifySuccess(msg);
      if (r.customerNotified != null || r.reminded > 0) {
        setLastReach({
          source: 'scan',
          title: '本次扫描提醒触达',
          customerPushed: pushed,
          customerUnbound: unbound,
          staffMessage: msg,
        });
      }
      await invalidateOverdue();
    } catch (e: any) {
      notifyError(e?.message || '扫描失败');
    } finally {
      setScanning(false);
    }
  };

  const onReturn = async (id: string, action: 'start' | 'complete') => {
    try {
      await overdueService.returnOverdue(id, action);
      await invalidateOverdue();
    } catch (e: any) {
      notifyError(e?.message || '操作失败');
    }
  };

  const onRemind = async (id: string) => {
    if (remindingId || batchReminding) return;
    const ok = window.confirm(
      '向该客户补发滞留提醒？\n\n已绑定微信会私信取件码；未绑定仅通知群/管理员旁路（不含取件码）。',
    );
    if (!ok) return;
    setRemindingId(id);
    try {
      const r = await overdueService.remindOverdue(id);
      notifySuccess(r.staffMessage || '提醒已发送');
      setLastReach({
        source: 'single',
        title: '单件提醒触达',
        customerPushed: r.customerPushed ? 1 : 0,
        customerUnbound: r.customerBound ? 0 : 1,
        failed: r.customerBound && !r.customerPushed ? 1 : 0,
        staffMessage: r.staffMessage || '提醒已发送',
      });
      await invalidateOverdue();
    } catch (e: any) {
      notifyError(e?.message || '发送失败');
    } finally {
      setRemindingId(null);
    }
  };

  const remindableIds = items
    .filter((it) => it.returnStage !== 'returned')
    .map((it) => it.id)
    .slice(0, 30);

  const onBatchRemind = async () => {
    if (batchReminding || remindingId || remindableIds.length === 0) return;
    const ok = window.confirm(
      `对本页 ${remindableIds.length} 条滞留件批量发提醒？\n\n已绑定会私信取件码；未绑定仅旁路通知，不含取件码。`,
    );
    if (!ok) return;
    setBatchReminding(true);
    try {
      const r = await overdueService.remindOverdueBatch(remindableIds);
      notifySuccess(r.staffMessage || '批量提醒完成');
      setLastReach({
        source: 'batch',
        title: `本页批量提醒触达（${r.total} 条）`,
        customerPushed: r.pushed,
        customerUnbound: r.unbound,
        failed: r.failed,
        staffMessage: r.staffMessage || '批量提醒完成',
      });
      await invalidateOverdue();
    } catch (e: any) {
      notifyError(e?.message || '批量提醒失败');
    } finally {
      setBatchReminding(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="滞留件管理"
        description={`阈值：预警 ${thresholds.warnDays} 天 · 提醒 ${thresholds.remindDays} 天 · 退回 ${thresholds.returnDays} 天`}
        actions={
          writable && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onBatchRemind()}
                disabled={batchReminding || Boolean(remindingId) || remindableIds.length === 0}
                className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
              >
                {batchReminding ? '批量提醒中…' : `本页发提醒${remindableIds.length ? `（${remindableIds.length}）` : ''}`}
              </button>
              <button
                type="button"
                onClick={onScan}
                disabled={scanning || batchReminding}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {scanning ? '扫描中…' : '立即扫描'}
              </button>
            </div>
          )
        }
      />

      <NotifyReachBar className="mb-3" context="overdue" />


      
      {fromDashboard && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          来自工作台待办：可先点右上角「立即扫描」更新滞留，再对本页点「本页发提醒」。
          发完后会显示客户是否收到微信私信。
        </div>
      )}

{lastReach && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-sky-900">{lastReach.title}</p>
              <p className="mt-1 text-xs text-sky-900/90">{lastReach.staffMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setLastReach(null)}
              className="text-[11px] text-sky-700 underline hover:text-sky-900"
            >
              关闭
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-white px-2.5 py-1 text-emerald-700">
              已私信 {lastReach.customerPushed}
            </span>
            <span className="rounded-md bg-white px-2.5 py-1 text-orange-700">
              未绑定 {lastReach.customerUnbound}
            </span>
            {typeof lastReach.failed === 'number' && lastReach.failed > 0 && (
              <span className="rounded-md bg-white px-2.5 py-1 text-amber-700">
                失败 {lastReach.failed}
              </span>
            )}
          </div>
          {(lastReach.customerUnbound > 0 || (lastReach.failed || 0) > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              <p className="text-[11px] text-sky-900/80">
                未私信请当面报码；客户绑定后可到通知记录补发滞留提醒。
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/system?tab=notify&filter=overdue')}
                className="rounded-md border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100/60"
              >
                查看滞留通知记录
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_TABS.map((t) => {
          const count = counts[t.key || 'all'] ?? 0;
          const active = level === t.key;
          return (
            <button
              key={t.key || 'all'}
              type="button"
              onClick={() => onTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
              <span
                className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-xs ${
                  active ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedKeyword(keyword);
            if (submittedKeyword === keyword) refetch();
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="运单/取件码/手机号"
            className="w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
            搜索
          </button>
        </form>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无滞留件" description="可点击「立即扫描」刷新超期状态" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl bg-white p-4 shadow-sm ${levelStyle[item.level || 'warn'] || ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        levelBadge[item.level || 'warn']
                      }`}
                    >
                      {levelLabel[item.level || 'warn']} · {item.days} 天
                    </span>
                    {item.returnStage === 'returning' && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        退回中
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => navigate(`/admin/inventory/${item.id}`)}
                    >
                      {item.trackingNumber}
                    </button>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    取件码 {item.pickupCode} · {item.recipientName} {item.recipientPhone}
                    {item.shelf ? ` · 货架 #${item.shelf.number}` : ''}
                    {item.courier ? ` · ${item.courier.name}` : ''}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">入库 {item.inboundAt}</div>
                </div>
                {writable && (
                  <div className="flex flex-wrap gap-2">
                    {item.returnStage !== 'returned' && (
                      <>
                        <button
                          type="button"
                          className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs text-orange-800 hover:bg-orange-50"
                          onClick={() => {
                            void (async () => {
                              const ok = await copyText(
                                buildFacePickupScript({
                                  pickupCode: item.pickupCode,
                                  recipientName: item.recipientName,
                                }),
                              );
                              if (ok) notifySuccess('已复制当面话术（含取件码，勿发群）');
                              else notifyError('复制失败');
                            })();
                          }}
                        >
                          复制当面话术
                        </button>
                        <button
                          type="button"
                          disabled={remindingId === item.id || batchReminding}
                          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-700 disabled:opacity-60"
                          onClick={() => void onRemind(item.id)}
                        >
                          {remindingId === item.id ? '发送中…' : '发提醒'}
                        </button>
                      </>
                    )}
                    {item.returnStage !== 'returning' && item.returnStage !== 'returned' && (
                      <button
                        type="button"
                        className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-700"
                        onClick={() => onReturn(item.id, 'start')}
                      >
                        标记退回中
                      </button>
                    )}
                    {item.returnStage === 'returning' && (
                      <button
                        type="button"
                        className="rounded-lg bg-red-500 px-3 py-1.5 text-xs text-white"
                        onClick={() => onReturn(item.id, 'complete')}
                      >
                        完成退回
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={Math.max(1, Math.ceil(total / pageSize))} onChange={setPage} />
        </div>
      )}
    </div>
  );
};

export default OverduePage;
