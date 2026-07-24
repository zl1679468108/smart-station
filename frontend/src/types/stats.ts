// 工作台 Dashboard 统计类型定义

export interface DashboardToday {
  inbound: number;
  outbound: number;
  inStock: number;
  overdue: number;
  exception: number;
}

export interface DashboardYesterday {
  inbound: number;
  outbound: number;
}

export interface DashboardHourly {
  hour: number;
  inbound: number;
  outbound: number;
}

export interface DashboardTodo {
  overdueWarn: number;
  exceptionUnresolved: number;
  /** 待处理寄件单 */
  shippingPending?: number;
  /** 已取件待发出 */
  shippingPicked?: number;
  /** 上月未对账/有差异账单数 */
  financeUnreconciled?: number;
  /** 财务待办对应账期 YYYY-MM */
  financeMonth?: string;
}

/** 今日到件通知触达（工作台运营卡片） */
export interface DashboardNotify {
  inboundNotices: number;
  customerPushed: number;
  customerUnbound: number;
  customerPushFailed: number;
  sendFailed: number;
  activeBindings: number;
}

export interface DashboardData {
  today: DashboardToday;
  yesterday: DashboardYesterday;
  hourly: DashboardHourly[];
  todo: DashboardTodo;
  notify?: DashboardNotify;
}


/** 大屏实时动态事件 */
export type DashboardEventTone = 'ok' | 'warn' | 'danger' | 'info';

export interface DashboardEvent {
  id: string;
  eventType: string;
  tone: DashboardEventTone;
  text: string;
  createdAt: string;
  trackingNumber?: string | null;
  pickupCode?: string | null;
  shelfNumber?: number | null;
}
