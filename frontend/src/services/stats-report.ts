import { get } from './api';
import type {
  TrendResult,
  TrendGranularity,
  FunnelResult,
  RetentionResult,
  PeakHoursResult,
} from '@/types/stats-report';

export function fetchTrend(params: {
  granularity?: TrendGranularity;
  span?: number;
}): Promise<TrendResult> {
  const q = new URLSearchParams();
  if (params.granularity) q.set('granularity', params.granularity);
  if (params.span) q.set('span', String(params.span));
  const s = q.toString();
  return get<TrendResult>(`/api/stats/trend${s ? `?${s}` : ''}`);
}

export function fetchFunnel(days?: number): Promise<FunnelResult> {
  const q = days ? `?days=${days}` : '';
  return get<FunnelResult>(`/api/stats/funnel${q}`);
}

export function fetchRetention(days?: number): Promise<RetentionResult> {
  const q = days ? `?days=${days}` : '';
  return get<RetentionResult>(`/api/stats/retention${q}`);
}

export function fetchPeakHours(days?: number): Promise<PeakHoursResult> {
  const q = days ? `?days=${days}` : '';
  return get<PeakHoursResult>(`/api/stats/peak-hours${q}`);
}
