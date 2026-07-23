import React, { useRef, useState } from 'react';
import Icon from './Icon';
import * as ocrService from '@/services/ocr';
import type { WaybillOcrResult } from '@/types/inbound';

interface WaybillOcrUploaderProps {
  /** 识别成功回调，回填表单 */
  onResult: (result: WaybillOcrResult) => void;
  /** 外部禁用（如表单提交中） */
  disabled?: boolean;
}

const MAX_FILE_MB = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * 面单 OCR 上传识别组件（P1 智能入库）
 * ------------------------------------
 * 拍照 / 上传面单图片 → 调用后端腾讯云 OCR → 解析运单号/收件人/手机号 → 回填表单。
 * 仅做识别回填，不落库；入库仍由用户人工确认后提交。
 * 触摸友好：按钮最小点击区 ≥44px，适配平板现场操作。
 */
const WaybillOcrUploader: React.FC<WaybillOcrUploaderProps> = ({ onResult, disabled }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  // 额度提醒：剩余量偏低时展示，避免免费额度悄悄用尽
  const [quotaNote, setQuotaNote] = useState<string | null>(null);

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });

  const handleFile = async (file: File) => {
    setError('');
    setSummary(null);
    setQuotaNote(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('仅支持 JPG / PNG / WebP 格式图片');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`图片不能超过 ${MAX_FILE_MB}MB`);
      return;
    }
    setLoading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      setPreview(dataUrl);
      const res = await ocrService.recognizeWaybill(dataUrl);
      onResult(res);
      const hit: string[] = [];
      if (res.matched.trackingNumber) hit.push('运单号');
      if (res.matched.recipientName) hit.push('姓名');
      if (res.matched.recipientPhone) hit.push('手机号');
      setSummary(
        hit.length > 0
          ? `已识别并回填：${hit.join('、')}${hit.length < 3 ? '，其余请手动补全' : '，请核对后入库'}`
          : '未能识别出有效字段，请手动录入或换张更清晰的图',
      );
      if (res.quota?.warning) {
        setQuotaNote(
          `本月面单识别剩余 ${res.quota.remaining}/${res.quota.limit} 次，接近免费额度上限。用完后将暂停识别（不会产生按量付费），可继续手动录入。`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '面单识别失败');
      setPreview(null);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primaryLight/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Icon name="camera" size={18} className="text-primary" />
          <span>拍照或上传快递面单，自动识别收件信息</span>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || loading}
          className="flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          <Icon name="camera" size={16} />
          {loading ? '识别中...' : '面单识别'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        onChange={onChange}
        className="hidden"
      />

      {preview && (
        <div className="mt-3 flex items-start gap-3">
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
            title="点击查看大图"
          >
            <img src={preview} alt="面单预览" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
              <Icon name="search" size={18} />
            </span>
          </button>
          {summary && <p className="flex-1 text-xs leading-relaxed text-gray-500">{summary}</p>}
        </div>
      )}

      {error && <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {quotaNote && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          {quotaNote}
        </div>
      )}

      {zoom && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoom(false)}
        >
          <img
            src={preview}
            alt="面单大图"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-700 hover:bg-white"
            aria-label="关闭大图"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

export default WaybillOcrUploader;
