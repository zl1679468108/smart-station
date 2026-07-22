import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ExceptionQueryDto {
  @IsOptional()
  @IsIn(['registered', 'processing', 'resolved', 'compensated'])
  status?: string;

  @IsOptional()
  @IsIn(['lost', 'damaged', 'wrong_address', 'refused', 'other'])
  type?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
