import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as inboundService from '@/services/inbound';
import { ApiError } from '@/services/api';
import { notifyError, notifySuccess } from '@/utils/notification';
import {
  UNBOUND_FACE_HINT,
  buildBindGuideScript,
  buildFacePickupScript,
} from '@/utils/staffScripts';
import {
  loadLastParcelSize,
  playInboundSuccessBeep,
  saveLastParcelSize,
  isSuccessBeepEnabled,
  setSuccessBeepEnabled,
} from '@/utils/inboundOps';
import { useCouriers, useInvalidateShelves, useShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import { useInvalidateInventoryList } from '@/hooks/useInventoryData';
import type {
  BatchNotifySummary,
  CheckTrackingBatchResult,
  DuplicateParcelInfo,
  InboundResult,
  ParcelSize,
  WaybillOcrResult,
} from '@/types/inbound';
import type { Shelf } from '@/types/admin';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/ui/PageHeader';
import WaybillOcrUploader from '@/components/ui/WaybillOcrUploader';
import NotifyBindHint from '@/components/NotifyBindHint';
import * as shiftService from '@/services/shift';

type Mode = 'scan' | 'manual' | 'batch';

const SIZE_LABEL: Record<ParcelSize, string> = { small: '小件', medium: '中件', large: '大件' };
const SIZE_ORDER: ParcelSize[] = ['small', 'medium', 'large'];

/** 运单重复预检 hook */
function useTrackingDuplicateCheck(trackingNumber: string) {
  const [dup, setDup] = useState<DuplicateParcelInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [dupMessage, setDupMessage] = useState('');

  useEffect(() => {
    const tn = trackingNumber.trim().toUpperCase();
    if (tn.length < 6) {
      setDup(null);
      setDupMessage('');
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await inboundService.checkTracking(tn);
          if (cancelled) return;
          if (r.exists && r.parcel) {
            setDup(r.parcel);
            setDupMessage(r.message || '该运单已在库');
          } else {
            setDup(null);
            setDupMessage('');
          }
        } catch {
          if (!cancelled) {
            setDup(null);
            setDupMessage('');
          }
        } finally {
          if (!cancelled) setChecking(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trackingNumber]);

  return { dup, checking, dupMessage, setDup, setDupMessage };
}

const DuplicateTrackingBanner: React.FC<{
  parcel: DuplicateParcelInfo;
  message?: string;
}> = ({ parcel, message }) => {
  const navigate = useNavigate();
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <p className="font-medium">⚠️ 运单已在驿站，请勿重复入库</p>
      <p className="mt-1 leading-relaxed">{message || '该运单号当前仍在库/滞留/异常中。'}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-amber-900/90">
        {parcel.pickupCode && <span>取件码 <strong className="font-mono">{parcel.pickupCode}</strong></span>}
        {parcel.statusLabel && <span>状态 {parcel.statusLabel}</span>}
        {parcel.shelfNumber != null && (
          <span>
            货架 {parcel.shelfNumber}
            {parcel.shelfLayer != null ? `-${parcel.shelfLayer}` : ''}
            {parcel.shelfPosition != null ? `-${parcel.shelfPosition}` : ''}
          </span>
        )}
        {parcel.recipientPhoneMasked && <span>手机 {parcel.recipientPhoneMasked}</span>}
      </div>
      <button
        type="button"
        onClick={() => navigate(`/admin/inventory/${parcel.id}`)}
        className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
      >
        查看在库详情
      </button>
    </div>
  );
};


/** 手机号脱敏展示（连续同收件人提示用） */

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  return phone || '';
}

// 入库管理页：扫码入库（主）/ 手动录入 / 批量导入（入口）
const Inbound: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('scan');
  // 货架列表走 React Query 缓存（staleTime: Infinity），跨页面共享
  const { data: shelves = [] } = useShelves();
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await shiftService.fetchCurrentShift();
        if (!cancelled) setShiftOpen(Boolean(s));
      } catch {
        if (!cancelled) setShiftOpen(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full">
      <PageHeader title="入库管理" className="mb-4" />

      {shiftOpen === false && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-900">
            你还没开班。建议先开班再入库，交班时才能汇总本班入库/收款。
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin/shifts')}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            去开班
          </button>
        </div>
      )}

      {/* 模式切换 */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {([
          { key: 'scan', label: '扫码入库' },
          { key: 'manual', label: '手动录入' },
          { key: 'batch', label: '批量导入' },
        ] as { key: Mode; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
              mode === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl">
        {mode === 'scan' && <ScanInbound shelves={shelves} />}
        {mode === 'manual' && <ManualInbound shelves={shelves} />}
        {mode === 'batch' && <BatchInbound shelves={shelves} />}
      </div>
    </div>
  );
};

// ============ 包裹大小选择器 ============
// desc 动态显示该类型当前可用的货架号，货架归属可在系统管理中随时调整
const SizeSelector: React.FC<{
  value: ParcelSize;
  onChange: (v: ParcelSize) => void;
  disabled?: boolean;
  shelves?: Shelf[];
}> = ({ value, onChange, disabled, shelves }) => {
  const options = SIZE_ORDER.map((size) => {
    const nums = (shelves || [])
      .filter((s) => s.status === 'active' && s.size_type === size)
      .map((s) => s.number)
      .sort((a, b) => a - b);
    const desc = nums.length > 0 ? `${nums.join(',')} 号` : '暂无可用货架';
    return { value: size, label: SIZE_LABEL[size], desc, empty: nums.length === 0 };
  });
  return (
    <div>
      <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>包裹大小</label>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
              value === opt.value
                ? 'border-primary bg-primaryLight text-primary'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            } disabled:opacity-60`}
          >
            <div className="font-medium">{opt.label}</div>
            <div className={`text-xs ${opt.empty ? 'text-danger' : 'text-gray-400'}`}>{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ============ 入库成功结果展示 ============
const InboundSuccess: React.FC<{
  result: InboundResult;
  onNotifyUpdate?: (next: InboundResult) => void;
}> = ({ result, onNotifyUpdate }) => {
  const n = result.notify;
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);
  const notifyTone = !n
    ? 'border-gray-200 bg-gray-50 text-gray-600'
    : !n.enabled
      ? 'border-gray-200 bg-gray-50 text-gray-600'
      : n.customerPushed
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : n.customerBound
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-orange-200 bg-orange-50 text-orange-800';

  const onCopyCode = async () => {
    const ok = await copyText(result.pickupCode);
    if (ok) {
      setCopied(true);
      notifySuccess('取件码已复制');
      setTimeout(() => setCopied(false), 1500);
    } else {
      notifyError('复制失败，请长按取件码手动复制');
    }
  };

  const onResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const r = await inboundService.resendInboundNotice(result.id);
      notifySuccess(r.staffMessage || '已尝试补发');
      onNotifyUpdate?.({
        ...result,
        notify: {
          enabled: r.enabled,
          attempted: r.attempted,
          customerBound: r.customerBound,
          customerPushed: r.customerPushed,
          customerChannels: r.customerChannels,
          staffMessage: r.staffMessage,
        },
      });
    } catch (e: any) {
      notifyError(e?.message || '补发失败');
    } finally {
      setResending(false);
    }
  };

  const onCopyFaceScript = async () => {
    const text = buildFacePickupScript({
      pickupCode: result.pickupCode,
    });
    const ok = await copyText(text);
    if (ok) notifySuccess('已复制当面话术（含取件码，勿发群）');
    else notifyError('复制失败，请手动抄取件码');
  };

  const onCopyBindScript = async () => {
    const text = buildBindGuideScript();
    const ok = await copyText(text);
    if (ok) notifySuccess('已复制绑定引导（不含取件码，可发客户）');
    else notifyError('复制失败');
  };

  return (
    <div className="rounded-lg border border-success/40 bg-success/5 p-5">
      <h3 className="mb-3 flex items-center gap-1.5 text-base font-medium text-success">
        <Icon name="check" size={18} />
        入库成功
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex gap-3">
          <span className="w-24 shrink-0 text-gray-500">运单号</span>
          <span className="font-medium text-gray-800">{result.trackingNumber}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-24 shrink-0 text-gray-500">取件码</span>
          <span className="font-mono text-2xl font-bold tracking-widest text-primary">
            {result.pickupCode}
          </span>
          <button
            type="button"
            onClick={() => void onCopyCode()}
            className="mb-0.5 rounded-md border border-primary/30 bg-white px-2 py-1 text-xs text-primary hover:bg-orange-50"
          >
            {copied ? '已复制' : '复制取件码'}
          </button>
          <span className="self-center text-xs text-gray-400">
            （第{result.shelfNumber}号货架 · 第{result.shelfLayer}层 · 第{result.shelfPosition}号）
          </span>
        </div>
        {result.courierCompanyName && (
          <div className="flex gap-3">
            <span className="w-24 shrink-0 text-gray-500">快递公司</span>
            <span className="text-gray-800">{result.courierCompanyName}</span>
          </div>
        )}
      </div>

      {n && (
        <div className={`mt-4 rounded-md border px-3 py-2.5 text-xs leading-relaxed ${notifyTone}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">通知状态</p>
              <p className="mt-1">{n.staffMessage}</p>
              {!n.customerBound && n.enabled && (
                <p className="mt-1 text-[11px] opacity-90">{UNBOUND_FACE_HINT}</p>
              )}
              {n.customerBound && !n.customerPushed && n.enabled && (
                <p className="mt-1 text-[11px] opacity-90">
                  客户已绑定但私信未成功，可点「补发通知」再试一次。
                </p>
              )}
            </div>
            {n.enabled && (
              <button
                type="button"
                disabled={resending}
                onClick={() => void onResend()}
                className="shrink-0 rounded-md border border-current/20 bg-white/80 px-2.5 py-1 text-[11px] font-medium hover:bg-white disabled:opacity-60"
              >
                {resending ? '补发中…' : n.customerPushed ? '再发一次' : '补发通知'}
              </button>
            )}
          </div>
          {!n.customerBound && n.enabled && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onCopyFaceScript()}
                className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
              >
                复制当面话术（含取件码）
              </button>
              <button
                type="button"
                onClick={() => void onCopyBindScript()}
                className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
              >
                复制绑定引导（不含码）
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ 扫码入库 ============
const ScanInbound: React.FC<{ shelves: Shelf[] }> = ({ shelves }) => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryList = useInvalidateInventoryList();
  const [trackingNumber, setTrackingNumber] = useState('');
  const { dup, checking: checkingDup, dupMessage, setDup, setDupMessage } = useTrackingDuplicateCheck(trackingNumber);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [size, setSize] = useState<ParcelSize>(() => loadLastParcelSize('small'));
  const [beepOn, setBeepOn] = useState(() => isSuccessBeepEnabled());
  const [note, setNote] = useState('');
  const [freightCollectAmount, setFreightCollectAmount] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InboundResult | null>(null);
  /** 本会话最近成功入库，便于连续扫码时回看取件码/通知 */
  const [recent, setRecent] = useState<InboundResult[]>([]);
  /**
   * 连续同收件人：成功后保留姓名/手机号/尺寸，只清空运单与金额
   * 晚高峰同一人多件时少打字
   */
  const [keepRecipient, setKeepRecipient] = useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 面单 OCR 识别回填：仅覆盖识别到的字段，未识别的保留用户已填内容
  const handleOcrResult = (res: WaybillOcrResult) => {
    setError('');
    if (res.trackingNumber) setTrackingNumber(res.trackingNumber);
    if (res.recipientName) setRecipientName(res.recipientName);
    if (res.recipientPhone) setRecipientPhone(res.recipientPhone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setResult(null);
    if (!trackingNumber.trim()) {
      setError('请扫描或输入运单号');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim()) {
      setError('请填写收件人姓名和手机号');
      return;
    }
    if (dup) {
      setError(dupMessage || '该运单已在库，不可重复入库');
      return;
    }
    setSubmitting(true);
    try {
      const res = await inboundService.inbound({
        trackingNumber: trackingNumber.trim(),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        size,
        note: note.trim() || undefined,
        freightCollectAmount: freightCollectAmount.trim()
          ? Number(freightCollectAmount)
          : undefined,
        codAmount: codAmount.trim() ? Number(codAmount) : undefined,
        inboundMethod: 'scan',
      });
      setResult(res);
      setRecent((prev) => [res, ...prev].slice(0, 5));
      saveLastParcelSize(size);
      playInboundSuccessBeep();
      invalidateShelves();
      invalidateDashboard();
      invalidateInventoryList();
      // 运单/备注/金额每次清空；姓名手机按「连续同收件人」开关
      setTrackingNumber('');
      setNote('');
      setFreightCollectAmount('');
      setCodAmount('');
      if (!keepRecipient) {
        setRecipientName('');
        setRecipientPhone('');
      }
      // 稍后再聚焦，避免与成功区重绘抢焦点
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object' && (err.data as any).id) {
        setDup(err.data as DuplicateParcelInfo);
        setDupMessage(err.message);
      }
      setError(err instanceof Error ? err.message : '入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <WaybillOcrUploader disabled={submitting || Boolean(dup)} onResult={handleOcrResult} />
        <div>
          <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>运单号（扫码）</label>
          <input
            ref={inputRef}
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="扫描或输入运单号"
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary ${
              dup ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
            }`}
            disabled={submitting}
          />
          {checkingDup && (
            <p className="mt-1 text-[11px] text-gray-400">正在检查是否已入库…</p>
          )}
          {dup && (
            <div className="mt-2">
              <DuplicateTrackingBanner parcel={dup} message={dupMessage} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>收件人姓名</label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>收件人手机号</label>
            <input
              type="tel"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="11 位手机号"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
            <NotifyBindHint phone={recipientPhone} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={keepRecipient}
              onChange={(e) => setKeepRecipient(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            连续同收件人（成功后保留姓名手机，只换运单）
          </label>
          {keepRecipient && (recipientName || recipientPhone) && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setRecipientName('');
                setRecipientPhone('');
                setKeepRecipient(false);
              }}
              className="text-xs text-gray-500 hover:text-danger"
            >
              换收件人
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={beepOn}
            onChange={(e) => {
              const on = e.target.checked;
              setBeepOn(on);
              setSuccessBeepEnabled(on);
            }}
            disabled={submitting}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          入库成功提示音（短哔一声）
        </label>
        {keepRecipient && recipientName && recipientPhone && (
          <p className="text-[11px] text-emerald-700">
            下一件将继续给：{recipientName} · {maskPhone(recipientPhone)}
          </p>
        )}
        <SizeSelector
          value={size}
          onChange={(s) => {
            setSize(s);
            saveLastParcelSize(s);
          }}
          disabled={submitting}
          shelves={shelves}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">到付运费（元）</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={freightCollectAmount}
              onChange={(e) => setFreightCollectAmount(e.target.value)}
              placeholder="无则留空"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">代收货款（元）</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={codAmount}
              onChange={(e) => setCodAmount(e.target.value)}
              placeholder="无则留空"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400">有金额时，取件出库须先确认收款；普通件可不填。</p>
        <div>
          <label className="mb-1 block text-sm text-gray-600">备注（可选）</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            disabled={submitting}
          />
        </div>

        {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <button
          type="submit"
          disabled={submitting || Boolean(dup)}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '入库中...' : dup ? '运单已在库' : '确认入库'}
        </button>
        <p className="text-center text-xs text-gray-400">快递公司自动识别，货架按包裹大小自动分配</p>
      </form>

      {result && (
        <InboundSuccess
          result={result}
          onNotifyUpdate={(next) => {
            setResult(next);
            setRecent((prev) => prev.map((x) => (x.id === next.id ? next : x)));
          }}
        />
      )}

      {recent.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">本会话最近入库</h3>
            <span className="text-[11px] text-gray-400">最多显示 5 条</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {recent.map((r) => {
              const n = r.notify;
              let tip = '通知未知';
              let tipClass = 'text-gray-500';
              if (n) {
                if (!n.enabled) {
                  tip = '通知已关';
                  tipClass = 'text-gray-500';
                } else if (n.customerPushed) {
                  tip = '已私信';
                  tipClass = 'text-emerald-600';
                } else if (n.customerBound) {
                  tip = '私信失败';
                  tipClass = 'text-amber-600';
                } else {
                  tip = '未绑定';
                  tipClass = 'text-orange-600';
                }
              }
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-primary">{r.pickupCode}</div>
                    <div className="truncate text-gray-500">{r.trackingNumber}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-gray-700">
                      {r.shelfNumber}-{r.shelfLayer}-{String(r.shelfPosition).padStart(4, '0')}
                    </div>
                    <div className={tipClass}>{tip}</div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                        onClick={() =>
                          void copyText(r.pickupCode).then((ok) =>
                            ok ? notifySuccess('取件码已复制') : notifyError('复制失败'),
                          )
                        }
                      >
                        复制码
                      </button>
                      {n?.enabled && (
                        <button
                          type="button"
                          className="rounded border border-primary/30 px-1.5 py-0.5 text-[11px] text-primary hover:bg-orange-50"
                          onClick={() => {
                            void (async () => {
                              try {
                                const res = await inboundService.resendInboundNotice(r.id);
                                notifySuccess(res.staffMessage || '已尝试补发');
                                setRecent((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id
                                      ? {
                                          ...x,
                                          notify: {
                                            enabled: res.enabled,
                                            attempted: res.attempted,
                                            customerBound: res.customerBound,
                                            customerPushed: res.customerPushed,
                                            customerChannels: res.customerChannels,
                                            staffMessage: res.staffMessage,
                                          },
                                        }
                                      : x,
                                  ),
                                );
                                setResult((cur) =>
                                  cur && cur.id === r.id
                                    ? {
                                        ...cur,
                                        notify: {
                                          enabled: res.enabled,
                                          attempted: res.attempted,
                                          customerBound: res.customerBound,
                                          customerPushed: res.customerPushed,
                                          customerChannels: res.customerChannels,
                                          staffMessage: res.staffMessage,
                                        },
                                      }
                                    : cur,
                                );
                              } catch (e: any) {
                                notifyError(e?.message || '补发失败');
                              }
                            })();
                          }}
                        >
                          补发
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// ============ 手动录入 ============
const ManualInbound: React.FC<{ shelves: Shelf[] }> = ({ shelves }) => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryList = useInvalidateInventoryList();
  const trackingInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    trackingNumber: '',
    courierCompanyId: '',
    recipientName: '',
    recipientPhone: '',
    size: loadLastParcelSize('small') as ParcelSize,
    shelfId: '',
    note: '',
    freightCollectAmount: '',
    codAmount: '',
  });
  const { dup, checking: checkingDup, dupMessage, setDup, setDupMessage } = useTrackingDuplicateCheck(form.trackingNumber);
  const [keepRecipient, setKeepRecipient] = useState(true);
  // 快递公司列表走 React Query 缓存；下拉仅展示启用中的公司
  const { data: allCouriers = [] } = useCouriers();
  const couriers = allCouriers.filter((c) => c.status === 'active');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InboundResult | null>(null);

  // 按当前选择的 size 过滤可选货架（仅显示启用中的货架）
  const filteredShelves = shelves.filter((s) => s.status === 'active' && s.size_type === form.size);

  // 面单 OCR 识别回填：仅覆盖识别到的字段，未识别的保留用户已填内容
  const handleOcrResult = (res: WaybillOcrResult) => {
    setError('');
    setForm((prev) => ({
      ...prev,
      trackingNumber: res.trackingNumber ?? prev.trackingNumber,
      recipientName: res.recipientName ?? prev.recipientName,
      recipientPhone: res.recipientPhone ?? prev.recipientPhone,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setResult(null);
    if (!form.trackingNumber.trim() || !form.recipientName.trim() || !form.recipientPhone.trim()) {
      setError('运单号、收件人姓名、手机号不能为空');
      return;
    }
    if (dup) {
      setError(dupMessage || '该运单已在库，不可重复入库');
      return;
    }
    setSubmitting(true);
    try {
      const res = await inboundService.inbound({
        trackingNumber: form.trackingNumber.trim(),
        courierCompanyId: form.courierCompanyId || undefined,
        recipientName: form.recipientName.trim(),
        recipientPhone: form.recipientPhone.trim(),
        size: form.size,
        shelfId: form.shelfId || undefined,
        note: form.note.trim() || undefined,
        freightCollectAmount: form.freightCollectAmount.trim()
          ? Number(form.freightCollectAmount)
          : undefined,
        codAmount: form.codAmount.trim() ? Number(form.codAmount) : undefined,
        inboundMethod: 'manual',
      });
      setResult(res);
      saveLastParcelSize(form.size);
      playInboundSuccessBeep();
      invalidateShelves();
      invalidateDashboard();
      invalidateInventoryList();
      setForm((prev) => ({
        trackingNumber: '',
        courierCompanyId: '',
        recipientName: keepRecipient ? prev.recipientName : '',
        recipientPhone: keepRecipient ? prev.recipientPhone : '',
        size: keepRecipient ? prev.size : 'small',
        shelfId: '',
        note: '',
        freightCollectAmount: '',
        codAmount: '',
      }));
      // 连续作业：成功后回到运单号，方便扫下一票
      setTimeout(() => {
        trackingInputRef.current?.focus();
        trackingInputRef.current?.select();
      }, 30);
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object' && (err.data as any).id) {
        setDup(err.data as DuplicateParcelInfo);
        setDupMessage(err.message);
      }
      setError(err instanceof Error ? err.message : '入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <WaybillOcrUploader disabled={submitting} onResult={handleOcrResult} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>运单号</label>
            <input
              ref={trackingInputRef}
              type="text"
              value={form.trackingNumber}
              onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-primary ${
                dup ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300'
              }`}
              disabled={submitting}
            />
            {checkingDup && (
              <p className="mt-1 text-[11px] text-gray-400">正在检查是否已入库…</p>
            )}
            {dup && (
              <div className="mt-2 sm:col-span-2">
                <DuplicateTrackingBanner parcel={dup} message={dupMessage} />
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">快递公司（留空自动识别）</label>
            <select
              value={form.courierCompanyId}
              onChange={(e) => setForm({ ...form, courierCompanyId: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            >
              <option value="">自动识别</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.code}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>收件人姓名</label>
            <input
              type="text"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>收件人手机号</label>
            <input
              type="tel"
              value={form.recipientPhone}
              onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
              placeholder="11 位手机号"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
            <NotifyBindHint phone={form.recipientPhone} />
          </div>
        </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={keepRecipient}
              onChange={(e) => setKeepRecipient(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            连续同收件人（成功后保留姓名手机，只换运单）
          </label>
          {keepRecipient && (form.recipientName || form.recipientPhone) && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setForm((prev) => ({ ...prev, recipientName: '', recipientPhone: '' }));
                setKeepRecipient(false);
              }}
              className="text-xs text-gray-500 hover:text-danger"
            >
              换收件人
            </button>
          )}
        </div>
        <SizeSelector
          value={form.size}
          onChange={(v) => {
            setForm({ ...form, size: v, shelfId: '' });
            saveLastParcelSize(v);
          }}
          disabled={submitting}
          shelves={shelves}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">
              货架（留空自动分配，仅显示{form.size === 'small' ? '小件' : form.size === 'medium' ? '中件' : '大件'}货架）
            </label>
            <select
              value={form.shelfId}
              onChange={(e) => setForm({ ...form, shelfId: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            >
              <option value="">自动分配</option>
              {filteredShelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number}号（{s.layers}层×{s.capacity_per_layer}件）
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">到付运费（元）</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.freightCollectAmount}
                onChange={(e) => setForm({ ...form, freightCollectAmount: e.target.value })}
                placeholder="无则留空"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">代收货款（元）</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.codAmount}
                onChange={(e) => setForm({ ...form, codAmount: e.target.value })}
                placeholder="无则留空"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={submitting}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">有金额时，取件出库须先确认收款；普通件可不填。</p>
          <div>
            <label className="mb-1 block text-sm text-gray-600">备注</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
          </div>
        </div>

        {error && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <button
          type="submit"
          disabled={submitting || Boolean(dup)}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '入库中...' : dup ? '运单已在库' : '确认入库'}
        </button>
      </form>

      {result && (
        <InboundSuccess
          result={result}
          onNotifyUpdate={(next) => setResult(next)}
        />
      )}
    </div>
  );
};

// ============ 批量导入（CSV 粘贴） ============
const BatchInbound: React.FC<{ shelves: Shelf[] }> = ({ shelves }) => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryList = useInvalidateInventoryList();
  const [csvText, setCsvText] = useState('');
  const [defaultSize, setDefaultSize] = useState<ParcelSize>(() => loadLastParcelSize('small'));
  const [submitting, setSubmitting] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [precheck, setPrecheck] = useState<CheckTrackingBatchResult | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    succeeded: number;
    failed: number;
    total: number;
    errors: Array<{ index: number; error: string }>;
    notifySummary?: BatchNotifySummary;
    successes?: Array<{
      id: string;
      trackingNumber: string;
      pickupCode: string;
      recipientPhone?: string;
      staffMessage?: string;
      notifyEnabled?: boolean;
      customerPushed?: boolean;
      customerBound?: boolean;
    }>;
  } | null>(null);
  const [bulkResending, setBulkResending] = useState(false);
  const [rowResendingId, setRowResendingId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    setError('');
    setResult(null);
    const lines = csvText.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
      setError('请粘贴至少一行数据');
      return;
    }
    // 解析格式：运单号,收件人姓名,手机号[,备注]
    const items: Array<{
      trackingNumber: string;
      recipientName: string;
      recipientPhone: string;
      size: ParcelSize;
      note?: string;
      inboundMethod: 'batch';
    }> = [];
    const parseErrors: Array<{ index: number; error: string }> = [];
    lines.forEach((line, i) => {
      const parts = line.split(',').map((s) => s.trim());
      if (parts.length < 3) {
        parseErrors.push({ index: i, error: '字段不足，需至少 运单号,姓名,手机号' });
        return;
      }
      const [trackingNumber, recipientName, recipientPhone, note] = parts;
      if (!trackingNumber || !recipientName || !recipientPhone) {
        parseErrors.push({ index: i, error: '字段不能为空' });
        return;
      }
      if (!/^1\d{10}$/.test(recipientPhone)) {
        parseErrors.push({ index: i, error: '手机号格式不正确' });
        return;
      }
      items.push({
        trackingNumber,
        recipientName,
        recipientPhone,
        size: defaultSize,
        note: note || undefined,
        inboundMethod: 'batch',
      });
    });

    if (items.length === 0) {
      setError(`无有效数据，${parseErrors.length} 行解析失败`);
      setResult({ total: lines.length, succeeded: 0, failed: parseErrors.length, errors: parseErrors });
      setPrecheck(null);
      return;
    }

    // 先预检：库内重复 + CSV 内重复
    setPrechecking(true);
    setError('');
    setPrecheck(null);
    let check: CheckTrackingBatchResult | null = null;
    try {
      check = await inboundService.checkTrackingBatch(items.map((x) => x.trackingNumber));
      setPrecheck(check);
    } catch (err) {
      setError(err instanceof Error ? err.message : '预检失败');
      setPrechecking(false);
      return;
    }
    setPrechecking(false);

    const stockBlocked = new Set(
      (check?.items || []).filter((x) => x.exists).map((x) => x.trackingNumber.toUpperCase()),
    );
    const readyFinal: typeof items = [];
    const firstSeen = new Set<string>();
    const skippedErrors: Array<{ index: number; error: string }> = [...parseErrors];
    items.forEach((it, idx) => {
      const tn = it.trackingNumber.trim().toUpperCase();
      if (stockBlocked.has(tn)) {
        const hit = (check?.items || []).find((c) => c.trackingNumber === tn && c.exists);
        skippedErrors.push({
          index: idx,
          error: hit?.message || '运单已在库，已跳过',
        });
        return;
      }
      if (firstSeen.has(tn)) {
        skippedErrors.push({ index: idx, error: '本批 CSV 内运单号重复，已跳过' });
        return;
      }
      firstSeen.add(tn);
      readyFinal.push(it);
    });

    if (readyFinal.length === 0) {
      setError(check?.staffMessage || '没有可入库的运单（均为重复）');
      setResult({
        total: lines.length,
        succeeded: 0,
        failed: skippedErrors.length,
        errors: skippedErrors,
      });
      return;
    }

    const skipCount = items.length - readyFinal.length;
    if (skipCount > 0) {
      const ok = window.confirm(
        `${check?.staffMessage || '预检完成'}\n\n将跳过 ${skipCount} 条重复，仅导入 ${readyFinal.length} 条。是否继续？`,
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      const res = await inboundService.batchInbound(readyFinal);
      setResult({
        total: items.length + parseErrors.length,
        succeeded: res.succeeded,
        failed: res.failed + skippedErrors.length,
        errors: [
          ...skippedErrors,
          ...res.errors.map((e) => ({
            index: e.index,
            error: `${readyFinal[e.index]?.trackingNumber || ''} ${e.error}`.trim(),
          })),
        ],
        notifySummary: res.notifySummary,
        successes: (res.results || []).map((row) => ({
          id: row.result?.id || '',
          trackingNumber: row.result?.trackingNumber || '',
          pickupCode: row.result?.pickupCode || '',
          recipientPhone: row.result?.recipientPhone,
          staffMessage: row.result?.notify?.staffMessage,
          notifyEnabled: row.result?.notify?.enabled,
          customerPushed: row.result?.notify?.customerPushed,
          customerBound: row.result?.notify?.customerBound,
        })),
      });
      if (res.succeeded > 0) {
        setCsvText('');
        saveLastParcelSize(defaultSize);
        playInboundSuccessBeep();
        invalidateShelves();
        invalidateDashboard();
        invalidateInventoryList();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-medium text-gray-700">批量导入（CSV 粘贴）</h2>
        <p className="mb-3 text-xs text-gray-500">
          每行一条，字段用英文逗号分隔：<code className="rounded bg-gray-100 px-1">运单号,收件人姓名,手机号,备注</code>
          <br />
          备注可选。快递公司自动识别，货架按下方选择的包裹大小统一分配。
        </p>
        <div className="mb-3">
          <SizeSelector
            value={defaultSize}
            onChange={(s) => {
              setDefaultSize(s);
              saveLastParcelSize(s);
            }}
            disabled={submitting}
            shelves={shelves}
          />
        </div>
        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setPrecheck(null);
          }}
          rows={8}
          placeholder={'SF1234567890,张三,13800001234,易碎品\nZTO9876543210,李四,13900005678'}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          disabled={submitting}
        />
        {error && <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {precheck && precheck.blocked > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <p className="font-medium">{precheck.staffMessage}</p>
            <p className="mt-1 text-[11px] opacity-90">
              导入时会自动跳过库内已存在与 CSV 内重复运单；下方失败列表会写明原因。
            </p>
            <div className="mt-2 max-h-36 overflow-auto rounded border border-amber-100 bg-white/70">
              <ul className="divide-y divide-amber-50">
                {precheck.items
                  .filter((x) => x.blocked)
                  .slice(0, 30)
                  .map((x) => (
                    <li key={`${x.index}-${x.trackingNumber}`} className="px-2 py-1.5 font-mono text-[11px]">
                      <span className="text-gray-800">{x.trackingNumber}</span>
                      <span className="ml-2 text-amber-800">
                        {x.exists
                          ? `已在库${x.parcel?.pickupCode ? ` · 取件码 ${x.parcel.pickupCode}` : ''}`
                          : x.message}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || prechecking || !csvText.trim()}
          className="mt-3 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {prechecking ? '预检中...' : submitting ? '导入中...' : '预检并导入'}
        </button>
      </div>

      {result && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-gray-700">导入结果</h3>
          <div className="mb-3 flex gap-4 text-sm">
            <span className="text-gray-600">总计：{result.total}</span>
            <span className="text-success">成功：{result.succeeded}</span>
            <span className="text-danger">失败：{result.failed}</span>
          </div>
          {result.notifySummary && result.succeeded > 0 && (
            <div
              className={`mb-3 rounded-md border px-3 py-2.5 text-xs leading-relaxed ${
                result.notifySummary.customerPushed > 0 &&
                result.notifySummary.customerUnbound === 0 &&
                result.notifySummary.customerPushFailed === 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : result.notifySummary.notifyEnabled === 0
                    ? 'border-gray-200 bg-gray-50 text-gray-600'
                    : 'border-orange-200 bg-orange-50 text-orange-800'
              }`}
            >
              <div className="font-medium">客户通知</div>
              <p className="mt-1">{result.notifySummary.staffMessage}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {result.notifySummary.customerPushed > 0 && (
                  <span className="rounded bg-white/70 px-2 py-0.5">
                    已私信 {result.notifySummary.customerPushed}
                  </span>
                )}
                {result.notifySummary.customerUnbound > 0 && (
                  <span className="rounded bg-white/70 px-2 py-0.5">
                    未绑定 {result.notifySummary.customerUnbound}
                  </span>
                )}
                {result.notifySummary.customerPushFailed > 0 && (
                  <span className="rounded bg-white/70 px-2 py-0.5">
                    私信失败 {result.notifySummary.customerPushFailed}
                  </span>
                )}
                {result.notifySummary.notifyDisabled > 0 && (
                  <span className="rounded bg-white/70 px-2 py-0.5">
                    通知已关 {result.notifySummary.notifyDisabled}
                  </span>
                )}
              </div>
              {(result.notifySummary.customerUnbound > 0 ||
                result.notifySummary.customerPushFailed > 0) && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] opacity-90">
                    未私信的：当面报取件码；可复制绑定引导；客户绑定后点「补发」或下方一键补发。
                  </p>
                  {result.notifySummary.customerUnbound > 0 && (
                    <button
                      type="button"
                      className="rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
                      onClick={() => {
                        void (async () => {
                          const ok = await copyText(buildBindGuideScript());
                          if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                          else notifyError('复制失败');
                        })();
                      }}
                    >
                      复制绑定话术
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {result.successes && result.successes.length > 0 && (
            <div className="mb-3 space-y-2">
              {result.successes.some(
                (s) => s.id && s.notifyEnabled && !s.customerPushed,
              ) && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-500">
                    未私信{' '}
                    {
                      result.successes.filter(
                        (s) => s.id && s.notifyEnabled && !s.customerPushed,
                      ).length
                    }{' '}
                    件（未绑定或发送失败）
                  </p>
                  <button
                    type="button"
                    disabled={bulkResending || !!rowResendingId}
                    className="rounded-md border border-primary/30 bg-orange-50 px-3 py-1.5 text-xs text-primary hover:bg-orange-100 disabled:opacity-60"
                    onClick={() => {
                      void (async () => {
                        const targets = (result.successes || []).filter(
                          (s) => s.id && s.notifyEnabled && !s.customerPushed,
                        );
                        if (targets.length === 0) return;
                        const ok = window.confirm(
                          `对 ${targets.length} 件未私信包裹尝试补发到件通知？\n\n已绑定会私信取件码；仍未绑定则保持到店查件。`,
                        );
                        if (!ok) return;
                        setBulkResending(true);
                        let pushed = 0;
                        let stillUnbound = 0;
                        let failed = 0;
                        const updates = new Map<string, (typeof targets)[0]>();
                        for (const s of targets) {
                          try {
                            const r = await inboundService.resendInboundNotice(s.id);
                            updates.set(s.id, {
                              ...s,
                              staffMessage: r.staffMessage,
                              notifyEnabled: r.enabled,
                              customerPushed: r.customerPushed,
                              customerBound: r.customerBound,
                            });
                            if (r.customerPushed) pushed += 1;
                            else if (!r.customerBound) stillUnbound += 1;
                            else failed += 1;
                          } catch {
                            failed += 1;
                          }
                        }
                        setResult((prev) => {
                          if (!prev?.successes) return prev;
                          return {
                            ...prev,
                            successes: prev.successes.map((x) => updates.get(x.id) || x),
                          };
                        });
                        setBulkResending(false);
                        notifySuccess(
                          `补发完成：已私信 ${pushed}，仍未绑定 ${stillUnbound}，失败 ${failed}`,
                        );
                      })();
                    }}
                  >
                    {bulkResending ? '批量补发中…' : '一键补发未私信'}
                  </button>
                </div>
              )}
              <div className="max-h-60 overflow-auto rounded-md border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">运单号</th>
                      <th className="px-3 py-2 text-left font-medium">取件码</th>
                      <th className="px-3 py-2 text-left font-medium">通知</th>
                      <th className="px-3 py-2 text-left font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.successes.map((s, i) => (
                      <tr key={`${s.id || s.trackingNumber}-${i}`}>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{s.trackingNumber}</td>
                        <td className="px-3 py-1.5 font-mono font-semibold text-primary">
                          {s.pickupCode || '-'}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {s.staffMessage || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {s.pickupCode && (
                              <button
                                type="button"
                                className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
                                onClick={() =>
                                  void copyText(s.pickupCode).then((ok) =>
                                    ok ? notifySuccess('取件码已复制') : notifyError('复制失败'),
                                  )
                                }
                              >
                                复制码
                              </button>
                            )}
                            {s.id && s.notifyEnabled && (
                              <button
                                type="button"
                                disabled={bulkResending || rowResendingId === s.id}
                                className="rounded border border-primary/30 px-1.5 py-0.5 text-[11px] text-primary hover:bg-orange-50 disabled:opacity-60"
                                onClick={() => {
                                  void (async () => {
                                    setRowResendingId(s.id);
                                    try {
                                      const r = await inboundService.resendInboundNotice(s.id);
                                      notifySuccess(r.staffMessage || '已尝试补发');
                                      setResult((prev) => {
                                        if (!prev?.successes) return prev;
                                        return {
                                          ...prev,
                                          successes: prev.successes.map((x) =>
                                            x.id === s.id
                                              ? {
                                                  ...x,
                                                  staffMessage: r.staffMessage,
                                                  notifyEnabled: r.enabled,
                                                  customerPushed: r.customerPushed,
                                                  customerBound: r.customerBound,
                                                }
                                              : x,
                                          ),
                                        };
                                      });
                                    } catch (e: any) {
                                      notifyError(e?.message || '补发失败');
                                    } finally {
                                      setRowResendingId(null);
                                    }
                                  })();
                                }}
                              >
                                {rowResendingId === s.id ? '…' : s.customerPushed ? '再发' : '补发'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="max-h-60 overflow-auto rounded-md border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">行号</th>
                    <th className="px-3 py-2 text-left font-medium">错误</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-gray-600">{e.index + 1}</td>
                      <td className="px-3 py-1.5 text-danger">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Inbound;
