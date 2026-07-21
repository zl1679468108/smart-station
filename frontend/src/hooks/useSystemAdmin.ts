import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as inventoryService from '@/services/inventory';
import * as adminService from '@/services/admin';
import { useAuth } from '@/utils/auth';
import type { Station, Staff, StationLayoutConfig } from '@/types/admin';

/**
 * 系统管理低频数据：驿站信息 / 员工 / 门店布局配置
 *
 * 与 useDictionary 一致：staleTime Infinity，仅写操作后主动 invalidate / setQueryData。
 * 读接口：驿站走 inventory 只读；员工与布局配置走 admin。
 */

const SYS_STALE_TIME = Infinity;
const SYS_GC_TIME = 1000 * 60 * 30; // 30 分钟无观察者后回收

// ============ 驿站信息 ============
export const STATION_KEY = ['station'] as const;

export function stationKey(stationId?: string | null) {
  return [...STATION_KEY, stationId ?? 'none'] as const;
}

export function useStation() {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: stationKey(currentStationId),
    queryFn: () => inventoryService.fetchStation(),
    enabled: Boolean(currentStationId),
    staleTime: SYS_STALE_TIME,
    gcTime: SYS_GC_TIME,
  });
}

/** 失效驿站缓存，写操作后调用 */
export function useInvalidateStation() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: STATION_KEY });
}

/** 用写接口返回值直接更新缓存，避免保存后多余 GET */
export function useSetStationCache() {
  const qc = useQueryClient();
  const { currentStationId } = useAuth();
  return (station: Station) => {
    if (!currentStationId) return;
    qc.setQueryData<Station>(stationKey(currentStationId), station);
  };
}

// ============ 员工 ============
export const STAFF_KEY = ['staff'] as const;

export function staffKey(stationId?: string | null) {
  return [...STAFF_KEY, stationId ?? 'none'] as const;
}

export function useStaff() {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: staffKey(currentStationId),
    queryFn: () => adminService.listStaff(),
    enabled: Boolean(currentStationId),
    staleTime: SYS_STALE_TIME,
    gcTime: SYS_GC_TIME,
  });
}

/** 失效员工缓存，增删改/启停/重置密码后调用 */
export function useInvalidateStaff() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: STAFF_KEY });
}

// ============ 门店布局配置 ============
export const LAYOUT_CONFIG_KEY = ['layout-config'] as const;

export type LayoutConfigResult = {
  stationId: string;
  stationName: string;
  layoutConfig: StationLayoutConfig;
};

export function useLayoutConfig() {
  const { currentStationId } = useAuth();
  return useQuery({
    queryKey: layoutConfigKey(currentStationId),
    queryFn: () => adminService.fetchLayoutConfig(),
    enabled: Boolean(currentStationId),
    staleTime: SYS_STALE_TIME,
    gcTime: SYS_GC_TIME,
  });
}

export function layoutConfigKey(stationId?: string | null) {
  return [...LAYOUT_CONFIG_KEY, stationId ?? 'none'] as const;
}

/** 失效布局配置缓存 */
export function useInvalidateLayoutConfig() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: LAYOUT_CONFIG_KEY });
}

/** 用保存接口返回的 layoutConfig 合并更新缓存 */
export function useSetLayoutConfigCache() {
  const qc = useQueryClient();
  const { currentStationId } = useAuth();
  return (layoutConfig: StationLayoutConfig) => {
    if (!currentStationId) return;
    qc.setQueryData<LayoutConfigResult>(layoutConfigKey(currentStationId), (old) =>
      old ? { ...old, layoutConfig } : old,
    );
  };
}
