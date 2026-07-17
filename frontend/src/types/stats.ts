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
}

export interface DashboardData {
  today: DashboardToday;
  yesterday: DashboardYesterday;
  hourly: DashboardHourly[];
  todo: DashboardTodo;
}
