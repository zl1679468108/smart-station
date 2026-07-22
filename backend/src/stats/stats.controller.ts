import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsReportService } from './stats-report.service';
import { TrendQueryDto, RangeQueryDto } from './dto/stats-query.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { StationId } from '../common/decorators/station-id.decorator';

/**
 * 统计控制器
 * - GET /api/stats/dashboard        今日概览 + 环比 + 小时趋势 + 待办
 * - GET /api/stats/dashboard/events 大屏实时动态
 * - GET /api/stats/trend            业务量趋势（日/周/月）
 * - GET /api/stats/funnel           转化漏斗
 * - GET /api/stats/retention        滞留率（总体 + 按快递公司）
 * - GET /api/stats/peak-hours       取件高峰（小时 + 星期分布）
 */
@Controller('stats')
@UseGuards(TokenAuthGuard)
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly statsReportService: StatsReportService,
  ) {}

  @Get('dashboard')
  async dashboard(@StationId() stationId: string) {
    return this.statsService.getDashboard(stationId);
  }

  /** 大屏实时动态 */
  @Get('dashboard/events')
  async recentEvents(
    @StationId() stationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.statsService.getRecentEvents(stationId, limit ? Number(limit) : 20);
  }

  @Get('trend')
  async trend(@StationId() stationId: string, @Query() q: TrendQueryDto) {
    return this.statsReportService.getTrend(stationId, q.granularity || 'day', q.span || 14);
  }

  @Get('funnel')
  async funnel(@StationId() stationId: string, @Query() q: RangeQueryDto) {
    return this.statsReportService.getFunnel(stationId, q.days || 30);
  }

  @Get('retention')
  async retention(@StationId() stationId: string, @Query() q: RangeQueryDto) {
    return this.statsReportService.getRetention(stationId, q.days || 30);
  }

  @Get('peak-hours')
  async peakHours(@StationId() stationId: string, @Query() q: RangeQueryDto) {
    return this.statsReportService.getPeakHours(stationId, q.days || 30);
  }
}
