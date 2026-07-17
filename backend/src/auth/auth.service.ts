import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';
import { TokenService, StationBrief } from './token.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserPayload } from '../common/types/user-payload.type';

/**
 * 认证服务
 * - 登录：校验账号密码 + 失败计数/锁定 + 创建会话
 * - 登出：销毁当前会话
 * - 个人资料：查询/更新
 * - 修改密码：校验旧密码 + 更新 + 销毁全部会话
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * 登录
   * @returns { user, token, stations }
   */
  async login(dto: LoginDto, meta: { userAgent?: string; ipAddress?: string }) {
    // 账号支持手机号或邮箱
    const account = dto.account.trim();
    const isEmail = account.includes('@');
    const column = isEmail ? 'email' : 'phone';

    const { data: user, error } = await this.supabase
      .getClient()
      .from('ss_users')
      .select('id, phone, email, username, password_hash, avatar_url, status, failed_login_count, locked_until, current_station_id')
      .eq(column, account)
      .maybeSingle();

    if (error) {
      throw new UnauthorizedException('登录失败，请稍后重试');
    }
    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('账号已被禁用，请联系管理员');
    }
    // 锁定检查
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until).getTime();
      if (Date.now() < lockedUntil) {
        const remainMin = Math.ceil((lockedUntil - Date.now()) / 60000);
        throw new UnauthorizedException(`账号已锁定，请 ${remainMin} 分钟后重试`);
      }
    }

    // 校验密码
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      const { locked } = await this.tokenService.recordLoginFailure(user.id);
      if (locked) {
        throw new UnauthorizedException('密码错误次数过多，账号已锁定 15 分钟');
      }
      throw new UnauthorizedException('账号或密码错误');
    }

    // 登录成功：重置失败计数
    await this.tokenService.resetLoginFailure(user.id);

    // 取该用户关联的所有驿站
    const stations = await this.listStationsOfUser(user.id);

    // 若无 current_station_id，自动选第一个 active 驿站
    let currentStationId = user.current_station_id as string | null;
    if (!currentStationId) {
      const firstActive = stations.find((s) => s.isActive !== false);
      currentStationId = firstActive?.id ?? stations[0]?.id ?? null;
      if (currentStationId) {
        await this.supabase
          .getClient()
          .from('ss_users')
          .update({ current_station_id: currentStationId })
          .eq('id', user.id);
      }
    }

    // 创建会话
    const session = await this.tokenService.createSession({
      userId: user.id,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    // 标记当前选中驿站
    const stationsWithActive: StationBrief[] = stations.map((s) => ({
      ...s,
      isActive: s.id === currentStationId,
    }));

    return {
      token: session.token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatar_url,
        currentStationId,
        role: stationsWithActive.find((s) => s.id === currentStationId)?.role ?? null,
      },
      stations: stationsWithActive,
    };
  }

  /** 登出：销毁当前 token 对应会话 */
  async logout(rawToken: string): Promise<void> {
    await this.tokenService.destroySessionByToken(rawToken);
  }

  /** 获取当前用户资料 + 关联驿站 */
  async getProfile(user: UserPayload) {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_users')
      .select('id, phone, email, username, avatar_url, current_station_id')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) {
      throw new UnauthorizedException('用户不存在');
    }
    const stations = await this.listStationsOfUser(user.id);
    const current = stations.find((s) => s.id === data.current_station_id);
    return {
      id: data.id,
      phone: data.phone,
      email: data.email,
      username: data.username,
      avatarUrl: data.avatar_url,
      currentStationId: data.current_station_id,
      role: current?.role ?? user.role,
      stations: stations.map((s) => ({
        ...s,
        isActive: s.id === data.current_station_id,
      })),
    };
  }

  /** 更新个人资料（用户名、头像） */
  async updateProfile(user: UserPayload, dto: UpdateProfileDto) {
    const patch: Record<string, unknown> = {};
    if (dto.username !== undefined) patch.username = dto.username;
    if (dto.avatarUrl !== undefined) patch.avatar_url = dto.avatarUrl;
    if (Object.keys(patch).length === 0) {
      return this.getProfile(user);
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_users')
      .update(patch)
      .eq('id', user.id)
      .select('id, phone, email, username, avatar_url, current_station_id')
      .maybeSingle();
    if (error || !data) {
      throw new BadRequestException('更新失败');
    }
    const stations = await this.listStationsOfUser(user.id);
    return {
      id: data.id,
      phone: data.phone,
      email: data.email,
      username: data.username,
      avatarUrl: data.avatar_url,
      currentStationId: data.current_station_id,
      role: stations.find((s) => s.id === data.current_station_id)?.role ?? user.role,
      stations: stations.map((s) => ({
        ...s,
        isActive: s.id === data.current_station_id,
      })),
    };
  }

  /** 修改密码：校验旧密码 + 更新 + 销毁全部会话 */
  async changePassword(user: UserPayload, dto: ChangePasswordDto) {
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_users')
      .select('password_hash')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) {
      throw new UnauthorizedException('用户不存在');
    }
    const ok = await bcrypt.compare(dto.oldPassword, data.password_hash);
    if (!ok) {
      throw new BadRequestException('旧密码错误');
    }
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    const { error: updateErr } = await this.supabase
      .getClient()
      .from('ss_users')
      .update({ password_hash: newHash })
      .eq('id', user.id);
    if (updateErr) {
      throw new BadRequestException('密码修改失败');
    }
    // 销毁全部会话，强制重新登录
    await this.tokenService.destroyAllSessionsOfUser(user.id);
    return { message: '密码修改成功，请重新登录' };
  }

  /** 切换当前驿站 */
  async switchStation(user: UserPayload, stationId: string) {
    // 校验该用户在该驿站有 active 员工关系
    const { data: staff, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('station_id', stationId)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !staff) {
      throw new BadRequestException('无该驿站的操作权限');
    }
    await this.supabase
      .getClient()
      .from('ss_users')
      .update({ current_station_id: stationId })
      .eq('id', user.id);
    return { currentStationId: stationId, role: staff.role };
  }

  /** 查询用户关联的所有驿站（带角色） */
  private async listStationsOfUser(userId: string): Promise<StationBrief[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_staff')
      .select(
        'station_id, role, status, station:ss_stations!ss_staff_station_id_fkey(id, name, status)',
      )
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error || !data) {
      return [];
    }
    return data
      .map((row: any) => {
        const station = Array.isArray(row.station) ? row.station[0] : row.station;
        if (!station) return null;
        return {
          id: station.id,
          name: station.name,
          role: row.role,
          isActive: station.status === 'active',
        } as StationBrief;
      })
      .filter((s): s is StationBrief => s !== null);
  }
}
