import type { LayoutAreaType, ShelfSizeType } from '@/types/kiosk';

export type StationAssetKey =
  | 'shelf.small'
  | 'shelf.medium'
  | 'shelf.large'
  | 'door.main'
  | 'area.counter'
  | 'area.outboundRecord'
  | 'area.office';

export interface StationAssetDef {
  key: StationAssetKey;
  url: string;
  label: string;
  /** 期望包围盒尺寸 [width, height, depth]（米） */
  targetSize: [number, number, number];
}

/** 与 public/models/manifest.json 保持同步的内置注册表 */
export const STATION_ASSET_REGISTRY: Record<StationAssetKey, StationAssetDef> = {
  'shelf.small': {
    key: 'shelf.small',
    url: '/models/shelf-small.glb?v=strip-labels-1',
    label: '小型货架',
    targetSize: [2.0, 1.8, 1.0],
  },
  'shelf.medium': {
    key: 'shelf.medium',
    url: '/models/shelf-medium.glb?v=strip-labels-1',
    label: '中型货架',
    targetSize: [2.4, 2.2, 1.2],
  },
  'shelf.large': {
    key: 'shelf.large',
    url: '/models/shelf-large.glb?v=strip-labels-1',
    label: '大型货架',
    targetSize: [2.8, 2.4, 1.4],
  },
  'door.main': {
    key: 'door.main',
    url: '/models/door-main.glb',
    label: '正门',
    targetSize: [2.0, 2.2, 0.4],
  },
  'area.counter': {
    key: 'area.counter',
    url: '/models/counter.glb',
    label: '服务台',
    targetSize: [3.2, 1.4, 1.4],
  },
  'area.outboundRecord': {
    key: 'area.outboundRecord',
    url: '/models/locker.glb',
    label: '出库记录区',
    targetSize: [3.0, 2.2, 0.8],
  },
  'area.office': {
    key: 'area.office',
    url: '/models/office.glb',
    label: '办公区',
    targetSize: [2.4, 1.8, 1.8],
  },
};

export function shelfAssetKey(sizeType: ShelfSizeType): StationAssetKey {
  if (sizeType === 'small') return 'shelf.small';
  if (sizeType === 'large') return 'shelf.large';
  return 'shelf.medium';
}

export function areaAssetKey(type: LayoutAreaType | string): StationAssetKey | null {
  const normalizedType = type.toLowerCase();
  if (type === 'counter') return 'area.counter';
  if (
    type === 'outboundRecord' ||
    normalizedType === 'locker' ||
    normalizedType === 'safebox' ||
    normalizedType === 'safe_box'
  ) {
    return 'area.outboundRecord';
  }
  if (type === 'office') return 'area.office';
  return null;
}
