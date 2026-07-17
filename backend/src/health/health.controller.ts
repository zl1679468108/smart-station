import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

/**
 * 健康检查控制器
 * 提供 /api/health 端点用于服务存活探测，无需认证
 */
@Controller()
export class HealthController {
  @Get('health')
  @Public()
  check(): { status: string; timestamp: number } {
    return { status: 'ok', timestamp: Date.now() };
  }
}
