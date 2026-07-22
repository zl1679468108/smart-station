import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShippingDto {
  @IsOptional()
  @IsUUID()
  courierCompanyId?: string;

  @IsOptional()
  @IsIn(['in_store', 'door'])
  pickupType?: string = 'in_store';

  @IsOptional()
  @IsISO8601()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupAddress?: string;

  @IsString()
  @MaxLength(50)
  senderName: string;

  @IsString()
  @MaxLength(20)
  senderPhone: string;

  @IsString()
  @MaxLength(255)
  senderAddress: string;

  @IsString()
  @MaxLength(50)
  receiverName: string;

  @IsString()
  @MaxLength(20)
  receiverPhone: string;

  @IsString()
  @MaxLength(255)
  receiverAddress: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  weight: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  insuredAmount?: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
