import { Module } from '@nestjs/common';
import { OutboundController } from './outbound.controller';
import { OutboundService } from './outbound.service';

@Module({
  controllers: [OutboundController],
  providers: [OutboundService],
})
export class OutboundModule {}
