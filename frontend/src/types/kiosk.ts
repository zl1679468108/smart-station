// Kiosk 取件自助查询类型定义

export interface KioskParcelItem {
  id: string;
  trackingNumber: string;
  /** 脱敏：姓名首字 + ** */
  recipientName: string;
  /** 脱敏：手机号尾号 4 位，格式 ****1234 */
  recipientPhoneTail: string;
  pickupCode: string | null;
  inboundAt: string;
  stationName: string | null;
  courierName: string | null;
}

export interface KioskQueryResult {
  items: KioskParcelItem[];
  total: number;
}

export interface SendCodeResult {
  sent: boolean;
  ttlSeconds: number;
}

/** 货架大小类型 */
export type ShelfSizeType = 'small' | 'medium' | 'large';

/** 货架平面图数据项（Kiosk 公开接口返回） */
export interface KioskShelf {
  /** 货架号（同驿站唯一） */
  number: number;
  /** 大小类型：small/medium/large → 自动分到 A/B/C 区 */
  sizeType: ShelfSizeType;
  /** 层数 */
  layers: number;
  /** 备注（可选） */
  description: string | null;
  /** 仓库内 X 坐标（米），NULL 时走自动布局 */
  posX: number | null;
  /** 仓库内 Y 坐标（米），NULL 时走自动布局 */
  posY: number | null;
  /** 朝向角度：0/90/180/270 */
  rotation: number;
  /** 区域号 A/B/C...，NULL 时按 size_type 推断 */
  zone: string | null;
}

/** 仓库户型 - 门口 */
export interface LayoutDoor {
  x: number;
  y: number;
  width: number;
  label: string;
}

/** 仓库户型 - 内部尺寸 */
export interface LayoutBounds {
  width: number;
  depth: number;
}

/** 仓库户型 - 区域类型 */
export type LayoutAreaType = 'office' | 'pickup';

/** 仓库户型 - 区域（办公区/揽收区等，只读展示用） */
export interface LayoutArea {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  type: LayoutAreaType;
  label: string;
}

/** 仓库户型配置（公开只读，仅 bounds + doors + areas） */
export interface StationLayoutConfig {
  bounds?: LayoutBounds;
  doors?: LayoutDoor[];
  areas?: LayoutArea[];
}

/** GET /api/kiosk/station/layout 返回结构（1.2.0 起） */
export interface StationLayoutResponse {
  shelves: KioskShelf[];
  station: {
    /** 驿站名（公开，用于 /query 门户顶部展示） */
    name: string | null;
    /** 地址（公开） */
    address: string | null;
    /** 联系电话（公开） */
    contactPhone: string | null;
    /** 营业时间（公开，如 "08:00-22:00"） */
    businessHours: string | null;
    layoutConfig: StationLayoutConfig;
  };
}

/** size_type → 区域名字母映射 */
export const SHELF_ZONE_MAP: Record<ShelfSizeType, string> = {
  small: 'A',
  medium: 'B',
  large: 'C',
};

/** 区域名中文标签 */
export const SHELF_ZONE_LABEL: Record<ShelfSizeType, string> = {
  small: 'A 区（小件）',
  medium: 'B 区（中件）',
  large: 'C 区（大件）',
};
