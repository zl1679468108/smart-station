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
