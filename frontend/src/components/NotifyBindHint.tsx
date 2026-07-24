import React, { useEffect, useState } from 'react';
import * as adminService from '@/services/admin';

type HintState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'bound'; channels: string[] }
  | { kind: 'unbound' }
  | { kind: 'error' };

/**
 * 入库页：手机号填齐后预检是否已绑定微信通知（白话提示）
 */
const NotifyBindHint: React.FC<{ phone: string }> = ({ phone }) => {
  const [state, setState] = useState<HintState>({ kind: 'idle' });

  useEffect(() => {
    const p = (phone || '').replace(/\D/g, '');
    if (!/^1\d{10}$/.test(p)) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await adminService.listNotifyBindings({ limit: 10, phone: p });
          if (cancelled) return;
          const active = (res.items || []).filter((i) => i.status === 'active');
          if (active.length === 0) {
            setState({ kind: 'unbound' });
            return;
          }
          const channels = [
            ...new Set(
              active.map((i) => i.channelLabel || i.channel).filter(Boolean) as string[],
            ),
          ];
          setState({ kind: 'bound', channels });
        } catch {
          if (!cancelled) setState({ kind: 'error' });
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phone]);

  if (state.kind === 'idle') return null;

  if (state.kind === 'loading') {
    return <p className="mt-1 text-[11px] text-gray-400">正在查询通知绑定…</p>;
  }
  if (state.kind === 'error') {
    return <p className="mt-1 text-[11px] text-gray-400">绑定状态暂不可查（不影响入库）</p>;
  }
  if (state.kind === 'bound') {
    return (
      <p className="mt-1 text-[11px] text-emerald-700">
        已绑定通知
        {state.channels.length ? `（${state.channels.join('、')}）` : ''}
        ，入库后可私信取件码
      </p>
    );
  }
  return (
    <p className="mt-1 text-[11px] text-orange-700">
      未绑定微信通知：入库后客户收不到私信，可提醒到店查件或扫码绑定后再补发
    </p>
  );
};

export default NotifyBindHint;
