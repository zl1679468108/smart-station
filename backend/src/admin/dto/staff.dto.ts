import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 新增员工 DTO
 * - 若手机号已存在 ss_users，则复用该账号并建立 staff 关系
 * - 若不存在，则创建新用户（需提供初始密码），再建立 staff 关系
 */
export class CreateStaffDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  /** 仅在新建用户时使用；复用已有账号时忽略 */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(32, { message: '密码最多 32 位' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, { message: '密码需含字母+数字' })
  password?: string;

  @IsString()
  @IsNotEmpty({ message: '角色不能为空' })
  @Matches(/^(admin|clerk|viewer)$/, { message: '角色必须为 admin/clerk/viewer' })
  role!: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @Matches(/^(admin|clerk|viewer)$/, { message: '角色必须为 admin/clerk/viewer' })
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;
}

/**
 * 重置员工密码 DTO
 * - 不传 password：后端生成 8 位随机密码（含字母+数字）
 * - 传 password：按规则校验（8-32 位，含字母+数字）
 */
export class ResetStaffPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(32, { message: '密码最多 32 位' })
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, { message: '密码需含字母+数字' })
  password?: string;
}
