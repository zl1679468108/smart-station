import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { WaybillOcrDto } from './dto/ocr.dto';
import { TokenAuthGuard } from '../common/guards/token-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * 面单 OCR 识别控制器
 * - POST /api/ocr/waybill  上传面单图片，识别并解析运单号/收件人/手机号
 *
 * 权限与入库一致（PRD 4.12.2）：admin + clerk，viewer 不可用。
 * 仅做识别与解析回填，不落库；入库仍走 POST /api/inbound 人工确认。
 */
@Controller('ocr')
@UseGuards(TokenAuthGuard)
@Roles('admin', 'clerk')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('waybill')
  @HttpCode(200)
  async waybill(@Body() dto: WaybillOcrDto) {
    return this.ocrService.recognizeWaybill({
      imageBase64: dto.imageBase64,
      imageUrl: dto.imageUrl,
    });
  }
}
