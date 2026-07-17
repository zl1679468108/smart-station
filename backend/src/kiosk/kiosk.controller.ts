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
import { ThrottlerGuard, SkipThrottle } from '@nestjs/throttler';
import { KioskService } from './kiosk.service';
import { SendCodeDto, QueryByPhoneDto, QueryByPhoneDirectDto, QueryByTrackingDto, QueryByCodeDto } from './dto/kiosk.dto';
import { Public } from '../common/decorators/public.decorator';
import type { Request } from 'express';

/**
 * Kiosk 取件自助查询控制器
 * - 全部 @Public（无登录）
 * - 全局 ThrottlerGuard 限流：同 IP 每分钟 ≤10 次（默认配置）
 *
 * 路由：
 * - GET  /api/kiosk/station/layout        货架平面图数据（按 size_type 自动分 A/B/C 区）
 * - POST /api/kiosk/send-code              发送验证码
 * - POST /api/kiosk/query-by-phone         手机号尾号 + 验证码查询
 * - POST /api/kiosk/query-by-phone-direct  手机号直接查询（1.1.0 新增，无需验证码）
 * - POST /api/kiosk/query-by-tracking      运单号查询
 * - POST /api/kiosk/query-by-code          取件码查询（1.1.0 新增）
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
  async sendCode(@Body() dto: SendCodeDto, @Req() req: Request) {
    return this.kioskService.sendCode(dto, this.getClientIp(req));
  }

  @Post('query-by-phone')
  @HttpCode(200)
  async queryByPhone(@Body() dto: QueryByPhoneDto) {
    return this.kioskService.queryByPhone(dto);
  }

  @Post('query-by-phone-direct')
  @HttpCode(200)
  async queryByPhoneDirect(@Body() dto: QueryByPhoneDirectDto) {
    return this.kioskService.queryByPhoneDirect(dto);
  }

  @Post('query-by-tracking')
  @HttpCode(200)
  async queryByTracking(@Body() dto: QueryByTrackingDto) {
    return this.kioskService.queryByTracking(dto);
  }

  @Post('query-by-code')
  @HttpCode(200)
  async queryByCode(@Body() dto: QueryByCodeDto) {
    return this.kioskService.queryByCode(dto);
  }
}
