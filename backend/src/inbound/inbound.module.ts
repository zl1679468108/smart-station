import { Module } from '@nestjs/common';
import { InboundController } from './inbound.controller';
import { InboundService } from './inbound.service';
import { NotifyModule } from '../notify/notify.module';

/**
 * 入库模块
 * 依赖 NotifyModule（发送入库通知）
 */
@Module({
  imports: [NotifyModule],
  controllers: [InboundController],
  providers: [InboundService],
})
export class InboundModule {}
