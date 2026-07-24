import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as financeService from '@/services/finance';
import { fetchCouriers } from '@/services/inventory';
import type { CourierCompany } from '@/types/admin';
import type {
  FinanceBill,
  BillStatus,
  CourierRate,
  UpsertRateBody,
  FinanceBillItem,
} from '@/types/finance';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import { notifyError, notifySuccess } from '@/utils/notification';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import CashDayPanel from './CashDayPanel';

type Tab = 'bills' | 'rates' | 'cash';

const STATUS_LABEL: Record<BillStatus, string> = {
  unreconciled: '未对账',
  reconciled: '已对账',
  discrepancy: '有差异',
};

const STATUS_BADGE: Record<BillStatus, string> = {
  unreconciled: 'bg-amber-100 text-amber-800',
  reconciled: 'bg-green-100 text-green-800',
  discrepancy: 'bg-red-100 text-red-800',
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  collect: '代收',
  deliver: '代派',
  shipping: '寄件',
  insure: '保价',
};

function defaultMonth(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const money = (n: number) => `¥${Number(n || 0).toFixed(2)}`;

const EMPTY_RATE: UpsertRateBody = {
  courierCompanyId: '',
  effectiveMonth: defaultMonth(),
  firstWeightPrice: 12,
  additionalPrice: 2,
  firstWeightKg: 1,
  collectRate: 0.8,
  deliverRate: 0.5,
  insureRate: 0.005,
};

const FinancePage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = canManageSystem(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const queryMonth = searchParams.get('month') || '';
  const queryStatus = searchParams.get('status') as BillStatus | '' | null;
  const initialMonth =
    queryMonth && /^\d{4}-\d{2}$/.test(queryMonth) ? queryMonth : defaultMonth();
  const initialStatus: BillStatus | '' =
    queryStatus && ['unreconciled', 'reconciled', 'discrepancy'].includes(queryStatus)
      ? queryStatus
      : '';

  const initialTab = ((): Tab => {
    const tabQ = searchParams.get('tab');
    if (tabQ === 'rates' || tabQ === 'cash' || tabQ === 'bills') return tabQ;
    return 'bills';
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [couriers, setCouriers] = useState<CourierCompany[]>([]);

  // ===== 账单 =====
  const [month, setMonth] = useState(initialMonth);
  const [status, setStatus] = useState<BillStatus | ''>(initialStatus);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<FinanceBill[]>([]);
  const [total, setTotal] = useState(0);
  const [generating, setGenerating] = useState(false);
  const pageSize = 20;

  // 明细弹窗
  const [detailBill, setDetailBill] = useState<FinanceBill | null>(null);
  const [detailItems, setDetailItems] = useState<FinanceBillItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 对账弹窗
  const [reconcileBill, setReconcileBill] = useState<FinanceBill | null>(null);
  const [reconcileForm, setReconcileForm] = useState({ reconciledAmount: '', reconciledNote: '' });
  const [reconciling, setReconciling] = useState(false);

  // ===== 费率 =====
  const [rates, setRates] = useState<CourierRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [rateForm, setRateForm] = useState<UpsertRateBody>(EMPTY_RATE);
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    fetchCouriers()
      .then((list) => setCouriers(list.filter((c) => c.status === 'active')))
      .catch(() => setCouriers([]));
  }, []);

  // 工作台深链 ?month=YYYY-MM&status=unreconciled
  useEffect(() => {
    if (queryMonth && /^\d{4}-\d{2}$/.test(queryMonth) && queryMonth !== month) {
      setMonth(queryMonth);
      setPage(1);
    }
    if (
      queryStatus &&
      ['unreconciled', 'reconciled', 'discrepancy'].includes(queryStatus) &&
      queryStatus !== status
    ) {
      setStatus(queryStatus);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryMonth, queryStatus]);

  const syncBillQuery = (nextMonth: string, nextStatus: BillStatus | '') => {
    const sp = new URLSearchParams(searchParams);
    if (nextMonth) sp.set('month', nextMonth);
    else sp.delete('month');
    if (nextStatus) sp.set('status', nextStatus);
    else sp.delete('status');
    setSearchParams(sp, { replace: true });
  };

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeService.fetchBills({
        month: month || undefined,
        status: status || undefined,
        page,
        pageSize,
      });
      setBills(res.items);
      setTotal(res.total);
    } catch (e: any) {
      notifyError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [month, status, page]);

  const loadRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await financeService.fetchRates();
      setRates(res);
    } catch (e: any) {
      notifyError(e?.message || '加载费率失败');
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'bills') loadBills();
  }, [tab, loadBills]);

  useEffect(() => {
    if (tab === 'rates') loadRates();
  }, [tab, loadRates]);

  const courierName = useMemo(() => {
    const map: Record<string, string> = {};
    couriers.forEach((c) => (map[c.id] = c.name));
    return map;
  }, [couriers]);

  const onGenerate = async () => {
    if (!month) {
      notifyError('请先选择账单月份');
      return;
    }
    setGenerating(true);
    try {
      const r = await financeService.generateBills(month);
      notifySuccess(`已生成 ${r.generated} 张账单，跳过 ${r.skipped} 张已对账`);
      await loadBills();
    } catch (e: any) {
      notifyError(e?.message || '生成账单失败');
    } finally {
      setGenerating(false);
    }
  };

  const onExport = async () => {
    try {
      await financeService.exportBills({ month: month || undefined, status: status || undefined });
    } catch (e: any) {
      notifyError(e?.message || '导出失败');
    }
  };

  const openDetail = async (bill: FinanceBill) => {
    setDetailBill(bill);
    setDetailLoading(true);
    try {
      const items = await financeService.fetchBillItems(bill.id);
      setDetailItems(items);
    } catch (e: any) {
      notifyError(e?.message || '加载明细失败');
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const openReconcile = (bill: FinanceBill) => {
    setReconcileBill(bill);
    setReconcileForm({
      reconciledAmount: bill.reconciledAmount != null ? String(bill.reconciledAmount) : String(bill.netAmount),
      reconciledNote: bill.reconciledNote || '',
    });
  };

  const onReconcile = async () => {
    if (!reconcileBill) return;
    setReconciling(true);
    try {
      const amount = reconcileForm.reconciledAmount.trim();
      await financeService.reconcileBill(reconcileBill.id, {
        status: 'reconciled',
        reconciledAmount: amount === '' ? undefined : Number(amount),
        reconciledNote: reconcileForm.reconciledNote || undefined,
      });
      setReconcileBill(null);
      await loadBills();
    } catch (e: any) {
      notifyError(e?.message || '对账失败');
    } finally {
      setReconciling(false);
    }
  };

  const onSaveRate = async () => {
    if (!rateForm.courierCompanyId) {
      notifyError('请选择快递公司');
      return;
    }
    setSavingRate(true);
    try {
      await financeService.upsertRate({
        ...rateForm,
        firstWeightPrice: Number(rateForm.firstWeightPrice),
        additionalPrice: Number(rateForm.additionalPrice),
        firstWeightKg: Number(rateForm.firstWeightKg),
        collectRate: Number(rateForm.collectRate),
        deliverRate: Number(rateForm.deliverRate),
        insureRate: Number(rateForm.insureRate),
      });
      setShowRate(false);
      await loadRates();
    } catch (e: any) {
      notifyError(e?.message || '保存费率失败');
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">财务结算</h1>
          <p className="mt-1 text-sm text-gray-500">月结账单、对用户收款日结、快递公司费率</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('bills')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm ${
            tab === 'bills'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          月结账单
        </button>
        <button
          type="button"
          onClick={() => setTab('rates')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm ${
            tab === 'rates'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          费率配置
        </button>
        <button
          type="button"
          onClick={() => setTab('cash')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm ${
            tab === 'cash'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          收款日结
        </button>
      </div>

      {tab === 'cash' ? (
        <CashDayPanel />
      ) : tab === 'bills' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => {
                const v = e.target.value;
                setMonth(v);
                setPage(1);
                syncBillQuery(v, status);
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            />
            <select
              value={status}
              onChange={(e) => {
                const v = e.target.value as BillStatus | '';
                setStatus(v);
                setPage(1);
                syncBillQuery(month, v);
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            >
              <option value="">全部状态</option>
              {(Object.keys(STATUS_LABEL) as BillStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onExport}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                导出 CSV
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={generating}
                  className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {generating ? '生成中…' : '生成账单'}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : bills.length === 0 ? (
            <EmptyState title="暂无账单" description="选择月份后点击「生成账单」按快递公司汇总" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">月份</th>
                    <th className="px-3 py-2">快递公司</th>
                    <th className="px-3 py-2 text-right">代收</th>
                    <th className="px-3 py-2 text-right">代派</th>
                    <th className="px-3 py-2 text-right">寄件</th>
                    <th className="px-3 py-2 text-right">应收</th>
                    <th className="px-3 py-2 text-right">应付</th>
                    <th className="px-3 py-2 text-right">净额</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-700">{b.billMonth}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {b.courier?.name || courierName[b.courierCompanyId] || '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{b.collectCount}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{b.deliverCount}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{b.shippingCount}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{money(b.receivable)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{money(b.payable)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {money(b.netAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[b.status]}`}
                        >
                          {STATUS_LABEL[b.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => openDetail(b)}
                          >
                            明细
                          </button>
                          {isAdmin && b.status !== 'reconciled' && (
                            <button
                              type="button"
                              className="text-xs text-gray-600 hover:underline"
                              onClick={() => openReconcile(b)}
                            >
                              对账
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
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            onChange={setPage}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-500">费率按月生效，运费试算与账单金额取当月及之前最近一档。</p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setRateForm(EMPTY_RATE);
                  setShowRate(true);
                }}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                配置费率
              </button>
            )}
          </div>

          {ratesLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
          ) : rates.length === 0 ? (
            <EmptyState title="暂无费率" description="点击「配置费率」为快递公司设置按月费率" />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-3 py-2">生效月份</th>
                    <th className="px-3 py-2">快递公司</th>
                    <th className="px-3 py-2 text-right">首重价</th>
                    <th className="px-3 py-2 text-right">首重(kg)</th>
                    <th className="px-3 py-2 text-right">续重单价</th>
                    <th className="px-3 py-2 text-right">代收费率</th>
                    <th className="px-3 py-2 text-right">代派费率</th>
                    <th className="px-3 py-2 text-right">保价费率</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-700">{r.effectiveMonth}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.courier?.name || courierName[r.courierCompanyId] || '-'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{money(r.firstWeightPrice)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.firstWeightKg}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{money(r.additionalPrice)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{money(r.collectRate)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{money(r.deliverRate)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {(r.insureRate * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin && (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => {
                              setRateForm({
                                courierCompanyId: r.courierCompanyId,
                                effectiveMonth: r.effectiveMonth,
                                firstWeightPrice: r.firstWeightPrice,
                                additionalPrice: r.additionalPrice,
                                firstWeightKg: r.firstWeightKg,
                                collectRate: r.collectRate,
                                deliverRate: r.deliverRate,
                                insureRate: r.insureRate,
                              });
                              setShowRate(true);
                            }}
                          >
                            编辑
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 明细弹窗 */}
      <Modal
        open={detailBill !== null}
        onClose={() => setDetailBill(null)}
        title="账单明细"
        widthClassName="max-w-lg"
      >
        {detailBill && (
          <div className="mb-3 text-sm text-gray-600">
            {detailBill.billMonth} · {detailBill.courier?.name || courierName[detailBill.courierCompanyId]}
          </div>
        )}
        {detailLoading ? (
          <div className="py-8 text-center text-sm text-gray-400">加载中…</div>
        ) : detailItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">无明细</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="py-2">项目</th>
                <th className="py-2 text-right">数量</th>
                <th className="py-2 text-right">金额</th>
                <th className="py-2">方向</th>
              </tr>
            </thead>
            <tbody>
              {detailItems.map((it) => (
                <tr key={it.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-gray-700">{ITEM_TYPE_LABEL[it.itemType] || it.itemType}</td>
                  <td className="py-2 text-right text-gray-600">{it.quantity}</td>
                  <td className="py-2 text-right text-gray-700">{money(it.amount)}</td>
                  <td className="py-2 text-gray-500">
                    {it.direction === 'receivable' ? '应收' : '应付'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      {/* 对账弹窗 */}
      <Modal
        open={reconcileBill !== null}
        onClose={() => setReconcileBill(null)}
        title="账单对账"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => setReconcileBill(null)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={reconciling}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
              onClick={onReconcile}
            >
              {reconciling ? '保存中…' : '确认对账'}
            </button>
          </>
        }
      >
        {reconcileBill && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              系统净额 <span className="font-medium text-gray-900">{money(reconcileBill.netAmount)}</span>
              ，录入快递公司对账金额后自动比对，不一致将标记为「有差异」。
            </p>
            <div>
              <label className="mb-1 block text-sm text-gray-600">对账金额</label>
              <input
                type="number"
                value={reconcileForm.reconciledAmount}
                onChange={(e) =>
                  setReconcileForm((f) => ({ ...f, reconciledAmount: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">备注</label>
              <textarea
                value={reconcileForm.reconciledNote}
                onChange={(e) =>
                  setReconcileForm((f) => ({ ...f, reconciledNote: e.target.value }))
                }
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 费率配置弹窗 */}
      <Modal
        open={showRate}
        onClose={() => setShowRate(false)}
        title="配置费率"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => setShowRate(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={savingRate}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
              onClick={onSaveRate}
            >
              {savingRate ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">快递公司</label>
              <select
                value={rateForm.courierCompanyId}
                onChange={(e) => setRateForm((f) => ({ ...f, courierCompanyId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">请选择</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">生效月份</label>
              <input
                type="month"
                value={rateForm.effectiveMonth}
                onChange={(e) => setRateForm((f) => ({ ...f, effectiveMonth: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">首重价(元)</label>
              <input
                type="number"
                value={rateForm.firstWeightPrice}
                onChange={(e) => setRateForm((f) => ({ ...f, firstWeightPrice: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">首重(kg)</label>
              <input
                type="number"
                value={rateForm.firstWeightKg}
                onChange={(e) => setRateForm((f) => ({ ...f, firstWeightKg: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">续重(元/kg)</label>
              <input
                type="number"
                value={rateForm.additionalPrice}
                onChange={(e) => setRateForm((f) => ({ ...f, additionalPrice: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">代收(元/件)</label>
              <input
                type="number"
                value={rateForm.collectRate}
                onChange={(e) => setRateForm((f) => ({ ...f, collectRate: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">代派(元/件)</label>
              <input
                type="number"
                value={rateForm.deliverRate}
                onChange={(e) => setRateForm((f) => ({ ...f, deliverRate: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">保价费率</label>
              <input
                type="number"
                step="0.001"
                value={rateForm.insureRate}
                onChange={(e) => setRateForm((f) => ({ ...f, insureRate: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FinancePage;
