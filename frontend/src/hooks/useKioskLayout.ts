import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as kioskService from '@/services/kiosk';
import { getQueryStationIdFromLocation } from '@/utils/queryPortal';

const KIOSK_LAYOUT_STALE_TIME = 1000 * 60 * 30;
const KIOSK_LAYOUT_GC_TIME = 1000 * 60 * 30;

export const KIOSK_LAYOUT_KEY = ['kiosk-layout'] as const;

function getKioskStationId() {
  const fromUrl = getQueryStationIdFromLocation();
  if (fromUrl) return fromUrl;
  return (import.meta.env.VITE_KIOSK_STATION_ID as string | undefined) || 'default';
}

export function kioskLayoutKey() {
  return [...KIOSK_LAYOUT_KEY, getKioskStationId()] as const;
}

export function useKioskLayout() {
  return useQuery({
    queryKey: kioskLayoutKey(),
    queryFn: () => kioskService.getLayout(),
    staleTime: KIOSK_LAYOUT_STALE_TIME,
    gcTime: KIOSK_LAYOUT_GC_TIME,
  });
}

export function useInvalidateKioskLayout() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KIOSK_LAYOUT_KEY });
}
