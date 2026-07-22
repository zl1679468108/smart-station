import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateExceptionDto {
  @IsOptional()
  @IsIn(['registered', 'processing', 'resolved', 'compensated'])
  status?: string;

  @IsOptional()
  @IsIn(['compensate', 'return', 'destroy', 'redeliver'])
  resolution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
