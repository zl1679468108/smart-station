import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { StationId } from '../common/decorators/station-id.decorator';

/**
 * 统计控制器 - 工作台 Dashboard
 * - GET /api/stats/dashboard  今日概览 + 环比 + 小时趋势 + 待办
 */
@Controller('stats')
@UseGuards(TokenAuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  async dashboard(@StationId() stationId: string) {
    return this.statsService.getDashboard(stationId);
  }
}
