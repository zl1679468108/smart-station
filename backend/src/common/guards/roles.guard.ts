import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserPayload } from '../types/user-payload.type';

/**
 * 角色守卫
 * 读取 @Roles() 元数据，校验当前用户角色是否在允许列表内
 * 必须配合 TokenAuthGuard 使用（依赖 req.user 已被填充）
 *
 * 未标记 @Roles() 的接口默认放行（仅登录校验，不做角色校验）
 * 标记 @Roles('admin','clerk') 的接口，viewer 调用会返回 403
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      Array<'admin' | 'clerk' | 'viewer'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // 未声明 @Roles() 则不做角色限制
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as UserPayload | undefined;
    if (!user) {
      throw new ForbiddenException('用户身份未识别');
    }

    if (!requiredRoles.includes(user.role as 'admin' | 'clerk' | 'viewer')) {
      const roleLabel: Record<string, string> = {
        admin: '管理员',
        clerk: '店员',
        viewer: '查询员',
      };
      const allowed = requiredRoles.map((r) => roleLabel[r] || r).join('、');
      throw new ForbiddenException(
        `无权限访问该资源，仅 ${allowed} 可操作（当前角色：${roleLabel[user.role] || user.role}）`,
      );
    }
    return true;
  }
}
