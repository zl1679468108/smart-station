import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAddressDto {
  @IsIn(['sender', 'receiver'])
  role: string;

  @IsString()
  @MaxLength(50)
  name: string;

  @IsString()
  @MaxLength(20)
  phone: string;

  @IsString()
  @MaxLength(255)
  address: string;

  @IsOptional()
  @IsIn(['home', 'company', 'school', 'other'])
  tag?: string;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsIn(['sender', 'receiver'])
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsIn(['home', 'company', 'school', 'other'])
  tag?: string;
}

export class AddressQueryDto {
  @IsOptional()
  @IsIn(['sender', 'receiver'])
  role?: string;

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
  pageSize?: number = 50;
}
