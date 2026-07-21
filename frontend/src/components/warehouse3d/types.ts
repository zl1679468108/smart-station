import type { KioskShelf, StationLayoutConfig } from '@/types/kiosk';

/** 统一货架数据：只读/编辑共用，库存字段可选 */
export type WarehouseShelf = KioskShelf & {
  id?: string;
  inStockCount?: number;
  remainingCapacity?: number;
  capacityPerLayer?: number;
};

/** 编辑模式要求货架带后台 id，用于拖拽后回写位置 */
export type WarehouseEditableShelf = WarehouseShelf & { id: string };

export type Warehouse3DMode = 'view' | 'edit';

/** ops=运营工作台质感，screen=数字孪生大屏科技感 */
export type WarehouseVisualTheme = 'ops' | 'screen';

export type SelectedTargetType = 'shelf' | 'door' | 'area';

export interface WarehouseHighlight {
  shelfNumber: number;
  layer?: number | null;
  count?: number;
}

export interface Warehouse3DBaseProps {
  shelves: WarehouseShelf[];
  layoutConfig?: StationLayoutConfig | null;
  height?: number | string;
  className?: string;
  /** 顶部黄灯带，默认关闭（避免遮挡） */
  showCeilingLights?: boolean;
  /** 以库存数据渲染占用高亮 */
  showOccupancy?: boolean;
  /** 门店布局接口未完成时展示遮罩，避免露出不完整 3D 布局 */
  layoutLoading?: boolean;
  /** 视觉主题：日常运营 / 大屏演示 */
  visualTheme?: WarehouseVisualTheme;
  /** 大屏自动环绕巡航（默认 screen 主题开启） */
  enableCameraPatrol?: boolean;
  /** 大屏/运营总览可关闭取件引导标签，查询页默认保留 */
  showGuidanceLabels?: boolean;
}

export interface Warehouse3DViewProps extends Warehouse3DBaseProps {
  mode?: 'view';
  highlights?: WarehouseHighlight[];
  /** 有焦点才飞；默认：存在 highlights 时开启 */
  enableCameraFly?: boolean;
  enableBloom?: boolean;
  enablePath?: boolean;
}

export interface Warehouse3DEditProps extends Warehouse3DBaseProps {
  mode: 'edit';
  shelves: WarehouseEditableShelf[];
  selectedId?: string | null;
  selectedType?: SelectedTargetType;
  onSelect?: (id: string | null, type: SelectedTargetType | null) => void;
  onShelfDragEnd?: (shelfId: string, x: number, z: number) => void;
  onDoorDragEnd?: (doorIndex: number, x: number, y: number) => void;
  onAreaDragEnd?: (areaId: string, x: number, z: number) => void;
  onDropFromLibrary?: (modelType: string, x: number, z: number) => void;
}

export type Warehouse3DProps = Warehouse3DViewProps | Warehouse3DEditProps;

export type { StationLayoutConfig };
