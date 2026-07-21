// 认证 API 服务
import { post, get, put } from './api';
import type { LoginResult, Profile, AuthUser, StationBrief } from '@/types/auth';

export interface LoginPayload {
  account: string;
  password: string;
}

export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfilePayload {
  username?: string;
  avatarUrl?: string;
}

/** 登录 */
export function login(payload: LoginPayload): Promise<LoginResult> {
  return post<LoginResult>('/api/auth/login', payload, { successMessage: '登录成功' });
}

/** 登出 */
export function logout(): Promise<{ message: string }> {
  return post<{ message: string }>('/api/auth/logout', undefined, { skipNotify: true });
}

/** 获取当前用户资料 + 关联驿站 */
export function fetchProfile(): Promise<Profile> {
  return get<Profile>('/api/auth/profile');
}

/** 更新个人资料 */
export function updateProfile(payload: UpdateProfilePayload): Promise<Profile> {
  return put<Profile>('/api/auth/profile', payload, { successMessage: '资料已更新' });
}

/** 修改密码 */
export function changePassword(payload: ChangePasswordPayload): Promise<{ message: string }> {
  return put<{ message: string }>('/api/auth/password', payload, { successMessage: '密码修改成功，请重新登录' });
}

/** 切换当前驿站 */
export function switchStation(
  stationId: string,
): Promise<{ currentStationId: string; role: AuthUser['role'] }> {
  return post('/api/auth/switch-station', { stationId }, { successMessage: '驿站已切换' });
}

/** 类型导出供组件使用 */
export type { LoginResult, Profile, AuthUser, StationBrief };
