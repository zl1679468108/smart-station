import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as overdueService from '@/services/overdue';
import { useAuth } from '@/utils/auth';
import type { OverdueLevel, OverdueListResult } from '@/types/overdue';

const OVERDUE_LIST_STALE_TIME = 1000 * 30;
const OVERDUE_LIST_GC_TIME = 1000 * 60 * 5;

export const OVERDUE_LIST_KEY = ['overdue-list'] as const;

export interface OverdueListQuery {
  level?: OverdueLevel | '';
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function normalizeOverdueQuery(query: OverdueListQuery): OverdueListQuery {
  return {
    level: query.level || undefined,
    keyword: query.keyword || undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

export function overdueListKey(stationId?: string | null, query: OverdueListQuery = {}) {
  return [...OVERDUE_LIST_KEY, stationId ?? 'none', normalizeOverdueQuery(query)] as const;
}

export function useOverdueList(query: OverdueListQuery) {
  const { currentStationId } = useAuth();
  const normalizedQuery = normalizeOverdueQuery(query);
  return useQuery<OverdueListResult>({
    queryKey: overdueListKey(currentStationId, normalizedQuery),
    queryFn: () => overdueService.fetchOverdueList(normalizedQuery),
    enabled: Boolean(currentStationId),
    staleTime: OVERDUE_LIST_STALE_TIME,
    gcTime: OVERDUE_LIST_GC_TIME,
  });
}

export function useInvalidateOverdueList() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: OVERDUE_LIST_KEY });
}
