import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
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
  BindNotifyDto,
  UnbindNotifyDto,
  StartWxPusherBindDto,
  PollWxPusherBindDto,
  BindPushPlusDto,
  NotifyBindStatusDto,
} from './dto/kiosk.dto';
import { Public } from '../common/decorators/public.decorator';
import type { Request } from 'express';
import { AppointmentService } from '../appointments/appointment.service';
import {
  CreateAppointmentDto,
  MyAppointmentsDto,
  CancelAppointmentDto,
} from '../appointments/dto/appointment.dto';

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
  constructor(
    private readonly kioskService: KioskService,
    private readonly appointmentService: AppointmentService,
  ) {}

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

  /** 通知绑定引导（公示） */
  @SkipThrottle()
  @Get('notify-guide')
  async getNotifyGuide(@Query('stationId') stationId?: string) {
    return this.kioskService.getNotifyGuide(stationId);
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

  /** 兼容：绑定个人 Server酱 SendKey */
  @Post('notify-bind')
  @HttpCode(200)
  async bindNotify(@Body() dto: BindNotifyDto, @Query('stationId') stationId?: string) {
    return this.kioskService.bindNotify(dto, stationId);
  }

  /** WxPusher 扫码绑定：校验手机号后创建关注二维码 */
  @Post('notify-bind/wxpusher/start')
  @HttpCode(200)
  async startWxPusherBind(
    @Body() dto: StartWxPusherBindDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.startWxPusherBind(dto, stationId);
  }

  /** WxPusher 扫码绑定：轮询扫码 UID（建议 ≥12s） */
  @Post('notify-bind/wxpusher/poll')
  @HttpCode(200)
  async pollWxPusherBind(
    @Body() dto: PollWxPusherBindDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.pollWxPusherBind(dto.qrCode, stationId);
  }

  /** PushPlus token 绑定 */
  @Post('notify-bind/pushplus')
  @HttpCode(200)
  async bindPushPlus(@Body() dto: BindPushPlusDto, @Query('stationId') stationId?: string) {
    return this.kioskService.bindPushPlus(dto, stationId);
  }

  /** 查询手机号绑定状态（不含 target） */
  @Post('notify-bind-status')
  @HttpCode(200)
  async getNotifyBindStatus(
    @Body() dto: NotifyBindStatusDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.kioskService.getNotifyBindStatus(dto.phone, stationId);
  }

  /** 解绑个人通知（wxpusher / pushplus / serverchan） */
  @Post('notify-unbind')
  @HttpCode(200)
  async unbindNotify(@Body() dto: UnbindNotifyDto, @Query('stationId') stationId?: string) {
    return this.kioskService.unbindNotify(dto, stationId);
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
  /** 可预约时段（到店导航配套） */
  @SkipThrottle()
  @Get('appointment/slots')
  async getAppointmentSlots(@Query('stationId') stationId?: string) {
    return this.appointmentService.getSlots(stationId);
  }

  /** 客户提交预约取件 */
  @Post('appointment')
  @HttpCode(200)
  async createAppointment(
    @Body() dto: CreateAppointmentDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.appointmentService.createPublic(dto, stationId);
  }

  /** 客户查自己的预约 */
  @Post('appointment/my')
  @HttpCode(200)
  async myAppointments(
    @Body() dto: MyAppointmentsDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.appointmentService.listMine(dto.phone, stationId);
  }

  /** 客户取消预约 */
  @Post('appointment/:id([0-9a-fA-F-]{36})/cancel')
  @HttpCode(200)
  async cancelAppointment(
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto,
    @Query('stationId') stationId?: string,
  ) {
    return this.appointmentService.cancelMine(id, dto.phone, stationId);
  }

}
