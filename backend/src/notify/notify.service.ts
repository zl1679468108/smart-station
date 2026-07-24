import { Injectable, Inject } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * 免费多通道通知（开发试验）
 *
 * 通道角色（重要）：
 * - console：开发日志，完整内容
 * - wecom（环境变量群机器人）：运营公告通道，共享可见 → 仅脱敏摘要，永不发取件码/完整手机号/验证码
 * - serverchan（环境变量 SendKey）：管理员个人旁路，完整内容（仅你一人微信）
 * - 客户绑定（ss_notify_bindings）：按手机号一对一推送完整内容
 *   - 主通道 wxpusher：扫码关注后 UID 推送
 *   - 备选 pushplus：客户填写 token 一对一
 *   - 兼容 serverchan：历史 SendKey 绑定
 *
 * 失败不阻断主流程；外部通道瞬时失败自动短退避重试（最多 3 次）；日志写 ss_sms_logs。
 */

type OpsChannel = 'console' | 'wecom' | 'serverchan';

export type NotifyPayload = {
  phone: string;
  recipientName?: string | null;
  title: string;
  /** 完整内容（个人通道 / console / 管理员旁路） */
  content: string;
  /** 脱敏内容（企微群等共享通道）；缺省则自动生成 */
  publicContent?: string;
  templateCode: string;
  parcelId?: string;
  stationId?: string;
  params?: Record<string, unknown>;
};

export type NotifyChannelResult = {
  channel: string;
  ok: boolean;
  error?: string;
  mode?: string;
  /** 实际尝试次数（含首次；>1 表示发生过自动重试） */
  attempts?: number;
  /** 是否至少重试过一次 */
  retried?: boolean;
};

/** 入库/通知扇出回执（给店员看的运营反馈） */
export type NotifyDispatchResult = {
  attempted: boolean;
  customerBound: boolean;
  customerChannels: string[];
  customerPushed: boolean;
  channelResults: NotifyChannelResult[];
  /** 面向店员的中文摘要 */
  staffMessage: string;
};

@Injectable()
export class NotifyService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  private getOpsChannels(): OpsChannel[] {
    const raw = (process.env.NOTIFY_CHANNELS || '').trim();
    if (raw) {
      const allowed = new Set<OpsChannel>(['console', 'wecom', 'serverchan']);
      const list = raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is OpsChannel => allowed.has(s as OpsChannel));
      if (list.length > 0) return [...new Set(list)];
    }
    const sms = (process.env.SMS_PROVIDER || 'stub').toLowerCase();
    if (sms === 'real') {
      // eslint-disable-next-line no-console
      console.warn('[Notify] 免费路线下 SMS_PROVIDER=real 无效，回退 console');
    }
    return ['console'];
  }

  shouldExposeDevCode(): boolean {
    const flag = (process.env.NOTIFY_EXPOSE_DEV_CODE || '').toLowerCase();
    if (flag === 'true' || flag === '1') return true;
    if (flag === 'false' || flag === '0') return false;
    return (process.env.NODE_ENV || 'development') !== 'production';
  }

  /** 手机号脱敏：138****1234 */
  maskPhone(phone: string): string {
    const p = (phone || '').trim();
    if (p.length >= 7) return `${p.slice(0, 3)}****${p.slice(-4)}`;
    if (p.length >= 4) return `****${p.slice(-4)}`;
    return '****';
  }

  /** 共享通道用摘要（不含取件码/验证码） */
  private buildPublicContent(payload: NotifyPayload): string {
    if (payload.publicContent) return payload.publicContent;
    const tail = this.maskPhone(payload.phone);
    if (payload.templateCode === 'inbound_notice') {
      return `【到件公告】收件人 ${tail} 有新包裹到站。取件码仅向本人推送或现场查询，本群不公示。`;
    }
    if (payload.templateCode === 'overdue_remind') {
      return `【滞留公告】收件人 ${tail} 有包裹即将超期退回，请尽快到店取件。取件码不在本群公示。`;
    }
    if (payload.templateCode === 'kiosk_code') {
      return `【系统】有用户请求查件验证码（${tail}）。验证码不在群内发送。`;
    }
    return `【通知】涉及收件人 ${tail} 的业务提醒（详情已对本人脱敏处理）。`;
  }

  async sendInboundNotice(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    pickupCode: string;
    parcelId?: string;
    stationId?: string;
  }): Promise<NotifyDispatchResult> {
    const content = `【${opts.stationName}】您有包裹已到，取件码 ${opts.pickupCode}，请凭码到对应货架取件。`;
    const publicContent = `【${opts.stationName}·到件公告】收件人 ${this.maskPhone(
      opts.phone,
    )} 有新包裹到站。取件码仅向本人推送或现场查询，本群不公示。`;
    return this.dispatch({
      phone: opts.phone,
      recipientName: opts.recipientName,
      title: `入库通知 · ${opts.stationName}`,
      content,
      publicContent,
      templateCode: 'inbound_notice',
      parcelId: opts.parcelId,
      stationId: opts.stationId,
      params: { pickupCode: opts.pickupCode, stationName: opts.stationName },
    });
  }

  async sendOverdueRemind(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    days: number;
    pickupCode?: string;
    parcelId?: string;
    stationId?: string;
  }): Promise<NotifyDispatchResult> {
    const content = `【${opts.stationName}】您的包裹已到 ${opts.days} 天，即将退回，请立即取件${
      opts.pickupCode ? `，取件码 ${opts.pickupCode}` : ''
    }。`;
    const publicContent = `【${opts.stationName}·滞留公告】收件人 ${this.maskPhone(
      opts.phone,
    )} 有包裹已到 ${opts.days} 天，即将退回。取件码不在本群公示。`;
    return this.dispatch({
      phone: opts.phone,
      recipientName: opts.recipientName,
      title: `滞留提醒 · ${opts.stationName}`,
      content,
      publicContent,
      templateCode: 'overdue_remind',
      parcelId: opts.parcelId,
      stationId: opts.stationId,
      params: {
        days: opts.days,
        pickupCode: opts.pickupCode,
        stationName: opts.stationName,
      },
    });
  }

  async sendVerificationCode(opts: {
    phone: string;
    code: string;
    ttlMinutes: number;
    stationId?: string;
  }): Promise<void> {
    const content = `【智能快递驿站】您的查件验证码为 ${opts.code}，${opts.ttlMinutes} 分钟内有效。`;
    // 验证码绝不进企微群：publicContent 仅作跳过标记用途，wecom 会 skip
    await this.dispatch({
      phone: opts.phone,
      title: '查件验证码',
      content,
      publicContent: '',
      templateCode: 'kiosk_code',
      stationId: opts.stationId,
      params: { ttlMinutes: opts.ttlMinutes },
    });
  }

  /** 客户提交预约到店 */
  async sendAppointmentCreated(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    slotDate: string;
    slotLabel: string;
    stationId?: string;
  }): Promise<NotifyDispatchResult> {
    const content = `【${opts.stationName}】您已预约 ${opts.slotDate} ${opts.slotLabel} 到店取件。请按时带手机号到店；取件码请在查件页或货架查看。`;
    const publicContent = `【${opts.stationName}·预约到店】收件人 ${this.maskPhone(
      opts.phone,
    )} 预约 ${opts.slotDate} ${opts.slotLabel} 到店。取件码不在本群公示。`;
    return this.dispatch({
      phone: opts.phone,
      recipientName: opts.recipientName,
      title: `预约到店 · ${opts.stationName}`,
      content,
      publicContent,
      templateCode: 'appointment_created',
      stationId: opts.stationId,
      params: {
        slotDate: opts.slotDate,
        slotLabel: opts.slotLabel,
        stationName: opts.stationName,
      },
    });
  }

  /** 店员确认预约 */
  async sendAppointmentConfirmed(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    slotDate: string;
    slotLabel: string;
    stationId?: string;
  }): Promise<NotifyDispatchResult> {
    const content = `【${opts.stationName}】您的预约已确认：${opts.slotDate} ${opts.slotLabel}，请按时到店取件。取件码仍以查件/货架为准。`;
    const publicContent = `【${opts.stationName}·预约确认】收件人 ${this.maskPhone(
      opts.phone,
    )} 的 ${opts.slotDate} ${opts.slotLabel} 到店预约已确认。`;
    return this.dispatch({
      phone: opts.phone,
      recipientName: opts.recipientName,
      title: `预约确认 · ${opts.stationName}`,
      content,
      publicContent,
      templateCode: 'appointment_confirmed',
      stationId: opts.stationId,
      params: {
        slotDate: opts.slotDate,
        slotLabel: opts.slotLabel,
        stationName: opts.stationName,
      },
    });
  }

  /** 免费通道瞬时失败退避：400ms → 1000ms，最多 3 次 */
  private static readonly RETRY_DELAYS_MS = [400, 1000];

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 配置缺失/参数错误不重试；其余外部错误（网络/5xx/限流/未知）可短退避重试 */
  private isRetryableNotifyError(err: unknown): boolean {
    const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
    if (!msg.trim()) return true;
    // 配置/绑定问题：立即失败
    if (
      msg.includes('未配置') ||
      msg.includes('为空') ||
      msg.includes('unsupported') ||
      msg.includes('invalid token')
    ) {
      return false;
    }
    // 多数 4xx 不重试；408/429 可重试
    if (/http 4\d\d/.test(msg) && !msg.includes('http 408') && !msg.includes('http 429')) {
      return false;
    }
    return true;
  }

  /**
   * 对外部 HTTP 通道做短退避重试。
   * 成功返回 attempts；失败抛出 Error，并带 attempts / retried 字段。
   */
  private async withNotifyRetry(
    label: string,
    fn: () => Promise<void>,
  ): Promise<{ attempts: number; retried: boolean }> {
    const maxAttempts = NotifyService.RETRY_DELAYS_MS.length + 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await fn();
        if (attempt > 1) {
          // eslint-disable-next-line no-console
          console.warn(`[Notify/${label}] 第 ${attempt} 次尝试成功`);
        }
        return { attempts: attempt, retried: attempt > 1 };
      } catch (err) {
        lastErr = err;
        const retryable = this.isRetryableNotifyError(err);
        if (!retryable || attempt >= maxAttempts) {
          const msg = err instanceof Error ? err.message : String(err);
          const wrapped = new Error(msg) as Error & { attempts?: number; retried?: boolean };
          wrapped.attempts = attempt;
          wrapped.retried = attempt > 1;
          throw wrapped;
        }
        const delay = NotifyService.RETRY_DELAYS_MS[attempt - 1] || 1000;
        // eslint-disable-next-line no-console
        console.warn(
          `[Notify/${label}] 第 ${attempt} 次失败，${delay}ms 后重试:`,
          err instanceof Error ? err.message : String(err),
        );
        await this.sleep(delay);
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    const wrapped = new Error(msg) as Error & { attempts?: number; retried?: boolean };
    wrapped.attempts = maxAttempts;
    wrapped.retried = true;
    throw wrapped;
  }

  /**
   * 扇出：
   * 1) ops console → 完整
   * 2) ops wecom → 脱敏（验证码模板跳过）
   * 3) ops serverchan env → 完整（管理员个人）
   * 4) 客户绑定 → 完整（一对一）
   */
  private async dispatch(payload: NotifyPayload): Promise<NotifyDispatchResult> {
    const results: NotifyChannelResult[] = [];
    const ops = this.getOpsChannels();
    const publicText = this.buildPublicContent(payload);

    for (const channel of ops) {
      try {
        if (channel === 'console') {
          await this.sendConsole(payload.content, payload);
          results.push({ channel, ok: true, mode: 'full', attempts: 1 });
        } else if (channel === 'wecom') {
          // 验证码 / 空摘要：不进共享群
          if (payload.templateCode === 'kiosk_code' || !publicText.trim()) {
            results.push({ channel, ok: true, mode: 'skipped_private', attempts: 1 });
            continue;
          }
          const { attempts, retried } = await this.withNotifyRetry('wecom', () =>
            this.sendWecom(payload.title, publicText),
          );
          results.push({
            channel,
            ok: true,
            mode: 'public',
            attempts,
            retried,
          });
        } else if (channel === 'serverchan') {
          // 环境变量 SendKey = 管理员个人旁路，可收完整内容（仅你自己）
          const { attempts, retried } = await this.withNotifyRetry('serverchan', () =>
            this.sendServerChan(payload.title, payload.content, process.env.SERVERCHAN_SENDKEY),
          );
          results.push({
            channel,
            ok: true,
            mode: 'admin_full',
            attempts,
            retried,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempts =
          typeof (err as { attempts?: number })?.attempts === 'number'
            ? (err as { attempts: number }).attempts
            : 1;
        const retried =
          typeof (err as { retried?: boolean })?.retried === 'boolean'
            ? (err as { retried: boolean }).retried
            : attempts > 1;
        // eslint-disable-next-line no-console
        console.error(`[Notify/${channel}] 发送失败:`, msg);
        results.push({
          channel,
          ok: false,
          error: msg,
          attempts,
          retried,
        });
      }
    }

    // 客户一对一绑定
    try {
      const bindings = await this.listActiveBindings(payload.phone, payload.stationId);
      for (const b of bindings) {
        const channelKey = `binding:${b.channel}:${b.id.slice(0, 8)}`;
        try {
          let attempts = 1;
          let retried = false;
          if (b.channel === 'wxpusher') {
            ({ attempts, retried } = await this.withNotifyRetry(channelKey, () =>
              this.sendWxPusher(payload.title, payload.content, [b.target]),
            ));
          } else if (b.channel === 'pushplus') {
            ({ attempts, retried } = await this.withNotifyRetry(channelKey, () =>
              this.sendPushPlus(payload.title, payload.content, b.target),
            ));
          } else if (b.channel === 'serverchan') {
            ({ attempts, retried } = await this.withNotifyRetry(channelKey, () =>
              this.sendServerChan(payload.title, payload.content, b.target),
            ));
          } else {
            results.push({
              channel: `binding:${b.channel}`,
              ok: false,
              error: `unsupported channel ${b.channel}`,
              attempts: 1,
            });
            continue;
          }
          results.push({
            channel: channelKey,
            ok: true,
            mode: 'customer_full',
            attempts,
            retried,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const attempts =
            typeof (err as { attempts?: number })?.attempts === 'number'
              ? (err as { attempts: number }).attempts
              : 1;
          const retried =
            typeof (err as { retried?: boolean })?.retried === 'boolean'
              ? (err as { retried: boolean }).retried
              : attempts > 1;
          // eslint-disable-next-line no-console
          console.error(`[Notify/binding] 发送失败:`, msg);
          results.push({
            channel: channelKey,
            ok: false,
            error: msg,
            attempts,
            retried,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[Notify] 查询客户绑定失败:', msg);
      results.push({ channel: 'bindings_lookup', ok: false, error: msg, attempts: 1 });
    }

    const anyOk = results.some((r) => r.ok);
    const errors = results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`);
    await this.log({
      phone: payload.phone,
      recipientName: payload.recipientName,
      templateCode: payload.templateCode,
      content: payload.content,
      status: anyOk ? 'sent' : 'failed',
      errorMsg: errors.length ? errors.join(' | ') : null,
      parcelId: payload.parcelId,
      stationId: payload.stationId,
      params: {
        ...(payload.params || {}),
        publicContent: publicText,
        channelResults: results,
        freeRoute: true,
        privacy: 'wecom_public_only',
      },
    });

    const customerResults = results.filter((r) => String(r.channel).startsWith('binding:'));
    const customerBound = customerResults.length > 0;
    const customerPushed = customerResults.some((r) => r.ok);
    const customerChannels = [
      ...new Set(
        customerResults.map((r) => {
          const ch = String(r.channel);
          if (ch.includes('wxpusher')) return 'wxpusher';
          if (ch.includes('pushplus')) return 'pushplus';
          if (ch.includes('serverchan')) return 'serverchan';
          return ch;
        }),
      ),
    ];
    return {
      attempted: true,
      customerBound,
      customerChannels,
      customerPushed,
      channelResults: results,
      staffMessage: this.buildStaffMessage({
        templateCode: payload.templateCode,
        customerBound,
        customerPushed,
        customerChannels,
        results,
      }),
    };
  }

  private buildStaffMessage(opts: {
    templateCode?: string;
    customerBound: boolean;
    customerPushed: boolean;
    customerChannels: string[];
    results: NotifyChannelResult[];
  }): string {
    const parts: string[] = [];
    const wecom = opts.results.find((r) => r.channel === 'wecom');
    if (wecom?.ok && wecom.mode === 'public') parts.push('通知群已发脱敏公告');
    if (wecom?.ok && wecom.mode === 'skipped_private') parts.push('验证码未进群');
    if (wecom && !wecom.ok) parts.push('通知群发送失败');

    const isAppt =
      opts.templateCode === 'appointment_created' ||
      opts.templateCode === 'appointment_confirmed';

    if (!opts.customerBound) {
      parts.push(
        isAppt
          ? '客户未绑定微信，预约提醒未私信（客户可在查件页自查预约）'
          : '客户未绑定微信，取件码未私信（请当面报码；客户在查件页绑定后会自动补发）',
      );
    } else if (opts.customerPushed) {
      const customerOk = opts.results.filter(
        (r) => String(r.channel).startsWith('binding:') && r.ok,
      );
      const retriedOk = customerOk.some((r) => (r.attempts || 1) > 1 || r.retried);
      if (retriedOk) {
        parts.push(
          isAppt
            ? '预约提醒已私信到客户微信（自动重试后成功）'
            : '取件码已私信到客户微信（自动重试后成功）',
        );
      } else {
        parts.push(isAppt ? '预约提醒已私信到客户微信' : '取件码已私信到客户微信');
      }
    } else {
      parts.push(
        isAppt
          ? '客户已绑定但预约提醒发送失败（已自动重试），请核对绑定'
          : '客户已绑定但私信发送失败（已自动重试），请核对绑定或让客户现场查码',
      );
    }
    return parts.join('；');
  }

  private async listActiveBindings(
    phone: string,
    stationId?: string,
  ): Promise<Array<{ id: string; channel: string; target: string }>> {
    if (!phone) return [];
    let q = this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .select('id, channel, target')
      .eq('phone', phone)
      .eq('status', 'active');
    if (stationId) q = q.eq('station_id', stationId);
    const { data, error } = await q;
    if (error) {
      // 表未迁移时不打断主流程
      if (String(error.message || '').includes('ss_notify_bindings')) {
        // eslint-disable-next-line no-console
        console.warn('[Notify] ss_notify_bindings 不存在，跳过客户绑定推送。请执行 database-init.sql 补丁。');
        return [];
      }
      throw new Error(error.message);
    }
    return (data || []).map((r: any) => ({
      id: r.id as string,
      channel: r.channel as string,
      target: r.target as string,
    }));
  }

  private async sendConsole(content: string, payload: NotifyPayload): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[Notify/console] ${payload.templateCode} -> ${payload.phone}` +
        (payload.recipientName ? ` (${payload.recipientName})` : '') +
        `: ${content}`,
    );
  }

  private async sendWecom(title: string, content: string): Promise<void> {
    const url = (process.env.WECOM_WEBHOOK_URL || '').trim();
    if (!url) throw new Error('未配置 WECOM_WEBHOOK_URL');

    const text = `${title}\n${content}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content: text },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
    if (body.errcode && body.errcode !== 0) {
      throw new Error(body.errmsg || `errcode=${body.errcode}`);
    }
  }

  private async sendServerChan(
    title: string,
    content: string,
    sendkeyRaw?: string | null,
  ): Promise<void> {
    const sendkey = (sendkeyRaw || '').trim();
    if (!sendkey) throw new Error('未配置 SERVERCHAN_SENDKEY');

    const endpoint = `https://sctapi.ftqq.com/${encodeURIComponent(sendkey)}.send`;
    const form = new URLSearchParams();
    form.set('title', title.slice(0, 32));
    form.set('desp', content);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (body.code !== undefined && body.code !== 0) {
      throw new Error(body.message || `code=${body.code}`);
    }
  }

  /** WxPusher 一对一推送（客户 UID） */
  private async sendWxPusher(
    title: string,
    content: string,
    uids: string[],
  ): Promise<void> {
    const appToken = (process.env.WXPUSHER_APP_TOKEN || '').trim();
    if (!appToken) throw new Error('未配置 WXPUSHER_APP_TOKEN');
    const cleanUids = (uids || []).map((u) => String(u || '').trim()).filter(Boolean);
    if (cleanUids.length === 0) throw new Error('WxPusher UID 为空');

    const bodyText = title ? `${title}\n${content}` : content;
    const res = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appToken,
        content: bodyText,
        contentType: 1,
        uids: cleanUids,
        summary: (title || content).slice(0, 20),
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: unknown;
    };
    if (body.code !== 1000) {
      throw new Error(body.msg || `wxpusher code=${body.code}`);
    }
  }

  /** PushPlus 一对一推送（客户 token） */
  private async sendPushPlus(
    title: string,
    content: string,
    tokenRaw?: string | null,
  ): Promise<void> {
    const token = (tokenRaw || '').trim();
    if (!token) throw new Error('PushPlus token 为空');

    const res = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        title: (title || '通知').slice(0, 100),
        content,
        template: 'txt',
        channel: 'wechat',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: unknown;
    };
    // 官方成功码 200
    if (body.code !== undefined && body.code !== 200) {
      throw new Error(body.msg || `pushplus code=${body.code}`);
    }
  }

  /** 创建带参关注二维码（扫码后可轮询 UID） */
  async createWxPusherQrcode(opts: {
    extra: string;
    validTimeSec?: number;
  }): Promise<{ code: string; url: string; shortUrl?: string; expires?: number }> {
    const appToken = (process.env.WXPUSHER_APP_TOKEN || '').trim();
    if (!appToken) throw new Error('未配置 WXPUSHER_APP_TOKEN');

    const validTime = Math.min(Math.max(opts.validTimeSec ?? 1800, 60), 30 * 24 * 3600);
    const res = await fetch('https://wxpusher.zjiecode.com/api/fun/create/qrcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appToken,
        extra: opts.extra,
        validTime,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { code?: string; url?: string; shortUrl?: string; expires?: number };
    };
    if (body.code !== 1000 || !body.data?.code) {
      throw new Error(body.msg || `wxpusher create qrcode failed code=${body.code}`);
    }
    const code = String(body.data.code);
    const url =
      body.data.url ||
      body.data.shortUrl ||
      `https://wxpusher.zjiecode.com/api/qrcode/${encodeURIComponent(code)}`;
    return {
      code,
      url,
      shortUrl: body.data.shortUrl,
      expires: body.data.expires ?? validTime,
    };
  }

  /** 轮询扫码关注得到的 UID；未扫返回 null */
  async pollWxPusherScanUid(code: string): Promise<string | null> {
    const c = (code || '').trim();
    if (!c) return null;
    const res = await fetch(
      `https://wxpusher.zjiecode.com/api/fun/scan-qrcode-uid?code=${encodeURIComponent(c)}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: string | null;
    };
    if (body.code !== 1000) {
      // 未扫或过期等业务态：无 UID 即 null
      return null;
    }
    const uid = (body.data || '').trim();
    return uid || null;
  }

  /** 绑定成功后发一条测试完整消息到客户通道 */
  async sendBindTest(opts: {
    phone: string;
    channel: 'wxpusher' | 'pushplus' | 'serverchan';
    target: string;
    stationName?: string;
  }): Promise<void> {
    const title = '绑定成功';
    const content = `【${opts.stationName || '智能快递驿站'}】手机号 ${this.maskPhone(
      opts.phone,
    )} 已绑定取件通知。后续到件/滞留提醒将私信推送到此微信，含取件码（仅你可见）。`;
    if (opts.channel === 'wxpusher') {
      await this.sendWxPusher(title, content, [opts.target]);
      return;
    }
    if (opts.channel === 'pushplus') {
      await this.sendPushPlus(title, content, opts.target);
      return;
    }
    await this.sendServerChan(title, content, opts.target);
  }

  private async log(opts: {
    phone: string;
    recipientName?: string | null;
    templateCode: string;
    content: string;
    status: 'sent' | 'failed';
    errorMsg?: string | null;
    parcelId?: string;
    stationId?: string;
    params?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.supabase.getClient().from('ss_sms_logs').insert({
        recipient_phone: opts.phone,
        recipient_name: opts.recipientName ?? null,
        template_code: opts.templateCode,
        content: opts.content,
        status: opts.status,
        error_message: opts.errorMsg ?? null,
        parcel_id: opts.parcelId ?? null,
        station_id: opts.stationId ?? null,
        params: opts.params ?? null,
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NotifyService] 写入通知日志失败:', err);
    }
  }
}
