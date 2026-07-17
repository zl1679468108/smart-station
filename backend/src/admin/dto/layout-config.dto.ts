import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * 仓库 3D 布局配置 DTO（对应 ss_stations.layout_config JSONB 字段）
 *
 * 结构：
 *   bounds: { width, depth }   仓库内部尺寸（米）
 *   doors:  [{ x, y, width, label }]   门口列表
 *   obstacles?: [{ x, y, width, depth, height, type }]   障碍物（柱子/柜台，可选）
 */
export class LayoutBoundsDto {
  @IsNumber()
  @Min(1, { message: '仓库宽度必须大于 0' })
  width!: number;

  @IsNumber()
  @Min(1, { message: '仓库深度必须大于 0' })
  depth!: number;
}

export class LayoutDoorDto {
  // 坐标可正可负：地面中心在原点 (0,0)，门口可在任意位置
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;

  @IsNumber()
  @Min(0.5, { message: '门口宽度必须 ≥ 0.5 米' })
  width!: number;

  @IsString()
  @MaxLength(20)
  label!: string;
}

export class LayoutObstacleDto {
  @IsNumber()
  @Min(0)
  x!: number;

  @IsNumber()
  @Min(0)
  y!: number;

  @IsNumber()
  @Min(0.1)
  width!: number;

  @IsNumber()
  @Min(0.1)
  depth!: number;

  @IsNumber()
  @Min(0.1)
  height!: number;

  @IsString()
  @MaxLength(20)
  type!: string;
}

export class UpdateLayoutConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutBoundsDto)
  bounds?: LayoutBoundsDto;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: '门口列表不能为空（至少一个入口）' })
  @ValidateNested({ each: true })
  @Type(() => LayoutDoorDto)
  doors?: LayoutDoorDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutObstacleDto)
  obstacles?: LayoutObstacleDto[];
}

/**
 * 单个货架位置项（用于批量保存）
 * - id：货架 UUID
 * - posX/posY：传 null 表示清空位置（回到 fallback 自动布局）
 * - rotation/zone：可选，不传则不改
 */
export class ShelfPositionItemDto {
  @IsString()
  id!: string;

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

/**
 * 仓库 3D 布局统一保存 DTO
 * 一次性提交：货架位置批量更新 + 仓库尺寸 + 门口列表
 * 后端在单个请求内串行处理，避免前端并发多请求
 */
export class SaveStationLayoutDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShelfPositionItemDto)
  shelves?: ShelfPositionItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutBoundsDto)
  bounds?: LayoutBoundsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutDoorDto)
  doors?: LayoutDoorDto[];
}
