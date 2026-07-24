import { get, post, put } from './api';
import { getToken, getStationId } from './api';
import type {
  CourierRate,
  FinanceBill,
  FinanceBillListResult,
  FinanceBillItem,
  UpsertRateBody,
  GenerateBillsResult,
  BillStatus,
  CashDaySummary,
} from '@/types/finance';
import { notifyError, notifySuccess } from '@/utils/notification';

// ===== 费率配置 =====

export function fetchRates(month?: string): Promise<CourierRate[]> {
  const q = month ? `?month=${encodeURIComponent(month)}` : '';
  return get<CourierRate[]>(`/api/finance/rates${q}`);
}

export function upsertRate(body: UpsertRateBody): Promise<CourierRate> {
  return put<CourierRate>('/api/finance/rates', body, { successMessage: '费率已保存' });
}

// ===== 月结账单 =====

export function fetchBills(params: {
  month?: string;
  status?: BillStatus | '';
  courierCompanyId?: string;
  page?: number;
  pageSize?: number;
}): Promise<FinanceBillListResult> {
  const q = new URLSearchParams();
  if (params.month) q.set('month', params.month);
  if (params.status) q.set('status', params.status);
  if (params.courierCompanyId) q.set('courierCompanyId', params.courierCompanyId);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const s = q.toString();
  return get<FinanceBillListResult>(`/api/finance/bills${s ? `?${s}` : ''}`);
}

export function fetchBillItems(id: string): Promise<FinanceBillItem[]> {
  return get<FinanceBillItem[]>(`/api/finance/bills/${id}/items`);
}

export function generateBills(month: string): Promise<GenerateBillsResult> {
  return post<GenerateBillsResult>('/api/finance/bills/generate', { month }, {
    successMessage: '账单已生成',
  });
}

export function reconcileBill(
  id: string,
  body: { status: 'reconciled' | 'discrepancy'; reconciledAmount?: number; reconciledNote?: string },
): Promise<FinanceBill> {
  return post<FinanceBill>(`/api/finance/bills/${id}/reconcile`, body, {
    successMessage: '对账已保存',
  });
}

/**
 * 导出账单 CSV（带 UTF-8 BOM，Excel 可直接打开）。
 * request<T>() 只处理 JSON，这里单独用 fetch 拿 blob 触发浏览器下载。
 */
export async function exportBills(params: { month?: string; status?: BillStatus | '' }): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const q = new URLSearchParams();
  if (params.month) q.set('month', params.month);
  if (params.status) q.set('status', params.status);
  const s = q.toString();
  const headers: Record<string, string> = {};
  const token = getToken();
  const stationId = getStationId();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (stationId) headers['x-station-id'] = stationId;

  try {
    const res = await fetch(`${baseUrl}/api/finance/bills/export${s ? `?${s}` : ''}`, { headers });
    if (!res.ok) throw new Error(`导出失败（${res.status}）`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-bills-${params.month || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notifySuccess('账单已导出');
  } catch (e: any) {
    notifyError(e?.message || '导出失败');
  }
}


/** 对用户收款日结（到付+代收货款） */
export function getCashDay(date?: string): Promise<CashDaySummary> {
  const q = date ? `?date=${encodeURIComponent(date)}` : '';
  return get<CashDaySummary>(`/api/finance/cash-day${q}`);
}
