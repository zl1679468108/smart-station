import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import {
  AppointmentListQueryDto,
  CreateAppointmentDto,
  UpdateAppointmentStatusDto,
} from './dto/appointment.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 店员预约管理
 * - GET   /api/appointments/slots
 * - GET   /api/appointments
 * - POST  /api/appointments
 * - PATCH /api/appointments/:id/status
 */
@Controller('appointments')
@UseGuards(TokenAuthGuard)
@Roles('admin', 'clerk')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get('slots')
  async slots(@StationId() stationId: string) {
    return this.appointmentService.getSlots(stationId);
  }

  @Get()
  async list(@StationId() stationId: string, @Query() q: AppointmentListQueryDto) {
    return this.appointmentService.listStaff(stationId, q);
  }

  /** 店员代客预约 */
  @Post()
  async create(@StationId() stationId: string, @Body() dto: CreateAppointmentDto) {
    return this.appointmentService.createStaff(stationId, dto);
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
