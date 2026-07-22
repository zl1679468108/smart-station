import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { StatsReportService } from './stats-report.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, StatsReportService],
})
export class StatsModule {}
