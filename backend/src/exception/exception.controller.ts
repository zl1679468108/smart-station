import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ExceptionService } from './exception.service';
import { ExceptionQueryDto } from './dto/exception-query.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { UpdateExceptionDto } from './dto/update-exception.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

@Controller('exception')
@UseGuards(TokenAuthGuard)
export class ExceptionController {
  constructor(private readonly exceptionService: ExceptionService) {}

  @Get()
  async list(@StationId() stationId: string, @Query() q: ExceptionQueryDto) {
    return this.exceptionService.list(stationId, q);
  }

  @Get(':id([0-9a-fA-F-]{36})')
  async detail(@StationId() stationId: string, @Param('id') id: string) {
    return this.exceptionService.detail(stationId, id);
  }

  @Roles('admin', 'clerk')
  @Post()
  async create(
    @StationId() stationId: string,
    @Body() dto: CreateExceptionDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.exceptionService.create(stationId, dto, user.id);
  }

  @Roles('admin', 'clerk')
  @Patch(':id([0-9a-fA-F-]{36})')
  async update(
    @StationId() stationId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExceptionDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.exceptionService.update(stationId, id, dto, user.id);
  }
}
