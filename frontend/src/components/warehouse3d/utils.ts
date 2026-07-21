import { SHELF_ZONE_MAP, type KioskShelf } from '@/types/kiosk';

/** 从取件码解析货架号 */
export function parseShelfNumberFromCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const seg = code.split('-')[0];
  const n = Number(seg);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 从取件码解析层号 */
export function parseLayerFromCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const seg = code.split('-')[1];
  const n = Number(seg);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 根据货架号 + shelves 推断区字母 */
export function getZoneLetter(shelfNumber: number, shelves: KioskShelf[]): string | null {
  const s = shelves.find((x) => x.number === shelfNumber);
  if (!s) return null;
  return s.zone || SHELF_ZONE_MAP[s.sizeType];
}
