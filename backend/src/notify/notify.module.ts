import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';

/**
 * 通知模块
 * v1.0 为 stub，仅记录日志，不真实发送短信
 * 后续接入真实服务商时替换 NotifyService 内部实现
 */
@Module({
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
