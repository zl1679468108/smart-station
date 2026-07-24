import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CheckTrackingBatchDto {
  @IsArray()
  @ArrayMinSize(1, { message: '请至少提供一条运单号' })
  @ArrayMaxSize(200, { message: '一次最多预检 200 条' })
  @IsString({ each: true })
  trackingNumbers!: string[];
}
