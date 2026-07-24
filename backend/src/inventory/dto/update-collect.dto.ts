import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 在库改价：调整到付/代收货款（仅未出库且未收款/无收款） */
export class UpdateCollectDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '到付运费最多两位小数' })
  @Min(0, { message: '到付运费不能为负' })
  @Max(999999.99, { message: '到付运费金额过大' })
  freightCollectAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '代收货款最多两位小数' })
  @Min(0, { message: '代收货款不能为负' })
  @Max(999999.99, { message: '代收货款金额过大' })
  codAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '备注最长 100 字' })
  note?: string;
}
