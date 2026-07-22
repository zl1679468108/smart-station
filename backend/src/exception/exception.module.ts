import { Module } from '@nestjs/common';
import { ExceptionController } from './exception.controller';
import { ExceptionService } from './exception.service';

@Module({
  controllers: [ExceptionController],
  providers: [ExceptionService],
  exports: [ExceptionService],
})
export class ExceptionModule {}
