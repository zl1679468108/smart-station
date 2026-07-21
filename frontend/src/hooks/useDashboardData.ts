import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as statsService from '@/services/stats';
import { useAuth } from '@/utils/auth';
import type { DashboardData } from '@/types/stats';

const DASHBOARD_STALE_TIME = 1000 * 30;
const DASHBOARD_EVENTS_STALE_TIME = 1000 * 15;
const DASHBOARD_GC_TIME = 1000 * 60 * 10;

export const DASHBOARD_KEY = ['dashboard'] as const;
export const DASHBOARD_EVENTS_KEY = ['dashboard-events'] as const;

export function dashboardKey(stationId?: string | null) {
  return [...DASHBOARD_KEY, stationId ?? 'none'] as const;
}

export function dashboardEventsKey(stationId?: string | null, limit = 20) {
  return [...DASHBOARD_EVENTS_KEY, stationId ?? 'none', limit] as const;
}

export function useDashboard(options: {
  enabled?: boolean;
  refetchInterval?: number;
  initialData?: DashboardData;
} = {}) {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: dashboardKey(currentStationId),
    queryFn: () => statsService.fetchDashboard(),
    enabled: Boolean(currentStationId) && (options.enabled ?? true),
    staleTime: DASHBOARD_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
    refetchInterval: options.refetchInterval,
    initialData: options.initialData,
  });
}

export function useDashboardEvents(
  limit = 20,
  options: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: dashboardEventsKey(currentStationId, limit),
    queryFn: () => statsService.fetchDashboardEvents(limit),
    enabled: Boolean(currentStationId) && (options.enabled ?? true),
    staleTime: DASHBOARD_EVENTS_STALE_TIME,
    gcTime: DASHBOARD_GC_TIME,
    refetchInterval: options.refetchInterval,
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: DASHBOARD_KEY });
}
