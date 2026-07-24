import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotifyService } from '../notify/notify.service';
import {
  SendCodeDto,
  QueryByPhoneDto,
  QueryByPhoneDirectDto,
  QueryByTrackingDto,
  QueryByCodeDto,
} from './dto/kiosk.dto';

/**
 * Kiosk 取件自助查询服务
 * - 公开接口（@Public）
 * - 限流：同 IP 每分钟 ≤10 次（ThrottlerGuard）；直查接口更严
 * - 验证码：同手机号每小时 ≤5 次
 * - 脱敏：手机号仅尾号 4 位，姓名首字 + **
 * - 驿站隔离：查询强制 station_id（显式 stationId 或默认第一个 active 驿站）
 * - 取件码错误锁定：ss_pickup_code_attempts（与出库侧同表，多实例一致）
 */

const CODE_TTL_MINUTES = 5;
const MAX_SEND_PER_HOUR = 5;
const MAX_CODE_QUERY_ATTEMPTS = 5;
const CODE_QUERY_LOCK_MINUTES = 10;

@Injectable()
export class KioskService {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    private readonly notify: NotifyService,
  ) {}

  /**
   * 发送验证码
   * 免费通道路线：经 NotifyService 推 console / 企业微信 / Server酱；
   * 非 production（或 NOTIFY_EXPOSE_DEV_CODE=true）时响应附带 devCode，便于 PC/PAD/H5 联调。
   */
  async sendCode(dto: SendCodeDto, ip?: string, stationId?: string) {
    // 限流：同手机号 1 小时内 ≤5 次
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', dto.phone)
      .gte('created_at', oneHourAgo);
    if (countErr) throw new Error(`查询验证码次数失败: ${countErr.message}`);
    if ((count || 0) >= MAX_SEND_PER_HOUR) {
      throw new ForbiddenException('该手机号验证码请求过于频繁，请稍后再试');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error } = await this.supabase.getClient().from('ss_kiosk_codes').insert({
      phone: dto.phone,
      code,
      expires_at: expiresAt,
      ip_address: ip || null,
    });
    if (error) throw new Error(`验证码发送失败: ${error.message}`);

    try {
      await this.notify.sendVerificationCode({
        phone: dto.phone,
        code,
        ttlMinutes: CODE_TTL_MINUTES,
        stationId,
      });
    } catch {
      // 通知失败不阻断验证码发放
    }

    const result: { sent: boolean; ttlSeconds: number; devCode?: string } = {
      sent: true,
      ttlSeconds: CODE_TTL_MINUTES * 60,
    };
    if (this.notify.shouldExposeDevCode()) {
      result.devCode = code;
    }
    return result;
  }

  /** 手机号尾号 + 验证码查询 */
  async queryByPhone(dto: QueryByPhoneDto, stationId?: string) {
    const { data: codeRows, error: codeErr } = await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .select('id, phone, code, expires_at, used_at')
      .like('phone', `%${dto.phoneTail}`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (codeErr) throw new Error(`验证码查询失败: ${codeErr.message}`);

    const matched = (codeRows || []).find(
      (r: any) => r.code === dto.code && !r.used_at && new Date(r.expires_at).getTime() > Date.now(),
    );
    if (!matched) {
      throw new BadRequestException('验证码错误或已过期');
    }

    await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matched.id);

    const phone = (matched as any).phone as string;
    return this.queryInStockParcels({ recipientPhone: phone, stationId });
  }

  /** 运单号查询（无需验证码） */
  async queryByTracking(dto: QueryByTrackingDto, stationId?: string) {
    return this.queryInStockParcels({
      trackingNumber: dto.trackingNumber.trim().toUpperCase(),
      stationId,
    });
  }

  /** 手机号直接查询（脱敏返回） */
  async queryByPhoneDirect(dto: QueryByPhoneDirectDto, stationId?: string) {
    return this.queryInStockParcels({ recipientPhone: dto.phone, stationId });
  }

  /** 取件码查询（错误 5 次锁定 10 分钟，落库） */
  async queryByCode(dto: QueryByCodeDto, stationId?: string) {
    const resolvedStationId = await this.resolveStationId(stationId);
    await this.checkCodeQueryLock(resolvedStationId, dto.code);

    const result = await this.queryInStockParcels({
      pickupCode: dto.code,
      stationId: resolvedStationId,
    });

    if (result.total === 0) {
      await this.recordCodeQueryFailure(resolvedStationId, dto.code);
      throw new NotFoundException('未找到该取件码对应的在库包裹');
    }

    await this.clearCodeQueryFailures(resolvedStationId, dto.code);
    return result;
  }

  /**
   * 获取驿站货架平面图数据（公开接口）
   * - stationId 未传时取第一个 active 驿站（兼容单租户场景）
   */
  async getStationLayout(stationId?: string) {
    const client = this.supabase.getClient();
    const STATION_PUBLIC_FIELDS = 'id, name, address, contact_phone, business_hours, layout_config, notify_config';

    const targetStationId = await this.resolveStationId(stationId);
    const { data: st, error: stErr } = await client
      .from('ss_stations')
      .select(STATION_PUBLIC_FIELDS)
      .eq('id', targetStationId)
      .maybeSingle();
    if (stErr) throw new Error(`查询驿站户型失败: ${stErr.message}`);
    const stationRow = (st as Record<string, unknown>) ?? null;

    const stationLayoutConfig =
      (stationRow?.layout_config as Record<string, unknown> | null) ?? null;

    const { data, error } = await client
      .from('ss_shelves')
      .select('number, size_type, layers, description, pos_x, pos_y, rotation, zone')
      .eq('station_id', targetStationId)
      .eq('status', 'active')
      .order('number', { ascending: true });
    if (error) throw new Error(`查询货架失败: ${error.message}`);

    const rawConfig = (stationLayoutConfig as Record<string, unknown> | null) || {};
    const publicLayoutConfig: Record<string, unknown> = {};
    if (rawConfig.bounds) publicLayoutConfig.bounds = rawConfig.bounds;
    if (rawConfig.doors) publicLayoutConfig.doors = rawConfig.doors;
    if (rawConfig.areas) publicLayoutConfig.areas = rawConfig.areas;

    return {
      shelves: (data || []).map((s: any) => ({
        number: s.number,
        sizeType: s.size_type,
        layers: s.layers,
        description: s.description ?? null,
        posX: s.pos_x ?? null,
        posY: s.pos_y ?? null,
        rotation: s.rotation ?? 0,
        zone: s.zone ?? null,
      })),
      station: {
        name: (stationRow?.name as string) ?? null,
        address: (stationRow?.address as string) ?? null,
        contactPhone: (stationRow?.contact_phone as string) ?? null,
        businessHours: (stationRow?.business_hours as string) ?? null,
        layoutConfig: publicLayoutConfig,
        notifyGuide: this.normalizeNotifyGuide(stationRow?.notify_config),
      },
    };
  }


  /** 规范化对外公示的通知引导（过滤内部字段） */
  private normalizeNotifyGuide(raw: unknown) {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const bindEnabled = c.bindEnabled !== false;
    return {
      title: (c.title as string) || '取件消息通知',
      content:
        (c.content as string) ||
        '绑定后，包裹到了会发到你的微信（含取件码，只有你能看到）。通知群只发提醒，不会公开取件码。没绑定请到店查件。',
      wecomQrUrl: (c.wecomQrUrl as string) || '',
      wecomJoinTip:
        (c.wecomJoinTip as string) || '扫码加入驿站通知群（只发提醒，不公开取件码）',
      // 兼容历史字段；主绑定通道已切到 WxPusher 扫码
      serverchanGuideUrl: (c.serverchanGuideUrl as string) || '',
      serverchanGuide: (c.serverchanGuide as string) || '',
      wxpusherGuide:
        (c.wxpusherGuide as string) ||
        '1. 填写收件手机号，获取验证码\n2. 点「生成二维码」\n3. 用微信扫一扫完成绑定\n4. 之后包裹到了会发到你的微信',
      pushplusGuide:
        (c.pushplusGuide as string) ||
        '适合已有其他推送工具的用户。\n1. 在网页用微信登录\n2. 复制你的专属绑定码\n3. 回到这里验证手机号并粘贴',
      pushplusGuideUrl: (c.pushplusGuideUrl as string) || 'https://www.pushplus.plus/',
      bindEnabled,
      bindChannel: 'wxpusher' as const,
      bindChannels: ['wxpusher', 'pushplus'] as const,
    };
  }

  /** 公开：通知引导信息 */
  async getNotifyGuide(stationId?: string) {
    const targetStationId = await this.resolveStationId(stationId);
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id, name, notify_config')
      .eq('id', targetStationId)
      .maybeSingle();
    if (error) throw new Error(`查询通知引导失败: ${error.message}`);
    if (!data) throw new NotFoundException('驿站不存在');
    return {
      stationId: data.id,
      stationName: data.name,
      guide: this.normalizeNotifyGuide(data.notify_config),
    };
  }

  /** 校验并消耗验证码（绑定/解绑共用） */
  private async consumePhoneCode(phone: string, code: string) {
    const { data: rows, error } = await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .select('id, phone, code, expires_at, used_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(`验证码查询失败: ${error.message}`);
    const matched = (rows || []).find(
      (r: any) => r.code === code && !r.used_at && new Date(r.expires_at).getTime() > Date.now(),
    );
    if (!matched) {
      throw new BadRequestException('验证码错误或已过期');
    }
    await this.supabase
      .getClient()
      .from('ss_kiosk_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matched.id);
  }

  /**
   * 兼容旧版：Server酱 SendKey 绑定（不推荐，保留给已有绑定）
   * 完整取件码只会推到该 SendKey，不会进企微群。
   */
  async bindNotify(
    dto: { phone: string; code: string; sendKey: string },
    stationId?: string,
  ) {
    const targetStationId = await this.resolveStationId(stationId);
    await this.consumePhoneCode(dto.phone, dto.code);

    const sendKey = dto.sendKey.trim();
    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('name, notify_config')
      .eq('id', targetStationId)
      .maybeSingle();
    const guide = this.normalizeNotifyGuide(station?.notify_config);
    if (!guide.bindEnabled) {
      throw new ForbiddenException('该驿站暂未开放通知绑定');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .upsert(
        {
          station_id: targetStationId,
          phone: dto.phone,
          channel: 'serverchan',
          target: sendKey,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'station_id,phone,channel' },
      )
      .select('id, phone, channel, status, created_at, updated_at')
      .maybeSingle();

    if (error) {
      if (String(error.message || '').includes('ss_notify_bindings')) {
        throw new BadRequestException(
          '通知绑定表未初始化，请管理员在 Supabase 执行 migration-wxpusher-m35.sql',
        );
      }
      throw new Error(`绑定失败: ${error.message}`);
    }

    let testPushed = false;
    try {
      await this.notify.sendBindTest({
        phone: dto.phone,
        channel: 'serverchan',
        target: sendKey,
        stationName: station?.name,
      });
      testPushed = true;
    } catch {
      testPushed = false;
    }

    return {
      bound: true,
      phone: dto.phone,
      phoneMasked: this.notify.maskPhone(dto.phone),
      channel: 'serverchan',
      testPushed,
      message: testPushed
        ? '绑定成功，已发送测试消息到你的微信'
        : '绑定已保存，但测试推送失败，请检查 SendKey 是否正确',
      bindingId: data?.id,
    };
  }

  /**
   * WxPusher 扫码绑定 step1：校验验证码后创建关注二维码，并写入 pending。
   * 前端展示二维码后轮询 pollWxPusherBind。
   */
  async startWxPusherBind(
    dto: { phone: string; code: string },
    stationId?: string,
  ) {
    const targetStationId = await this.resolveStationId(stationId);
    await this.consumePhoneCode(dto.phone, dto.code);

    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('name, notify_config')
      .eq('id', targetStationId)
      .maybeSingle();
    const guide = this.normalizeNotifyGuide(station?.notify_config);
    if (!guide.bindEnabled) {
      throw new ForbiddenException('该驿站暂未开放通知绑定');
    }

    const extra = `ss:${targetStationId.slice(0, 8)}:${dto.phone.slice(-4)}:${Date.now().toString(36)}`.slice(
      0,
      64,
    );
    const validTimeSec = 30 * 60;
    let qr: { code: string; url: string; shortUrl?: string; expires?: number };
    try {
      qr = await this.notify.createWxPusherQrcode({ extra, validTimeSec });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(
        msg.includes('WXPUSHER_APP_TOKEN')
          ? '微信通知暂未开通，请联系店员'
          : `创建关注二维码失败：${msg}`,
      );
    }

    const expiresAt = new Date(Date.now() + validTimeSec * 1000).toISOString();
    const { error: pendErr } = await this.supabase.getClient().from('ss_notify_bind_pending').insert({
      station_id: targetStationId,
      phone: dto.phone,
      qr_code: qr.code,
      extra,
      expires_at: expiresAt,
      status: 'pending',
    });
    if (pendErr) {
      if (String(pendErr.message || '').includes('ss_notify_bind_pending')) {
        throw new BadRequestException(
          '绑定暂存表未初始化，请管理员在 Supabase 执行 migration-wxpusher-m35.sql',
        );
      }
      throw new Error(`创建绑定会话失败: ${pendErr.message}`);
    }

    return {
      channel: 'wxpusher' as const,
      qrCode: qr.code,
      qrUrl: qr.url,
      shortUrl: qr.shortUrl || qr.url,
      expiresAt,
      pollIntervalSec: 12,
      phone: dto.phone,
      phoneMasked: this.notify.maskPhone(dto.phone),
      stationName: station?.name || null,
      message: '请用微信扫一扫，完成后会自动绑定',
    };
  }

  /**
   * WxPusher 扫码绑定 step2：轮询扫码 UID，成功则 upsert 绑定并发测试消息。
   * 官方要求轮询间隔 ≥10s。
   */
  async pollWxPusherBind(qrCode: string, stationId?: string) {
    const code = (qrCode || '').trim();
    if (!code) throw new BadRequestException('缺少二维码 code');

    const targetStationId = await this.resolveStationId(stationId);
    const { data: pending, error: pErr } = await this.supabase
      .getClient()
      .from('ss_notify_bind_pending')
      .select('id, station_id, phone, qr_code, expires_at, status')
      .eq('qr_code', code)
      .maybeSingle();
    if (pErr) {
      if (String(pErr.message || '').includes('ss_notify_bind_pending')) {
        throw new BadRequestException(
          '绑定暂存表未初始化，请管理员在 Supabase 执行 migration-wxpusher-m35.sql',
        );
      }
      throw new Error(`查询绑定会话失败: ${pErr.message}`);
    }
    if (!pending) throw new BadRequestException('绑定会话不存在或已失效，请重新生成二维码');
    if (pending.station_id !== targetStationId) {
      throw new ForbiddenException('绑定会话与当前驿站不匹配');
    }
    if (pending.status === 'done') {
      return {
        status: 'done' as const,
        bound: true,
        channel: 'wxpusher' as const,
        phone: pending.phone,
        phoneMasked: this.notify.maskPhone(pending.phone),
        message: '已绑定成功',
      };
    }
    if (new Date(pending.expires_at).getTime() <= Date.now()) {
      await this.supabase
        .getClient()
        .from('ss_notify_bind_pending')
        .update({ status: 'expired' })
        .eq('id', pending.id);
      return {
        status: 'expired' as const,
        bound: false,
        message: '二维码已过期，请重新验证手机号并生成',
      };
    }

    let uid: string | null = null;
    try {
      uid = await this.notify.pollWxPusherScanUid(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`查询扫码状态失败：${msg}`);
    }

    if (!uid) {
      return {
        status: 'waiting' as const,
        bound: false,
        message: '请用微信扫一扫，完成后会自动绑定…',
        pollIntervalSec: 12,
      };
    }

    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('name')
      .eq('id', targetStationId)
      .maybeSingle();

    const { data: binding, error: bErr } = await this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .upsert(
        {
          station_id: targetStationId,
          phone: pending.phone,
          channel: 'wxpusher',
          target: uid,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'station_id,phone,channel' },
      )
      .select('id, phone, channel, status')
      .maybeSingle();

    if (bErr) {
      if (String(bErr.message || '').includes('ss_notify_bindings')) {
        throw new BadRequestException(
          '通知绑定表未初始化，请管理员在 Supabase 执行 migration-wxpusher-m35.sql',
        );
      }
      throw new Error(`绑定失败: ${bErr.message}`);
    }

    await this.supabase
      .getClient()
      .from('ss_notify_bind_pending')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', pending.id);

    let testPushed = false;
    try {
      await this.notify.sendBindTest({
        phone: pending.phone,
        channel: 'wxpusher',
        target: uid,
        stationName: station?.name,
      });
      testPushed = true;
    } catch {
      testPushed = false;
    }

    return {
      status: 'done' as const,
      bound: true,
      channel: 'wxpusher' as const,
      phone: pending.phone,
      phoneMasked: this.notify.maskPhone(pending.phone),
      bindingId: binding?.id,
      testPushed,
      message: testPushed
        ? '绑定成功，已发送测试消息到你的微信'
        : '绑定已保存，但测试推送失败，请稍后重试入库通知',
    };
  }

  /**
   * PushPlus 客户绑定：手机号 + 验证码 + token
   * 完整取件码一对一推送到该 token，不进企微群。
   */
  async bindPushPlus(
    dto: { phone: string; code: string; token: string },
    stationId?: string,
  ) {
    const targetStationId = await this.resolveStationId(stationId);
    await this.consumePhoneCode(dto.phone, dto.code);

    const token = dto.token.trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
      throw new BadRequestException('专属绑定码格式不正确，请重新复制粘贴');
    }

    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('name, notify_config')
      .eq('id', targetStationId)
      .maybeSingle();
    const guide = this.normalizeNotifyGuide(station?.notify_config);
    if (!guide.bindEnabled) {
      throw new ForbiddenException('该驿站暂未开放通知绑定');
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .upsert(
        {
          station_id: targetStationId,
          phone: dto.phone,
          channel: 'pushplus',
          target: token,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'station_id,phone,channel' },
      )
      .select('id, phone, channel, status')
      .maybeSingle();

    if (error) {
      if (String(error.message || '').includes('ss_notify_bindings')) {
        throw new BadRequestException(
          '通知绑定表未初始化，请管理员在 Supabase 执行 migration-pushplus-m36.sql',
        );
      }
      throw new Error(`绑定失败: ${error.message}`);
    }

    let testPushed = false;
    try {
      await this.notify.sendBindTest({
        phone: dto.phone,
        channel: 'pushplus',
        target: token,
        stationName: station?.name,
      });
      testPushed = true;
    } catch {
      testPushed = false;
    }

    return {
      bound: true,
      phone: dto.phone,
      phoneMasked: this.notify.maskPhone(dto.phone),
      channel: 'pushplus' as const,
      testPushed,
      message: testPushed
        ? '绑定成功，已发送测试消息到你的微信'
        : '绑定已保存，但测试消息发送失败，请检查绑定码是否正确',
      bindingId: data?.id,
    };
  }

  /**
   * 查询手机号是否已绑定任意客户通知通道（不返回 target，防泄露）
   */
  async getNotifyBindStatus(phone: string, stationId?: string) {
    const p = (phone || '').trim();
    if (!/^1\d{10}$/.test(p)) {
      throw new BadRequestException('手机号格式不正确');
    }
    const targetStationId = await this.resolveStationId(stationId);
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .select('channel, status')
      .eq('station_id', targetStationId)
      .eq('phone', p)
      .eq('status', 'active');

    if (error) {
      if (String(error.message || '').includes('ss_notify_bindings')) {
        return {
          phone: p,
          phoneMasked: this.notify.maskPhone(p),
          bound: false,
          channels: [] as string[],
          bindEnabled: true,
          message: '绑定表未初始化',
        };
      }
      throw new Error(`查询绑定状态失败: ${error.message}`);
    }

    const channels = [...new Set((data || []).map((r: any) => String(r.channel)))];
    const { data: station } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('notify_config')
      .eq('id', targetStationId)
      .maybeSingle();
    const guide = this.normalizeNotifyGuide(station?.notify_config);

    return {
      phone: p,
      phoneMasked: this.notify.maskPhone(p),
      bound: channels.length > 0,
      channels,
      bindEnabled: guide.bindEnabled,
      message: channels.length
        ? '已绑定微信通知，包裹到了会发到你的微信'
        : '还没绑定微信通知：包裹到了不会发到你微信，群里也不会公开取件码，请到店查件',
    };
  }

  async unbindNotify(dto: { phone: string; code: string }, stationId?: string) {
    const targetStationId = await this.resolveStationId(stationId);
    await this.consumePhoneCode(dto.phone, dto.code);
    const { error } = await this.supabase
      .getClient()
      .from('ss_notify_bindings')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('station_id', targetStationId)
      .eq('phone', dto.phone)
      .in('channel', ['wxpusher', 'pushplus', 'serverchan']);
    if (error) throw new Error(`解绑失败: ${error.message}`);
    return { unbound: true, phone: dto.phone };
  }


  // ============ 取件码查询错误计数（持久化） ============

  private async checkCodeQueryLock(stationId: string, code: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('attempt_count, locked_until')
      .eq('station_id', stationId)
      .eq('pickup_code', code)
      .maybeSingle();
    if (data?.locked_until) {
      const until = new Date(data.locked_until).getTime();
      if (Date.now() < until) {
        const remainMin = Math.ceil((until - Date.now()) / 60000);
        throw new ForbiddenException(`该取件码查询错误次数过多，请 ${remainMin} 分钟后重试`);
      }
    }
  }

  private async recordCodeQueryFailure(stationId: string, code: string) {
    const { data } = await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .select('id, attempt_count')
      .eq('station_id', stationId)
      .eq('pickup_code', code)
      .maybeSingle();

    const next = (data?.attempt_count || 0) + 1;
    const locked = next >= MAX_CODE_QUERY_ATTEMPTS;
    const patch: {
      attempt_count: number;
      last_attempt_at: string;
      locked_until?: string | null;
    } = {
      attempt_count: next,
      last_attempt_at: new Date().toISOString(),
    };
    if (locked) {
      patch.locked_until = new Date(
        Date.now() + CODE_QUERY_LOCK_MINUTES * 60 * 1000,
      ).toISOString();
    }

    if (data?.id) {
      await this.supabase
        .getClient()
        .from('ss_pickup_code_attempts')
        .update(patch)
        .eq('id', data.id);
    } else {
      await this.supabase.getClient().from('ss_pickup_code_attempts').insert({
        station_id: stationId,
        pickup_code: code,
        ...patch,
      });
    }
  }

  private async clearCodeQueryFailures(stationId: string, code: string) {
    await this.supabase
      .getClient()
      .from('ss_pickup_code_attempts')
      .update({
        attempt_count: 0,
        locked_until: null,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('station_id', stationId)
      .eq('pickup_code', code);
  }

  // ============ 内部 ============

  /** 解析驿站：显式 ID 优先，否则取第一个 active 驿站 */
  private async resolveStationId(stationId?: string): Promise<string> {
    if (stationId) return stationId;
    const { data, error } = await this.supabase
      .getClient()
      .from('ss_stations')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`查询驿站失败: ${error.message}`);
    if (!data?.id) throw new NotFoundException('未找到可用驿站');
    return data.id as string;
  }

  private async queryInStockParcels(opts: {
    recipientPhone?: string;
    trackingNumber?: string;
    pickupCode?: string;
    stationId?: string;
  }) {
    const stationId = await this.resolveStationId(opts.stationId);

    let query = this.supabase
      .getClient()
      .from('ss_parcels')
      .select(
        'id, tracking_number, recipient_name, recipient_phone, pickup_code, status, shelf_layer, shelf_position, inbound_at, station:ss_stations!ss_parcels_station_id_fkey(name), shelf:ss_shelves!ss_parcels_shelf_id_fkey(number), courier:ss_courier_companies!ss_parcels_courier_company_id_fkey(name, code)',
      )
      // 滞留件仍可查询取件，避免客户查不到超期包裹
      .in('status', ['in_stock', 'overdue'])
      .eq('station_id', stationId);

    if (opts.recipientPhone) {
      query = query.eq('recipient_phone', opts.recipientPhone);
    } else if (opts.trackingNumber) {
      query = query.eq('tracking_number', opts.trackingNumber);
    } else if (opts.pickupCode) {
      query = query.eq('pickup_code', opts.pickupCode);
    }

    const { data, error } = await query.order('inbound_at', { ascending: false });
    if (error) throw new Error(`查询包裹失败: ${error.message}`);

    if (!data || data.length === 0) {
      return { items: [], total: 0 };
    }

    const flatten = (v: any) => (Array.isArray(v) ? v[0] : v);
    return {
      items: data.map((r: any) => {
        return {
          id: r.id,
          trackingNumber: r.tracking_number,
          recipientName: this.maskName(r.recipient_name),
          recipientPhoneTail: this.maskPhone(r.recipient_phone),
          pickupCode: r.pickup_code,
          status: r.status as string,
          inboundAt: r.inbound_at,
          stationName: flatten(r.station)?.name ?? null,
          courierName: flatten(r.courier)?.name ?? null,
        };
      }),
      total: data.length,
    };
  }

  private maskName(name: string): string {
    if (!name) return '';
    if (name.length <= 1) return name;
    return name.charAt(0) + '*'.repeat(Math.min(name.length - 1, 2));
  }

  private maskPhone(phone: string): string {
    if (!phone || phone.length < 4) return phone || '';
    return `****${phone.slice(-4)}`;
  }
}
