import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 面单 OCR 识别 DTO
 * - imageBase64：面单图片的 base64（可含或不含 data URI 前缀），二选一
 * - imageUrl：面单图片的公网可访问 URL，二选一
 * 至少提供一个；同时提供时优先使用 imageBase64。
 */
export class WaybillOcrDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'imageBase64 不能为空字符串' })
  imageBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}
