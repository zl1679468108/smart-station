import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class RemindBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  ids: string[];
}
