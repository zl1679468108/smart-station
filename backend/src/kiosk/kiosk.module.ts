import { Module } from '@nestjs/common';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { NotifyModule } from '../notify/notify.module';
import { AppointmentModule } from '../appointments/appointment.module';

@Module({
  imports: [NotifyModule, AppointmentModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
