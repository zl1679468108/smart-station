import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';

/**
 * 面单 OCR 识别模块（P1 智能入库）
 * 调用腾讯云 OCR，解析面单结构化字段供入库表单回填。
 */
@Module({
  controllers: [OcrController],
  providers: [OcrService],
})
export class OcrModule {}
