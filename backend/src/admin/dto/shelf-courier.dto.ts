import {
  ArrayNotEmpty,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShelfDto {
  @IsInt()
  @Min(1, { message: '货架号必须大于 0' })
  number!: number;

  @IsString()
  @IsIn(['small', 'medium', 'large'], { message: '大小类型必须为 small/medium/large' })
  sizeType!: 'small' | 'medium' | 'large';

  @IsOptional()
  @IsInt()
  @Min(1, { message: '层数必须大于 0' })
  layers?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '每层容量必须大于 0' })
  capacityPerLayer?: number;

  @IsOptional()
  @IsString()
  description?: string;

  // 仓库 3D 布局：可选初始化位置（不传则留空，走自动布局 fallback）
  // 坐标可正可负：地面中心在原点 (0,0)，货架可在任意象限
  @IsOptional()
  @IsNumber()
  posX?: number;

  @IsOptional()
  @IsNumber()
  posY?: number;

  @IsOptional()
  @IsIn([0, 90, 180, 270], { message: '朝向必须为 0/90/180/270' })
  rotation?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  zone?: string;
}

export class UpdateShelfDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: '货架号必须大于 0' })
  number?: number;

  @IsOptional()
  @IsString()
  @IsIn(['small', 'medium', 'large'], { message: '大小类型必须为 small/medium/large' })
  sizeType?: 'small' | 'medium' | 'large';

  @IsOptional()
  @IsInt()
  @Min(1)
  layers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacityPerLayer?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(/^(active|disabled)$/, { message: '状态必须为 active/disabled' })
  status?: string;

  // 位置字段也允许在通用 update 接口里改（用于一次性批量更新场景）
  // 坐标可正可负：地面中心在原点 (0,0)，货架可在任意象限
  @IsOptional()
  @IsNumber()
  posX?: number;

  @IsOptional()
  @IsNumber()
  posY?: number;

  @IsOptional()
  @IsIn([0, 90, 180, 270], { message: '朝向必须为 0/90/180/270' })
  rotation?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  zone?: string;
}

/**
 * 更新货架位置（拖拽高频调用专用）
 * - 与通用 UpdateShelfDto 分离，避免触发 sizeType 校验等重逻辑
 * - 任何字段传 null 表示清空（回到自动布局）
 * - 坐标可正可负：地面中心在原点 (0,0)，货架可在任意象限
 */
export class UpdateShelfPositionDto {
  @IsOptional()
  @IsNumber()
  posX?: number | null;

  @IsOptional()
  @IsNumber()
  posY?: number | null;

  @IsOptional()
  @IsIn([0, 90, 180, 270], { message: '朝向必须为 0/90/180/270' })
  rotation?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  zone?: string | null;
}

export class CreateCourierCompanyDto {
  @IsString()
  @IsNotEmpty({ message: '名称不能为空' })
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: '代码不能为空' })
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  servicePhone?: string;

  @IsOptional()
  @ArrayNotEmpty({ message: '前缀数组不能为空（如需清空请传空数组外的处理）' })
  trackingPrefixes?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCourierCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  servicePhone?: string;

  @IsOptional()
  trackingPrefixes?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Matches(/^(active|disabled)$/, { message: '状态必须为 active/disabled' })
  status?: string;
}
