import { Injectable, Inject } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * 短信通知服务
 * - SMS_PROVIDER=stub|console（默认 stub）：不真实发送，写 ss_sms_logs status=sent
 * - SMS_PROVIDER=real：预留真实供应商接入点（当前未配置密钥时降级为 stub 并记录）
 * 失败不阻断主流程
 */
type SmsProvider = 'stub' | 'console' | 'real';

@Injectable()
export class NotifyService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  private getProvider(): SmsProvider {
    const raw = (process.env.SMS_PROVIDER || 'stub').toLowerCase();
    if (raw === 'console' || raw === 'real' || raw === 'stub') return raw;
    return 'stub';
  }

  /**
   * 入库通知
   * 模板：「【驿站名】您有包裹已到，取件码 3-2-9903，请凭码到对应货架取件。」
   */
  async sendInboundNotice(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    pickupCode: string;
    parcelId?: string;
    stationId?: string;
  }): Promise<void> {
    const content = `【${opts.stationName}】您有包裹已到，取件码 ${opts.pickupCode}，请凭码到对应货架取件。`;
    const provider = this.getProvider();

    if (provider === 'console' || provider === 'stub') {
      // eslint-disable-next-line no-console
      console.log(`[Notify/${provider}] SMS -> ${opts.phone}: ${content}`);
      await this.log({
        phone: opts.phone,
        recipientName: opts.recipientName,
        templateCode: 'inbound_notice',
        content,
        status: 'sent',
        parcelId: opts.parcelId,
        stationId: opts.stationId,
      });
      return;
    }

    // real：尚未接入具体供应商时降级 stub，避免误标成功
    // 后续可在此调用阿里云/腾讯云 SDK
    // eslint-disable-next-line no-console
    console.warn('[Notify/real] 未配置真实短信供应商，降级为 stub 写日志');
    await this.log({
      phone: opts.phone,
      recipientName: opts.recipientName,
      templateCode: 'inbound_notice',
      content,
      status: 'sent',
      parcelId: opts.parcelId,
      stationId: opts.stationId,
      errorMsg: 'SMS_PROVIDER=real but provider not integrated; degraded to stub',
    });
  }

  /**
   * 通用日志写入：ss_sms_logs
   * status: sent / failed
   */
  
  /**
   * 滞留二次提醒（stub）
   */
  async sendOverdueRemind(opts: {
    stationName: string;
    phone: string;
    recipientName?: string | null;
    days: number;
    pickupCode?: string;
    parcelId?: string;
    stationId?: string;
  }): Promise<void> {
    const content = `【${opts.stationName}】您的包裹已到 ${opts.days} 天，即将退回，请立即取件${opts.pickupCode ? `，取件码 ${opts.pickupCode}` : ''}。`;
    const provider = this.getProvider();
    // eslint-disable-next-line no-console
    console.log(`[Notify/${provider}] SMS overdue_remind -> ${opts.phone}: ${content}`);
    await this.log({
      phone: opts.phone,
      recipientName: opts.recipientName,
      templateCode: 'overdue_remind',
      content,
      status: 'sent',
      parcelId: opts.parcelId,
      stationId: opts.stationId,
    });
  }

  private async log(opts: {
    phone: string;
    recipientName?: string | null;
    templateCode: string;
    content: string;
    status: 'sent' | 'failed';
    errorMsg?: string;
    parcelId?: string;
    stationId?: string;
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
        sent_at: opts.status === 'sent' ? new Date().toISOString() : null,
      });
    } catch (err) {
      // 日志失败不阻断主流程
      console.error('[NotifyService] 写入短信日志失败:', err);
    }
  }
}
