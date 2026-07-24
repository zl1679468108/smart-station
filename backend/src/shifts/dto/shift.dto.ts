import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenShiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '开班备注最长 200 字' })
  openingNote?: string;
}

export class CloseShiftDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '交班备注最长 500 字' })
  closingNote?: string;

  /** 交班给谁（可选） */
  @IsOptional()
  @IsUUID()
  handoverToUserId?: string;

  /** 交班时在库件数盘点（可选） */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '在库盘点须为整数' })
  @Min(0)
  @Max(999999)
  stockCount?: number;
}

export class ShiftListQueryDto {
  @IsOptional()
  @IsString()
  status?: 'open' | 'closed';

  @IsOptional()
  @IsString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  endDate?: string;

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
