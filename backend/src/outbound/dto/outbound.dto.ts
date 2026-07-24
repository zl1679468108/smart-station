import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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

  /**
   * 取件人身份核验：收件人手机号后 4 位（向取件人当面询问后填写）
   * 防止仅凭取件码冒领
   */
  @IsString()
  @IsNotEmpty({ message: '请填写收件人手机号后 4 位以核验取件人身份' })
  @Matches(/^\d{4}$/, { message: '手机号后 4 位须为 4 位数字' })
  phoneTail!: string;

  /** 可选核验备注（如：代取、已看身份证） */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '核验备注最长 100 字' })
  verifyNote?: string;

  /**
   * 可选拍照留证（jpeg/png base64，可含 data URI 前缀）
   * 上传到 Supabase Storage；失败不阻断出库
   */
  @IsOptional()
  @IsString()
  evidenceImageBase64?: string;

  /**
   * 可选取件签名（大件推荐；png/jpeg base64，可含 data URI 前缀）
   * 上传到 Supabase Storage；失败不阻断出库
   */
  @IsOptional()
  @IsString()
  signatureImageBase64?: string;

  /**
   * 待收款件出库时必填：收款方式
   * cash 现金 / wechat 微信 / alipay 支付宝 / other 其他
   */
  @IsOptional()
  @IsString()
  @IsIn(['cash', 'wechat', 'alipay', 'other'], { message: '收款方式不合法' })
  collectPaidMethod?: 'cash' | 'wechat' | 'alipay' | 'other';

  /** 收款备注（如：少收、已线下结清；免收时必填原因） */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '收款备注最长 100 字' })
  collectNote?: string;

  /**
   * 待收款处理：pay 收款出库（默认）/ waive 免收出库
   */
  @IsOptional()
  @IsString()
  @IsIn(['pay', 'waive'], { message: '收款处理方式不合法' })
  collectAction?: 'pay' | 'waive';
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
