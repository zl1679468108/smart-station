// 系统管理相关类型定义

export interface NotifyConfig {
  title?: string;
  content?: string;
  wecomQrUrl?: string;
  wecomJoinTip?: string;
  /** @deprecated 客户主通道 WxPusher */
  serverchanGuideUrl?: string;
  serverchanGuide?: string;
  wxpusherGuide?: string;
  pushplusGuide?: string;
  pushplusGuideUrl?: string;
  bindEnabled?: boolean;
}

export interface Station {
  id: string;
  name: string;
  address: string;
  contact_phone: string | null;
  business_hours: string | null;
  floor_plan_url: string | null;
  layout_config: StationLayoutConfig | null;
  overdue_warn_days: number;
  overdue_remind_days: number;
  overdue_return_days: number;
  sms_enabled: boolean;
  notify_config?: NotifyConfig | null;
  status: string;
  created_at: string;
  updated_at: string;
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
  /** 仓库层高（米），旧数据可能没有该字段 */
  height?: number;
}

/** 驿站门店布局 - 可配置区域类型 */
export type LayoutAreaType =
  | 'office'
  | 'pickup'
  | 'counter'
  | 'outboundRecord'
  | 'exception'
  | 'oversize';

/** 仓库户型 - 区域（办公区/揽收区等） */
export interface LayoutArea {
  /** 区域唯一 ID（前端生成 uuid） */
  id: string;
  /** 中心点 X 坐标（米），地面中心为原点 */
  x: number;
  /** 中心点 Y 坐标（米），对应 3D 场景的 Z 轴 */
  y: number;
  /** 宽度（米） */
  width: number;
  /** 深度（米） */
  depth: number;
  /** 高度（米） */
  height: number;
  /** 区域类型：office 办公区 / pickup 待取件区 / outboundRecord 出库记录区 */
  type: LayoutAreaType;
  /** 显示标签 */
  label: string;
}

/** 仓库户型配置（含可选障碍物，供管理员后台编辑用） */
export interface StationLayoutConfig {
  bounds?: LayoutBounds;
  doors?: LayoutDoor[];
  areas?: LayoutArea[];
  obstacles?: Array<{
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    type: string;
  }>;
}

export interface Staff {
  id: string;
  role: 'admin' | 'clerk' | 'viewer';
  status: 'active' | 'disabled';
  joinedAt: string;
  userId: string;
  phone: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  userStatus: string | null;
}

export interface StaffWithPassword extends Staff {
  initialPassword?: string | null;
}

export type ShelfSizeType = 'small' | 'medium' | 'large';

export interface Shelf {
  id: string;
  number: number;
  size_type: ShelfSizeType;
  layers: number;
  capacity_per_layer: number;
  description: string | null;
  status: 'active' | 'disabled';
  pos_x: number | null;
  pos_y: number | null;
  rotation: number;
  zone: string | null;
  created_at: string;
  in_stock_count: number;
  remaining_capacity: number;
}

export interface CourierCompany {
  id: string;
  name: string;
  code: string;
  service_phone: string | null;
  tracking_prefixes: string[] | null;
  status: 'active' | 'disabled';
  sort_order: number;
  created_at: string;
}


/** 客户通知绑定（管理端，target 已脱敏） */
export interface NotifyBindingItem {
  id: string;
  phone: string;
  phoneMasked: string;
  channel: string;
  channelLabel: string;
  targetMasked: string;
  status: string;
  statusLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotifyChannelResultItem {
  key: string;
  ok: boolean;
  label: string;
}

export interface NotifyPhoneSummaryItem {
  phone: string;
  phoneMasked: string;
  recipientName?: string | null;
  total: number;
  sent: number;
  failed: number;
  unbound: number;
  pushed: number;
  pushFailed: number;
  lastAt?: string | null;
  lastTemplateCode?: string;
  lastTemplateLabel?: string;
  lastReach?: 'unbound' | 'pushed' | 'push_failed';
  lastReachLabel?: string;
}

export interface NotifyLogItem {
  id: string;
  templateCode: string;
  templateLabel: string;
  phone: string;
  phoneMasked: string;
  recipientName?: string | null;
  content: string;
  status: string;
  statusLabel?: string;
  errorMessage?: string | null;
  channels?: NotifyChannelResultItem[];
  channelSummary: string;
  /** 客户触达：未私信 / 已私信 / 私信失败 */
  customerReach?: 'unbound' | 'pushed' | 'push_failed';
  customerReachLabel?: string;
  /** 到件/滞留可重发 */
  canResend?: boolean;
  parcelId?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface NotifyResendResult {
  logId: string;
  templateCode: string;
  templateLabel: string;
  phoneMasked: string;
  attempted: boolean;
  customerBound: boolean;
  customerPushed: boolean;
  customerChannels: string[];
  staffMessage: string;
  channelResults: NotifyChannelResultItem[];
}
