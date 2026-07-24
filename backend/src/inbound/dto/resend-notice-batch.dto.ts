import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ResendNoticeBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  ids: string[];
}
