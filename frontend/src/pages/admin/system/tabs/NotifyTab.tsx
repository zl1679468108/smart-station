import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as adminService from '@/services/admin';
import * as statsService from '@/services/stats';
import type { DashboardNotify } from '@/types/stats';
import type { NotifyBindingItem, NotifyLogItem, NotifyPhoneSummaryItem } from '@/types/admin';
import { formatBeijingTimestamp } from '@/utils/date';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import { buildBindGuideScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';

type LogFilter =
  | ''
  | 'today'
  | 'failed'
  | 'inbound'
  | 'overdue'
  | 'unbound'
  | 'pushed'
  | 'push_failed';

const REACH_FILTERS: LogFilter[] = ['unbound', 'pushed', 'push_failed'];

function isLogFilter(v: string): v is LogFilter {
  return (
    v === '' ||
    v === 'today' ||
    v === 'failed' ||
    v === 'inbound' ||
    v === 'overdue' ||
    v === 'unbound' ||
    v === 'pushed' ||
    v === 'push_failed'
  );
}

/**
 * 通知可观测：客户绑定 + 最近发送记录
 * - 通道/状态/触达中文展示
 * - 支持手机号/尾号查询
 * - 触达筛选：未私信 / 已私信 / 私信失败
 */
const NotifyTab: React.FC = () => {
  const [bindings, setBindings] = useState<NotifyBindingItem[]>([]);
  const [logs, setLogs] = useState<NotifyLogItem[]>([]);
  const [phoneSummaries, setPhoneSummaries] = useState<NotifyPhoneSummaryItem[]>([]);
  const [phoneSummaryTotal, setPhoneSummaryTotal] = useState(0);
  const [phoneSummaryScanned, setPhoneSummaryScanned] = useState(0);
  const [bindingTotal, setBindingTotal] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sub, setSub] = useState<'bindings' | 'logs' | 'byPhone'>('bindings');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [batchResending, setBatchResending] = useState(false);
  const [resendTip, setResendTip] = useState('');
  const [reachToday, setReachToday] = useState<DashboardNotify | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || '';
  const [logFilter, setLogFilter] = useState<LogFilter>(
    isLogFilter(initialFilter) ? initialFilter : '',
  );
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 40;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const phone = phoneQuery || undefined;
      const logOpts: Parameters<typeof adminService.listNotifyLogs>[0] = {
        limit: logPageSize,
        page: logPage,
        phone,
      };

      if (logFilter === 'today') logOpts.todayOnly = true;
      if (logFilter === 'failed') logOpts.status = 'failed';
      if (logFilter === 'inbound') logOpts.templateCode = 'inbound_notice';
      if (logFilter === 'overdue') logOpts.templateCode = 'overdue_remind';

      // 触达筛选：默认「今日 + 到件」，便于从工作台深链复盘
      if (REACH_FILTERS.includes(logFilter)) {
        logOpts.reach = logFilter;
        logOpts.todayOnly = true;
        logOpts.templateCode = 'inbound_notice';
      }

      // 发送失败可叠加今日
      if (logFilter === 'failed' && searchParams.get('today') === '1') {
        logOpts.todayOnly = true;
      }

      const summaryOpts: Parameters<typeof adminService.listNotifyLogPhoneSummary>[0] = {
        limit: 300,
        phone,
      };
      if (logFilter === 'today') summaryOpts.todayOnly = true;
      if (logFilter === 'failed') summaryOpts.status = 'failed';
      if (logFilter === 'inbound') summaryOpts.templateCode = 'inbound_notice';
      if (logFilter === 'overdue') summaryOpts.templateCode = 'overdue_remind';
      if (REACH_FILTERS.includes(logFilter)) {
        summaryOpts.reach = logFilter;
        summaryOpts.todayOnly = true;
        summaryOpts.templateCode = 'inbound_notice';
      }
      if (logFilter === 'failed' && searchParams.get('today') === '1') {
        summaryOpts.todayOnly = true;
      }
      // 默认聚合看今日，避免全量过大
      if (!logFilter && !phone) {
        summaryOpts.todayOnly = true;
      }

      const [b, l, s, dash] = await Promise.all([
        adminService.listNotifyBindings({ limit: 80, phone }),
        adminService.listNotifyLogs(logOpts),
        adminService.listNotifyLogPhoneSummary(summaryOpts),
        statsService.fetchDashboard().catch(() => null),
      ]);
      setReachToday(dash?.notify ?? null);
      setBindings(b.items || []);
      setBindingTotal(b.total ?? b.items?.length ?? 0);
      setLogs(l.items || []);
      setLogTotal(l.total ?? l.items?.length ?? 0);
      setPhoneSummaries(s.items || []);
      setPhoneSummaryTotal(s.total ?? s.items?.length ?? 0);
      setPhoneSummaryScanned(s.scanned ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [phoneQuery, logFilter, logPage, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (logFilter && sub === 'bindings') setSub('logs');
  }, [logFilter, sub]);

  // URL filter 变化时同步（工作台深链）
  useEffect(() => {
    const f = searchParams.get('filter') || '';
    if (isLogFilter(f) && f !== logFilter) {
      setLogFilter(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const applyLogFilter = (f: LogFilter) => {
    setLogFilter(f);
    setLogPage(1);
    const next = new URLSearchParams(searchParams);
    if (f) next.set('filter', f);
    else next.delete('filter');
    if (f !== 'failed') next.delete('today');
    setSearchParams(next, { replace: true });
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLogPage(1);
    setPhoneQuery(phoneInput.replace(/\D/g, '').slice(0, 11));
  };

  const onClearSearch = () => {
    setPhoneInput('');
    setPhoneQuery('');
    setLogPage(1);
  };

  const onResend = async (log: NotifyLogItem) => {
    if (!log.canResend || resendingId || batchResending) return;
    const ok = window.confirm(
      `确认向 ${log.phoneMasked} 重新发送「${log.templateLabel}」？\n\n若客户已绑定微信，将再次私信取件码；未绑定则仅通知群/管理员旁路。`,
    );
    if (!ok) return;
    setResendingId(log.id);
    setResendTip('');
    try {
      const r = await adminService.resendNotifyLog(log.id);
      setResendTip(`${log.phoneMasked}：${r.staffMessage}`);
      await load();
    } catch (err) {
      setResendTip(err instanceof Error ? err.message : '重发失败');
    } finally {
      setResendingId(null);
    }
  };

  const resendableOnPage = useMemo(
    () =>
      logs.filter(
        (l) =>
          l.canResend &&
          (l.customerReach === 'unbound' || l.customerReach === 'push_failed'),
      ),
    [logs],
  );

  const onBatchResend = async () => {
    if (batchResending || resendingId || resendableOnPage.length === 0) return;
    const ok = window.confirm(
      `确认对本页 ${resendableOnPage.length} 条「未私信/私信失败」记录重新发送？\n\n已绑定的会再推取件码；仍未绑定的只会走群/管理员旁路。`,
    );
    if (!ok) return;
    setBatchResending(true);
    setResendTip('');
    let pushed = 0;
    let failed = 0;
    for (const log of resendableOnPage) {
      try {
        const r = await adminService.resendNotifyLog(log.id);
        if (r.customerPushed) pushed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setResendTip(
      `一键补发完成：成功私信 ${pushed} 条，仍未私信/失败 ${failed} 条（共 ${resendableOnPage.length} 条）`,
    );
    setBatchResending(false);
    await load();
  };

  const exportLogsCsv = () => {
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    if (sub === 'byPhone') {
      if (phoneSummaries.length === 0) {
        notifyError('当前没有可导出的聚合记录');
        return;
      }
      const header = [
        '手机号',
        '姓名',
        '次数',
        '已私信',
        '未私信',
        '私信失败',
        '发送失败',
        '最近类型',
        '最近触达',
        '最近时间',
      ];
      const rows = phoneSummaries.map((row) => [
        row.phoneMasked || row.phone || '',
        row.recipientName || '',
        String(row.total ?? 0),
        String(row.pushed ?? 0),
        String(row.unbound ?? 0),
        String(row.pushFailed ?? 0),
        String(row.failed ?? 0),
        row.lastTemplateLabel || '',
        row.lastReachLabel || '',
        row.lastAt || '',
      ]);
      const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '通知记录-按手机号.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notifySuccess(`已导出 ${phoneSummaries.length} 个手机号`);
      return;
    }

    if (logs.length === 0) {
      notifyError('当前没有可导出的记录');
      return;
    }
    const header = [
      '时间',
      '类型',
      '手机号',
      '状态',
      '客户触达',
      '通道摘要',
      '内容',
      '错误',
    ];
    const rows = logs.map((log) => [
      log.createdAt || '',
      log.templateLabel || log.templateCode || '',
      log.phoneMasked || log.phone || '',
      log.statusLabel || log.status || '',
      log.customerReachLabel || log.customerReach || '',
      log.channelSummary || '',
      (log.content || '').replace(/\r?\n/g, ' '),
      (log.errorMessage || '').replace(/\r?\n/g, ' '),
    ]);
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `通知记录-第${logPage}页.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notifySuccess(`已导出本页 ${logs.length} 条`);
  };

    const filterChips: { key: LogFilter; label: string }[] = [
    { key: '', label: '全部' },
    { key: 'today', label: '今日' },
    { key: 'failed', label: '发送失败' },
    { key: 'inbound', label: '到件' },
    { key: 'overdue', label: '滞留' },
    { key: 'unbound', label: '未私信' },
    { key: 'pushed', label: '已私信' },
    { key: 'push_failed', label: '私信失败' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          查看客户是否已绑定微信通知，以及到件/提醒是否发送成功。敏感内容已脱敏。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportLogsCsv()}
            disabled={sub === 'byPhone' ? phoneSummaries.length === 0 : logs.length === 0}
            className="min-h-[40px] rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {sub === 'byPhone' ? '导出聚合 CSV' : '导出本页 CSV'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[40px] rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 hover:bg-gray-50"
          >
            刷新
          </button>
        </div>
      </div>


      {/* 今日触达漏斗（与工作台同源，便于运营复盘） */}
      {reachToday && (
        <div className="rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-800">今日到件触达漏斗</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                到件通知 → 微信私信是否成功（点卡片可筛选记录）
              </p>
            </div>
            <div className="text-right text-xs text-gray-600">
              <div>已绑定 {reachToday.activeBindings} 人</div>
              {reachToday.inboundNotices > 0 && (
                <div className="mt-0.5 font-medium text-gray-800">
                  私信率{' '}
                  {Math.round(
                    (reachToday.customerPushed / reachToday.inboundNotices) * 100,
                  )}
                  %
                </div>
              )}
            </div>
          </div>
          {reachToday.inboundNotices > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (reachToday.customerPushed / reachToday.inboundNotices) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setSub('logs');
                applyLogFilter('inbound');
              }}
              className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-orange-50/80"
            >
              <div className="text-[11px] text-gray-500">到件通知</div>
              <div className="text-base font-semibold text-gray-800">
                {reachToday.inboundNotices}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setSub('logs');
                applyLogFilter('pushed');
              }}
              className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-emerald-50/80"
            >
              <div className="text-[11px] text-emerald-700">已私信</div>
              <div className="text-base font-semibold text-emerald-800">
                {reachToday.customerPushed}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setSub('logs');
                applyLogFilter('unbound');
              }}
              className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-orange-50/80"
            >
              <div className="text-[11px] text-orange-700">未绑定</div>
              <div className="text-base font-semibold text-orange-800">
                {reachToday.customerUnbound}
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setSub('logs');
                applyLogFilter('push_failed');
              }}
              className="rounded-md bg-white px-2.5 py-2 text-left hover:bg-amber-50/80"
            >
              <div className="text-[11px] text-amber-700">私信失败</div>
              <div className="text-base font-semibold text-amber-800">
                {reachToday.customerPushFailed}
              </div>
            </button>
          </div>
          {(reachToday.customerUnbound > 0 || reachToday.customerPushFailed > 0) && (
            <p className="mt-2 text-[11px] text-orange-900/80">
              未私信：当面报码或复制绑定话术；客户绑定后可在下方记录一键补发。
            </p>
          )}
        </div>
      )}

      {/* 手机号查询 */}
      <form onSubmit={onSearch} className="flex flex-wrap items-center gap-2">
        <input
          type="tel"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="输入手机号或尾号查询"
          className="min-h-[40px] w-full max-w-xs rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="min-h-[40px] rounded-md bg-primary px-4 text-xs font-medium text-white hover:bg-primaryHover"
        >
          查询
        </button>
        {phoneQuery && (
          <button
            type="button"
            onClick={onClearSearch}
            className="min-h-[40px] rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-600 hover:bg-gray-50"
          >
            清除
          </button>
        )}
        {phoneQuery && (
          <span className="text-xs text-gray-400">当前筛选：{phoneQuery}</span>
        )}
      </form>

      {/* 发送记录快捷筛选（运营复盘） */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">记录筛选：</span>
        {filterChips.map((f) => (
          <button
            key={f.key || 'all'}
            type="button"
            onClick={() => applyLogFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${
              logFilter === f.key
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {REACH_FILTERS.includes(logFilter) && (
        <p className="text-[11px] text-gray-500">
          当前为「今日到件」触达筛选：
          {logFilter === 'unbound' && '未绑定微信的客户，取件码未私信。'}
          {logFilter === 'pushed' && '客户微信私信已成功。'}
          {logFilter === 'push_failed' && '客户已绑定但私信失败，可重试。'}
        </p>
      )}

      {resendTip && (
        <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          重发结果：{resendTip}
        </div>
      )}

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(
          [
            { key: 'bindings' as const, label: `客户绑定（${bindingTotal}）` },
            { key: 'logs' as const, label: `发送记录（${logTotal}）` },
            { key: 'byPhone' as const, label: `按手机号（${phoneSummaryTotal}）` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSub(tab.key)}
            className={`min-h-[40px] flex-1 rounded-md text-xs font-medium ${
              sub === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {sub === 'logs' && (resendableOnPage.length > 0 || logFilter === 'unbound') && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-100 bg-orange-50/70 px-3 py-2">
          <p className="text-xs text-orange-900">
            {resendableOnPage.length > 0
              ? `本页有 ${resendableOnPage.length} 条可补发（未私信/私信失败）`
              : '未私信客户请当面报码，或复制绑定引导话术'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await copyText(buildBindGuideScript());
                  if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                  else notifyError('复制失败');
                })();
              }}
              className="min-h-[36px] rounded-md border border-orange-200 bg-white px-3 text-xs font-medium text-orange-800 hover:bg-orange-50"
            >
              复制绑定话术
            </button>
            {resendableOnPage.length > 0 && (
              <button
                type="button"
                onClick={() => void onBatchResend()}
                disabled={batchResending || Boolean(resendingId)}
                className="min-h-[36px] rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primaryHover disabled:opacity-60"
              >
                {batchResending ? '补发中…' : '一键补发未私信'}
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : sub === 'bindings' ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {bindings.length === 0 ? (
            <EmptyState
              title={phoneQuery ? '未找到匹配绑定' : '暂无客户绑定'}
              description={
                phoneQuery
                  ? '换个手机号或尾号试试'
                  : '客户在查件页绑定后会出现在这里'
              }
            />
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">手机号</th>
                  <th className="px-3 py-2 font-medium">绑定方式</th>
                  <th className="px-3 py-2 font-medium">目标（脱敏）</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono text-xs text-gray-800">{b.phoneMasked}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{b.channelLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{b.targetMasked}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          b.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.statusLabel || (b.status === 'active' ? '有效' : b.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {formatBeijingTimestamp(b.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : sub === 'byPhone' ? (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500">
            按手机号汇总最近发送记录（已扫 {phoneSummaryScanned} 条日志）。优先列出未私信/失败多的客户，点手机号可筛选明细。
          </p>
          {phoneSummaries.length === 0 ? (
            <EmptyState
              title={phoneQuery ? '未找到匹配客户' : '暂无聚合数据'}
              description={
                phoneQuery
                  ? '换个手机号或尾号试试'
                  : '可先选「今日/未私信」再看，或等有到件通知后刷新'
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">手机号</th>
                    <th className="px-3 py-2 font-medium">次数</th>
                    <th className="px-3 py-2 font-medium">已私信</th>
                    <th className="px-3 py-2 font-medium">未私信</th>
                    <th className="px-3 py-2 font-medium">私信失败</th>
                    <th className="px-3 py-2 font-medium">发送失败</th>
                    <th className="px-3 py-2 font-medium">最近</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {phoneSummaries.map((row) => (
                    <tr key={row.phone} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs text-gray-800">{row.phoneMasked}</div>
                        {row.recipientName && (
                          <div className="text-[11px] text-gray-400">{row.recipientName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{row.total}</td>
                      <td className="px-3 py-2 text-xs text-emerald-700">{row.pushed}</td>
                      <td className="px-3 py-2 text-xs text-orange-700">{row.unbound}</td>
                      <td className="px-3 py-2 text-xs text-amber-700">{row.pushFailed}</td>
                      <td className="px-3 py-2 text-xs text-red-700">{row.failed}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-500">
                        <div>{row.lastTemplateLabel || '—'}</div>
                        <div>{row.lastReachLabel || ''}</div>
                        <div>{formatBeijingTimestamp(row.lastAt || '')}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-primary hover:text-primary"
                            onClick={() => {
                              setPhoneInput(row.phone);
                              setPhoneQuery(row.phone);
                              setLogPage(1);
                              setSub('logs');
                            }}
                          >
                            看明细
                          </button>
                          {(row.unbound > 0 || row.pushFailed > 0) && (
                            <button
                              type="button"
                              className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] text-orange-800 hover:bg-orange-50"
                              onClick={() => {
                                void (async () => {
                                  const ok = await copyText(buildBindGuideScript());
                                  if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                                  else notifyError('复制失败');
                                })();
                              }}
                            >
                              复制绑定话术
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <EmptyState
              title={phoneQuery ? '未找到匹配记录' : '暂无发送记录'}
              description={
                phoneQuery
                  ? '换个手机号或尾号试试'
                  : REACH_FILTERS.includes(logFilter)
                    ? '当前筛选下没有记录，可切换「全部/今日」再看'
                    : '入库/滞留/验证码通知会写到这里'
              }
            />
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-lg border bg-white p-3 ${
                  log.status === 'failed'
                    ? 'border-red-100'
                    : log.customerReach === 'push_failed'
                      ? 'border-amber-100'
                      : log.customerReach === 'unbound'
                        ? 'border-orange-100'
                        : log.status === 'sent'
                          ? 'border-gray-200'
                          : 'border-amber-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-800">{log.templateLabel}</span>
                    <span className="font-mono text-xs text-gray-500">{log.phoneMasked}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        log.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {log.statusLabel ||
                        (log.status === 'sent'
                          ? '已发送'
                          : log.status === 'failed'
                            ? '失败'
                            : log.status)}
                    </span>
                    {log.customerReach && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          log.customerReach === 'pushed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : log.customerReach === 'push_failed'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-orange-50 text-orange-800'
                        }`}
                      >
                        {log.customerReachLabel ||
                          (log.customerReach === 'pushed'
                            ? '已私信'
                            : log.customerReach === 'push_failed'
                              ? '私信失败'
                              : '未私信')}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {formatBeijingTimestamp(log.createdAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{log.content}</p>
                {(log.channels?.length || log.channelSummary) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {log.channels && log.channels.length > 0
                      ? log.channels.map((c) => (
                          <span
                            key={`${log.id}-${c.key}-${c.label}`}
                            className={`rounded-md px-2 py-0.5 text-[11px] ${
                              c.ok
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {c.label}
                          </span>
                        ))
                      : (
                          <span className="text-[11px] text-gray-400">通道：{log.channelSummary}</span>
                        )}
                  </div>
                )}
                {log.errorMessage && (
                  <p className="mt-1 text-[11px] text-red-600">错误：{log.errorMessage}</p>
                )}
                {log.canResend && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void onResend(log)}
                      disabled={resendingId === log.id || batchResending}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 hover:border-primary hover:text-primary disabled:opacity-60"
                    >
                      {resendingId === log.id ? '重发中…' : '重新发送'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {logTotal > logPageSize && (
            <Pagination
              page={logPage}
              totalPages={Math.max(1, Math.ceil(logTotal / logPageSize))}
              total={logTotal}
              pageSize={logPageSize}
              onChange={setLogPage}
              disabled={loading}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default NotifyTab;
