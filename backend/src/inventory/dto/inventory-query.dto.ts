import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const STATUSES = ['in_stock', 'out_stock', 'overdue', 'exception', 'returned'] as const;
const COLLECT_STATUSES = ['none', 'unpaid', 'paid', 'waived'] as const;

/**
 * 库存查询 DTO
 * 支持手机号、运单号、取件码、快递公司、货架、状态、收款状态、入库时间范围筛选
 */
export class InventoryQueryDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  pickupCode?: string;

  @IsOptional()
  @IsUUID()
  courierCompanyId?: string;

  @IsOptional()
  @IsUUID()
  shelfId?: string;

  @IsOptional()
  @IsEnum(STATUSES)
  status?: (typeof STATUSES)[number];

  /** 对用户收款状态：none / unpaid / paid / waived */
  @IsOptional()
  @IsEnum(COLLECT_STATUSES)
  collectStatus?: (typeof COLLECT_STATUSES)[number];

  @IsOptional()
  @IsString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
