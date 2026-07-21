// Stats API 服务
import { get } from './api';
import type { DashboardData, DashboardEvent } from '@/types/stats';

export function fetchDashboard(): Promise<DashboardData> {
  return get<DashboardData>('/api/stats/dashboard');
}


export function fetchDashboardEvents(limit = 20): Promise<DashboardEvent[]> {
  return get<DashboardEvent[]>(`/api/stats/dashboard/events?limit=${limit}`);
}
