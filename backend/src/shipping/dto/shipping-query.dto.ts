import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ShippingQueryDto {
  @IsOptional()
  @IsIn(['pending', 'picked', 'shipped', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsIn(['in_store', 'door'])
  pickupType?: string;

  @IsOptional()
  @IsUUID()
  courierCompanyId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
