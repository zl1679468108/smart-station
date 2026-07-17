// Stats API 服务
import { get } from './api';
import type { DashboardData } from '@/types/stats';

export function fetchDashboard(): Promise<DashboardData> {
  return get<DashboardData>('/api/stats/dashboard');
}
