import { SHELF_ZONE_MAP, type KioskShelf, type ShelfSizeType } from '@/types/kiosk';
import {
  CAMERA_FOV,
  PER_ROW,
  SHELF_D,
  SHELF_GAP_X,
  SHELF_GAP_Z,
  SHELF_W,
  ZONE_GAP,
  ZONE_LABEL_H,
} from './constants';

export interface PlacedShelf<T extends KioskShelf = KioskShelf> {
  shelf: T;
  x: number;
  z: number;
  zone: string;
}

export interface ShelfBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 计算货架摆放位置：
 * - 有 posX/posY 的货架用真实坐标
 * - 无坐标的货架走 size_type 网格自动布局
 */
export function computeShelfPositions<T extends KioskShelf>(shelves: T[]): {
  placed: PlacedShelf<T>[];
  hasRealCoords: boolean;
  bounds: ShelfBounds;
} {
  const hasRealCoords = shelves.some((s) => s.posX !== null && s.posY !== null);
  const order: ShelfSizeType[] = ['small', 'medium', 'large'];
  const fallbackGroup: Record<ShelfSizeType, T[]> = {
    small: [],
    medium: [],
    large: [],
  };
  for (const s of shelves) {
    if (s.posX === null || s.posY === null) fallbackGroup[s.sizeType].push(s);
  }

  let cursorZ = 0;
  if (hasRealCoords) {
    for (const s of shelves) {
      if (s.posX !== null && s.posY !== null) {
        cursorZ = Math.max(cursorZ, s.posY + SHELF_D);
      }
    }
    cursorZ += ZONE_GAP;
  }

  const placed: PlacedShelf<T>[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = 0;
  let maxZ = -Infinity;

  for (const s of shelves) {
    if (s.posX !== null && s.posY !== null) {
      placed.push({
        shelf: s,
        x: s.posX,
        z: s.posY,
        zone: s.zone || SHELF_ZONE_MAP[s.sizeType],
      });
      minX = Math.min(minX, s.posX - SHELF_W / 2);
      maxX = Math.max(maxX, s.posX + SHELF_W / 2);
      minZ = Math.min(minZ, s.posY - SHELF_D / 2);
      maxZ = Math.max(maxZ, s.posY + SHELF_D / 2);
    }
  }

  for (const t of order) {
    const items = fallbackGroup[t];
    if (items.length === 0) continue;
    const rows = Math.ceil(items.length / PER_ROW);
    const rowWidth = PER_ROW * SHELF_W + (PER_ROW - 1) * SHELF_GAP_X;
    const zoneDepth = rows * SHELF_D + (rows - 1) * SHELF_GAP_Z + ZONE_LABEL_H;
    const originZ = cursorZ;
    cursorZ += zoneDepth + ZONE_GAP;
    items.forEach((s, i) => {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const x = col * (SHELF_W + SHELF_GAP_X) - rowWidth / 2 + SHELF_W / 2;
      const z = row * (SHELF_D + SHELF_GAP_Z) + ZONE_LABEL_H + SHELF_D / 2 + originZ;
      placed.push({ shelf: s, x, z, zone: s.zone || SHELF_ZONE_MAP[t] });
      minX = Math.min(minX, x - SHELF_W / 2);
      maxX = Math.max(maxX, x + SHELF_W / 2);
      maxZ = Math.max(maxZ, z + SHELF_D / 2);
    });
  }

  if (minX === Infinity) {
    minX = -5;
    maxX = 5;
    maxZ = 5;
  }

  return { placed, hasRealCoords, bounds: { minX, maxX, minZ, maxZ } };
}

/** 默认总览相机：对准原点，距离按容器与地面尺寸自适应 */
export function computeCameraInit(
  groundW: number,
  groundD: number,
  containerWidth: number,
  containerHeight: number,
  mode: 'ops' | 'screen' = 'ops',
): {
  target: [number, number, number];
  position: [number, number, number];
} {
  const halfFov = ((CAMERA_FOV * Math.PI) / 180) / 2;
  const aspect =
    containerWidth > 0 && containerHeight > 0 ? containerWidth / containerHeight : 1.5;
  const dHorizontal = groundW / (2 * Math.tan(halfFov) * aspect);
  const dVertical = groundD / (2 * Math.tan(halfFov));
  const dist = Math.max(dHorizontal, dVertical, 5) * 1.2;
  if (mode === 'screen') {
    // 大屏：略低一点、更靠前，优先看清货架号与前场，避免过高俯视
    return {
      target: [0, 0.85, groundD * 0.04],
      position: [dist * 0.38, dist * 0.34, dist * 0.92],
    };
  }

  return {
    target: [0, 1, 0],
    position: [0, dist * 0.8, dist * 0.9],
  };
}
