import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SupabaseService
 * ---------------
 * 封装 Supabase 客户端的初始化、懒重建、以及统一的网络错误处理（重试/超时）。
 *
 * 设计要点（参考 family-bookkeeping 项目，两项目共用同一 Supabase 数据库，仅表名前缀不同：
 * family-bookkeeping 用 jj_，smart-station 用 ss_）：
 * 1. 缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 时只降级为 "未配置" 状态，
 *    不 throw 导致整个 NestJS 进程起不来。
 * 2. 客户端懒初始化：被标记异常后自动重建，JWT 轮换 / 长时间闲置更健壮。
 * 3. withRetry<T>() 封装统一错误处理：最多 3 次重试、指数退避、10s 单次超时。
 * 4. 全局 fetch 设置 12s AbortSignal，防止 HTTP 连接挂起导致 socket 池耗尽。
 * 5. 使用 service_role_key（非 anon key），后端服务绕过 RLS 直接操作数据。
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient | null = null;
  private supabaseUrl: string | null = null;
  private supabaseServiceRoleKey: string | null = null;
  private markedForRecreate = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.supabaseUrl = this.configService.get<string>('SUPABASE_URL') || null;
    this.supabaseServiceRoleKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || null;

    if (!this.supabaseUrl || !this.supabaseServiceRoleKey) {
      this.logger.warn(
        '未检测到 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，Supabase 客户端将处于未配置状态。' +
          '依赖数据库的接口会返回 503。请在 .env 中配置后重启服务。',
      );
      return;
    }

    try {
      this.supabase = this.buildClient();
      this.logger.log('Supabase 客户端初始化完成。');
    } catch (err) {
      this.logger.error('Supabase 客户端初始化失败：' + (err as Error).message);
      this.supabase = null;
    }
  }

  /** 是否已配置环境变量 */
  isConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseServiceRoleKey);
  }

  /** 获取客户端；未配置或重建失败时抛出 SupabaseUnavailableError */
  getClient(): SupabaseClient {
    if (!this.isConfigured()) {
      throw new SupabaseUnavailableError(
        'Supabase 未配置，请联系管理员在服务端配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。',
      );
    }

    if (!this.supabase || this.markedForRecreate) {
      if (this.markedForRecreate) {
        this.logger.warn('检测到客户端异常，正在重建 Supabase 客户端...');
      }
      try {
        this.supabase = this.buildClient();
        this.markedForRecreate = false;
      } catch (err) {
        this.logger.error('重建 Supabase 客户端失败：' + (err as Error).message);
        throw new SupabaseUnavailableError('Supabase 客户端初始化失败，请稍后重试。');
      }
    }

    return this.supabase;
  }

  /**
   * 带重试 / 超时的执行器：业务层用它包裹 Supabase 调用。
   *
   *   const data = await this.supabaseService.withRetry(async (client) => {
   *     const { data, error } = await client.from('ss_parcels').select('*');
   *     if (error) throw error;
   *     return data;
   *   });
   */
  async withRetry<T>(
    fn: (client: SupabaseClient) => Promise<T>,
    options?: { maxRetries?: number; timeoutMs?: number },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const timeoutMs = options?.timeoutMs ?? 10000;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const client = this.getClient();
      try {
        const result = await withTimeout(fn(client), timeoutMs);
        if (attempt > 1) {
          this.logger.log(`Supabase 请求在第 ${attempt} 次重试后成功。`);
        }
        return result;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);

        if (
          /jwt/i.test(msg) ||
          /token/i.test(msg) ||
          /invalid.*key|invalid.*credentials/i.test(msg)
        ) {
          this.markedForRecreate = true;
        }

        if (attempt >= maxRetries) break;

        const retryable =
          /fetch|network|timeout|timed out|socket|econnreset|econnrefused|etimedout|enotfound|dns|eai_again|5\d{2}|overloaded|rate limit|internal server/i.test(
            msg,
          ) || err instanceof TimeoutError;

        if (!retryable) {
          throw this.normalizeError(err);
        }

        const delay = 200 * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Supabase 请求第 ${attempt} 次失败：${msg}。${delay}ms 后进行第 ${attempt + 1} 次重试...`,
        );
        await sleep(delay);
      }
    }

    throw this.normalizeError(lastErr);
  }

  /** 轻量查询检测连通性，用于健康检查 */
  async ping(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
    if (!this.isConfigured()) {
      return { ok: false, message: '未配置' };
    }
    const start = Date.now();
    try {
      await this.withRetry(
        async (client) => {
          const { error } = await client
            .from('ss_users')
            .select('id', { head: true, count: 'exact' })
            .limit(0);
          if (error) throw error;
          return null;
        },
        { maxRetries: 1, timeoutMs: 8000 },
      );
      return { ok: true, latencyMs: Date.now() - start };
    } catch (outerErr) {
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      return { ok: false, message: msg, latencyMs: Date.now() - start };
    }
  }

  private buildClient(): SupabaseClient {
    return createClient(this.supabaseUrl!, this.supabaseServiceRoleKey!, {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, {
            ...options,
            signal: AbortSignal.timeout(12_000),
          }),
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  private normalizeError(err: unknown): Error {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (/timeout|timed out|aborted/i.test(msg)) {
        return new SupabaseNetworkError('Supabase 请求超时，请稍后重试。');
      }
      if (/fetch|network|socket|econn|etimedout|enotfound|dns|eai/i.test(msg)) {
        return new SupabaseNetworkError('无法连接到 Supabase，请检查网络或稍后重试。');
      }
      if (/jwt|token/i.test(msg)) {
        return new SupabaseNetworkError('Supabase 鉴权失败，请联系管理员检查服务端密钥。');
      }
      return err;
    }
    return new SupabaseNetworkError('Supabase 请求失败，请稍后重试。');
  }
}

export class SupabaseUnavailableError extends Error {
  constructor(message?: string) {
    super(message || 'Supabase 当前不可用');
    this.name = 'SupabaseUnavailableError';
  }
}

export class SupabaseNetworkError extends Error {
  constructor(message?: string) {
    super(message || 'Supabase 网络异常');
    this.name = 'SupabaseNetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message || '请求超时');
    this.name = 'TimeoutError';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`请求超过 ${ms}ms 未返回`));
    }, ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
