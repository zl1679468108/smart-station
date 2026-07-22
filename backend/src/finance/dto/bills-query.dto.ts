import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

export class BillsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month 格式应为 YYYY-MM' })
  month?: string;

  @IsOptional()
  @IsIn(['unreconciled', 'reconciled', 'discrepancy'])
  status?: string;

  @IsOptional()
  @IsUUID()
  courierCompanyId?: string;

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
