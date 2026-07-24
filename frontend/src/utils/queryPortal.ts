/**
 * 查件门户链接（店员分享给客户绑定用）
 * - 优先 VITE_PUBLIC_QUERY_URL（生产完整 H5 地址）
 * - 否则用当前站点 Hash 路由 /#/query?device=h5
 */

export function getQueryPortalUrl(opts?: { device?: 'h5' | 'kiosk' }): string {
  const env = String(import.meta.env.VITE_PUBLIC_QUERY_URL || '').trim();
  if (env) return env;
  if (typeof window === 'undefined') return '';
  const device = opts?.device || 'h5';
  const path = window.location.pathname.replace(/\/$/, '') || '';
  const base = `${window.location.origin}${path}`;
  return `${base}/#/query?device=${encodeURIComponent(device)}`;
}
