import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 客户提交预约 */
export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  recipientName?: string;

  /** 预约日期 YYYY-MM-DD（北京时间） */
  @IsDateString({}, { message: '预约日期格式不正确' })
  slotDate!: string;

  /** 时段开始 HH:mm */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: '时段开始格式应为 HH:mm' })
  slotStart!: string;

  /** 时段结束 HH:mm */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: '时段结束格式应为 HH:mm' })
  slotEnd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** 客户查自己的预约 */
export class MyAppointmentsDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;
}

/** 店员列表查询 */
export class AppointmentListQueryDto {
  @IsOptional()
  @IsDateString()
  slotDate?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** 店员更新状态 */
export class UpdateAppointmentStatusDto {
  @IsIn(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'], {
    message: '状态不合法',
  })
  status!: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cancelReason?: string;
}

/** 客户取消自己的预约 */
export class CancelAppointmentDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string;
}
