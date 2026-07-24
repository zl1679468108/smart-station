import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardData } from '@/types/stats';
import type { ShiftItem } from '@/types/shift';
import type { CashDaySummary } from '@/types/finance';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';

type Tone = 'danger' | 'warn' | 'info' | 'ok';

interface FollowItem {
  key: string;
  priority: number;
  title: string;
  detail: string;
  count: number;
  href: string;
  tone: Tone;
  actionLabel: string;
}

const TONE_CLS: Record<Tone, string> = {
  danger: 'border-rose-200 bg-rose-50/80',
  warn: 'border-orange-200 bg-orange-50/80',
  info: 'border-sky-200 bg-sky-50/70',
  ok: 'border-emerald-200 bg-emerald-50/70',
};

const COUNT_CLS: Record<Tone, string> = {
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
}

/**
 * 工作台「今日跟进」：按紧急程度排序的一页纸清单
 * 复用 dashboard 已有数据，不新增接口。
 */
const DailyFollowupCard: React.FC<DailyFollowupCardProps> = ({
  data,
  currentShift,
  cashToday,
  stationName,
}) => {
  const navigate = useNavigate();
  const todo = data.todo;
  const notify = data.notify;

  const items = useMemo(() => {
    const list: FollowItem[] = [];

    if (currentShift === null) {
      list.push({
        key: 'shift',
        priority: 5,
        title: '尚未开班',
        detail: '开班后才能按班次汇总入出库与收款',
        count: 1,
        href: '/admin/shifts',
        tone: 'warn',
        actionLabel: '去开班',
      });
    }

    const unbound = notify?.customerUnbound || 0;
    if (unbound > 0) {
      list.push({
        key: 'unbound',
        priority: 10,
        title: '今日到件未绑定',
        detail: '客户收不到微信取件码，请当面报码或引导绑定',
        count: unbound,
        href: '/admin/system?tab=notify&filter=unbound&view=byPhone',
        tone: 'warn',
        actionLabel: '按手机跟进',
      });
    }

    const pushFailed = notify?.customerPushFailed || 0;
    if (pushFailed > 0) {
      list.push({
        key: 'push_failed',
        priority: 15,
        title: '今日私信失败',
        detail: '已绑定但发送失败，可在通知记录重试',
        count: pushFailed,
        href: '/admin/system?tab=notify&filter=push_failed',
        tone: 'danger',
        actionLabel: '去重发',
      });
    }

    const unpaid = todo.collectUnpaid ?? cashToday?.unpaidInStock ?? 0;
    if (unpaid > 0) {
      list.push({
        key: 'collect',
        priority: 20,
        title: '在库待收款',
        detail: '到付/代收货款未收，出库前需先收款',
        count: unpaid,
        href: '/admin/outbound?unpaid=1',
        tone: 'danger',
        actionLabel: '去处理',
      });
    }

    const apptPending = todo.appointmentPending ?? 0;
    const apptToday = todo.appointmentToday ?? 0;
    if (apptPending > 0) {
      list.push({
        key: 'appt_pending',
        priority: 25,
        title: '预约待确认',
        detail: `今日共 ${apptToday} 条预约，其中 ${apptPending} 条待确认`,
        count: apptPending,
        href: '/admin/appointments?status=pending&date=today',
        tone: 'info',
        actionLabel: '去确认',
      });
    } else if (apptToday > 0) {
      list.push({
        key: 'appt_today',
        priority: 40,
        title: '今日预约到店',
        detail: '已确认/待接待客户，到点注意接待',
        count: apptToday,
        href: '/admin/appointments?date=today',
        tone: 'info',
        actionLabel: '看预约',
      });
    }

    if ((todo.overdueWarn || 0) > 0) {
      list.push({
        key: 'overdue',
        priority: 30,
        title: '滞留件待催',
        detail: '可在滞留页扫描并发送催取提醒',
        count: todo.overdueWarn,
        href: '/admin/overdue?from=dashboard',
        tone: 'warn',
        actionLabel: '去催取',
      });
    }

    if ((todo.exceptionUnresolved || 0) > 0) {
      list.push({
        key: 'exception',
        priority: 35,
        title: '异常件未处理',
        detail: '破损/错件等需尽快登记处理',
        count: todo.exceptionUnresolved,
        href: '/admin/exception',
        tone: 'danger',
        actionLabel: '去处理',
      });
    }

    if ((todo.shippingPending || 0) > 0) {
      list.push({
        key: 'ship_pending',
        priority: 45,
        title: '寄件待处理',
        detail: '客户下单待取件',
        count: todo.shippingPending || 0,
        href: '/admin/shipping?status=pending',
        tone: 'info',
        actionLabel: '去处理',
      });
    }

    if ((todo.shippingPicked || 0) > 0) {
      list.push({
        key: 'ship_picked',
        priority: 50,
        title: '寄件待发出',
        detail: '已取件，待交快递发出',
        count: todo.shippingPicked || 0,
        href: '/admin/shipping?status=picked',
        tone: 'info',
        actionLabel: '去发出',
      });
    }

    // 近3日未绑定入口：今日无未绑定也常驻轻提示（低优先级，仅当有今日到件时）
    if (unbound === 0 && (notify?.inboundNotices || 0) > 0) {
      list.push({
        key: 'unbound3',
        priority: 90,
        title: '近3日未绑定复查',
        detail: '今日到件均已覆盖，仍可复查近3日漏绑',
        count: 0,
        href: '/admin/system?tab=notify&filter=unbound&view=byPhone&days=3',
        tone: 'ok',
        actionLabel: '去复查',
      });
    } else if (unbound > 0) {
      list.push({
        key: 'unbound3',
        priority: 12,
        title: '近3日未绑定',
        detail: '扩大窗口跟进，避免只盯今天',
        count: 0,
        href: '/admin/system?tab=notify&filter=unbound&view=byPhone&days=3',
        tone: 'warn',
        actionLabel: '近3日清单',
      });
    }

    return list.sort((a, b) => a.priority - b.priority).slice(0, 8);
  }, [cashToday?.unpaidInStock, currentShift, data, notify, todo]);

  const actionable = items.filter((i) => i.count > 0 || i.key === 'unbound3' || i.key === 'shift');

  const onCopySummary = async () => {
    const name = stationName || '本站';
    const lines = [
      `【${name} 今日跟进】`,
      currentShift === undefined
        ? '班次：加载中'
        : currentShift
          ? '班次：已开班'
          : '班次：尚未开班',
      `今日入库 ${data.today.inbound} · 出库 ${data.today.outbound} · 在库 ${data.today.inStock}`,
    ];
    if (notify) {
      lines.push(
        `到件触达：已私信 ${notify.customerPushed} · 未绑定 ${notify.customerUnbound} · 失败 ${notify.customerPushFailed}`,
      );
      if (notify.todayNewBindings != null) {
        lines.push(`今日新绑 ${notify.todayNewBindings} 人 · 累计绑定 ${notify.activeBindings}`);
      }
    }
    for (const item of actionable) {
      if (item.key === 'unbound3' && item.count === 0 && unboundZero(notify)) {
        lines.push(`- ${item.title}：可复查`);
      } else if (item.count > 0) {
        lines.push(`- ${item.title}：${item.count}（${item.detail}）`);
      }
    }
    if (actionable.filter((i) => i.count > 0).length === 0) {
      lines.push('暂无紧急待办，可正常入库/出库。');
    }
    lines.push('（系统生成，请店内使用）');
    const ok = await copyText(lines.join('\n'));
    if (ok) notifySuccess('已复制今日跟进摘要');
    else notifyError('复制失败');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">今日跟进</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            按紧急程度排好，点一项就去处理；可复制摘要发给交班同事
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onCopySummary()}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            复制跟进摘要
          </button>
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

function unboundZero(notify?: DashboardData['notify']): boolean {
  return (notify?.customerUnbound || 0) === 0;
}

export default DailyFollowupCard;
