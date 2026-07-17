import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 当前驿站 ID 装饰器
 * 从 req.user.currentStationId 取当前活跃驿站 ID
 * 用于按 station_id 隔离的多租户数据查询
 */
export const StationId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.currentStationId;
});
