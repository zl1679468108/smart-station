// 面单 OCR 识别 API 服务（P1 智能入库）
import { post } from './api';
import type { WaybillOcrResult } from '@/types/inbound';

/**
 * 上传面单图片识别并解析运单号/收件人/手机号
 * @param imageBase64 面单图片 base64（可含或不含 data URI 前缀）
 */
export function recognizeWaybill(imageBase64: string): Promise<WaybillOcrResult> {
  return post<WaybillOcrResult>(
    '/api/ocr/waybill',
    { imageBase64 },
    { successMessage: false, errorMessage: '面单识别失败，请重试或手动录入' },
  );
}
