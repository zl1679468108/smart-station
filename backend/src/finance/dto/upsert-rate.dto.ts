import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Matches, Min } from 'class-validator';

export class UpsertRateDto {
  @IsUUID()
  courierCompanyId: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'effectiveMonth 格式应为 YYYY-MM' })
  effectiveMonth: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstWeightPrice: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionalPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  firstWeightKg?: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectRate: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliverRate: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  insureRate?: number = 0;
}
