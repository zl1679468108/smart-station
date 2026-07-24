import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as adminService from '@/services/admin';
import * as statsService from '@/services/stats';
import type { DashboardNotify } from '@/types/stats';
import type { NotifyBindingItem, NotifyLogItem, NotifyPhoneSummaryItem } from '@/types/admin';
import { formatBeijingTimestamp } from '@/utils/date';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import { buildBindShareScript, buildUnboundFollowupScript } from '@/utils/staffScripts';
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

function collectUnboundFromPhoneSummaries(rows: NotifyPhoneSummaryItem[]) {
  return rows.filter(
    (r) =>
      (Number(r.unbound || 0) > 0 || Number(r.pushFailed || 0) > 0) &&
      r.hasBinding !== true,
  );
}

function collectUnboundFromLogs(rows: NotifyLogItem[]) {
  const map = new Map<string, { phone: string; phoneMasked?: string; recipientName?: string | null; unbound: number; pushFailed: number }>();
  for (const log of rows) {
    if (log.customerReach !== 'unbound' && log.customerReach !== 'push_failed') continue;
    const phone = String(log.phone || '').trim();
    if (!phone) continue;
    const cur = map.get(phone) || {
      phone,
      phoneMasked: log.phoneMasked,
      recipientName: log.recipientName,
      unbound: 0,
      pushFailed: 0,
    };
    if (log.customerReach === 'unbound') cur.unbound += 1;
    else cur.pushFailed += 1;
    map.set(phone, cur);
  }
  return Array.from(map.values());
}

const NotifyTab: React.FC = () => {
  const navigate = useNavigate();
  const [bindings, setBindings] = useState<NotifyBindingItem[]>([]);
  const [logs, setLogs] = useState<NotifyLogItem[]>([]);
  const [phoneSummaries, setPhoneSummaries] = useState<NotifyPhoneSummaryItem[]>([]);
  const [phoneSummaryTotal, setPhoneSummaryTotal] = useState(0);
  const [phoneSummaryScanned, setPhoneSummaryScanned] = useState(0);
  const [bindingTotal, setBindingTotal] = useState(0);
  const [logTotal, setLogTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [batchResending, setBatchResending] = useState(false);
  const [phoneResending, setPhoneResending] = useState<string | null>(null);
  const [phoneBatchResending, setPhoneBatchResending] = useState(false);
  const [resendTip, setResendTip] = useState('');
  const [reachToday, setReachToday] = useState<DashboardNotify | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get('filter') || '';
  const initialPhone = (searchParams.get('phone') || '').replace(/\D/g, '').slice(0, 11);
  const initialView = searchParams.get('view') || '';
  const initialSub: 'bindings' | 'logs' | 'byPhone' =
    initialView === 'byPhone'
      ? 'byPhone'
      : initialPhone || (isLogFilter(initialFilter) && initialFilter)
        ? 'logs'
        : 'bindings';
  const [sub, setSub] = useState<'bindings' | 'logs' | 'byPhone'>(initialSub);
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [phoneQuery, setPhoneQuery] = useState(initialPhone);
  const [logFilter, setLogFilter] = useState<LogFilter>(
    isLogFilter(initialFilter) ? initialFilter : '',
  );
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 40;
  const parseDays = (raw: string | null) => {
    const n = Number(raw || '');
    if (n === 3 || n === 7) return n;
    return 1;
  };
  const initialDays = parseDays(searchParams.get('days'));
  const initialExcludeBound =
    searchParams.get('excludeBound') === '0' || searchParams.get('excludeBound') === 'false'
      ? false
      : true;
  const [rangeDays, setRangeDays] = useState<1 | 3 | 7>(initialDays as 1 | 3 | 7);
  const [excludeBound, setExcludeBound] = useState(initialExcludeBound);
  /** 无深链时按今日失败优先自动落地一次 */
  const autoFailFirstApplied = useRef(false);

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

      // 触达筛选：默认「时间窗 + 到件」，便于从工作台深链复盘
      // URL ?template=overdue_remind|all 可覆盖（滞留失败复盘）
      if (REACH_FILTERS.includes(logFilter)) {
        logOpts.reach = logFilter;
        logOpts.days = rangeDays;
        const tpl = (searchParams.get('template') || '').trim();
        if (tpl === 'all') {
          // 不限模板：到件 + 滞留等
        } else if (tpl === 'overdue_remind' || tpl === 'inbound_notice') {
          logOpts.templateCode = tpl;
        } else {
          logOpts.templateCode = 'inbound_notice';
        }
      } else if (logFilter === 'today') {
        logOpts.days = 1;
      } else if (logFilter === 'inbound' || logFilter === 'overdue') {
        // 其它筛选默认带时间窗，避免扫全表
        if (!phone) logOpts.days = rangeDays;
      } else if (logFilter === 'failed') {
        // 发送失败默认只看今日（运营补发场景）；?days= 或本地 rangeDays 可放宽
        if (!phone) logOpts.days = rangeDays;
      } else if (!phone) {
        logOpts.days = rangeDays;
      }

      // 兼容旧 deep link：filter=failed&today=1 强制今日
      if (logFilter === 'failed' && searchParams.get('today') === '1') {
        logOpts.days = 1;
      }
      // 私信失败深链默认今日窗（未显式带 days 时）
      if (logFilter === 'push_failed' && !searchParams.get('days')) {
        logOpts.days = 1;
      }

      const summaryOpts: Parameters<typeof adminService.listNotifyLogPhoneSummary>[0] = {
        limit: rangeDays > 1 ? 800 : 300,
        phone,
        days: rangeDays,
        excludeBound: sub === 'byPhone' ? excludeBound : false,
      };
      if (logFilter === 'failed') summaryOpts.status = 'failed';
      if (logFilter === 'inbound') summaryOpts.templateCode = 'inbound_notice';
      if (logFilter === 'overdue') summaryOpts.templateCode = 'overdue_remind';
      if (REACH_FILTERS.includes(logFilter)) {
        summaryOpts.reach = logFilter;
        const tpl = (searchParams.get('template') || '').trim();
        if (tpl === 'all') {
          // no template
        } else if (tpl === 'overdue_remind' || tpl === 'inbound_notice') {
          summaryOpts.templateCode = tpl;
        } else {
          summaryOpts.templateCode = 'inbound_notice';
        }
      }
      if (logFilter === 'failed' && searchParams.get('today') === '1') {
        summaryOpts.days = 1;
      }
      if (logFilter === 'push_failed' && !searchParams.get('days')) {
        summaryOpts.days = 1;
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
  }, [phoneQuery, logFilter, logPage, searchParams, rangeDays, excludeBound, sub]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if ((logFilter || phoneQuery) && sub === 'bindings') setSub('logs');
  }, [logFilter, phoneQuery, sub]);

  // URL filter/phone/view/days 变化时同步（工作台/统计深链）
  useEffect(() => {
    const f = searchParams.get('filter') || '';
    if (isLogFilter(f) && f !== logFilter) {
      setLogFilter(f);
      setLogPage(1);
    }
    const p = (searchParams.get('phone') || '').replace(/\D/g, '').slice(0, 11);
    if (p && p !== phoneQuery) {
      setPhoneInput(p);
      setPhoneQuery(p);
      setLogPage(1);
    }
    if (!p && phoneQuery && !searchParams.get('phone')) {
      // keep local clear via onClearSearch
    }
    const view = searchParams.get('view') || '';
    if (view === 'byPhone' && sub !== 'byPhone') {
      setSub('byPhone');
    }
    const d = parseDays(searchParams.get('days'));
    if (d !== rangeDays) setRangeDays(d as 1 | 3 | 7);
    const ex =
      searchParams.get('excludeBound') === '0' || searchParams.get('excludeBound') === 'false'
        ? false
        : true;
    if (ex !== excludeBound) setExcludeBound(ex);
  }, [searchParams]);

  const applyLogFilter = (f: LogFilter) => {
    setLogFilter(f);
    setLogPage(1);
    const next = new URLSearchParams(searchParams);
    if (f) next.set('filter', f);
    else next.delete('filter');
    if (f !== 'failed') next.delete('today');
    // 私信失败/发送失败：默认压到今日，方便当场补发
    if (f === 'push_failed' || f === 'failed') {
      setRangeDays(1);
      next.set('days', '1');
      if (f === 'failed') next.set('today', '1');
    }
    setSearchParams(next, { replace: true });
  };

  // 无 filter/phone/view 深链时：失败优先自动落到可处理列表（仅首次）
  useEffect(() => {
    if (autoFailFirstApplied.current) return;
    if (searchParams.get('filter') || searchParams.get('phone') || searchParams.get('view')) {
      autoFailFirstApplied.current = true;
      return;
    }
    if (!reachToday) return;
    autoFailFirstApplied.current = true;
    if ((reachToday.customerPushFailed || 0) > 0) {
      setSub('logs');
      applyLogFilter('push_failed');
      return;
    }
    if ((reachToday.sendFailed || 0) > 0) {
      setSub('logs');
      applyLogFilter('failed');
      return;
    }
    if ((reachToday.customerUnbound || 0) > 0) {
      setSub('byPhone');
      applyLogFilter('unbound');
    }
  }, [reachToday, searchParams]);


  const applyRangeDays = (d: 1 | 3 | 7) => {
    setRangeDays(d);
    setLogPage(1);
    const next = new URLSearchParams(searchParams);
    if (d === 1) next.delete('days');
    else next.set('days', String(d));
    setSearchParams(next, { replace: true });
  };

  const applyExcludeBound = (v: boolean) => {
    setExcludeBound(v);
    const next = new URLSearchParams(searchParams);
    if (v) next.delete('excludeBound');
    else next.set('excludeBound', '0');
    setSearchParams(next, { replace: true });
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLogPage(1);
    const p = phoneInput.replace(/\D/g, '').slice(0, 11);
    setPhoneQuery(p);
    const next = new URLSearchParams(searchParams);
    if (p) next.set('phone', p);
    else next.delete('phone');
    setSearchParams(next, { replace: true });
  };

  const onClearSearch = () => {
    setPhoneInput('');
    setPhoneQuery('');
    setLogPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('phone');
    setSearchParams(next, { replace: true });
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
      logFilter === 'push_failed'
        ? `确认对本页 ${resendableOnPage.length} 条「私信失败」记录重新发送？\n\n会再次走自动短重试；成功后客户微信会收到取件码。`
        : `确认对本页 ${resendableOnPage.length} 条「未私信/私信失败」记录重新发送？\n\n已绑定的会再推取件码；仍未绑定的只会走群/管理员旁路。`,
    );
    if (!ok) return;
    setBatchResending(true);
    setResendTip('');
    try {
      const r = await adminService.resendNotifyLogsBatch(resendableOnPage.map((l) => l.id));
      setResendTip(r.staffMessage);
    } catch (err) {
      setResendTip(err instanceof Error ? err.message : '一键补发失败');
    } finally {
      setBatchResending(false);
      await load();
    }
  };


  const onResendPhoneLogs = async (logIds: string[], phoneKey?: string) => {
    const ids = (logIds || []).filter(Boolean);
    if (ids.length === 0 || phoneBatchResending || batchResending || resendingId || phoneResending) {
      return;
    }
    const ok = window.confirm(
      `对该客户 ${ids.length} 条可补发记录重新发送？\n\n已绑定会再推取件码；未绑定仍只会旁路通知。`,
    );
    if (!ok) return;
    if (phoneKey) setPhoneResending(phoneKey);
    else setPhoneBatchResending(true);
    setResendTip('');
    try {
      const r = await adminService.resendNotifyLogsBatch(ids.slice(0, 40));
      setResendTip(r.staffMessage);
    } catch (err) {
      setResendTip(err instanceof Error ? err.message : '补发失败');
    } finally {
      if (phoneKey) setPhoneResending(null);
      else setPhoneBatchResending(false);
      await load();
    }
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

  const unboundFollowupItems =
    sub === 'byPhone'
      ? collectUnboundFromPhoneSummaries(phoneSummaries)
      : collectUnboundFromLogs(logs);

  const copyUnboundFollowup = async () => {
    if (unboundFollowupItems.length === 0) {
      notifyError('当前没有未绑定/私信失败客户可复制');
      return;
    }
    const text = buildUnboundFollowupScript(unboundFollowupItems);
    const ok = await copyText(text);
    if (ok) {
      notifySuccess(`已复制 ${unboundFollowupItems.length} 人跟进清单（含绑定话术，勿发群）`);
    } else {
      notifyError('复制失败');
    }
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
          {(sub === 'byPhone' || sub === 'logs') && (
            <button
              type="button"
              onClick={() => void copyUnboundFollowup()}
              disabled={unboundFollowupItems.length === 0}
              className="min-h-[40px] rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50"
            >
              复制跟进清单
              {unboundFollowupItems.length > 0 ? `（${unboundFollowupItems.length}）` : ''}
            </button>
          )}
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
              <div>
                已绑定 {reachToday.activeBindings} 人
                {typeof reachToday.todayNewBindings === 'number' &&
                reachToday.todayNewBindings > 0
                  ? ` · 今日新绑 ${reachToday.todayNewBindings}`
                  : ''}
              </div>
              {reachToday.inboundNotices > 0 && (
                <div className="mt-0.5 font-medium text-gray-800">
                  件次私信率{' '}
                  {Math.round(
                    (reachToday.customerPushed / reachToday.inboundNotices) * 100,
                  )}
                  %
                </div>
              )}
              {typeof reachToday.uniqueRecipients === 'number' &&
                reachToday.uniqueRecipients > 0 && (
                  <div className="mt-0.5 text-gray-600">
                    人数覆盖{' '}
                    {Math.round(
                      ((reachToday.uniquePushedRecipients || 0) /
                        reachToday.uniqueRecipients) *
                        100,
                    )}
                    %（{reachToday.uniquePushedRecipients || 0}/
                    {reachToday.uniqueRecipients} 人）
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
          {(reachToday.customerUnbound > 0 ||
            reachToday.customerPushFailed > 0 ||
            (reachToday.sendFailed || 0) > 0) && (
            <p className="mt-2 text-[11px] text-orange-900/80">
              {(reachToday.customerPushFailed || 0) > 0
                ? '优先处理私信失败：点上方「私信失败」或下方一键补发（客户已绑定）。'
                : (reachToday.sendFailed || 0) > 0
                  ? '有发送失败记录，可先筛「发送失败」再补发。'
                  : '未绑定：当面报码或复制绑定话术；客户绑定后可在下方记录一键补发。'}
            </p>
          )}
        </div>
      )}

      {/* 时间窗 + 跟进筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">时间范围</span>
        {(
          [
            { d: 1 as const, label: '今日' },
            { d: 3 as const, label: '近3日' },
            { d: 7 as const, label: '近7日' },
          ] as const
        ).map((t) => (
          <button
            key={t.d}
            type="button"
            onClick={() => applyRangeDays(t.d)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              rangeDays === t.d
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
        {sub === 'byPhone' && (
          <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={excludeBound}
              onChange={(e) => applyExcludeBound(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            只看仍未绑定
          </label>
        )}
        <span className="text-[11px] text-gray-400">
          {rangeDays === 1 ? '今天到件' : `含今天共 ${rangeDays} 天`}
          {sub === 'byPhone' && excludeBound ? ' · 已绑定的不出现在清单' : ''}
        </span>
      </div>

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
          {logFilter === 'push_failed' &&
            '客户已绑定但私信失败：优先一键补发；仍失败请核对绑定或当面报码。'}
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
            onClick={() => {
              setSub(tab.key);
              const next = new URLSearchParams(searchParams);
              if (tab.key === 'byPhone') next.set('view', 'byPhone');
              else next.delete('view');
              setSearchParams(next, { replace: true });
            }}
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
              ? logFilter === 'push_failed'
                ? `今日/本页有 ${resendableOnPage.length} 条私信失败，可一键重试（自动短重试后再发）`
                : logFilter === 'failed'
                  ? `本页有 ${resendableOnPage.length} 条发送失败，可一键重发`
                  : `本页有 ${resendableOnPage.length} 条可补发（未私信/私信失败）`
              : '未私信客户请当面报码，或复制绑定引导话术'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await copyText(buildBindShareScript());
                  if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                  else notifyError('复制失败');
                })();
              }}
              className="min-h-[36px] rounded-md border border-orange-200 bg-white px-3 text-xs font-medium text-orange-800 hover:bg-orange-50"
            >
              复制绑定话术
            </button>
            {unboundFollowupItems.length > 0 && (
              <button
                type="button"
                onClick={() => void copyUnboundFollowup()}
                className="min-h-[36px] rounded-md border border-orange-300 bg-white px-3 text-xs font-medium text-orange-900 hover:bg-orange-50"
              >
                复制跟进清单（{unboundFollowupItems.length}）
              </button>
            )}
            {resendableOnPage.length > 0 && (
              <button
                type="button"
                onClick={() => void onBatchResend()}
                disabled={batchResending || Boolean(resendingId)}
                className="min-h-[36px] rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primaryHover disabled:opacity-60"
              >
                {batchResending
                  ? '补发中…'
                  : logFilter === 'push_failed'
                    ? '一键补发私信失败'
                    : logFilter === 'failed'
                      ? '一键重发失败记录'
                      : '一键补发未私信'}
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
            按手机号汇总{rangeDays === 1 ? '今日' : `近${rangeDays}日`}发送记录（已扫{' '}
            {phoneSummaryScanned} 条日志）。优先列出未私信/失败多的客户；勾选「只看仍未绑定」可做班中跟进清单。
          </p>
          {(unboundFollowupItems.length > 0 ||
            phoneSummaries.some((r) => (r.resendLogIds || []).length > 0)) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-100 bg-orange-50/70 px-3 py-2">
              <p className="text-xs text-orange-900">
                本页可按客户补发：已绑定失败优先一键补发；未绑定可复制清单当面跟进（含手机号，勿发群）。
              </p>
              <div className="flex flex-wrap gap-2">
                {phoneSummaries.some((r) => (r.resendLogIds || []).length > 0) && (
                  <button
                    type="button"
                    disabled={
                      phoneBatchResending ||
                      batchResending ||
                      Boolean(resendingId) ||
                      Boolean(phoneResending)
                    }
                    onClick={() => {
                      const ids = phoneSummaries.flatMap((r) => r.resendLogIds || []).slice(0, 40);
                      void onResendPhoneLogs(ids);
                    }}
                    className="min-h-[36px] rounded-md bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {phoneBatchResending
                      ? '补发中…'
                      : `一键补发本页客户（${Math.min(
                          40,
                          phoneSummaries.reduce(
                            (n, r) => n + (r.resendLogIds || []).length,
                            0,
                          ),
                        )}条）`}
                  </button>
                )}
                {unboundFollowupItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void copyUnboundFollowup()}
                    className="min-h-[36px] rounded-md border border-orange-200 bg-white px-3 text-xs font-medium text-orange-900 hover:bg-orange-50"
                  >
                    复制跟进清单
                  </button>
                )}
              </div>
            </div>
          )}
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
                        <div className="mt-0.5 text-[10px]">
                          {row.hasBinding ? (
                            <span className="text-emerald-600">已绑定</span>
                          ) : (
                            <span className="text-orange-600">未绑定</span>
                          )}
                        </div>
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
                          {(row.resendLogIds || []).length > 0 && (
                            <button
                              type="button"
                              disabled={
                                phoneBatchResending ||
                                batchResending ||
                                Boolean(resendingId) ||
                                phoneResending === row.phone
                              }
                              className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                              onClick={() => void onResendPhoneLogs(row.resendLogIds || [], row.phone)}
                            >
                              {phoneResending === row.phone
                                ? '补发中…'
                                : `补发该客户（${(row.resendLogIds || []).length}）`}
                            </button>
                          )}
                          {(row.unbound > 0 || row.pushFailed > 0) && (
                            <button
                              type="button"
                              className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] text-orange-800 hover:bg-orange-50"
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
                {(log.parcelId || log.canResend) && (
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {log.parcelId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/inventory/${log.parcelId}`)}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 hover:border-primary hover:text-primary"
                      >
                        看包裹
                      </button>
                    )}
                    {log.canResend && (
                      <button
                        type="button"
                        onClick={() => void onResend(log)}
                        disabled={resendingId === log.id || batchResending}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 hover:border-primary hover:text-primary disabled:opacity-60"
                      >
                        {resendingId === log.id ? '重发中…' : '重新发送'}
                      </button>
                    )}
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
