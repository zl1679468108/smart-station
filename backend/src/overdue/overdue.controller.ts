import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OverdueService } from './overdue.service';
import { OverdueQueryDto } from './dto/overdue-query.dto';
import { ReturnActionDto } from './dto/return-action.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

@Controller('overdue')
@UseGuards(TokenAuthGuard)
export class OverdueController {
  constructor(private readonly overdueService: OverdueService) {}

  @Get()
  async list(@StationId() stationId: string, @Query() q: OverdueQueryDto) {
    return this.overdueService.list(stationId, q);
  }

  @Roles('admin', 'clerk')
  @Post('scan')
  async scan(@StationId() stationId: string) {
    return this.overdueService.scan(stationId);
  }

  @Roles('admin', 'clerk')
  @Post(':id([0-9a-fA-F-]{36})/return')
  async returnAction(
    @StationId() stationId: string,
    @Param('id') id: string,
    @Body() dto: ReturnActionDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.overdueService.returnAction(stationId, id, dto, user.id);
  }
}
