import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShippingStatusDto {
  @IsIn(['pending', 'picked', 'shipped', 'cancelled'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
