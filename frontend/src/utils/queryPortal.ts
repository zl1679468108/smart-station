/**
 * 查件门户链接（店员分享给客户绑定用）
 * - 优先 VITE_PUBLIC_QUERY_URL（生产完整 H5 地址）
 * - 否则用当前站点 Hash 路由 /#/query?device=h5
 * - 自动附带 stationId（当前登录驿站 / 显式传入），避免多站串站
 */

import { getStationId } from '@/services/api';

function appendQueryParams(url: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => Boolean(v && String(v).trim()));
  if (entries.length === 0) return url;

  // 支持带 hash 的完整地址：https://x.com/app/#/query?device=h5
  const hashIdx = url.indexOf('#');
  if (hashIdx >= 0) {
    const before = url.slice(0, hashIdx);
    const hash = url.slice(hashIdx + 1); // /query?device=h5 或 /query
    const qIdx = hash.indexOf('?');
    const path = qIdx >= 0 ? hash.slice(0, qIdx) : hash;
    const search = qIdx >= 0 ? hash.slice(qIdx + 1) : '';
    const sp = new URLSearchParams(search);
    for (const [k, v] of entries) {
      if (!sp.get(k)) sp.set(k, v);
    }
    const qs = sp.toString();
    return `${before}#${path}${qs ? `?${qs}` : ''}`;
  }

  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    for (const [k, v] of entries) {
      if (!u.searchParams.get(k)) u.searchParams.set(k, v);
    }
    // 若原 url 是相对路径，尽量保留原形态
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url)) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    return u.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `${url}${join}${qs}`;
  }
}

export function getQueryPortalUrl(opts?: {
  device?: 'h5' | 'kiosk';
  stationId?: string | null;
}): string {
  const device = opts?.device || 'h5';
  const stationId = String(opts?.stationId ?? getStationId() ?? '').trim();
  const extra: Record<string, string> = { device };
  if (stationId) extra.stationId = stationId;

  const env = String(import.meta.env.VITE_PUBLIC_QUERY_URL || '').trim();
  if (env) {
    return appendQueryParams(env, extra);
  }
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname.replace(/\/$/, '') || '';
  const base = `${window.location.origin}${path}`;
  const sp = new URLSearchParams();
  sp.set('device', device);
  if (stationId) sp.set('stationId', stationId);
  return `${base}/#/query?${sp.toString()}`;
}

/** 从当前页 URL 解析查件驿站（Hash 查询优先，兼容 ?station=） */
export function getQueryStationIdFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hash = window.location.hash || '';
  const hq = hash.indexOf('?');
  if (hq >= 0) {
    const sp = new URLSearchParams(hash.slice(hq + 1));
    const s = (sp.get('stationId') || sp.get('station') || '').trim();
    if (s) return s;
  }
  const sp2 = new URLSearchParams(window.location.search || '');
  const s2 = (sp2.get('stationId') || sp2.get('station') || '').trim();
  return s2 || undefined;
}
