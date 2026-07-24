import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as shiftService from '@/services/shift';
import type { ShiftItem, StaffPerformanceItem } from '@/types/shift';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import { notifyError, notifySuccess } from '@/utils/notification';
import * as statsService from '@/services/stats';
import type { DashboardNotify } from '@/types/stats';
import { buildBindGuideScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';

type Tab = 'duty' | 'history' | 'performance';

const money = (n: number) => `¥${Number(n || 0).toFixed(2)}`;

function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsv(v: string | number | null | undefined) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function shiftSnapshotCsv(s: ShiftItem, notify?: DashboardNotify | null) {
  const rows: Array<[string, string | number]> = [
    ['字段', '值'],
    ['班次ID', s.id],
    ['状态', s.status === 'open' ? '进行中' : '已交班'],
    ['店员', s.operatorName || ''],
    ['开班时间', s.startedAt || ''],
    ['交班时间', s.endedAt || ''],
    ['本班入库', s.inboundCount],
    ['本班出库', s.outboundCount],
    ['收款笔数', s.collectPaidCount],
    ['收款合计', s.collectPaidTotal],
    ['现金', s.collectCash],
    ['微信', s.collectWechat],
    ['支付宝', s.collectAlipay],
    ['其他', s.collectOther],
    ['在库盘点', s.stockCount ?? ''],
    ['在库待收款', s.collectUnpaid ?? ''],
    ['开班备注', s.openingNote || ''],
    ['交班备注', s.closingNote || ''],
  ];
  if (notify) {
    rows.push(
      ['今日到件通知', notify.inboundNotices],
      ['今日已私信', notify.customerPushed],
      ['今日未绑定', notify.customerUnbound],
      ['今日私信失败', notify.customerPushFailed],
      ['今日发送失败', notify.sendFailed],
      ['当前已绑定客户', notify.activeBindings],
    );
  }
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function fmtMin(m: number): string {
  if (!m || m < 0) return '0 分';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min} 分`;
  return `${h} 小时 ${min} 分`;
}

function todayBeijing(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
}

function daysAgoBeijing(days: number): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000 - days * 86400000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
}

const ShiftsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('duty');
  const [current, setCurrent] = useState<ShiftItem | null>(null);
  const [notifyToday, setNotifyToday] = useState<DashboardNotify | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(true);
  const [openingNote, setOpeningNote] = useState('');
  const [busy, setBusy] = useState(false);

  // close modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const [stockCount, setStockCount] = useState('');

  // history
  const [history, setHistory] = useState<ShiftItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  // performance
  const [perfStart, setPerfStart] = useState(daysAgoBeijing(6));
  const [perfEnd, setPerfEnd] = useState(todayBeijing());
  const [perfItems, setPerfItems] = useState<StaffPerformanceItem[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  const loadCurrent = useCallback(async () => {
    setLoadingCurrent(true);
    try {
      const [s, dash] = await Promise.all([
        shiftService.fetchCurrentShift(),
        statsService.fetchDashboard().catch(() => null),
      ]);
      setCurrent(s);
      setNotifyToday(dash?.notify ?? null);
    } catch (e: any) {
      notifyError(e?.message || '加载当前班次失败');
      setCurrent(null);
    } finally {
      setLoadingCurrent(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await shiftService.fetchShifts({ page: historyPage, pageSize: 10 });
      setHistory(res.items);
      setHistoryTotal(res.total);
    } catch (e: any) {
      notifyError(e?.message || '加载班次记录失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  const loadPerf = useCallback(async () => {
    setPerfLoading(true);
    try {
      const res = await shiftService.fetchStaffPerformance({
        startDate: perfStart,
        endDate: perfEnd,
      });
      setPerfItems(res.items);
    } catch (e: any) {
      notifyError(e?.message || '加载绩效失败');
    } finally {
      setPerfLoading(false);
    }
  }, [perfStart, perfEnd]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  useEffect(() => {
    if (tab === 'performance') void loadPerf();
  }, [tab, loadPerf]);

  const onOpen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await shiftService.openShift(openingNote.trim() || undefined);
      setCurrent(s);
      setOpeningNote('');
    } catch {
      // notified
    } finally {
      setBusy(false);
    }
  };

  const onClose = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await shiftService.closeShift(current.id, {
        closingNote: closingNote.trim() || undefined,
        stockCount: stockCount.trim() ? Number(stockCount) : undefined,
      });
      setCloseOpen(false);
      setClosingNote('');
      setStockCount('');
      setCurrent(null);
      if (tab === 'history') void loadHistory();
    } catch {
      // notified
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="交接班"
        description="开班上岗、交班盘点；按员工看入库/出库/收款绩效。"
      />

      <div className="flex gap-2 border-b border-gray-200">
        {(
          [
            { k: 'duty', l: '我的班次' },
            { k: 'history', l: '班次记录' },
            { k: 'performance', l: '员工绩效' },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.k
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'duty' && (
        <div className="space-y-4">
          {loadingCurrent ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : current ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    班次进行中
                  </span>
                  <p className="mt-2 text-sm text-gray-600">
                    开班时间：
                    <span className="font-medium text-gray-800">
                      {new Date(current.startedAt).toLocaleString('zh-CN')}
                    </span>
                    {current.operatorName && (
                      <span className="ml-2 text-gray-500">· {current.operatorName}</span>
                    )}
                  </p>
                  {current.openingNote && (
                    <p className="mt-1 text-xs text-gray-500">开班备注：{current.openingNote}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      downloadText(
                        `班次快照-${(current.operatorName || '店员').replace(/\s+/g, '')}-${String(current.startedAt || '').slice(0, 10)}.csv`,
                        shiftSnapshotCsv(current, notifyToday),
                      );
                    }}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    导出本班快照
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStockCount(
                        current.stockCount != null ? String(current.stockCount) : '',
                      );
                      setCloseOpen(true);
                    }}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
                  >
                    交班
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="本班入库" value={String(current.inboundCount)} />
                <StatCard label="本班出库" value={String(current.outboundCount)} />
                <StatCard label="收款笔数" value={String(current.collectPaidCount)} />
                <StatCard label="收款合计" value={money(current.collectPaidTotal)} highlight />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="现金" value={money(current.collectCash)} />
                <Mini label="微信" value={money(current.collectWechat)} />
                <Mini label="支付宝" value={money(current.collectAlipay)} />
                <Mini label="其他" value={money(current.collectOther)} />
              </div>
              {current.stockCount != null && (
                <p className="mt-3 text-xs text-gray-500">
                  当前在库约 {current.stockCount} 件（系统统计，交班可手填盘点）
                </p>
              )}
              {Number(current.collectUnpaid || 0) > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-100 bg-rose-50 px-3 py-2">
                  <p className="text-xs text-rose-800">
                    在库待收款 {current.collectUnpaid} 件，出库时记得收款
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/outbound?unpaid=1')}
                    className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                  >
                    去出库收款
                  </button>
                </div>
              )}
              {notifyToday && (
                <div
                  className={`mt-3 rounded-md border px-3 py-2 ${
                    notifyToday.customerUnbound > 0 || notifyToday.customerPushFailed > 0
                      ? 'border-orange-100 bg-orange-50'
                      : 'border-emerald-100 bg-emerald-50'
                  }`}
                >
                  <p
                    className={`text-xs ${
                      notifyToday.customerUnbound > 0 || notifyToday.customerPushFailed > 0
                        ? 'text-orange-900'
                        : 'text-emerald-900'
                    }`}
                  >
                    今日到件触达：已私信 {notifyToday.customerPushed}
                    {notifyToday.inboundNotices > 0
                      ? ` / ${notifyToday.inboundNotices}`
                      : ''}
                    ，未绑定 {notifyToday.customerUnbound}
                    {notifyToday.customerPushFailed > 0
                      ? `，私信失败 ${notifyToday.customerPushFailed}`
                      : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-600">
                    交班时请告知接班：未绑定客户需当面报码；可复制绑定话术。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')
                      }
                      className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
                    >
                      按手机号跟进
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const ok = await copyText(buildBindGuideScript());
                          if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                          else notifyError('复制失败');
                        })();
                      }}
                      className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
                    >
                      复制绑定话术
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/system?tab=notify&filter=today')}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    >
                      看通知记录
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void loadCurrent()}
                className="mt-3 text-xs text-primary hover:underline"
              >
                刷新本班数据
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-medium text-gray-800">尚未开班</h2>
              <p className="mt-1 text-xs text-gray-500">
                上班先开班，系统会累计您本班的入库、出库与收款，交班时一键汇总。
              </p>
              <div className="mt-4">
                <label className="mb-1 block text-xs text-gray-500">开班备注（可选）</label>
                <input
                  type="text"
                  value={openingNote}
                  onChange={(e) => setOpeningNote(e.target.value.slice(0, 200))}
                  placeholder="如：早班 / 代班"
                  className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onOpen()}
                className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
              >
                {busy ? '开班中…' : '开始上班（开班）'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {history.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const header = [
                    '店员',
                    '开班',
                    '交班',
                    '入库',
                    '出库',
                    '收款笔数',
                    '收款合计',
                    '现金',
                    '微信',
                    '支付宝',
                    '其他',
                    '状态',
                    '开班备注',
                    '交班备注',
                  ];
                  const rows = history.map((s) => [
                    s.operatorName || '',
                    s.startedAt || '',
                    s.endedAt || '',
                    s.inboundCount,
                    s.outboundCount,
                    s.collectPaidCount,
                    s.collectPaidTotal,
                    s.collectCash,
                    s.collectWechat,
                    s.collectAlipay,
                    s.collectOther,
                    s.status === 'open' ? '进行中' : '已交班',
                    s.openingNote || '',
                    s.closingNote || '',
                  ]);
                  const csv = [header, ...rows]
                    .map((r) => r.map(escapeCsv).join(','))
                    .join('\n');
                  downloadText(`班次记录-第${historyPage}页.csv`, csv);
                }}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                导出本页 CSV
              </button>
            </div>
          )}
          {historyLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : history.length === 0 ? (
            <EmptyState title="暂无班次记录" description="开班并交班后会出现在这里" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">店员</th>
                    <th className="px-3 py-2">开班</th>
                    <th className="px-3 py-2">交班</th>
                    <th className="px-3 py-2 text-right">入库</th>
                    <th className="px-3 py-2 text-right">出库</th>
                    <th className="px-3 py-2 text-right">收款</th>
                    <th className="px-3 py-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-800">{s.operatorName || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {new Date(s.startedAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {s.endedAt ? new Date(s.endedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">{s.inboundCount}</td>
                      <td className="px-3 py-2 text-right">{s.outboundCount}</td>
                      <td className="px-3 py-2 text-right font-medium text-teal-700">
                        {money(s.collectPaidTotal)}
                      </td>
                      <td className="px-3 py-2">
                        {s.status === 'open' ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">
                            进行中
                          </span>
                        ) : (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                            已交班
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={historyPage}
            totalPages={Math.max(1, Math.ceil(historyTotal / 10))}
            total={historyTotal}
            pageSize={10}
            onChange={setHistoryPage}
          />
        </div>
      )}

      {tab === 'performance' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={perfStart}
              onChange={(e) => setPerfStart(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <span className="text-gray-400">至</span>
            <input
              type="date"
              value={perfEnd}
              onChange={(e) => setPerfEnd(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => void loadPerf()}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              查询
            </button>
          </div>
          {perfLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : perfItems.length === 0 ? (
            <EmptyState title="暂无绩效数据" description="选定日期内无入库/出库/收款操作" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">店员</th>
                    <th className="px-3 py-2 text-right">入库</th>
                    <th className="px-3 py-2 text-right">出库</th>
                    <th className="px-3 py-2 text-right">收款笔数</th>
                    <th className="px-3 py-2 text-right">收款合计</th>
                    <th className="px-3 py-2 text-right">班次数</th>
                    <th className="px-3 py-2 text-right">在岗时长</th>
                  </tr>
                </thead>
                <tbody>
                  {perfItems.map((p) => (
                    <tr key={p.userId} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-800">{p.username}</td>
                      <td className="px-3 py-2 text-right">{p.inboundCount}</td>
                      <td className="px-3 py-2 text-right">{p.outboundCount}</td>
                      <td className="px-3 py-2 text-right">{p.collectPaidCount}</td>
                      <td className="px-3 py-2 text-right font-medium text-teal-700">
                        {money(p.collectPaidTotal)}
                      </td>
                      <td className="px-3 py-2 text-right">{p.shiftCount}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {fmtMin(p.shiftMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={closeOpen}
        onClose={() => !busy && setCloseOpen(false)}
        title="交班确认"
        widthClassName="max-w-md"
        footer={
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCloseOpen(false)}
              className="flex-1 rounded-md border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onClose()}
              className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {busy ? '交班中…' : '确认交班'}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-gray-600">
          {current && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs">
              本班入库 {current.inboundCount} · 出库 {current.outboundCount} · 收款{' '}
              {money(current.collectPaidTotal)}
            </div>
          )}
          {current && Number(current.collectUnpaid || 0) > 0 && (
            <div className="rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <p>
                驿站还有 <strong>{current.collectUnpaid}</strong> 件在库待收款（到付/代收）。
                交班不强制清完，请告知接班同事留意。
              </p>
              <button
                type="button"
                className="mt-2 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-50"
                onClick={() => {
                  setCloseOpen(false);
                  navigate('/admin/outbound?unpaid=1');
                }}
              >
                去出库收款
              </button>
            </div>
          )}
          {notifyToday && (notifyToday.customerUnbound > 0 || notifyToday.customerPushFailed > 0) && (
            <div className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-900">
              <p>
                今日还有 <strong>{notifyToday.customerUnbound}</strong> 次到件未绑定
                {notifyToday.customerPushFailed > 0
                  ? `、${notifyToday.customerPushFailed} 次私信失败`
                  : ''}
                。接班后可按手机号跟进，或引导客户绑定后再补发。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
                  onClick={() => {
                    setCloseOpen(false);
                    navigate('/admin/system?tab=notify&filter=unbound&view=byPhone');
                  }}
                >
                  按手机号跟进
                </button>
                <button
                  type="button"
                  className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
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
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-gray-500">在库盘点件数（可选）</label>
            <input
              type="number"
              min={0}
              value={stockCount}
              onChange={(e) => setStockCount(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={
                current?.stockCount != null ? `系统统计约 ${current.stockCount}` : '手填盘点'
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">交班备注（可选）</label>
            <input
              type="text"
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value.slice(0, 500))}
              placeholder="如：货架已理齐 / 现金已交店长 / 未绑定客户已当面报码"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
    <div className="text-xs text-gray-500">{label}</div>
    <div
      className={`mt-1 text-lg font-semibold ${highlight ? 'text-teal-700' : 'text-gray-800'}`}
    >
      {value}
    </div>
  </div>
);

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-md bg-gray-50 px-3 py-2 text-xs">
    <span className="text-gray-500">{label}</span>
    <span className="ml-2 font-medium text-gray-800">{value}</span>
  </div>
);

export default ShiftsPage;
