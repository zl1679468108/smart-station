import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as outboundService from '@/services/outbound';
import { useAuth } from '@/utils/auth';
import type { OutboundRecordListResult, OutboundRecordQuery } from '@/types/outbound';

const OUTBOUND_RECORDS_STALE_TIME = 1000 * 30;
const OUTBOUND_RECORDS_GC_TIME = 1000 * 60 * 5;

export const OUTBOUND_RECORDS_KEY = ['outbound-records'] as const;

function normalizeOutboundRecordQuery(query: OutboundRecordQuery): OutboundRecordQuery {
  return {
    startDate: query.startDate || undefined,
    endDate: query.endDate || undefined,
    method: query.method || undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

export function outboundRecordsKey(
  stationId?: string | null,
  query: OutboundRecordQuery = {},
) {
  return [...OUTBOUND_RECORDS_KEY, stationId ?? 'none', normalizeOutboundRecordQuery(query)] as const;
}

export function useOutboundRecords(query: OutboundRecordQuery) {
  const { currentStationId } = useAuth();
  const normalizedQuery = normalizeOutboundRecordQuery(query);
  return useQuery<OutboundRecordListResult>({
    queryKey: outboundRecordsKey(currentStationId, normalizedQuery),
    queryFn: () => outboundService.listOutboundRecords(normalizedQuery),
    enabled: Boolean(currentStationId),
    staleTime: OUTBOUND_RECORDS_STALE_TIME,
    gcTime: OUTBOUND_RECORDS_GC_TIME,
  });
}

export function useInvalidateOutboundRecords() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: OUTBOUND_RECORDS_KEY });
}
