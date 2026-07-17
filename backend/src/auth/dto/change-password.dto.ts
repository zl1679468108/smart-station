import {
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * 修改密码 DTO
 * 新密码规则：8-32 位，需含字母+数字
 * 「新密码不能与旧密码相同」的跨字段校验在 service 中执行
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '旧密码不能为空' })
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(32, { message: '新密码最多 32 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: '新密码需包含字母和数字',
  })
  newPassword!: string;
}
