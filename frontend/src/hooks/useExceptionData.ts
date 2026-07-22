import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as exceptionService from '@/services/exception';
import { useAuth } from '@/utils/auth';
import type { ExceptionListResult, ExceptionStatus, ExceptionType } from '@/types/exception';

const EXCEPTION_LIST_STALE_TIME = 1000 * 30;
const EXCEPTION_LIST_GC_TIME = 1000 * 60 * 5;
const EXCEPTION_LIST_REFETCH_INTERVAL = 1000 * 60;

export const EXCEPTION_LIST_KEY = ['exception-list'] as const;

export interface ExceptionListQuery {
  status?: ExceptionStatus | '';
  type?: ExceptionType | '';
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function normalizeExceptionQuery(query: ExceptionListQuery): ExceptionListQuery {
  return {
    status: query.status || undefined,
    type: query.type || undefined,
    keyword: query.keyword || undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

export function exceptionListKey(stationId?: string | null, query: ExceptionListQuery = {}) {
  return [...EXCEPTION_LIST_KEY, stationId ?? 'none', normalizeExceptionQuery(query)] as const;
}

export function useExceptionList(query: ExceptionListQuery) {
  const { currentStationId } = useAuth();
  const normalizedQuery = normalizeExceptionQuery(query);
  return useQuery<ExceptionListResult>({
    queryKey: exceptionListKey(currentStationId, normalizedQuery),
    queryFn: () => exceptionService.fetchExceptionList(normalizedQuery),
    enabled: Boolean(currentStationId),
    staleTime: EXCEPTION_LIST_STALE_TIME,
    gcTime: EXCEPTION_LIST_GC_TIME,
    refetchInterval: EXCEPTION_LIST_REFETCH_INTERVAL,
  });
}

export function useInvalidateExceptionList() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: EXCEPTION_LIST_KEY });
}
