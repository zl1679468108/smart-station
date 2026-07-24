import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '@/types/stats';
import type { ShiftItem } from '@/types/shift';
import type { CashDaySummary } from '@/types/finance';
import {
  actionableFollowupItems,
  buildDailyFollowupItems,
  buildDailyFollowupSummaryText,
  type FollowTone,
} from '@/utils/dailyFollowup';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';

const TONE_CLS: Record<FollowTone, string> = {
  danger: 'border-rose-200 bg-rose-50/80',
  warn: 'border-orange-200 bg-orange-50/80',
  info: 'border-sky-200 bg-sky-50/70',
  ok: 'border-emerald-200 bg-emerald-50/70',
};

const COUNT_CLS: Record<FollowTone, string> = {
  danger: 'text-rose-700',
  warn: 'text-orange-700',
  info: 'text-sky-700',
  ok: 'text-emerald-700',
};

export interface DailyFollowupCardProps {
  data: DashboardData;
  /** undefined=加载中，不展示开班项 */
  currentShift?: ShiftItem | null;
  cashToday?: CashDaySummary | null;
  stationName?: string;
  /** 标题覆盖，交班页可用「交班跟进」 */
  title?: string;
  description?: string;
  /** 复制摘要时附带本班快照 */
  includeShiftSnapshot?: boolean;
}

/**
 * 「今日跟进」一页纸：工作台 / 交班共用
 */
const DailyFollowupCard: React.FC<DailyFollowupCardProps> = ({
  data,
  currentShift,
  cashToday,
  stationName,
  title = '今日跟进',
  description = '失败优先、按紧急程度排好；点一项就去处理，可复制摘要交班',
  includeShiftSnapshot = false,
}) => {
  const navigate = useNavigate();

  const actionable = useMemo(
    () =>
      actionableFollowupItems(
        buildDailyFollowupItems({ data, currentShift, cashToday }),
      ),
    [cashToday, currentShift, data],
  );

  const onCopySummary = async () => {
    const text = buildDailyFollowupSummaryText({
      data,
      currentShift,
      cashToday,
      stationName,
      shiftSnapshot: includeShiftSnapshot && currentShift ? currentShift : null,
      title: includeShiftSnapshot
        ? `【${stationName || '本站'} 交班跟进】`
        : undefined,
    });
    const ok = await copyText(text);
    if (ok) notifySuccess(includeShiftSnapshot ? '已复制交班跟进摘要' : '已复制今日跟进摘要');
    else notifyError('复制失败');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onCopySummary()}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            {includeShiftSnapshot ? '复制交班摘要' : '复制跟进摘要'}
          </button>
          {(data.notify?.customerPushFailed || 0) > 0 && (
            <button
              type="button"
              onClick={() =>
                navigate('/admin/system?tab=notify&filter=push_failed&days=1')
              }
              className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
            >
              补发私信失败（{data.notify!.customerPushFailed}）
            </button>
          )}
          {(data.notify?.sendFailed || 0) > 0 &&
            (data.notify?.customerPushFailed || 0) <= 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate('/admin/system?tab=notify&filter=failed&today=1&days=1')
                }
                className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
              >
                重发失败通知（{data.notify!.sendFailed}）
              </button>
            )}
          <button
            type="button"
            onClick={() =>
              navigate('/admin/system?tab=notify&filter=unbound&view=byPhone&days=3')
            }
            className="rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-900 hover:bg-orange-100"
          >
            近3日未绑定
          </button>
        </div>
      </div>

      {actionable.length === 0 ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          今日暂无紧急跟进，可继续入库/出库。有未绑定客户时，系统会自动出现在这里。
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actionable.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => navigate(item.href)}
                className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition hover:opacity-95 ${TONE_CLS[item.tone]}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                    {item.count > 0 && (
                      <span className={`text-base font-bold tabular-nums ${COUNT_CLS[item.tone]}`}>
                        {item.count}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">{item.detail}</p>
                </div>
                <span className="shrink-0 self-center text-[11px] font-medium text-gray-700">
                  {item.actionLabel} →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DailyFollowupCard;
