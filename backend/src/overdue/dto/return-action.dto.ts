import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnActionDto {
  @IsIn(['start', 'complete'])
  action: 'start' | 'complete';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
