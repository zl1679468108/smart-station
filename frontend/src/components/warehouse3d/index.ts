/**
 * 仓库 3D / 数字孪生 — 对外唯一出口
 *
 * 页面只应 import 本包：
 *   import Warehouse3D, { WarehouseScreen, parseShelfNumberFromCode } from '@/components/warehouse3d'
 *
 * 不要直接引用 ShelfMap3D / ShelfMap3DEditor / 内部 meshes。
 */

export { default } from './Warehouse3D';
export { default as Warehouse3D } from './Warehouse3D';
export { default as WarehouseScreen } from './WarehouseScreen';
export type { WarehouseScreenProps, WarehouseScreenTodoType } from './WarehouseScreen';

export { MODEL_LIBRARY, findModelByType } from './modelLibrary';
export type { ModelLibraryItem } from './modelLibrary';

export {
  parseShelfNumberFromCode,
  parseLayerFromCode,
  getZoneLetter,
} from './utils';

export type {
  SelectedTargetType,
  Warehouse3DProps,
  Warehouse3DViewProps,
  Warehouse3DEditProps,
  WarehouseEditableShelf,
  WarehouseHighlight,
  WarehouseShelf,
  WarehouseVisualTheme,
  Warehouse3DMode,
  Warehouse3DVariant,
} from './types';

export {
  DEFAULT_STATION_LAYOUT,
  normalizeStationLayout,
  normalizeLayoutArea,
} from './layoutConfig';
