import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as financeService from '@/services/finance';
import type { CashDaySummary } from '@/types/finance';
import { notifyError, notifySuccess } from '@/utils/notification';
import { buildBindShareScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { printCashDaySummary } from '@/utils/printPickupSlip';
import { useAuth } from '@/utils/auth';
import EmptyState from '@/components/ui/EmptyState';
import NotifyReachBar from '@/components/NotifyReachBar';

const money = (n: number) => `¥${Number(n || 0).toFixed(2)}`;

function todayBeijing(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
}

const METHOD_LABEL: Record<string, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  other: '其他',
};

/** 对用户收款日结（到付运费 + 代收货款） */
const CashDayPanel: React.FC = () => {
  const { stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '智能快递驿站';
  const navigate = useNavigate();
  const [cashDate, setCashDate] = useState(todayBeijing);
  const [cashDay, setCashDay] = useState<CashDaySummary | null>(null);
  const [cashLoading, setCashLoading] = useState(false);

  const loadCashDay = useCallback(async () => {
    setCashLoading(true);
    try {
      const res = await financeService.getCashDay(cashDate || undefined);
      setCashDay(res);
    } catch (e: any) {
      notifyError(e?.message || '加载收款日结失败');
      setCashDay(null);
    } finally {
      setCashLoading(false);
    }
  }, [cashDate]);

  useEffect(() => {
    void loadCashDay();
  }, [loadCashDay]);

  return (
    <div className="space-y-4">
      <NotifyReachBar context="finance" />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={cashDate}
          onChange={(e) => setCashDate(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => void loadCashDay()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/inventory?collectStatus=unpaid')}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100"
        >
          查看在库待收款（{cashDay?.unpaidInStock ?? 0}）
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/outbound?unpaid=1')}
          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
        >
          去出库收款
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/system?tab=notify&filter=today')}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          今日通知
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')}
          className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-900 hover:bg-orange-100"
        >
          未绑定跟进
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const ok = await copyText(buildBindShareScript());
              if (ok) notifySuccess('已复制绑定引导（不含取件码）');
              else notifyError('复制失败');
            })();
          }}
          className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm text-orange-800 hover:bg-orange-50"
        >
          复制绑定话术
        </button>
        <button
          type="button"
          disabled={!cashDay}
          onClick={() => {
            if (!cashDay) return;
            const lines = [
              `【${stationName} 收款日结】`,
              `日期：${cashDay.date}`,
              `收款合计：¥${Number(cashDay.total || 0).toFixed(2)}（${cashDay.paidCount} 笔）`,
              `到付运费 ¥${Number(cashDay.freightTotal || 0).toFixed(2)} · 代收货款 ¥${Number(cashDay.codTotal || 0).toFixed(2)}`,
              `现金 ¥${Number(cashDay.byMethod?.cash || 0).toFixed(2)} · 微信 ¥${Number(cashDay.byMethod?.wechat || 0).toFixed(2)} · 支付宝 ¥${Number(cashDay.byMethod?.alipay || 0).toFixed(2)} · 其他 ¥${Number(cashDay.byMethod?.other || 0).toFixed(2)}`,
              `免收 ${cashDay.waivedCount ?? 0} 笔 / ¥${Number(cashDay.waivedTotal || 0).toFixed(2)}`,
              `在库待收款 ${cashDay.unpaidInStock ?? 0} 件`,
              '（店内对账用，勿发客户群）',
            ];
            void (async () => {
              const ok = await copyText(lines.join('\n'));
              if (ok) notifySuccess('已复制日结摘要');
              else notifyError('复制失败');
            })();
          }}
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
        >
          复制日结摘要
        </button>
        <button
          type="button"
          disabled={!cashDay}
          onClick={() => {
            if (!cashDay) return;
            const ok = printCashDaySummary({
              stationName,
              date: cashDay.date,
              total: cashDay.total,
              freightTotal: cashDay.freightTotal,
              codTotal: cashDay.codTotal,
              paidCount: cashDay.paidCount,
              waivedCount: cashDay.waivedCount,
              waivedTotal: cashDay.waivedTotal,
              unpaidInStock: cashDay.unpaidInStock,
              byMethod: cashDay.byMethod,
            });
            if (ok) notifySuccess('已打开日结打印预览');
            else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
          }}
          className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
        >
          打印日结
        </button>
        <button
          type="button"
          onClick={() => void financeService.exportCashDay(cashDate || undefined)}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          导出 CSV
        </button>
      </div>

      {cashLoading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : !cashDay ? (
        <EmptyState title="暂无日结数据" description="选择日期后查看当日到付/代收货款收款" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">收款合计</div>
              <div className="mt-1 text-lg font-bold text-teal-700">{money(cashDay.total)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">到付运费</div>
              <div className="mt-1 text-lg font-semibold text-gray-800">
                {money(cashDay.freightTotal)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">代收货款</div>
              <div className="mt-1 text-lg font-semibold text-gray-800">{money(cashDay.codTotal)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">收款笔数</div>
              <div className="mt-1 text-lg font-semibold text-gray-800">{cashDay.paidCount}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <div className="text-xs text-amber-800/80">免收笔数</div>
              <div className="mt-1 text-lg font-semibold text-amber-800">
                {cashDay.waivedCount ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
              <div className="text-xs text-amber-800/80">免收金额</div>
              <div className="mt-1 text-lg font-semibold text-amber-800">
                {money(cashDay.waivedTotal ?? 0)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                { k: 'cash', l: '现金' },
                { k: 'wechat', l: '微信' },
                { k: 'alipay', l: '支付宝' },
                { k: 'other', l: '其他' },
              ] as const
            ).map((m) => (
              <div key={m.k} className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">{m.l}</span>
                <span className="ml-2 font-medium text-gray-800">
                  {money(cashDay.byMethod?.[m.k] || 0)}
                </span>
              </div>
            ))}
          </div>
          {cashDay.items.length === 0 ? (
            <EmptyState title="当日无收款记录" description="出库时确认收款后会出现在这里" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">时间</th>
                    <th className="px-3 py-2">运单</th>
                    <th className="px-3 py-2">收件人</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2 text-right">金额</th>
                    <th className="px-3 py-2">方式</th>
                  </tr>
                </thead>
                <tbody>
                  {cashDay.items.map((it) => (
                    <tr key={it.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {it.collectPaidAt
                          ? new Date(it.collectPaidAt).toLocaleString('zh-CN')
                          : '-'}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{it.trackingNumber}</td>
                      <td className="px-3 py-2 text-gray-700">{it.recipientName}</td>
                      <td className="px-3 py-2">
                        {it.collectStatus === 'waived' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                            免收
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">
                            已收
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-teal-700">
                        {money(it.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {it.collectStatus === 'waived'
                          ? it.collectNote || '免收'
                          : METHOD_LABEL[it.collectPaidMethod || ''] ||
                            it.collectPaidMethod ||
                            '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CashDayPanel;
