import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * 认证模块
 * 提供 /api/auth/* 接口：登录/登出/个人资料/密码修改/切换驿站
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [TokenService], // 供其他模块（如 outbound 自助销毁会话）复用
})
export class AuthModule {}
