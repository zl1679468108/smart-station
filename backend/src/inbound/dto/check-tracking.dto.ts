import { IsString, MinLength } from 'class-validator';

export class CheckTrackingDto {
  @IsString()
  @MinLength(4, { message: '运单号太短' })
  trackingNumber!: string;
}
