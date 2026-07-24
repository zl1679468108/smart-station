import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';

/**
 * 通知模块（免费通道路线）
 * - console / 企业微信 Webhook / Server酱
 * - 不接商用短信；见 NotifyService 与 .env.example
 */
@Module({
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
