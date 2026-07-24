import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as financeService from '@/services/finance';
import type { CashDaySummary } from '@/types/finance';
import { notifyError } from '@/utils/notification';
import EmptyState from '@/components/ui/EmptyState';

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
                      <td className="px-3 py-2 text-right font-medium text-teal-700">
                        {money(it.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {METHOD_LABEL[it.collectPaidMethod] || it.collectPaidMethod}
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
