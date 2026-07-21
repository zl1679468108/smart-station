import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OutboundService } from './outbound.service';
import { ManualOutboundDto, SelfServiceOutboundDto, OutboundSearchDto } from './dto/outbound.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 出库控制器
 * - POST /api/outbound/search          出库前查询在库包裹（Token，1.1.0 新增）
 * - POST /api/outbound/manual          人工辅助出库（Token）
 * - POST /api/outbound/self-service    自助扫描出库（@Public）
 * - GET  /api/outbound/records         出库记录列表（Token）
 *
 * 角色权限（PRD 4.12.2）：search/manual/records 需 admin+clerk，viewer 不可出库
 * self-service 为 @Public，由取件码鉴权，不走角色校验
 *
 * 注：self-service 单独挂 ThrottlerGuard（30 次/分钟）；Kiosk 查询另有限流；
 *     取件码错误锁定（M5.4）在 service 层用 ss_pickup_code_attempts 表实现
 */
@Controller('outbound')
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @UseGuards(TokenAuthGuard)
  @Roles('admin', 'clerk')
  @Post('search')
  @HttpCode(200)
  async search(@Body() dto: OutboundSearchDto, @StationId() stationId: string) {
    return this.outboundService.searchParcels(dto, stationId);
  }

  @UseGuards(TokenAuthGuard)
  @Roles('admin', 'clerk')
  @Post('manual')
  @HttpCode(200)
  async manual(
    @Body() dto: ManualOutboundDto,
    @CurrentUser() user: UserPayload,
    @StationId() stationId: string,
  ) {
    return this.outboundService.manualOutbound(dto, {
      stationId,
      operatorId: user.id,
    });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 同 IP 每分钟 ≤30 次
  @Post('self-service')
  @HttpCode(200)
  async selfService(@Body() dto: SelfServiceOutboundDto) {
    return this.outboundService.selfServiceOutbound(dto);
  }

  @UseGuards(TokenAuthGuard)
  @Roles('admin', 'clerk')
  @Get('records')
  async records(
    @StationId() stationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('method') method?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.outboundService.listOutboundRecords(stationId, {
      startDate,
      endDate,
      method,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
