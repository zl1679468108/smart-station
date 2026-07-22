import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class EstimateFreightDto {
  @IsUUID()
  courierCompanyId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  weight: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  insuredAmount?: number = 0;
}
