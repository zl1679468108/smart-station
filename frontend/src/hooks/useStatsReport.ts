import { useQuery } from '@tanstack/react-query';
import * as statsReport from '@/services/stats-report';
import { useAuth } from '@/utils/auth';
import type {
  TrendGranularity,
  TrendResult,
  FunnelResult,
  RetentionResult,
  PeakHoursResult,
  NotifyBindConversionResult,
} from '@/types/stats-report';

// 统计报表数据变动频率较低，缓存 1 分钟，切换 tab/窗口时命中缓存直接复用。
const STATS_STALE_TIME = 1000 * 60;
const STATS_GC_TIME = 1000 * 60 * 10;

export const STATS_TREND_KEY = ['stats-trend'] as const;
export const STATS_FUNNEL_KEY = ['stats-funnel'] as const;
export const STATS_RETENTION_KEY = ['stats-retention'] as const;
export const STATS_PEAK_KEY = ['stats-peak'] as const;
export const STATS_BIND_CONVERSION_KEY = ['stats-bind-conversion'] as const;

export function useStatsTrend(granularity: TrendGranularity, span: number) {
  const { currentStationId } = useAuth();
  return useQuery<TrendResult>({
    queryKey: [...STATS_TREND_KEY, currentStationId ?? 'none', granularity, span],
    queryFn: () => statsReport.fetchTrend({ granularity, span }),
    enabled: Boolean(currentStationId),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useStatsFunnel(days: number) {
  const { currentStationId } = useAuth();
  return useQuery<FunnelResult>({
    queryKey: [...STATS_FUNNEL_KEY, currentStationId ?? 'none', days],
    queryFn: () => statsReport.fetchFunnel(days),
    enabled: Boolean(currentStationId),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useStatsRetention(days: number) {
  const { currentStationId } = useAuth();
  return useQuery<RetentionResult>({
    queryKey: [...STATS_RETENTION_KEY, currentStationId ?? 'none', days],
    queryFn: () => statsReport.fetchRetention(days),
    enabled: Boolean(currentStationId),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useStatsPeakHours(days: number) {
  const { currentStationId } = useAuth();
  return useQuery<PeakHoursResult>({
    queryKey: [...STATS_PEAK_KEY, currentStationId ?? 'none', days],
    queryFn: () => statsReport.fetchPeakHours(days),
    enabled: Boolean(currentStationId),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

export function useStatsBindConversion(days: number) {
  const { currentStationId } = useAuth();
  return useQuery<NotifyBindConversionResult>({
    queryKey: [...STATS_BIND_CONVERSION_KEY, currentStationId ?? 'none', days],
    queryFn: () => statsReport.fetchBindConversion(days),
    enabled: Boolean(currentStationId),
    staleTime: STATS_STALE_TIME,
    gcTime: STATS_GC_TIME,
  });
}

