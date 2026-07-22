import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class TrendQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month' = 'day';

  // 统计跨度：day 取最近 N 天，week 取最近 N 周，month 取最近 N 月
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  span?: number = 14;
}

export class RangeQueryDto {
  // 统计窗口天数（漏斗/滞留率/高峰按此窗口聚合），默认 30 天
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  days?: number = 30;
}
