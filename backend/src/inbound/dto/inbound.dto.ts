import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * 单件入库 DTO
 * - trackingNumber 必填
 * - courierCompanyId 可选，未提供时按运单号前缀自动识别
 * - size 必填，包裹大小（small/medium/large），决定分配到哪类货架
 * - shelfId 可选，未提供时按 size 自动分配货架
 * - inboundMethod：scan / manual / batch
 */
export class InboundDto {
  @IsString()
  @IsNotEmpty({ message: '运单号不能为空' })
  @MaxLength(50)
  trackingNumber!: string;

  @IsOptional()
  @IsUUID()
  courierCompanyId?: string;

  @IsString()
  @IsNotEmpty({ message: '收件人姓名不能为空' })
  @MaxLength(100)
  recipientName!: string;

  @IsString()
  @IsNotEmpty({ message: '收件人手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  recipientPhone!: string;

  @IsString()
  @IsIn(['small', 'medium', 'large'], { message: '包裹大小必须为 small/medium/large' })
  size!: 'small' | 'medium' | 'large';

  @IsOptional()
  @IsUUID()
  shelfId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @Matches(/^(scan|manual|batch)$/)
  inboundMethod?: 'scan' | 'manual' | 'batch';
}
