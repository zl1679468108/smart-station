import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as adminService from '@/services/admin';
import { buildBindGuideScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';

export type OutboundBindState = 'loading' | 'bound' | 'unbound' | 'unknown';

async function resolveBindState(phone?: string | null): Promise<OutboundBindState> {
  const p = String(phone || '').replace(/\D/g, '');
  if (!/^1\d{10}$/.test(p)) return 'unknown';
  try {
    const res = await adminService.listNotifyBindings({ limit: 8, phone: p });
    const active = (res.items || []).some((i) => i.status === 'active');
    return active ? 'bound' : 'unbound';
  } catch {
    return 'unknown';
  }
}

/**
 * 出库成功后绑定引导（取件高峰转化）
 * - 已绑定：轻提示下次自动收码
 * - 未绑定：强引导复制话术 + 深链通知
 */
const OutboundBindNudge: React.FC<{
  phone?: string | null;
  /** admin 白底绿卡 / scan 深色成功页 */
  variant?: 'admin' | 'scan';
  /** 绑定状态变化（扫描机可据此延长停留） */
  onStateChange?: (state: OutboundBindState) => void;
  className?: string;
}> = ({ phone, variant = 'admin', onStateChange, className = '' }) => {
  const navigate = useNavigate();
  const [state, setState] = useState<OutboundBindState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void (async () => {
      const next = await resolveBindState(phone);
      if (cancelled) return;
      setState(next);
      onStateChange?.(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [phone, onStateChange]);

  const onCopyBind = async () => {
    const ok = await copyText(buildBindGuideScript());
    if (ok) notifySuccess('已复制绑定引导（不含取件码，可发客户）');
    else notifyError('复制失败');
  };

  const phoneDigits = String(phone || '').replace(/\D/g, '').slice(0, 11);

  if (variant === 'scan') {
    if (state === 'loading') {
      return (
        <div className={`mt-4 w-full max-w-sm rounded-lg border border-white/20 bg-black/15 px-4 py-3 text-left text-xs text-white/80 ${className}`}>
          正在查看客户是否已绑定微信收码…
        </div>
      );
    }
    if (state === 'bound') {
      return (
        <div className={`mt-4 w-full max-w-sm rounded-lg border border-white/25 bg-black/20 px-4 py-3 text-left text-xs text-white/90 ${className}`}>
          <p className="font-medium text-white">客户已绑定微信收码</p>
          <p className="mt-1 text-white/75">下次到件会微信提醒，可少说一句绑定话术。</p>
        </div>
      );
    }
    return (
      <div className={`mt-4 w-full max-w-sm rounded-lg border border-amber-200/40 bg-black/25 px-4 py-3 text-left text-xs leading-relaxed text-white/95 ${className}`}>
        <p className="font-semibold text-white">
          {state === 'unbound' ? '客户未绑定 · 取件时顺带引导' : '取件时顺带引导绑定'}
        </p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-white/80">
          <li>当面说：下次到件可微信自动收码</li>
          <li>发绑定话术（不含取件码）</li>
          <li>客户查件页扫一扫即可</li>
        </ol>
        <button
          type="button"
          onClick={() => void onCopyBind()}
          className="mt-3 min-h-[48px] w-full rounded-md bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-white/90"
        >
          复制绑定话术（推荐）
        </button>
      </div>
    );
  }

  // admin
  if (state === 'loading') {
    return (
      <p className={`mt-2 text-[11px] text-emerald-900/60 ${className}`}>
        正在查看是否已绑定微信收码…
      </p>
    );
  }

  if (state === 'bound') {
    return (
      <div className={`mt-2 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-2 text-[11px] text-emerald-900 ${className}`}>
        <p className="font-medium">客户已绑定微信收码</p>
        <p className="mt-0.5 opacity-80">下次到件会微信提醒，可少说一句绑定话术。</p>
      </div>
    );
  }

  return (
    <div
      className={`mt-2 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-[11px] text-orange-950 ${className}`}
    >
      <p className="font-semibold">
        {state === 'unbound' ? '客户未绑定 · 取件高峰正好引导' : '取件时顺带引导绑定'}
      </p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed opacity-95">
        <li>当面说：下次到件可微信自动收码</li>
        <li>复制绑定话术发给客户（不含取件码）</li>
        <li>客户打开查件页扫一扫完成绑定</li>
      </ol>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void onCopyBind()}
          className="min-h-[36px] rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-700"
        >
          复制绑定话术
        </button>
        {phoneDigits && (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/admin/system?tab=notify&phone=${encodeURIComponent(phoneDigits)}&view=byPhone`,
              )
            }
            className="min-h-[36px] rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-900 hover:bg-orange-100"
          >
            按手机号看通知
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            navigate('/admin/system?tab=notify&filter=unbound&view=byPhone&days=3')
          }
          className="min-h-[36px] rounded-md border border-orange-200 bg-white px-2.5 py-1 text-[11px] font-medium text-orange-900 hover:bg-orange-100"
        >
          近3日未绑定
        </button>
      </div>
    </div>
  );
};

export default OutboundBindNudge;
