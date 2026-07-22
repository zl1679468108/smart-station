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
  const pageSize = 20;

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
      notifySuccess(
        `扫描完成：标记滞留 ${r.markedOverdue}，预警事件 ${r.warned}，提醒 ${r.reminded}，待退回候选 ${r.returnCandidates}`,
      );
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

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="滞留件管理"
        description={`阈值：预警 ${thresholds.warnDays} 天 · 提醒 ${thresholds.remindDays} 天 · 退回 ${thresholds.returnDays} 天`}
        actions={
          writable && (
            <button
              type="button"
              onClick={onScan}
              disabled={scanning}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {scanning ? '扫描中…' : '立即扫描'}
            </button>
          )
        }
      />

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
                  <div className="flex gap-2">
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
