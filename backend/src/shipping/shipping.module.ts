import { Module } from '@nestjs/common';
import { ShippingController, AddressBookController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [ShippingController, AddressBookController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
