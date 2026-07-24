import type { ParcelSize } from '@/types/inbound';

const SIZE_KEY = 'ss_inbound_last_size';
const BEEP_KEY = 'ss_inbound_success_beep';
const AUTO_PRINT_KEY = 'ss_inbound_auto_print_slip';

const SIZES: ParcelSize[] = ['small', 'medium', 'large'];

export function loadLastParcelSize(fallback: ParcelSize = 'small'): ParcelSize {
  try {
    const v = localStorage.getItem(SIZE_KEY) as ParcelSize | null;
    if (v && SIZES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveLastParcelSize(size: ParcelSize): void {
  try {
    localStorage.setItem(SIZE_KEY, size);
  } catch {
    /* ignore */
  }
}

export function isSuccessBeepEnabled(): boolean {
  try {
    const v = localStorage.getItem(BEEP_KEY);
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function setSuccessBeepEnabled(on: boolean): void {
  try {
    localStorage.setItem(BEEP_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** 短促成功提示音（Web Audio，无外部资源） */
export function playInboundSuccessBeep(): void {
  if (!isSuccessBeepEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.start(t0);
    osc.stop(t0 + 0.14);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* 静默失败，不影响入库 */
  }
}

export function isAutoPrintSlipEnabled(): boolean {
  try {
    const v = localStorage.getItem(AUTO_PRINT_KEY);
    if (v === '1' || v === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function setAutoPrintSlipEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_PRINT_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
