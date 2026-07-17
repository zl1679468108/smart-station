import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 登录 DTO
 * account 支持手机号或邮箱
 * 密码规则：8-32 位，需含字母+数字（注册时校验，登录时只做基本非空校验）
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  account!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password!: string;
}
