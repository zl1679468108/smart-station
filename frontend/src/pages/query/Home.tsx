import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as kioskService from '@/services/kiosk';
import { useKioskLayout } from '@/hooks/useKioskLayout';
import type {
  KioskParcelItem,
  KioskShelf,
  StationLayoutConfig,
  NotifyBindStatusResult,
} from '@/types/kiosk';
import Icon from '@/components/ui/Icon';
import Logo from '@/components/brand/Logo';
import EmptyState from '@/components/ui/EmptyState';
import Keypad from '@/components/ui/Keypad';
import {
  parseShelfNumberFromCode,
  parseLayerFromCode,
  getZoneLetter,
} from '@/components/warehouse3d';
import { formatBeijingTimestamp } from '@/utils/date';
import NotifyBindCard from '@/components/NotifyBindCard';
import StationVisitCard from '@/components/StationVisitCard';
import PickupAppointmentCard from '@/components/PickupAppointmentCard';
import { useQueryDevice } from '@/hooks/useQueryDevice';
import { isNativeEditableTarget } from '@/utils/keypadTarget';

const Warehouse3D = React.lazy(() => import('@/components/warehouse3d'));

type QueryTab = 'phone' | 'tracking' | 'code';

// 用户自助查询门户：无登录，三种查询方式；portal/kiosk 常驻虚拟键盘，h5 用原生键盘
const Home: React.FC = () => {
  const device = useQueryDevice();
  const useNativeInput = device === 'h5';
  const [tab, setTab] = useState<QueryTab>('phone');
  const [items, setItems] = useState<KioskParcelItem[] | null>(null);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  /** 最近一次手机号查询（用于绑定转化引导） */
  const [lastQueryPhone, setLastQueryPhone] = useState<string | null>(null);
  /** 强制展开顶部绑定卡片 */
  const [bindForceOpen, setBindForceOpen] = useState(false);
  const [bindStatus, setBindStatus] = useState<NotifyBindStatusResult | null>(null);

  // 货架布局数据 + 驿站信息走缓存；失败不阻塞查询主流程。
  const { data: layoutData, isLoading: layoutLoading } = useKioskLayout();
  const shelves = layoutData?.shelves || [];
  const layoutConfig = layoutData?.station?.layoutConfig || null;
  const stationInfo = layoutData?.station
    ? {
        name: layoutData.station.name ?? null,
        address: layoutData.station.address ?? null,
        contactPhone: layoutData.station.contactPhone ?? null,
        businessHours: layoutData.station.businessHours ?? null,
      }
    : null;

  // 超时清空
  useEffect(() => {
    const handleTimeout = () => {
      setItems(null);
      setTab('phone');
      setLastQueryPhone(null);
      setBindStatus(null);
      setBindForceOpen(false);
      setToast({ type: 'success', msg: '长时间未操作，已清空查询结果' });
      setTimeout(() => setToast(null), 2000);
    };
    window.addEventListener('query-idle-timeout', handleTimeout);
    return () => window.removeEventListener('query-idle-timeout', handleTimeout);
  }, []);

  const showToast = (type: 'error' | 'success', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  };

  const refreshBindStatus = async (phone: string | null) => {
    if (!phone || !/^1\d{10}$/.test(phone)) {
      setBindStatus(null);
      return;
    }
    try {
      const st = await kioskService.getNotifyBindStatus(phone);
      setBindStatus(st);
    } catch {
      setBindStatus(null);
    }
  };

  const handleResult = (res: { items?: KioskParcelItem[] }, meta?: { phone?: string }) => {
    setItems(res.items || []);
    const phone = meta?.phone || null;
    setLastQueryPhone(phone);
    void refreshBindStatus(phone);
  };

  const switchTab = (t: QueryTab) => {
    setTab(t);
    setItems(null);
    setLastQueryPhone(null);
    setBindStatus(null);
    setBindForceOpen(false);
  };

  const openBindPanel = () => {
    setBindForceOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部品牌栏 + 驿站信息（参考 admin 左上角简洁样式：图标 + 驿站名） */}
      <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={28} className="shrink-0" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold text-gray-900 sm:text-lg">
              {stationInfo?.name || '智能快递驿站'}
            </span>
            <span className="truncate text-xs text-gray-500">
              智能快递驿站
              {stationInfo?.businessHours ? ` · ${stationInfo.businessHours}` : ''}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg bg-gray-100 p-1">
          {([
            { key: 'phone', label: '手机号' },
            { key: 'tracking', label: '运单号' },
            { key: 'code', label: '取件码' },
          ] as { key: QueryTab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`min-h-[44px] rounded-md px-2 py-2 text-sm transition-colors sm:px-4 ${
                tab === t.key
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* 到店导航 + 营业状态（白话对客） */}
      <StationVisitCard
        name={stationInfo?.name}
        address={stationInfo?.address}
        contactPhone={stationInfo?.contactPhone}
        businessHours={stationInfo?.businessHours}
      />

      {/* 通知绑定公示 */}
      <div className="border-b border-gray-100 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <NotifyBindCard
          guide={layoutData?.station?.notifyGuide}
          stationName={stationInfo?.name}
          compact
          initialPhone={lastQueryPhone || undefined}
          forceOpen={bindForceOpen}
          onBound={() => {
            setBindForceOpen(false);
            void refreshBindStatus(lastQueryPhone);
          }}
        />
      </div>

      {/* 主区域：PC 左右双栏，平板/H5 上下 */}
      <main className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* 左侧/上部：输入区 + 结果 */}
        <div className="page-layout-main flex-1 overflow-auto lg:order-1">
          <div className="mx-auto max-w-2xl">
            {tab === 'phone' && (
              <PhoneQueryView
                onSubmit={handleResult}
                showToast={showToast}
                useNativeInput={useNativeInput}
              />
            )}
            {tab === 'tracking' && (
              <TrackingQueryView
                onSubmit={handleResult}
                showToast={showToast}
                useNativeInput={useNativeInput}
              />
            )}
            {tab === 'code' && (
              <CodeQueryView
                onSubmit={handleResult}
                showToast={showToast}
                useNativeInput={useNativeInput}
              />
            )}

            {/* 预约到店（B6） */}
            <div className="mt-4">
              <PickupAppointmentCard defaultPhone={lastQueryPhone} />
            </div>

            {/* 查询结果 */}
            {items !== null && (
              <ResultView
                items={items}
                shelves={shelves}
                layoutConfig={layoutConfig}
                layoutLoading={layoutLoading}
                lastQueryPhone={lastQueryPhone}
                bindStatus={bindStatus}
                bindEnabled={layoutData?.station?.notifyGuide?.bindEnabled !== false}
                onBindClick={openBindPanel}
              />
            )}
          </div>
        </div>

        {/* 右侧/下部：虚拟键盘（h5 远端模式隐藏，改用系统键盘） */}
        {!useNativeInput && (
          <div className="page-layout-main border-t border-gray-200 bg-white lg:order-2 lg:w-[420px] lg:border-l lg:border-t-0">
            <KeypadPanel tab={tab} />
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
          <div
            className={`rounded-lg px-5 py-2.5 text-sm shadow-lg ${
              toast.type === 'error' ? 'bg-danger text-white' : 'bg-success text-white'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ 虚拟键盘面板 ============
const KeypadPanel: React.FC<{ tab: QueryTab }> = ({ tab }) => {
  // 优先写入当前原生可编辑框（通知绑定）；否则分发给查询表单监听
  const dispatchKey = (type: string, payload?: string) => {
    const active = document.activeElement;
    if (isNativeEditableTarget(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      const el = active;
      const maxLen = el.maxLength > 0 ? el.maxLength : Number.POSITIVE_INFINITY;
      let next = el.value;
      const start = el.selectionStart ?? next.length;
      const end = el.selectionEnd ?? next.length;

      if (type === 'input' && payload) {
        next = `${next.slice(0, start)}${payload}${next.slice(end)}`;
        if (next.length > maxLen) next = next.slice(0, maxLen);
      } else if (type === 'backspace') {
        next = start !== end ? `${next.slice(0, start)}${next.slice(end)}` : `${next.slice(0, Math.max(start - 1, 0))}${next.slice(start)}`;
      } else if (type === 'clear') {
        next = '';
      } else {
        return;
      }

      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (type === 'input' && payload) {
        const caret = Math.min(start + payload.length, next.length);
        try { el.setSelectionRange(caret, caret); } catch { /* ignore */ }
      } else if (type === 'backspace') {
        const caret = start !== end ? start : Math.max(start - 1, 0);
        try { el.setSelectionRange(caret, caret); } catch { /* ignore */ }
      } else if (type === 'clear') {
        try { el.setSelectionRange(0, 0); } catch { /* ignore */ }
      }
      return;
    }

    window.dispatchEvent(new CustomEvent('keypad-input', { detail: { type, payload } }));
  };

  const allowSwitch = tab === 'tracking';
  const enableDash = tab === 'code';

  return (
    <div className="mx-auto max-w-sm">
      {enableDash && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => dispatchKey('clear')}
            className="min-h-[44px] rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-600 hover:bg-gray-200"
          >
            清空
          </button>
        </div>
      )}
      <Keypad
        key={tab}
        mode="numeric"
        allowModeSwitch={allowSwitch}
        enableDash={enableDash}
        onInput={(char) => dispatchKey('input', char)}
        onBackspace={() => dispatchKey('backspace')}
        onClear={() => dispatchKey('clear')}
      />
    </div>
  );
};

// ============ 手机号查询（直接查询，无需验证码） ============
const PhoneQueryView: React.FC<{
  onSubmit: (res: { items?: KioskParcelItem[] }, meta?: { phone?: string }) => void;
  showToast: (type: 'error' | 'success', msg: string) => void;
  useNativeInput?: boolean;
}> = ({ onSubmit, showToast, useNativeInput = false }) => {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  // 监听虚拟键盘输入
  useEffect(() => {
    const handler = (e: Event) => {
      // 焦点在其它原生可编辑输入（如通知绑定手机号/验证码）时，不写入查询框
      if (isNativeEditableTarget(document.activeElement)) return;

      const detail = (e as CustomEvent).detail;
      if (detail.type === 'input' && /^\d$/.test(detail.payload)) {
        setPhone((v) => (v.length < 11 ? v + detail.payload : v));
      } else if (detail.type === 'backspace') {
        setPhone((v) => v.slice(0, -1));
      } else if (detail.type === 'clear') {
        setPhone('');
      }
    };
    window.addEventListener('keypad-input', handler);
    return () => window.removeEventListener('keypad-input', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^1\d{10}$/.test(phone)) {
      showToast('error', '请输入正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    try {
      const res = await kioskService.queryByPhoneDirect(phone);
      onSubmit(res, { phone });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '查询失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-800">手机号查询</h2>
        <p className="mt-1 text-xs text-gray-500">输入完整手机号查询名下包裹</p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>手机号</label>
        <input
          ref={phoneRef}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="11 位手机号"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none focus:border-primary"
          readOnly={!useNativeInput}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary py-3 text-base font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 运单号查询 ============
const TrackingQueryView: React.FC<{
  onSubmit: (res: { items?: KioskParcelItem[] }) => void;
  showToast: (type: 'error' | 'success', msg: string) => void;
  useNativeInput?: boolean;
}> = ({ onSubmit, showToast, useNativeInput = false }) => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 监听虚拟键盘输入（字母+数字）
  useEffect(() => {
    const handler = (e: Event) => {
      // 焦点在其它原生可编辑输入（如通知绑定手机号/验证码）时，不写入查询框
      if (isNativeEditableTarget(document.activeElement)) return;

      const detail = (e as CustomEvent).detail;
      if (detail.type === 'input' && /^[A-Z0-9]$/i.test(detail.payload)) {
        setTrackingNumber((v) => (v.length < 24 ? v + detail.payload.toUpperCase() : v));
      } else if (detail.type === 'backspace') {
        setTrackingNumber((v) => v.slice(0, -1));
      } else if (detail.type === 'clear') {
        setTrackingNumber('');
      }
    };
    window.addEventListener('keypad-input', handler);
    return () => window.removeEventListener('keypad-input', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!trackingNumber.trim()) {
      showToast('error', '请输入运单号');
      return;
    }
    setSubmitting(true);
    try {
      const res = await kioskService.queryByTracking(trackingNumber.trim());
      onSubmit(res);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '查询失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-800">运单号查询</h2>
        <p className="mt-1 text-xs text-gray-500">输入运单号查询包裹状态</p>
      </div>
      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>运单号</label>
        <input
          ref={inputRef}
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value.toUpperCase())}
          placeholder="请输入运单号"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base outline-none focus:border-primary"
          readOnly={!useNativeInput}
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary py-3 text-base font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 取件码查询 ============
const CodeQueryView: React.FC<{
  onSubmit: (res: { items?: KioskParcelItem[] }) => void;
  showToast: (type: 'error' | 'success', msg: string) => void;
  useNativeInput?: boolean;
}> = ({ onSubmit, showToast, useNativeInput = false }) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 监听虚拟键盘输入（数字 + 横杠）
  useEffect(() => {
    const handler = (e: Event) => {
      // 焦点在其它原生可编辑输入（如通知绑定手机号/验证码）时，不写入查询框
      if (isNativeEditableTarget(document.activeElement)) return;

      const detail = (e as CustomEvent).detail;
      if (detail.type === 'input') {
        const ch = detail.payload as string;
        if (/^[\d-]$/.test(ch)) {
          setCode((v) => (v.length < 13 ? v + ch : v));
        }
      } else if (detail.type === 'backspace') {
        setCode((v) => v.slice(0, -1));
      } else if (detail.type === 'clear') {
        setCode('');
      }
    };
    window.addEventListener('keypad-input', handler);
    return () => window.removeEventListener('keypad-input', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^\d{1,3}-\d{1,2}-\d{1,6}$/.test(code)) {
      showToast('error', '取件码格式不正确，如 3-2-9903');
      return;
    }
    setSubmitting(true);
    try {
      const res = await kioskService.queryByCode(code);
      onSubmit(res);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '查询失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="text-center">
        <h2 className="text-lg font-bold text-gray-800">取件码查询</h2>
        <p className="mt-1 text-xs text-gray-500">输入取件码查询包裹位置</p>
      </div>
      <div>
        <label className="mb-1 block text-sm text-gray-600"><span className="mr-0.5 text-danger">*</span>取件码</label>
        <input
          ref={inputRef}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="如 3-2-9903"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-mono tracking-wider outline-none focus:border-primary"
          readOnly={!useNativeInput}
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary py-3 text-base font-medium text-white hover:bg-primaryHover disabled:opacity-60"
      >
        {submitting ? '查询中...' : '查询包裹'}
      </button>
    </form>
  );
};

// ============ 查询结果展示 ============
const ResultView: React.FC<{
  items: KioskParcelItem[];
  shelves: KioskShelf[];
  layoutConfig: StationLayoutConfig | null;
  layoutLoading: boolean;
  lastQueryPhone?: string | null;
  bindStatus?: NotifyBindStatusResult | null;
  bindEnabled?: boolean;
  onBindClick?: () => void;
}> = ({
  items,
  shelves,
  layoutConfig,
  layoutLoading,
  lastQueryPhone,
  bindStatus,
  bindEnabled = true,
  onBindClick,
}) => {
  // 提取所有需高亮的「货架号 + 层号 + 包裹数」（按货架号去重，统计每个货架的包裹数）
  const highlights = useMemo(() => {
    const map = new Map<number, { layer: number | null; count: number }>();
    for (const it of items) {
      const num = parseShelfNumberFromCode(it.pickupCode);
      if (num === null) continue;
      if (!map.has(num)) {
        map.set(num, { layer: parseLayerFromCode(it.pickupCode), count: 1 });
      } else {
        const existing = map.get(num)!;
        existing.count += 1;
      }
    }
    return Array.from(map.entries()).map(([shelfNumber, info]) => ({
      shelfNumber,
      layer: info.layer,
      count: info.count,
    }));
  }, [items]);

  const showBindCta = bindEnabled && !bindStatus?.bound;
  const phoneHint = lastQueryPhone
    ? `手机号 ${lastQueryPhone.slice(0, 3)}****${lastQueryPhone.slice(-4)}`
    : '本机收件手机号';

  if (items.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <EmptyState
          title="未查询到在库包裹"
          description="可能已出库或尚未到达。也可到店向工作人员查询货架。"
          iconClassName="text-gray-300"
        />
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs leading-relaxed text-gray-600 shadow-sm">
          <p className="font-medium text-gray-800">还没查到包裹？</p>
          <p className="mt-1">
            可能还没到，或已经取走。也可以到店让店员帮你查。
            没绑定微信时，<strong className="text-gray-700">不会发到你手机微信</strong>，
            群里也<strong className="text-gray-700">不会公开取件码</strong>。
          </p>
          {showBindCta && (
            <button
              type="button"
              onClick={onBindClick}
              className="mt-3 min-h-[44px] w-full rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primaryHover"
            >
              扫一扫，有件自动收码
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="text-center">
        <h3 className="text-base font-bold text-gray-800">找到 {items.length} 个包裹</h3>
        <p className="text-xs text-gray-500">请凭取件码到对应货架取件 · 也可到店请工作人员协助</p>
      </div>

      {/* 绑定转化 / 未绑定兜底 */}
      {bindStatus?.bound ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          已开通微信收码：下次有件会直接发到你微信，不用反复查。
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary/30 bg-orange-50 px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">扫一扫，有件自动收码</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            {lastQueryPhone ? `当前查询 ${phoneHint}。` : ''}
            先记下下方取件码到店取件。再花 1 分钟绑定：下次包裹到了，微信直接告诉你取件码。
            <span className="text-gray-500">（群里不会公开你的码）</span>
          </p>
          {showBindCta && (
            <button
              type="button"
              onClick={onBindClick}
              className="mt-3 min-h-[48px] w-full rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primaryHover sm:w-auto sm:min-w-[200px] sm:px-5"
            >
              现在绑定（约 1 分钟）
            </button>
          )}
        </div>
      )}

      {/* 3D 货架平面图（有高亮货架且布局数据就绪时展示） */}
      {highlights.length > 0 && shelves.length > 0 && (
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-1">
            <h4 className="text-sm font-semibold text-gray-700">货架位置 3D 视图</h4>
            <span className="text-xs text-gray-400">点击地面可漫游，橙色为包裹货架</span>
          </div>
          <React.Suspense
            fallback={
              <div className="flex h-[360px] items-center justify-center text-sm text-gray-400">
                正在加载 3D 视图...
              </div>
            }
          >
            <Warehouse3D
              variant="guide"
              shelves={shelves}
              layoutConfig={layoutConfig}
              layoutLoading={layoutLoading}
              highlights={highlights}
              height={360}
            />
          </React.Suspense>
        </div>
      )}

      {items.map((item) => {
        const shelfNum = parseShelfNumberFromCode(item.pickupCode);
        const layerNum = parseLayerFromCode(item.pickupCode);
        const zoneLetter = shelfNum !== null ? getZoneLetter(shelfNum, shelves) : null;
        return (
          <div key={item.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">取件码</span>
                <span className="font-mono text-2xl font-bold tracking-widest text-primary">
                  {item.pickupCode || '-'}
                </span>
                {item.status === 'overdue' && (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                    即将超期，请尽快取件
                  </span>
                )}
              </div>
              {/* 取件文字指引：请前往 A 区 X 号货架（第 Y 层） */}
              {shelfNum !== null && (
                <div className="rounded-lg bg-primaryLight px-3 py-1.5 text-xs text-primary">
                  <span className="font-medium">
                    请前往 {zoneLetter ? `${zoneLetter} 区 ` : ''}{shelfNum} 号货架
                    {layerNum !== null ? `（第 ${layerNum} 层）` : ''}取件
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="text-gray-600">
                  运单号：<span className="font-medium text-gray-800">{item.trackingNumber}</span>
                </span>
                <span className="text-gray-600">
                  快递：<span className="text-gray-800">{item.courierName || '-'}</span>
                </span>
              </div>
              <div className="flex gap-x-4 text-sm">
                <span className="text-gray-600">
                  收件人：<span className="text-gray-800">{item.recipientName}</span>
                </span>
                <span className="text-gray-400">{item.recipientPhoneTail}</span>
              </div>
              <div className="text-xs text-gray-400">
                入库：{formatBeijingTimestamp(item.inboundAt)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Home;
