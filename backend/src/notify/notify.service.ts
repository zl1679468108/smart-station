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
 *   - 兼容 serverchan：历史 SendKey 绑定
 *
 * 失败不阻断主流程；日志写 ss_sms_logs。
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
  }): Promise<void> {
    const content = `【${opts.stationName}】您有包裹已到，取件码 ${opts.pickupCode}，请凭码到对应货架取件。`;
    const publicContent = `【${opts.stationName}·到件公告】收件人 ${this.maskPhone(
      opts.phone,
    )} 有新包裹到站。取件码仅向本人推送或现场查询，本群不公示。`;
    await this.dispatch({
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
  }): Promise<void> {
    const content = `【${opts.stationName}】您的包裹已到 ${opts.days} 天，即将退回，请立即取件${
      opts.pickupCode ? `，取件码 ${opts.pickupCode}` : ''
    }。`;
    const publicContent = `【${opts.stationName}·滞留公告】收件人 ${this.maskPhone(
      opts.phone,
    )} 有包裹已到 ${opts.days} 天，即将退回。取件码不在本群公示。`;
    await this.dispatch({
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

  /**
   * 扇出：
   * 1) ops console → 完整
   * 2) ops wecom → 脱敏（验证码模板跳过）
   * 3) ops serverchan env → 完整（管理员个人）
   * 4) 客户绑定 → 完整（一对一）
   */
  private async dispatch(payload: NotifyPayload): Promise<void> {
    const results: Array<{ channel: string; ok: boolean; error?: string; mode?: string }> = [];
    const ops = this.getOpsChannels();
    const publicText = this.buildPublicContent(payload);

    for (const channel of ops) {
      try {
        if (channel === 'console') {
          await this.sendConsole(payload.content, payload);
          results.push({ channel, ok: true, mode: 'full' });
        } else if (channel === 'wecom') {
          // 验证码 / 空摘要：不进共享群
          if (payload.templateCode === 'kiosk_code' || !publicText.trim()) {
            results.push({ channel, ok: true, mode: 'skipped_private' });
            continue;
          }
          await this.sendWecom(payload.title, publicText);
          results.push({ channel, ok: true, mode: 'public' });
        } else if (channel === 'serverchan') {
          // 环境变量 SendKey = 管理员个人旁路，可收完整内容（仅你自己）
          await this.sendServerChan(payload.title, payload.content, process.env.SERVERCHAN_SENDKEY);
          results.push({ channel, ok: true, mode: 'admin_full' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`[Notify/${channel}] 发送失败:`, msg);
        results.push({ channel, ok: false, error: msg });
      }
    }

    // 客户一对一绑定
    try {
      const bindings = await this.listActiveBindings(payload.phone, payload.stationId);
      for (const b of bindings) {
        try {
          if (b.channel === 'wxpusher') {
            await this.sendWxPusher(payload.title, payload.content, [b.target]);
            results.push({
              channel: `binding:wxpusher:${b.id.slice(0, 8)}`,
              ok: true,
              mode: 'customer_full',
            });
          } else if (b.channel === 'serverchan') {
            await this.sendServerChan(payload.title, payload.content, b.target);
            results.push({
              channel: `binding:serverchan:${b.id.slice(0, 8)}`,
              ok: true,
              mode: 'customer_full',
            });
          } else {
            results.push({
              channel: `binding:${b.channel}`,
              ok: false,
              error: `unsupported channel ${b.channel}`,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`[Notify/binding] 发送失败:`, msg);
          results.push({
            channel: `binding:${b.channel}`,
            ok: false,
            error: msg,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[Notify] 查询客户绑定失败:', msg);
      results.push({ channel: 'bindings_lookup', ok: false, error: msg });
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
    channel: 'wxpusher' | 'serverchan';
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
