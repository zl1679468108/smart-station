import { IsOptional, Matches } from 'class-validator';

export class RatesQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month 格式应为 YYYY-MM' })
  month?: string;
}
