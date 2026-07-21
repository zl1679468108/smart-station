import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as inventoryService from '@/services/inventory';
import { useAuth } from '@/utils/auth';
import type { InventoryListResult, InventoryQuery } from '@/types/inventory';

const INVENTORY_LIST_STALE_TIME = 1000 * 30;
const INVENTORY_LIST_GC_TIME = 1000 * 60 * 5;
const INVENTORY_DETAIL_STALE_TIME = 1000 * 60 * 5;
const INVENTORY_DETAIL_GC_TIME = 1000 * 60 * 15;

export const INVENTORY_LIST_KEY = ['inventory-list'] as const;
export const INVENTORY_DETAIL_KEY = ['inventory-detail'] as const;

function normalizeInventoryQuery(query: InventoryQuery): InventoryQuery {
  return {
    phone: query.phone || undefined,
    trackingNumber: query.trackingNumber || undefined,
    pickupCode: query.pickupCode || undefined,
    courierCompanyId: query.courierCompanyId || undefined,
    shelfId: query.shelfId || undefined,
    status: query.status || undefined,
    startDate: query.startDate || undefined,
    endDate: query.endDate || undefined,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  };
}

export function inventoryListKey(stationId?: string | null, query: InventoryQuery = {}) {
  return [...INVENTORY_LIST_KEY, stationId ?? 'none', normalizeInventoryQuery(query)] as const;
}

export function inventoryDetailKey(stationId?: string | null, id?: string | null) {
  return [...INVENTORY_DETAIL_KEY, stationId ?? 'none', id ?? 'none'] as const;
}

export function useInventoryList(query: InventoryQuery) {
  const { currentStationId } = useAuth();
  const normalizedQuery = normalizeInventoryQuery(query);
  return useQuery<InventoryListResult>({
    queryKey: inventoryListKey(currentStationId, normalizedQuery),
    queryFn: () => inventoryService.fetchInventory(normalizedQuery),
    enabled: Boolean(currentStationId),
    staleTime: INVENTORY_LIST_STALE_TIME,
    gcTime: INVENTORY_LIST_GC_TIME,
  });
}

export function useInvalidateInventoryList() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: INVENTORY_LIST_KEY });
}

export function useParcelDetail(id?: string | null) {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: inventoryDetailKey(currentStationId, id),
    queryFn: () => inventoryService.fetchParcelDetail(id!),
    enabled: Boolean(currentStationId && id),
    staleTime: INVENTORY_DETAIL_STALE_TIME,
    gcTime: INVENTORY_DETAIL_GC_TIME,
  });
}

export function useInvalidateInventoryDetail() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: INVENTORY_DETAIL_KEY });
}
