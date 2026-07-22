import { Matches } from 'class-validator';

export class GenerateBillsDto {
  // 生成账单的月份 YYYY-MM（默认上月由 service 处理）
  @Matches(/^\d{4}-\d{2}$/, { message: 'month 格式应为 YYYY-MM' })
  month: string;
}
