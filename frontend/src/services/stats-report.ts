import { get } from './api';
import type {
  TrendResult,
  TrendGranularity,
  FunnelResult,
  RetentionResult,
  PeakHoursResult,
  NotifyBindConversionResult,
} from '@/types/stats-report';

export function fetchTrend(params: {
  granularity?: TrendGranularity;
  span?: number;
}): Promise<TrendResult> {
  const q = new URLSearchParams();
  if (params.granularity) q.set('granularity', params.granularity);
  if (params.span) q.set('span', String(params.span));
  const s = q.toString();
  return get<TrendResult>(`/api/stats/trend${s ? `?${s}` : ''}`, { forceLoading: true });
}

export function fetchFunnel(days?: number): Promise<FunnelResult> {
  const q = days ? `?days=${days}` : '';
  return get<FunnelResult>(`/api/stats/funnel${q}`, { forceLoading: true });
}

export function fetchRetention(days?: number): Promise<RetentionResult> {
  const q = days ? `?days=${days}` : '';
  return get<RetentionResult>(`/api/stats/retention${q}`, { forceLoading: true });
}

export function fetchPeakHours(days?: number): Promise<PeakHoursResult> {
  const q = days ? `?days=${days}` : '';
  return get<PeakHoursResult>(`/api/stats/peak-hours${q}`, { forceLoading: true });
}

export function fetchBindConversion(days?: number): Promise<NotifyBindConversionResult> {
  const q = days ? `?days=${days}` : '';
  return get<NotifyBindConversionResult>(`/api/stats/bind-conversion${q}`, {
    forceLoading: true,
  });
}

