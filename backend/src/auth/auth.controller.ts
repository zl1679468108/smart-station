import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 认证模块控制器
 * - POST /api/auth/login      公开登录
 * - POST /api/auth/logout     登出（需 Token）
 * - GET  /api/auth/profile    个人资料（需 Token）
 * - PUT  /api/auth/profile    更新资料（需 Token）
 * - PUT  /api/auth/password   修改密码（需 Token）
 * - POST /api/auth/switch-station  切换驿站（需 Token）
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
    return this.authService.login(dto, { userAgent, ipAddress });
  }

  @UseGuards(TokenAuthGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request) {
    const authHeader = req.headers.authorization || '';
    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    await this.authService.logout(rawToken);
    return { message: '已登出' };
  }

  @UseGuards(TokenAuthGuard)
  @Get('profile')
  async getProfile(@CurrentUser() user: UserPayload) {
    return this.authService.getProfile(user);
  }

  @UseGuards(TokenAuthGuard)
  @Put('profile')
  async updateProfile(@CurrentUser() user: UserPayload, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user, dto);
  }

  @UseGuards(TokenAuthGuard)
  @Put('password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: UserPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @UseGuards(TokenAuthGuard)
  @Post('switch-station')
  @HttpCode(200)
  async switchStation(@CurrentUser() user: UserPayload, @Body('stationId') stationId: string) {
    if (!stationId) {
      return { error: 'stationId 不能为空' };
    }
    return this.authService.switchStation(user, stationId);
  }
}
