import React, { useState, useRef, useEffect } from 'react';
import * as inboundService from '@/services/inbound';
import { useCouriers, useInvalidateShelves, useShelves } from '@/hooks/useDictionary';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import { useInvalidateInventoryList } from '@/hooks/useInventoryData';
import type { BatchNotifySummary, InboundResult, ParcelSize, WaybillOcrResult } from '@/types/inbound';
import type { Shelf } from '@/types/admin';
import Icon from '@/components/ui/Icon';
import PageHeader from '@/components/ui/PageHeader';
import WaybillOcrUploader from '@/components/ui/WaybillOcrUploader';

type Mode = 'scan' | 'manual' | 'batch';

const SIZE_LABEL: Record<ParcelSize, string> = { small: '小件', medium: '中件', large: '大件' };
const SIZE_ORDER: ParcelSize[] = ['small', 'medium', 'large'];

/** 手机号脱敏展示（连续同收件人提示用） */
function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  return phone || '';
}

// 入库管理页：扫码入库（主）/ 手动录入 / 批量导入（入口）
const Inbound: React.FC = () => {
  const [mode, setMode] = useState<Mode>('scan');
  // 货架列表走 React Query 缓存（staleTime: Infinity），跨页面共享
  const { data: shelves = [] } = useShelves();

  return (
    <div className="w-full">
      <PageHeader title="入库管理" className="mb-4" />

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
const InboundSuccess: React.FC<{ result: InboundResult }> = ({ result }) => {
  const n = result.notify;
  const notifyTone = !n
    ? 'border-gray-200 bg-gray-50 text-gray-600'
    : !n.enabled
      ? 'border-gray-200 bg-gray-50 text-gray-600'
      : n.customerPushed
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : n.customerBound
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-orange-200 bg-orange-50 text-orange-800';

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
          <p className="font-medium">通知状态</p>
          <p className="mt-1">{n.staffMessage}</p>
          {!n.customerBound && n.enabled && (
            <p className="mt-1 text-[11px] opacity-90">
              可提醒客户打开查件页绑定微信通知，下次到件自动收码。
            </p>
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
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [size, setSize] = useState<ParcelSize>('small');
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
      setError(err instanceof Error ? err.message : '入库失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <WaybillOcrUploader disabled={submitting} onResult={handleOcrResult} />
        <div>
          <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>运单号（扫码）</label>
          <input
            ref={inputRef}
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="扫描或输入运单号"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            disabled={submitting}
          />
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
        {keepRecipient && recipientName && recipientPhone && (
          <p className="text-[11px] text-emerald-700">
            下一件将继续给：{recipientName} · {maskPhone(recipientPhone)}
          </p>
        )}
        <SizeSelector value={size} onChange={setSize} disabled={submitting} shelves={shelves} />
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
          disabled={submitting}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '入库中...' : '确认入库'}
        </button>
        <p className="text-center text-xs text-gray-400">快递公司自动识别，货架按包裹大小自动分配</p>
      </form>

      {result && <InboundSuccess result={result} />}

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
                  <div className="text-right">
                    <div className="text-gray-700">
                      {r.shelfNumber}-{r.shelfLayer}-{String(r.shelfPosition).padStart(4, '0')}
                    </div>
                    <div className={tipClass}>{tip}</div>
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
    size: 'small' as ParcelSize,
    shelfId: '',
    note: '',
    freightCollectAmount: '',
    codAmount: '',
  });
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={submitting}
            />
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
          onChange={(v) => setForm({ ...form, size: v, shelfId: '' })}
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
          disabled={submitting}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '入库中...' : '确认入库'}
        </button>
      </form>

      {result && <InboundSuccess result={result} />}
    </div>
  );
};

// ============ 批量导入（CSV 粘贴） ============
const BatchInbound: React.FC<{ shelves: Shelf[] }> = ({ shelves }) => {
  const invalidateShelves = useInvalidateShelves();
  const invalidateDashboard = useInvalidateDashboard();
  const invalidateInventoryList = useInvalidateInventoryList();
  const [csvText, setCsvText] = useState('');
  const [defaultSize, setDefaultSize] = useState<ParcelSize>('small');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    succeeded: number;
    failed: number;
    total: number;
    errors: Array<{ index: number; error: string }>;
    notifySummary?: BatchNotifySummary;
    successes?: Array<{
      trackingNumber: string;
      pickupCode: string;
      recipientPhone?: string;
      staffMessage?: string;
    }>;
  } | null>(null);

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
      return;
    }

    setSubmitting(true);
    try {
      const res = await inboundService.batchInbound(items);
      setResult({
        total: res.total,
        succeeded: res.succeeded,
        failed: res.failed + parseErrors.length,
        errors: [...parseErrors, ...res.errors.map((e) => ({ index: e.index, error: e.error }))],
        notifySummary: res.notifySummary,
        successes: (res.results || []).map((row) => ({
          trackingNumber: row.result?.trackingNumber || '',
          pickupCode: row.result?.pickupCode || '',
          recipientPhone: row.result?.recipientPhone,
          staffMessage: row.result?.notify?.staffMessage,
        })),
      });
      if (res.succeeded > 0) {
        setCsvText('');
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
          <SizeSelector value={defaultSize} onChange={setDefaultSize} disabled={submitting} shelves={shelves} />
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          placeholder={'SF1234567890,张三,13800001234,易碎品\nZTO9876543210,李四,13900005678'}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          disabled={submitting}
        />
        {error && <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={submitting || !csvText.trim()}
          className="mt-3 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '导入中...' : '开始导入'}
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
                <p className="mt-2 text-[11px] opacity-90">
                  未收到私信的客户可到店查件；绑定微信后可在「系统管理 → 通知记录」里重发。
                </p>
              )}
            </div>
          )}
          {result.successes && result.successes.length > 0 && (
            <div className="mb-3 max-h-60 overflow-auto rounded-md border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">运单号</th>
                    <th className="px-3 py-2 text-left font-medium">取件码</th>
                    <th className="px-3 py-2 text-left font-medium">通知</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.successes.map((s, i) => (
                    <tr key={`${s.trackingNumber}-${i}`}>
                      <td className="px-3 py-1.5 font-mono text-gray-700">{s.trackingNumber}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold text-primary">
                        {s.pickupCode || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">
                        {s.staffMessage || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
