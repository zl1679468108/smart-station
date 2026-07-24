import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CheckTrackingDto } from './dto/check-tracking.dto';
import { InboundService } from './inbound.service';
import { InboundDto } from './dto/inbound.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StationId } from '../common/decorators/station-id.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 入库控制器
 * - POST /api/inbound       单件入库（扫码/手动）
 * - POST /api/inbound/batch 批量入库
 *
 * 角色权限（PRD 4.12.2）：admin + clerk，viewer 不可入库
 */
@Controller('inbound')
@UseGuards(TokenAuthGuard)
@Roles('admin', 'clerk')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  /** 入库前运单预检（是否已在库） */
  @Post('check-tracking')
  @HttpCode(200)
  async checkTracking(
    @Body() body: CheckTrackingDto,
    @StationId() stationId: string,
  ) {
    return this.inboundService.checkTracking(stationId, body.trackingNumber);
  }

  @Post()
  @HttpCode(200)
  async inbound(
    @Body() dto: InboundDto,
    @CurrentUser() user: UserPayload,
    @StationId() stationId: string,
  ) {
    const method = dto.inboundMethod || 'scan';
    return this.inboundService.inbound(dto, {
      stationId,
      operatorId: user.id,
      method,
    });
  }

  /** 补发到件通知 */
  @Post(':id([0-9a-fA-F-]{36})/resend-notice')
  @HttpCode(200)
  async resendNotice(@StationId() stationId: string, @Param('id') id: string) {
    return this.inboundService.resendInboundNotice(stationId, id);
  }

  @Post('batch')
  @HttpCode(200)
  async batch(
    @Body('items') items: InboundDto[],
    @CurrentUser() user: UserPayload,
    @StationId() stationId: string,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, results: [], errors: [] };
    }
    return this.inboundService.batchInbound(items, {
      stationId,
      operatorId: user.id,
    });
  }
}
