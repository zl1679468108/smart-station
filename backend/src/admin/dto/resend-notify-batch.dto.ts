import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ResendNotifyBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsString({ each: true })
  ids: string[];
}
