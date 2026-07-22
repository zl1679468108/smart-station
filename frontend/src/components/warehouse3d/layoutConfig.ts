import type { LayoutDoor, LayoutArea, StationLayoutConfig } from '@/types/kiosk';
import type { ShelfBounds } from './layout';

export const DEFAULT_WAREHOUSE_HEIGHT = 3.2;

export function normalizeLayoutAreaType(type: string): LayoutArea['type'] {
  const normalized = type.toLowerCase();
  if (normalized === 'locker' || normalized === 'safebox' || normalized === 'safe_box') {
    return 'outboundRecord';
  }
  return type as LayoutArea['type'];
}

export function normalizeLayoutArea(area: LayoutArea): LayoutArea {
  const type = normalizeLayoutAreaType(String(area.type));
  const label =
    type === 'outboundRecord' && (area.label === '自提柜' || area.label.startsWith('自提柜 '))
      ? area.label.replace('自提柜', '出库记录区')
      : area.label;
  const id =
    type === 'outboundRecord' && area.id.includes('locker')
      ? area.id.replace('locker', 'outbound-record')
      : area.id;
  return { ...area, id, type, label };
}

export const DEFAULT_STATION_LAYOUT: Required<Pick<StationLayoutConfig, 'bounds' | 'doors' | 'areas'>> = {
  bounds: { width: 14, depth: 9, height: DEFAULT_WAREHOUSE_HEIGHT },
  doors: [{ x: 0, y: 4.5, width: 1.4, label: '正门' }],
  areas: [
    {
      id: 'default-counter',
      type: 'counter',
      label: '服务台',
      x: 4.2,
      y: 2.2,
      width: 2.8,
      depth: 1.2,
      height: 1.4,
    },
    {
      id: 'default-pickup',
      type: 'pickup',
      label: '待取件区',
      x: 0.8,
      y: 1.8,
      width: 3.2,
      depth: 1.8,
      height: 1.8,
    },
    {
      id: 'default-outbound-record',
      type: 'outboundRecord',
      label: '出库记录区',
      x: -4.2,
      y: -3.8,
      width: 2.8,
      depth: 0.8,
      height: 2.2,
    },
    {
      id: 'default-oversize',
      type: 'oversize',
      label: '大件区',
      x: -4.4,
      y: 2,
      width: 2.4,
      depth: 1.5,
      height: 1.3,
    },
    {
      id: 'default-exception',
      type: 'exception',
      label: '异常件区',
      x: 4.6,
      y: -1.2,
      width: 1.8,
      depth: 1.2,
      height: 1.2,
    },
  ],
};

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function sanitizeDoors(doors: LayoutDoor[] | undefined, depth: number): LayoutDoor[] {
  if (!Array.isArray(doors)) return [{ ...DEFAULT_STATION_LAYOUT.doors[0], y: depth / 2 }];
  const validDoors = doors.filter(
    (door) =>
      isPositiveNumber(door.width) &&
      typeof door.x === 'number' &&
      Number.isFinite(door.x) &&
      typeof door.y === 'number' &&
      Number.isFinite(door.y),
  );
  if (validDoors.length === 0) {
    return [{ ...DEFAULT_STATION_LAYOUT.doors[0], y: depth / 2 }];
  }
  return validDoors;
}

function sanitizeAreas(areas: LayoutArea[] | undefined): LayoutArea[] {
  if (!Array.isArray(areas)) return DEFAULT_STATION_LAYOUT.areas.map((area) => ({ ...area }));
  return areas
    .filter(
      (area) =>
        area.id &&
        isPositiveNumber(area.width) &&
        isPositiveNumber(area.depth) &&
        isPositiveNumber(area.height) &&
        typeof area.x === 'number' &&
        Number.isFinite(area.x) &&
        typeof area.y === 'number' &&
        Number.isFinite(area.y),
    )
    .map(normalizeLayoutArea);
}

/**
 * 3D 场景只消费完整、稳定的布局，避免接口未返回或局部字段缺失时先按货架范围渲染，
 * 随后再切到门店 bounds 造成视角和模型比例跳变。
 */
export function normalizeStationLayout(
  layoutConfig: StationLayoutConfig | null | undefined,
  shelfBounds?: ShelfBounds,
): Required<Pick<StationLayoutConfig, 'bounds' | 'doors' | 'areas'>> {
  const shelfWidth = shelfBounds ? shelfBounds.maxX - shelfBounds.minX + 4 : 0;
  const shelfDepth = shelfBounds ? shelfBounds.maxZ - shelfBounds.minZ + 4 : 0;
  const width = isPositiveNumber(layoutConfig?.bounds?.width)
    ? layoutConfig.bounds.width
    : Math.max(DEFAULT_STATION_LAYOUT.bounds.width, shelfWidth);
  const depth = isPositiveNumber(layoutConfig?.bounds?.depth)
    ? layoutConfig.bounds.depth
    : Math.max(DEFAULT_STATION_LAYOUT.bounds.depth, shelfDepth);
  const height = isPositiveNumber(layoutConfig?.bounds?.height)
    ? layoutConfig.bounds.height
    : DEFAULT_WAREHOUSE_HEIGHT;

  return {
    bounds: { width, depth, height },
    doors: sanitizeDoors(layoutConfig?.doors, depth),
    areas: sanitizeAreas(layoutConfig?.areas),
  };
}
