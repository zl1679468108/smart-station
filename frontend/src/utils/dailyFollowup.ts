import type { DashboardData } from '@/types/stats';
import type { ShiftItem } from '@/types/shift';
import type { CashDaySummary } from '@/types/finance';

export type FollowTone = 'danger' | 'warn' | 'info' | 'ok';

export interface FollowItem {
  key: string;
  priority: number;
  title: string;
  detail: string;
  count: number;
  href: string;
  tone: FollowTone;
  actionLabel: string;
}

export interface BuildFollowupInput {
  data: DashboardData;
  /** undefined=加载中，不展示开班项 */
  currentShift?: ShiftItem | null;
  cashToday?: CashDaySummary | null;
}

/** 按紧急程度生成今日跟进清单（与工作台卡片同源） */
export function buildDailyFollowupItems(input: BuildFollowupInput): FollowItem[] {
  const { data, currentShift, cashToday } = input;
  const todo = data.todo;
  const notify = data.notify;
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
      // 比未绑定更优先：客户已绑定，一键补发即可
      priority: 8,
      title: '今日私信失败',
      detail: '已绑定但没发到，优先一键补发（自动短重试）',
      count: pushFailed,
      href: '/admin/system?tab=notify&filter=push_failed&days=1',
      tone: 'danger',
      actionLabel: '一键补发',
    });
  }

  const sendFailed = notify?.sendFailed || 0;
  if (sendFailed > 0) {
    list.push({
      key: 'send_failed',
      priority: 9,
      title: '今日发送失败',
      detail: '整条通知发送失败，可在通知记录重发',
      count: sendFailed,
      href: '/admin/system?tab=notify&filter=failed&today=1&days=1',
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
}

export function actionableFollowupItems(items: FollowItem[]): FollowItem[] {
  return items.filter((i) => i.count > 0 || i.key === 'unbound3' || i.key === 'shift');
}

export interface BuildSummaryOptions extends BuildFollowupInput {
  stationName?: string;
  /** 交班场景：附带本班入出库/收款数字 */
  shiftSnapshot?: ShiftItem | null;
  title?: string;
}

/** 生成可复制的白话跟进/交班摘要 */
export function buildDailyFollowupSummaryText(options: BuildSummaryOptions): string {
  const {
    data,
    currentShift,
    cashToday,
    stationName,
    shiftSnapshot,
    title,
  } = options;
  const notify = data.notify;
  const items = actionableFollowupItems(
    buildDailyFollowupItems({ data, currentShift, cashToday }),
  );
  const name = stationName || '本站';
  const lines = [
    title || `【${name} 今日跟进】`,
    currentShift === undefined
      ? '班次：加载中'
      : currentShift
        ? '班次：已开班'
        : '班次：尚未开班',
    `今日入库 ${data.today.inbound} · 出库 ${data.today.outbound} · 在库 ${data.today.inStock}`,
  ];

  if (shiftSnapshot) {
    lines.push(
      `本班：入库 ${shiftSnapshot.inboundCount} · 出库 ${shiftSnapshot.outboundCount} · 收款 ${shiftSnapshot.collectPaidCount} 笔 / ¥${Number(shiftSnapshot.collectPaidTotal || 0).toFixed(2)}`,
    );
    if (Number(shiftSnapshot.collectUnpaid || 0) > 0) {
      lines.push(`本班提醒：在库待收款 ${shiftSnapshot.collectUnpaid} 件`);
    }
    if (shiftSnapshot.operatorName) {
      lines.push(`交班人：${shiftSnapshot.operatorName}`);
    }
  }

  if (notify) {
    lines.push(
      `到件触达：已私信 ${notify.customerPushed} · 未绑定 ${notify.customerUnbound} · 私信失败 ${notify.customerPushFailed}` +
        (notify.sendFailed > 0 ? ` · 发送失败 ${notify.sendFailed}` : ''),
    );
    if (notify.todayNewBindings != null) {
      lines.push(`今日新绑 ${notify.todayNewBindings} 人 · 累计绑定 ${notify.activeBindings}`);
    }
    if ((notify.customerPushFailed || 0) > 0) {
      lines.push('交接：优先补发「私信失败」（客户已绑定，补发即可）');
    }
    if ((notify.customerUnbound || 0) > 0) {
      lines.push('交接：未绑定请当面报码，或发绑定链接话术（勿发群）');
    }
  }

  for (const item of items) {
    if (item.key === 'unbound3' && item.count === 0 && (notify?.customerUnbound || 0) === 0) {
      lines.push(`- ${item.title}：可复查`);
    } else if (item.count > 0) {
      lines.push(`- ${item.title}：${item.count}（${item.detail}）`);
    }
  }

  if (items.filter((i) => i.count > 0).length === 0) {
    lines.push('暂无紧急待办，可正常入库/出库。');
  }
  lines.push('（系统生成，请店内使用，勿发客户群）');
  return lines.join('\n');
}
