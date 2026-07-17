import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../types/user-payload.type';

/**
 * 当前用户装饰器
 * 从 req.user 取登录用户信息
 * @example
 *   @CurrentUser() user: UserPayload       // 取整个用户对象
 *   @CurrentUser('id') userId: string       // 取单个字段
 */
export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserPayload;
    return data ? user?.[data] : user;
  },
);
