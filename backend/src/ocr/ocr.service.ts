import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
// 腾讯云 OCR 专用子包（tencentcloud-sdk-nodejs-ocr）
import * as tencentcloud from 'tencentcloud-sdk-nodejs-ocr';
import { SupabaseService } from '../supabase/supabase.service';

const OcrClient = tencentcloud.ocr.v20181119.Client;

// 免费额度默认上限（腾讯云通用印刷体识别免费额度约 1000/月，按账号每月计；默认设 950 留安全垫）。
// 可用环境变量 TENCENT_OCR_MONTHLY_LIMIT 覆盖；到达上限后后端直接拒绝，不再调用腾讯云，杜绝按量付费。
const DEFAULT_MONTHLY_LIMIT = 950;
// 剩余量低于该阈值时在响应里带提醒（可用 TENCENT_OCR_WARN_THRESHOLD 覆盖）。
const DEFAULT_WARN_THRESHOLD = 50;

/** 面单文本解析结果（不含额度信息） */
export interface WaybillFields {
  trackingNumber: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  /** 识别到的原始整段文本行（供前端调试/人工核对） */
  rawLines: string[];
  /** 命中情况，供前端提示哪些字段需人工补全 */
  matched: {
    trackingNumber: boolean;
    recipientName: boolean;
    recipientPhone: boolean;
  };
}

/** 面单解析结构化结果（含本月额度使用情况） */
export interface WaybillParseResult extends WaybillFields {
  /** 本月 OCR 额度使用情况，供前端提示剩余次数 */
  quota: {
    used: number;
    limit: number;
    remaining: number;
    /** 剩余量偏低（低于阈值）时为 true，前端可提醒运营 */
    warning: boolean;
  };
}

/**
 * 面单 OCR 识别服务
 * - 调用腾讯云通用印刷体识别 GeneralBasicOCR 获取全文
 * - 用启发式规则从文本中解析运单号 / 手机号 / 收件人姓名
 * - 仅做识别与解析，不落库；入库仍走 POST /api/inbound 人工确认
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private client: InstanceType<typeof OcrClient> | null = null;
  // 表不可用时的进程内兜底计数（按月），同样硬顶，保证绝不超额调用腾讯云。
  private readonly memoryUsage = new Map<string, number>();

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
  ) {}

  /** 当月额度上限（可用环境变量覆盖） */
  private getMonthlyLimit(): number {
    const raw = parseInt(process.env.TENCENT_OCR_MONTHLY_LIMIT || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_LIMIT;
  }

  /** 剩余量提醒阈值（可用环境变量覆盖） */
  private getWarnThreshold(): number {
    const raw = parseInt(process.env.TENCENT_OCR_WARN_THRESHOLD || '', 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_WARN_THRESHOLD;
  }

  /** 当前计费月份，按北京时间 YYYY-MM（与腾讯云免费额度按月重置对齐） */
  private currentMonth(): string {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
  }

  /**
   * 调用腾讯云之前先「占用」一次额度：原子自增当月计数，超过上限则抛错（不再调用腾讯云 → 杜绝按量付费）。
   * 优先走数据库原子函数 ss_ocr_try_consume；数据库不可用时降级为进程内内存计数，同样硬顶。
   * 返回本次占用后的 used，用于计算 remaining。
   */
  private async consumeQuota(): Promise<{ used: number; limit: number }> {
    const limit = this.getMonthlyLimit();
    const month = this.currentMonth();

    try {
      const data = await this.supabase.withRetry(async (client) => {
        const { data, error } = await client.rpc('ss_ocr_try_consume', {
          p_month: month,
          p_limit: limit,
        });
        if (error) throw error;
        return data;
      });
      // rpc 返回 [{ allowed, used }]
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('ss_ocr_try_consume 返回空');
      if (!row.allowed) {
        throw new ServiceUnavailableException(
          `本月面单识别免费额度已用完（上限 ${limit} 次），为避免产生按量付费已暂停识别。请手动录入，或下月额度重置后再用。`,
        );
      }
      return { used: row.used, limit };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      // 数据库不可用（表/函数未迁移、连接失败等）→ 进程内兜底计数，仍然硬顶
      this.logger.warn(
        `OCR 额度持久化不可用，降级为进程内计数（重启后清零）：${err instanceof Error ? err.message : String(err)}`,
      );
      const used = (this.memoryUsage.get(month) || 0) + 1;
      if (used > limit) {
        throw new ServiceUnavailableException(
          `本月面单识别免费额度已用完（上限 ${limit} 次），为避免产生按量付费已暂停识别。请手动录入，或下月额度重置后再用。`,
        );
      }
      this.memoryUsage.set(month, used);
      return { used, limit };
    }
  }

  private getClient(): InstanceType<typeof OcrClient> {
    if (this.client) return this.client;

    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    const region = process.env.TENCENT_OCR_REGION || 'ap-guangzhou';
    if (!secretId || !secretKey) {
      throw new ServiceUnavailableException(
        '面单识别未配置：请在后端 .env 中设置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY',
      );
    }

    this.client = new OcrClient({
      credential: { secretId, secretKey },
      region,
      profile: {
        httpProfile: { reqTimeout: 20 },
      },
    });
    return this.client;
  }

  /** 识别面单并解析出结构化字段 */
  async recognizeWaybill(input: {
    imageBase64?: string;
    imageUrl?: string;
  }): Promise<WaybillParseResult> {
    const { imageBase64, imageUrl } = input;
    if (!imageBase64 && !imageUrl) {
      throw new BadRequestException('请提供 imageBase64 或 imageUrl');
    }

    // 去掉可能存在的 data URI 前缀（data:image/xxx;base64,）
    const base64 = imageBase64
      ? imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '')
      : undefined;

    // 先确认密钥已配置（未配置直接抛错，不占用额度）
    const client = this.getClient();

    // 调用腾讯云之前先占用一次额度；到达上限直接抛错，绝不发起计费请求
    const { used, limit } = await this.consumeQuota();
    let resp: Awaited<ReturnType<InstanceType<typeof OcrClient>['GeneralBasicOCR']>>;
    try {
      resp = await client.GeneralBasicOCR({
        ...(base64 ? { ImageBase64: base64 } : {}),
        ...(imageUrl && !base64 ? { ImageUrl: imageUrl } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`腾讯云 OCR 调用失败: ${message}`);
      // 鉴权 / 配额类错误对外提示更友好
      if (/AuthFailure|SecretId|signature/i.test(message)) {
        throw new ServiceUnavailableException('面单识别服务鉴权失败，请检查腾讯云密钥配置');
      }
      throw new InternalServerErrorException(`面单识别失败：${message}`);
    }

    const lines = (resp?.TextDetections || [])
      .map((d) => (d?.DetectedText || '').trim())
      .filter((t) => t.length > 0);

    const fields = this.parseWaybillText(lines);
    const remaining = Math.max(limit - used, 0);
    if (remaining <= this.getWarnThreshold()) {
      this.logger.warn(`OCR 本月额度剩余 ${remaining}/${limit} 次，接近上限。`);
    }
    return {
      ...fields,
      quota: {
        used,
        limit,
        remaining,
        warning: remaining <= this.getWarnThreshold(),
      },
    };
  }

  /**
   * 从 OCR 文本行解析运单号 / 手机号 / 姓名
   * 规则为启发式，最终以入库表单人工确认为准。
   */
  parseWaybillText(lines: string[]): WaybillFields {
    const joined = lines.join(' ');

    // 1. 手机号：优先匹配带脱敏星号也能定位的 11 位号；这里取完整 11 位
    const recipientPhone = this.extractPhone(joined);

    // 2. 运单号：取最长的一段「字母+数字」或长数字串（排除手机号本身）
    const trackingNumber = this.extractTrackingNumber(lines, recipientPhone);

    // 3. 收件人姓名：找「收/收件人/姓名」等标签邻近的中文名
    const recipientName = this.extractName(lines);

    return {
      trackingNumber,
      recipientName,
      recipientPhone,
      rawLines: lines,
      matched: {
        trackingNumber: !!trackingNumber,
        recipientName: !!recipientName,
        recipientPhone: !!recipientPhone,
      },
    };
  }

  private extractPhone(text: string): string | null {
    // 去掉常见分隔符后匹配 1 开头的 11 位号
    const normalized = text.replace(/[\s\-()（）]/g, '');
    const m = normalized.match(/1[3-9]\d{9}/);
    return m ? m[0] : null;
  }

  private extractTrackingNumber(lines: string[], phone: string | null): string | null {
    const candidates: string[] = [];
    for (const line of lines) {
      // 提取每行中的「运单号样式」token：字母数字组合，长度 8-30
      const tokens = line.match(/[A-Za-z0-9]{8,30}/g) || [];
      for (const tk of tokens) {
        if (phone && tk.includes(phone)) continue; // 排除手机号
        if (!/\d/.test(tk)) continue; // 必须含数字
        // 纯 11 位且以 1 开头，极可能是手机号，跳过
        if (/^1[3-9]\d{9}$/.test(tk)) continue;
        candidates.push(tk.toUpperCase());
      }
    }
    if (candidates.length === 0) return null;
    // 运单号通常是最长的编号串
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  private extractName(lines: string[]): string | null {
    const labelRe = /(收件人|收货人|收\s*件|姓\s*名|收)[:：\s]*/;
    for (const line of lines) {
      if (labelRe.test(line)) {
        const after = line.replace(labelRe, '').trim();
        const name = this.pickChineseName(after);
        if (name) return name;
      }
    }
    // 兜底：整段里找 2-4 个连续中文（排除明显地址词）
    for (const line of lines) {
      const name = this.pickChineseName(line);
      if (name) return name;
    }
    return null;
  }

  private pickChineseName(text: string): string | null {
    // 姓名：2-4 位中文，排除含「省市区县路号栋室」等地址字符的片段
    const m = text.match(/[\u4e00-\u9fa5]{2,4}/);
    if (!m) return null;
    const candidate = m[0];
    if (/[省市区县镇乡村路街道号栋室楼层组]/.test(candidate)) return null;
    return candidate;
  }
}
