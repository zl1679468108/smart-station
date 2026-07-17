import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 更新个人资料 DTO
 * 允许修改用户名和头像，手机号/邮箱不在此接口修改
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '用户名最多 100 字符' })
  username?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
