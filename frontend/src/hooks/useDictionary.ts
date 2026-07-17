import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as inventoryService from '@/services/inventory';

/**
 * 字典数据统一封装：快递公司 + 货架
 *
 * 这类数据变动频率极低，使用 staleTime: Infinity 避免组件切换/重渲染时重复请求；
 * 仅在写操作（新增/编辑/状态变更）成功后主动 invalidate，下次访问自动刷新一次。
 *
 * 读取统一走 inventory 只读接口（/api/inventory/shelves、/api/inventory/couriers），
 * 该接口仅需登录（TokenAuthGuard），admin/clerk/viewer 均可访问；
 * 写操作（新增/编辑/删除）在各页面通过 adminService 调用 /api/admin/* 接口（仅 admin）。
 * 这样系统管理页对店员也可只读查看货架/快递公司，无需区分角色。
 */

const DIC_STALE_TIME = Infinity;
const DIC_GC_TIME = 1000 * 60 * 30; // 30 分钟无观察者后回收

// ============ 快递公司 ============
export const COURIERS_KEY = ['couriers'] as const;

export function useCouriers() {
  return useQuery({
    queryKey: COURIERS_KEY,
    queryFn: () => inventoryService.fetchCouriers(),
    staleTime: DIC_STALE_TIME,
    gcTime: DIC_GC_TIME,
  });
}

/** 失效快递公司缓存，写操作后调用 */
export function useInvalidateCouriers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: COURIERS_KEY });
}

// ============ 货架 ============
// 统一只读接口（inventory 端），admin/clerk 均可读，写操作走 adminService
export const SHELVES_KEY = ['shelves'] as const;

export function useShelves() {
  return useQuery({
    queryKey: SHELVES_KEY,
    queryFn: () => inventoryService.fetchShelves(),
    staleTime: DIC_STALE_TIME,
    gcTime: DIC_GC_TIME,
  });
}

/** 失效货架缓存，写操作后调用 */
export function useInvalidateShelves() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: SHELVES_KEY });
}
