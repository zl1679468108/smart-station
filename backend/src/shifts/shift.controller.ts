import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { CloseShiftDto, OpenShiftDto, ShiftListQueryDto } from './dto/shift.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 交接班
 * - GET  /api/shifts/current
 * - POST /api/shifts/open
 * - POST /api/shifts/:id/close
 * - GET  /api/shifts
 * - GET  /api/shifts/performance
 */
@Controller('shifts')
@UseGuards(TokenAuthGuard)
@Roles('admin', 'clerk')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Get('current')
  async current(@StationId() stationId: string, @CurrentUser() user: UserPayload) {
    return this.shiftService.getCurrent(stationId, user.id);
  }

  @Get('performance')
  async performance(
    @StationId() stationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.shiftService.staffPerformance(stationId, { startDate, endDate });
  }

  @Get()
  async list(@StationId() stationId: string, @Query() q: ShiftListQueryDto) {
    return this.shiftService.list(stationId, q);
  }

  @Post('open')
  async open(
    @StationId() stationId: string,
    @CurrentUser() user: UserPayload,
    @Body() dto: OpenShiftDto,
  ) {
    return this.shiftService.open(stationId, user.id, dto);
  }

  @Post(':id([0-9a-fA-F-]{36})/close')
  async close(
    @StationId() stationId: string,
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
  ) {
    return this.shiftService.close(stationId, user.id, id, dto);
  }
}
