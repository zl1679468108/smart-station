import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, SkipThrottle, Throttle } from '@nestjs/throttler';
import { KioskService } from './kiosk.service';
import {
  SendCodeDto,
  QueryByPhoneDto,
  QueryByPhoneDirectDto,
  QueryByTrackingDto,
  QueryByCodeDto,
} from './dto/kiosk.dto';
import { Public } from '../common/decorators/public.decorator';
import type { Request } from 'express';

/**
 * Kiosk 取件自助查询控制器
 * - 全部 @Public（无登录）
 * - ThrottlerGuard 限流：默认同 IP 每分钟 ≤10 次
 * - 手机号直查更严：同 IP 每分钟 ≤5 次
 * - 可通过 ?stationId= 或 VITE_KIOSK_STATION_ID 绑定驿站
 */
@Controller('kiosk')
@Public()
@UseGuards(ThrottlerGuard)
export class KioskController {
  constructor(private readonly kioskService: KioskService) {}

  private getClientIp(req: Request): string | undefined {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
    return req.ip || undefined;
  }

  // 货架平面图：页面加载即拉取，配合前端缓存，跳过限流避免被查询限流挤占
  @SkipThrottle()
  @Get('station/layout')
  async getStationLayout(@Query('stationId') stationId?: string) {
    return this.kioskService.getStationLayout(stationId);
  }

  @Post('send-code')
  @HttpCode(200)
  async sendCode(
    @Body() dto: SendCodeDto,
    @Req() req: Request,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.sendCode(dto, this.getClientIp(req), stationId);
  }

  @Post('query-by-phone')
  @HttpCode(200)
  async queryByPhone(@Body() dto: QueryByPhoneDto, @Query('stationId') stationId?: string) {
    return this.kioskService.queryByPhone(dto, stationId);
  }

  /** 手机号直查：更严格的 IP 限流，降低撞库窥探风险 */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('query-by-phone-direct')
  @HttpCode(200)
  async queryByPhoneDirect(
    @Body() dto: QueryByPhoneDirectDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.queryByPhoneDirect(dto, stationId);
  }

  @Post('query-by-tracking')
  @HttpCode(200)
  async queryByTracking(
    @Body() dto: QueryByTrackingDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.queryByTracking(dto, stationId);
  }

  @Post('query-by-code')
  @HttpCode(200)
  async queryByCode(@Body() dto: QueryByCodeDto, @Query('stationId') stationId?: string) {
    return this.kioskService.queryByCode(dto, stationId);
  }
}
