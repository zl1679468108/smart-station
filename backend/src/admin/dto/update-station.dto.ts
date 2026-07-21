import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 更新当前驿站信息 DTO
 * 滞留规则阈值可选调整；名称/地址/营业时间/联系方式可编辑
 */
export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessHours?: string;

  @IsOptional()
  @IsString()
  floorPlanUrl?: string;

  @IsOptional()
  @IsInt({ message: '预警天数必须为整数' })
  @Min(1, { message: '预警天数必须大于 0' })
  overdueWarnDays?: number;

  @IsOptional()
  @IsInt({ message: '提醒天数必须为整数' })
  @Min(1, { message: '提醒天数必须大于 0' })
  overdueRemindDays?: number;

  @IsOptional()
  @IsInt({ message: '退回天数必须为整数' })
  @Min(1, { message: '退回天数必须大于 0' })
  overdueReturnDays?: number;
}
