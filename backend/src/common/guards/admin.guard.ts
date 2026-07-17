import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserPayload } from '../types/user-payload.type';

/**
 * 管理员守卫
 * 校验当前用户角色是否为 admin，否则返回 403 Forbidden
 * 必须配合 TokenAuthGuard 使用（依赖 req.user 已被填充）
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UserPayload | undefined;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('无权限访问该资源，仅管理员可操作');
    }
    return true;
  }
}
