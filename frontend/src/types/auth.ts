// 认证相关类型定义

export interface StationBrief {
  id: string;
  name: string;
  role: 'admin' | 'clerk' | 'viewer';
  /** 是否为当前选中驿站 */
  isActive: boolean;
  /** 驿站本身是否营业中 */
  isActiveStation?: boolean;
}

export interface AuthUser {
  id: string;
  phone: string;
  email: string | null;
  username: string;
  avatarUrl: string | null;
  currentStationId: string | null;
  role: 'admin' | 'clerk' | 'viewer' | null;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  stations: StationBrief[];
}

export interface Profile extends AuthUser {
  stations: StationBrief[];
}
