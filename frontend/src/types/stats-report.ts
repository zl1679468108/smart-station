// M26 数据统计类型

export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  label: string;
  inbound: number;
  outbound: number;
}

export interface TrendResult {
  granularity: TrendGranularity;
  span: number;
  points: TrendPoint[];
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  percent: number;
}

export interface FunnelResult {
  days: number;
  stages: FunnelStage[];
}

export interface RetentionCourier {
  courierCompanyId: string | null;
  courierName: string;
  total: number;
  overdue: number;
  rate: number;
}

export interface RetentionResult {
  days: number;
  total: number;
  overdue: number;
  rate: number;
  couriers: RetentionCourier[];
}

export interface PeakHour {
  hour: number;
  count: number;
}

export interface PeakWeekday {
  weekday: number;
  label: string;
  count: number;
}

export interface PeakHoursResult {
  days: number;
  total: number;
  peakHour: number | null;
  hours: PeakHour[];
  weekdays: PeakWeekday[];
}

/** 绑定转化：到件 → 新绑 → 私信覆盖 */
export interface NotifyBindConversionPoint {
  date: string;
  inboundNotices: number;
  customerPushed: number;
  customerUnbound: number;
  customerPushFailed: number;
  uniqueRecipients: number;
  uniquePushedRecipients: number;
  newBindings: number;
  pushRate: number;
  coverRate: number;
}

export interface NotifyBindConversionSummary {
  inboundNotices: number;
  customerPushed: number;
  customerUnbound: number;
  customerPushFailed: number;
  uniqueRecipients: number;
  uniquePushedRecipients: number;
  newBindings: number;
  activeBindings: number;
  /** 件次私信率 % */
  pushRate: number;
  /** 人数覆盖率 % */
  coverRate: number;
  /** 新绑 / 到件人数 % */
  bindRate: number;
}

export interface NotifyBindConversionResult {
  days: number;
  summary: NotifyBindConversionSummary;
  points: NotifyBindConversionPoint[];
}

