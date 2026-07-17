import { Injectable, Inject } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * 短信通知服务
 * v1.0 为 stub：不真实发送，仅渲染模板并写入 ss_sms_logs（status='sent'）
 * 后续可接入阿里云/腾讯云短信服务商
 */
@Injectable()
export class NotifyService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

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
    await this.log({
      phone: opts.phone,
      recipientName: opts.recipientName,
      templateCode: 'inbound_notice',
      content,
      status: 'sent',
      parcelId: opts.parcelId,
      stationId: opts.stationId,
    });
  }

  /**
   * 通用日志写入：ss_sms_logs
   * status: sent / failed
   */
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
