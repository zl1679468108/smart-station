import React, { useEffect, useState } from 'react';
import * as adminService from '@/services/admin';
import { buildBindGuideScript, buildBindShareScript } from '@/utils/staffScripts';
import { getQueryPortalUrl } from '@/utils/queryPortal';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';
import { useAuth } from '@/utils/auth';

type HintState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'bound'; channels: string[] }
  | { kind: 'unbound' }
  | { kind: 'error' };

/**
 * 入库页：手机号填齐后预检是否已绑定微信通知（白话提示）
 * 未绑定时高亮，并提供一键复制绑定话术 / 查件链接。
 */
const NotifyBindHint: React.FC<{ phone: string }> = ({ phone }) => {
  const { stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '本驿站';
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
    <div className="mt-1.5 rounded-md border-2 border-orange-300 bg-orange-50 px-2.5 py-2 text-[11px] text-orange-950 shadow-sm">
      <p className="font-semibold">未绑定 · 入库后收不到微信私信</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed opacity-95">
        <li>入库后请当面报取件码</li>
        <li>把查件绑定链接发给客户（一对一）</li>
        <li>客户绑定后在库件会自动补发取件码</li>
      </ol>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="min-h-[36px] rounded-md bg-orange-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-700"
          onClick={() => {
            void (async () => {
              const ok = await copyText(buildBindShareScript({ stationName }));
              if (ok) notifySuccess('已复制绑定话术+查件链接（可发客户，不含取件码）');
              else notifyError('复制失败');
            })();
          }}
        >
          复制绑定链接话术
        </button>
        <button
          type="button"
          className="min-h-[36px] rounded-md border border-orange-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-orange-900 hover:bg-orange-100"
          onClick={() => {
            void (async () => {
              const url = getQueryPortalUrl();
              if (!url) {
                notifyError('暂无法生成链接，请配置 VITE_PUBLIC_QUERY_URL 或在浏览器中打开本系统');
                return;
              }
              const ok = await copyText(url);
              if (ok) notifySuccess('已复制查件绑定链接');
              else notifyError('复制失败');
            })();
          }}
        >
          仅复制链接
        </button>
        <button
          type="button"
          className="min-h-[36px] rounded-md border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] text-orange-900 hover:bg-orange-100"
          onClick={() => {
            void (async () => {
              const ok = await copyText(buildBindGuideScript({ stationName }));
              if (ok) notifySuccess('已复制短话术（含链接，不含取件码）');
              else notifyError('复制失败');
            })();
          }}
        >
          复制短话术
        </button>
      </div>
    </div>
  );
};

export default NotifyBindHint;
