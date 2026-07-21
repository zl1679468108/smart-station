import type { LayoutAreaType } from '@/types/kiosk';
import { STATION_MODEL_PRESETS } from './StationModels';

/**
 * 模型库预设尺寸（米）— 管理员拖入 3D 场景用，与 StationModels GLB 预设对齐
 * 宽度/深度/高度对应 3D 场景的 X/Z/Y 轴
 */
export interface ModelLibraryItem {
  type: LayoutAreaType | 'door';
  label: string;
  width: number;
  depth: number;
  height: number;
  color: string;
}

export const MODEL_LIBRARY: ModelLibraryItem[] = [
  ...STATION_MODEL_PRESETS,
  { type: 'door', label: '门口', width: 1.2, depth: 0.3, height: 2, color: '#10B981' },
];

/** 根据 type 查找预设 */
export function findModelByType(type: string): ModelLibraryItem | undefined {
  return MODEL_LIBRARY.find((m) => m.type === type);
}
