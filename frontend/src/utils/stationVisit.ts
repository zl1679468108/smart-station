/**
 * 到店导航 / 营业状态（白话对客）
 * 仅用地址文本深链，不依赖经纬度（试验期零成本）
 */

/** 地图导航链接（高德主推，腾讯/百度/系统地图兜底） */
export function buildMapLinks(address: string, stationName?: string | null) {
  const q = encodeURIComponent(address);
  const name = encodeURIComponent(stationName || address);
  return {
    /** 高德：手机常可唤起 App */
    amap: `https://uri.amap.com/search?keyword=${q}&src=smart-station`,
    /** 腾讯地图 */
    tencent: `https://apis.map.qq.com/uri/v1/search?keyword=${q}&referer=smart-station`,
    /** 百度地图 */
    baidu: `https://api.map.baidu.com/geocoder?address=${q}&output=html&src=webapp.baidu.openAPIdemo`,
    /** 系统/通用（iOS 会开 Apple 地图，其它浏览器多为 Google 或提示） */
    system: `https://maps.apple.com/?q=${name}`,
  };
}

export type OpenStatus = {
  /** open / closed / unknown */
  status: 'open' | 'closed' | 'unknown';
  label: string;
};

/**
 * 解析简单营业时间文案，如 "08:00-22:00" / "8:00~22:00"
 * 复杂文案（分工作日）则返回 unknown
 */
export function parseOpenStatus(businessHours?: string | null): OpenStatus {
  if (!businessHours || !businessHours.trim()) {
    return { status: 'unknown', label: '营业时间以店内为准' };
  }
  const text = businessHours.trim();
  const m = text.match(/(\d{1,2}):(\d{2})\s*[-~—至到]\s*(\d{1,2}):(\d{2})/);
  if (!m) {
    return { status: 'unknown', label: `营业 ${text}` };
  }
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  // 跨午夜：如 22:00-02:00
  const now = beijingMinutes();
  let open: boolean;
  if (end <= start) {
    open = now >= start || now < end;
  } else {
    open = now >= start && now < end;
  }
  const range = `${pad(sh)}:${pad(sm)}-${pad(eh)}:${pad(em)}`;
  return open
    ? { status: 'open', label: `营业中 · ${range}` }
    : { status: 'closed', label: `休息中 · ${range}` };
}

function beijingMinutes(): number {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export async function copyText(text: string): Promise<boolean> {
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
