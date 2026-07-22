import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateExceptionDto {
  @IsUUID()
  parcelId: string;

  @IsIn(['lost', 'damaged', 'wrong_address', 'refused', 'other'])
  type: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachments?: string[];
}
