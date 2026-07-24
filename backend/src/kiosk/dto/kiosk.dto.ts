import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';

/** 发送验证码 */
export class SendCodeDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;
}

/** 手机号尾号 + 验证码查询 */
export class QueryByPhoneDto {
  @IsString()
  @IsNotEmpty({ message: '手机号尾号不能为空' })
  @Length(4, 4, { message: '请输入手机号尾号 4 位' })
  @Matches(/^\d{4}$/, { message: '手机号尾号为 4 位数字' })
  phoneTail!: string;

  @IsString()
  @IsNotEmpty({ message: '验证码不能为空' })
  @Length(6, 6, { message: '验证码为 6 位数字' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}

/** 手机号直接查询（1.1.0 新增，无需验证码，用于 /query 门户） */
export class QueryByPhoneDirectDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;
}

/** 运单号查询 */
export class QueryByTrackingDto {
  @IsString()
  @IsNotEmpty({ message: '运单号不能为空' })
  trackingNumber!: string;
}

/** 取件码查询（格式：货架号-层号-件号，如 3-2-9903） */
export class QueryByCodeDto {
  @IsString()
  @IsNotEmpty({ message: '取件码不能为空' })
  @Matches(/^\d{1,3}-\d{1,2}-\d{1,6}$/, { message: '取件码格式不正确，应为 货架号-层号-件号，如 3-2-9903' })
  code!: string;
}

/** 绑定个人通知通道（Server酱 SendKey） */
export class BindNotifyDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: '验证码不能为空' })
  @Length(6, 6, { message: '验证码为 6 位数字' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'SendKey 不能为空' })
  @Matches(/^SCT[A-Za-z0-9]+$/, { message: 'SendKey 格式不正确，应以 SCT 开头' })
  sendKey!: string;
}

/** 解绑个人通知 */
export class UnbindNotifyDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: '验证码不能为空' })
  @Length(6, 6, { message: '验证码为 6 位数字' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}

/** WxPusher 扫码绑定：手机号 + 验证码 → 生成关注二维码 */
export class StartWxPusherBindDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: '验证码不能为空' })
  @Length(6, 6, { message: '验证码为 6 位数字' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;
}

/** WxPusher 轮询扫码结果 */
export class PollWxPusherBindDto {
  @IsString()
  @IsNotEmpty({ message: 'qrCode 不能为空' })
  qrCode!: string;
}

/** PushPlus 绑定：手机号 + 验证码 + token */
export class BindPushPlusDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: '验证码不能为空' })
  @Length(6, 6, { message: '验证码为 6 位数字' })
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'token 不能为空' })
  @Matches(/^[A-Za-z0-9_-]{16,64}$/, { message: '专属绑定码格式不正确' })
  token!: string;
}

/** 查询绑定状态（不返回 target） */
export class NotifyBindStatusDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;
}
