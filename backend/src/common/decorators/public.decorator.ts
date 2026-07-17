import { SetMetadata } from '@nestjs/common';

/**
 * 公开接口装饰器
 * 标记的路由跳过 TokenAuthGuard 校验，用于取件自助查询、健康检查等无需登录的接口
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
