import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { SupabaseService } from '../../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserPayload } from '../types/user-payload.type';

/**
 * Token 认证守卫
 * 校验自定义 Token Session（非 JWT）
 * 流程：
 * 1. 路由标记 @Public() 则放行
 * 2. 从 Authorization: Bearer <token> 取 token
 * 3. SHA-256 hash 后比对 ss_user_sessions.token_hash，且 expires_at 未过期
 * 4. 关联查 ss_users 获取用户信息，查 ss_staff 获取当前驿站角色
 * 5. 将 UserPayload 挂到 req.user
 */
@Injectable()
export class TokenAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SupabaseService) private readonly supabaseService: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 检查是否标记为公开接口
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少认证令牌');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('无效的认证令牌');
    }

    // SHA-256 hash 原始 token，与数据库存储的 hash 比对
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 查询会话并关联用户信息
    const { data: session, error } = await this.supabaseService
      .getClient()
      .from('ss_user_sessions')
      .select(
        'expires_at, user:ss_users!ss_user_sessions_user_id_fkey(id, phone, username, current_station_id, status)',
      )
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !session) {
      throw new UnauthorizedException('认证令牌无效或已过期');
    }

    // 关联查询返回的 user 可能是对象或数组，统一取对象
    const userRow: any = Array.isArray(session.user) ? session.user[0] : session.user;
    if (!userRow || userRow.status !== 'active') {
      throw new UnauthorizedException('用户账号不可用');
    }
    if (!userRow.current_station_id) {
      throw new UnauthorizedException('未选择当前驿站');
    }

    // 查询当前驿站的员工关系，取角色
    const { data: staff, error: staffError } = await this.supabaseService
      .getClient()
      .from('ss_staff')
      .select('id, role')
      .eq('user_id', userRow.id)
      .eq('station_id', userRow.current_station_id)
      .eq('status', 'active')
      .maybeSingle();

    if (staffError || !staff) {
      throw new UnauthorizedException('当前驿站无有效员工关系');
    }

    const payload: UserPayload = {
      id: userRow.id,
      phone: userRow.phone,
      username: userRow.username,
      role: staff.role,
      currentStationId: userRow.current_station_id,
      staffId: staff.id,
    };
    request.user = payload;
    return true;
  }
}
