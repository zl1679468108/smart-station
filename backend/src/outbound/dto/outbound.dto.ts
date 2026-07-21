import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** 取件码正则：货架号-层号-件号，如 3-2-9903 */
const PICKUP_CODE_REGEX = /^\d{1,3}-\d{1,2}-\d{1,6}$/;
const PICKUP_CODE_MSG = '取件码格式不正确，应为 货架号-层号-件号，如 3-2-9903';

/**
 * 人工辅助出库 DTO
 * trackingNumber 与 pickupCode 二选一
 */
export class ManualOutboundDto {
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(PICKUP_CODE_REGEX, { message: PICKUP_CODE_MSG })
  pickupCode?: string;
}

/**
 * 自助扫描出库 DTO（扫描机端，公开接口）
 */
export class SelfServiceOutboundDto {
  @IsString()
  @IsNotEmpty({ message: '运单号不能为空' })
  trackingNumber!: string;

  /** 可选：扫描机绑定驿站，避免跨站误出库 */
  @IsOptional()
  @IsString()
  stationId?: string;
}

/**
 * 出库前查询 DTO（1.1.0 新增）
 * 三种查询方式互斥：phone / trackingNumber / pickupCode 填一个即可
 */
export class OutboundSearchDto {
  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(PICKUP_CODE_REGEX, { message: PICKUP_CODE_MSG })
  pickupCode?: string;
}
