import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReconcileBillDto {
  @IsIn(['reconciled', 'discrepancy'])
  status: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  reconciledAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reconciledNote?: string;
}
