import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as outboundService from '@/services/outbound';
import { useInvalidateShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import { useInvalidateInventoryDetail, useInvalidateInventoryList } from '@/hooks/useInventoryData';
import { useInvalidateOutboundRecords } from '@/hooks/useOutboundData';
import type { OutboundResult } from '@/types/outbound';
import Icon from '@/components/ui/Icon';

type Phase = 'scan' | 'submitting' | 'success' | 'error';

// 出库扫描机页面：全屏扫码 + 手动输入 fallback
// 扫码枪作为键盘输入设备会向 input 注入文本并回车，因此输入框是核心交互
// 摄像头 BarcodeDetector 作为可选增强（部分浏览器支持）
const Scan: React.FC = () => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryDetail = useInvalidateInventoryDetail();
  const invalidateInventoryList = useInvalidateInventoryList();
  const invalidateOutboundRecords = useInvalidateOutboundRecords();
  const [phase, setPhase] = useState<Phase>('scan');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<OutboundResult | null>(null);
  const [camReady, setCamReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<number | null>(null);

  // 进入扫描态自动聚焦输入框
  useEffect(() => {
    if (phase === 'scan') {
      setTrackingNumber('');
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // 摄像头预览 + BarcodeDetector（可选）
  useEffect(() => {
    if (phase !== 'scan') return;
    let cancelled = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamReady(true);

        // 浏览器原生 BarcodeDetector（Chrome/Edge 部分版本支持）
        const BD = (window as any).BarcodeDetector;
        if (BD && videoRef.current) {
          const detector = new BD({
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code'],
          });
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes && codes.length > 0) {
                const value = codes[0].rawValue as string;
                if (value) {
                  submit(value);
                  return;
                }
              }
            } catch {
              /* ignore */
            }
            detectRef.current = window.setTimeout(tick, 400);
          };
          tick();
        }
      } catch {
        // 摄像头不可用：降级为纯手动输入
        setCamReady(false);
      }
    };
    start();
    return () => {
      cancelled = true;
      if (detectRef.current) {
        clearTimeout(detectRef.current);
        detectRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCamReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const submit = useCallback(async (raw: string) => {
    const tn = raw.trim();
    if (!tn) return;
    setPhase('submitting');
    setError('');
    setResult(null);
    setTrackingNumber(tn);
    try {
      const res = await outboundService.selfServiceOutbound(tn);
      setResult(res);
      invalidateShelves();
      invalidateDashboard();
      invalidateInventoryDetail();
      invalidateInventoryList();
      invalidateOutboundRecords();
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '出库失败');
      setPhase('error');
    }
  }, [
    invalidateDashboard,
    invalidateInventoryDetail,
    invalidateInventoryList,
    invalidateOutboundRecords,
    invalidateShelves,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === 'submitting') return;
    submit(trackingNumber);
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 扫码枪通常以回车结束，原生 form submit 已覆盖
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(trackingNumber);
    }
  };

  // 成功页停留 3 秒后返回扫描页（PRD 4.5.2）
  useEffect(() => {
    if (phase !== 'success') return;
    const t = setTimeout(() => setPhase('scan'), 3000);
    return () => clearTimeout(t);
  }, [phase]);

  // ===== 成功页 =====
  if (phase === 'success' && result) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-success px-6 text-center text-white">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/40 bg-white/20">
          <Icon name="check" size={56} strokeWidth={3} />
        </div>
        <h1 className="mb-2 text-3xl font-bold">出库成功</h1>
        <p className="mb-6 text-sm text-white/80">3 秒后自动返回扫描页</p>
        <div className="w-full max-w-sm space-y-2 rounded-lg bg-white/10 p-5 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-white/70">运单号</span>
            <span className="font-medium">{result.trackingNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70">收件人</span>
            <span>{result.recipientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70">取件码</span>
            <span className="font-mono">{result.pickupCode || '-'}</span>
          </div>
        </div>
        <button
          onClick={() => setPhase('scan')}
          className="mt-6 rounded-md border border-white/60 px-6 py-2 text-sm text-white hover:bg-white/10"
        >
          立即继续扫码
        </button>
      </div>
    );
  }

  // ===== 错误页 =====
  if (phase === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-danger px-6 text-center text-white">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/40 bg-white/20">
          <Icon name="close" size={56} strokeWidth={3} />
        </div>
        <h1 className="mb-2 text-3xl font-bold">出库失败</h1>
        <p className="mb-6 max-w-md text-sm text-white/90">{error || '未知错误'}</p>
        <div className="text-xs text-white/60">运单号：{trackingNumber}</div>
        <button
          onClick={() => setPhase('scan')}
          className="mt-6 rounded-md border border-white/60 px-6 py-2 text-sm text-white hover:bg-white/10"
        >
          重新扫码
        </button>
      </div>
    );
  }

  // ===== 扫描页 / 提交中 =====
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">
      {/* 摄像头预览层（背景） */}
      {camReady && (
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      )}

      <h1 className="relative z-10 mb-2 text-3xl font-bold">扫描出库</h1>
      <p className="relative z-10 mb-8 text-sm text-gray-300">请将包裹条码对准扫描框</p>

      {/* 扫描框装饰 */}
      <div className="relative z-10 mb-8 flex h-56 w-96 max-w-full items-center justify-center rounded-lg border-2 border-white/40">
        <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-primary" />
        <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-primary" />
        <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-primary" />
        <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-primary" />
        {phase === 'submitting' && (
          <div className="text-sm text-white/80">校验中...</div>
        )}
      </div>

      {/* 手动输入 fallback */}
      <form onSubmit={handleSubmit} className="relative z-10 w-96 max-w-full">
        <label className="mb-1 block text-xs text-gray-300">摄像头不可用时手动输入运单号</label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            onKeyDown={handleScanKeyDown}
            placeholder="运单号"
            className="flex-1 rounded-md border border-white/40 bg-black/40 px-4 py-3 text-base text-white outline-none focus:border-primary"
            disabled={phase === 'submitting'}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={phase === 'submitting' || !trackingNumber.trim()}
            className="rounded-md bg-primary px-6 py-3 text-base font-medium text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {phase === 'submitting' ? '处理中' : '出库'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Scan;
