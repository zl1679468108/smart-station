import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 驿站通知公示配置（客户可见） */
export class NotifyConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  wecomQrUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  wecomJoinTip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serverchanGuideUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  serverchanGuide?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  wxpusherGuide?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pushplusGuide?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pushplusGuideUrl?: string;

  @IsOptional()
  @IsBoolean()
  bindEnabled?: boolean;
}

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

  /** 通知公示配置（写入 ss_stations.notify_config） */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotifyConfigDto)
  notifyConfig?: NotifyConfigDto;
}
