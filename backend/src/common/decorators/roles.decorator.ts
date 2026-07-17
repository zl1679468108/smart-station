import { SetMetadata } from '@nestjs/common';

/**
 * 角色装饰器
 * 标记接口/控制器允许访问的角色列表
 * 配合 RolesGuard 使用（RolesGuard 需在 TokenAuthGuard 之后执行，依赖 req.user）
 *
 * 角色取值：admin（管理员）/ clerk（店员）/ viewer（查询员）
 *
 * PRD 4.12.2 角色权限边界：
 * - 管理员：全部功能 + 系统管理
 * - 店员：入库、库存、出库、滞留、异常、寄件
 * - 查询员：仅库存查询（只读）
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<'admin' | 'clerk' | 'viewer'>) =>
  SetMetadata(ROLES_KEY, roles);
