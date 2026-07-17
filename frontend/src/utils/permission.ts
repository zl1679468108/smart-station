/**
 * 权限工具
 * 基于 PRD 4.12.2 角色权限边界，提供前端按钮/操作的显隐判断
 *
 * 角色权限矩阵：
 * - 管理员（admin）：全部功能 + 系统管理
 * - 店员（clerk）：入库、库存、出库、滞留、异常、寄件（业务可读可写）
 * - 查询员（viewer）：仅库存查询（只读）
 *
 * 注：这是 UX 层防护，避免给无权限用户展示无法操作的按钮；
 *     后端仍需 @Roles() / AdminGuard 做真实拦截
 */

export type Role = 'admin' | 'clerk' | 'viewer';

/** 是否为只读角色（viewer） */
export const isReadOnly = (role: string | null | undefined): boolean => role === 'viewer';

/** 是否可写业务数据（admin + clerk） */
export const canWrite = (role: string | null | undefined): boolean =>
  role === 'admin' || role === 'clerk';

/** 是否可管理系统（仅 admin） */
export const canManageSystem = (role: string | null | undefined): boolean => role === 'admin';
