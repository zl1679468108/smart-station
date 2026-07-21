import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Token 服务
 * 自定义 Token Session（非 JWT）
 *
 * 流程：
 * - 生成：crypto.randomBytes(32).toString('hex') → 64 字符 hex 原始 token
 * - 存储：SHA-256 hash 后存入 ss_user_sessions.token_hash
 * - 返回：原始 token 发给客户端，客户端用 Authorization: Bearer <token> 传递
 * - TTL：3 天
 */

const TOKEN_TTL_DAYS = 3;
const LOCK_THRESHOLD = 5; // 连续失败 5 次
const LOCK_MINUTES = 15; // 锁定 15 分钟

export interface CreatedSession {
  token: string; // 原始 token，仅此一次返回给客户端
  expiresAt: string; // ISO 时间
}

export interface StationBrief {
  id: string;
  name: string;
  role: string;
  isActive: boolean; // 是否为当前选中驿站
}

@Injectable()
export class TokenService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** 生成 64 字符 hex 原始 token */
  private generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** SHA-256 hash */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * 创建会话
   * @returns 原始 token 与过期时间（原始 token 仅此一次返回）
   */
  async createSession(opts: {
    userId: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<CreatedSession> {
    const rawToken = this.generateRawToken();
    const tokenHash = TokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await this.supabase.withRetry(
      (client) =>
        client.from('ss_user_sessions').insert({
          user_id: opts.userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          user_agent: opts.userAgent ?? null,
          ip_address: opts.ipAddress ?? null,
        }),
      { maxRetries: 1, timeoutMs: 10000 },
    );

    if (error) {
      throw new Error(`创建会话失败: ${error.message}`);
    }

    return { token: rawToken, expiresAt };
  }

  /** 登出：删除当前 token 对应的会话 */
  async destroySessionByToken(rawToken: string): Promise<void> {
    const tokenHash = TokenService.hashToken(rawToken);
    const { error } = await this.supabase.withRetry(
      (client) => client.from('ss_user_sessions').delete().eq('token_hash', tokenHash),
      { maxRetries: 1, timeoutMs: 10000 },
    );
    if (error) {
      throw new Error(`登出失败: ${error.message}`);
    }
  }

  /** 销毁某用户全部会话（修改密码/重置时调用） */
  async destroyAllSessionsOfUser(userId: string): Promise<void> {
    const { error } = await this.supabase.withRetry(
      (client) => client.from('ss_user_sessions').delete().eq('user_id', userId),
      { maxRetries: 1, timeoutMs: 10000 },
    );
    if (error) {
      throw new Error(`销毁会话失败: ${error.message}`);
    }
  }

  /**
   * 登录失败计数 +1，达到阈值则锁定
   */
  async recordLoginFailure(userId: string): Promise<{ locked: boolean }> {
    // 先取当前计数
    const { data, error } = await this.supabase.withRetry(
      (client) =>
        client
          .from('ss_users')
          .select('failed_login_count')
          .eq('id', userId)
          .maybeSingle(),
      { maxRetries: 1, timeoutMs: 10000 },
    );
    if (error || !data) {
      return { locked: false };
    }
    const next = (data.failed_login_count ?? 0) + 1;
    const locked = next >= LOCK_THRESHOLD;
    const patch: { failed_login_count: number; locked_until?: string | null } = {
      failed_login_count: next,
    };
    if (locked) {
      patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    }
    await this.supabase.withRetry(
      (client) => client.from('ss_users').update(patch).eq('id', userId),
      { maxRetries: 1, timeoutMs: 10000 },
    );
    return { locked };
  }

  /** 登录成功：重置失败计数与锁定 */
  async resetLoginFailure(userId: string): Promise<void> {
    await this.supabase.withRetry(
      (client) =>
        client
          .from('ss_users')
          .update({ failed_login_count: 0, locked_until: null })
          .eq('id', userId),
      { maxRetries: 1, timeoutMs: 10000 },
    );
  }
}

export { LOCK_THRESHOLD, LOCK_MINUTES };
