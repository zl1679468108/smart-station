/**
 * 用户载荷类型
 * TokenAuthGuard 校验通过后挂到 req.user 上的用户信息结构
 */
export interface UserPayload {
  /** 用户 ID（ss_users.id） */
  id: string;
  /** 手机号 */
  phone: string;
  /** 用户名 */
  username: string;
  /** 当前驿站角色：admin(管理员) / clerk(店员) / viewer(查询员) */
  role: string;
  /** 当前驿站 ID（ss_users.current_station_id） */
  currentStationId: string;
  /** 当前驿站的员工关系记录 ID（ss_staff.id） */
  staffId: string;
}
