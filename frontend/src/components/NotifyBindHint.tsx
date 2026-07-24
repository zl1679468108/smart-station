import React, { useEffect, useState } from 'react';
import * as adminService from '@/services/admin';
import { buildBindGuideScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';

type HintState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'bound'; channels: string[] }
  | { kind: 'unbound' }
  | { kind: 'error' };

/**
 * 入库页：手机号填齐后预检是否已绑定微信通知（白话提示）
 * 未绑定时高亮，并提供一键复制绑定话术。
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
      <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
        <p className="font-medium">已绑定通知，入库后可私信取件码</p>
        {state.channels.length > 0 && (
          <p className="mt-0.5 opacity-90">通道：{state.channels.join('、')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-[11px] text-orange-900">
      <p className="font-medium">未绑定微信通知</p>
      <p className="mt-0.5 leading-relaxed opacity-90">
        入库后客户收不到取件码私信。请当面报码，或复制话术引导绑定后再补发。
      </p>
      <button
        type="button"
        className="mt-1.5 rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-100"
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
    </div>
  );
};

export default NotifyBindHint;
