import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import {
  AppointmentListQueryDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 店员预约管理
 * - GET   /api/appointments
 * - PATCH /api/appointments/:id/status
 */
@Controller('appointments')
@UseGuards(TokenAuthGuard)
@Roles('admin', 'clerk')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  async list(@StationId() stationId: string, @Query() q: AppointmentListQueryDto) {
    return this.appointmentService.listStaff(stationId, q);
  }

  @Patch(':id([0-9a-fA-F-]{36})/status')
  async updateStatus(
    @StationId() stationId: string,
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentService.updateStatus(stationId, user.id, id, dto);
  }
}
