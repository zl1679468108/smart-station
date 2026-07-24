/**
 * 店员现场白话话术（复制给客户或当面说）
 * 试用期免费通知：未绑定不发取件码私信，靠当面告知 + 引导绑定。
 */

/** 引导客户绑定微信通知（不含取件码，可群发/群里发） */
export function buildBindGuideScript(opts?: { stationName?: string; queryUrlHint?: string }): string {
  const station = opts?.stationName?.trim() || '本驿站';
  const hint = opts?.queryUrlHint?.trim() || '驿站查件页';
  return [
    `【${station}】您好，包裹到了可微信自动提醒。`,
    `请打开${hint}，用收件手机号绑定微信通知。`,
    '绑定后：已在库的件会补发取件码，以后到件也会微信提醒；未绑定请到店查件或看货架。',
  ].join('');
}

/** 当面告知取件码（仅一对一面告/电话，勿发到企微群） */
export function buildFacePickupScript(opts: {
  pickupCode: string;
  stationName?: string;
  recipientName?: string | null;
  /** 到付/货款待收金额（元），有则提醒取件时当面付 */
  collectDueAmount?: number | null;
}): string {
  const who = opts.recipientName?.trim() ? `${opts.recipientName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  const parts = [
    `${who}您的快递已到${station}。`,
    `取件码：${opts.pickupCode}。`,
  ];
  const due = Number(opts.collectDueAmount || 0);
  if (due > 0) {
    parts.push(`取件时请当面付到付/货款 ¥${due.toFixed(2)}。`);
  }
  parts.push(
    '请凭码到店取件。若要微信自动收码，可在查件页绑定微信通知；绑定后已在库件也会补发取件码。',
  );
  return parts.join('');
}

/** 未绑定客户短提示（UI 展示用） */
/** 滞留催取话术（含取件码，仅一对一面告/电话，勿发群） */
export function buildOverdueRemindScript(opts: {
  pickupCode: string;
  days?: number | null;
  stationName?: string;
  recipientName?: string | null;
}): string {
  const who = opts.recipientName?.trim() ? `${opts.recipientName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  const days = Number(opts.days || 0);
  const dayPart = days > 0 ? `已在店 ${days} 天，` : '';
  return [
    `${who}您的快递在${station}${dayPart}请尽快取件。`,
    `取件码：${opts.pickupCode}。`,
    '请凭码到店；若要微信自动收码，可在查件页绑定微信通知。',
  ].join('');
}

export const UNBOUND_FACE_HINT =
  '客户还没绑定微信：请当面报取件码；也可引导查件页绑定——绑定后系统会自动补发取件码。';

/** 入库成功后未绑定：店员三步动作（UI 展示） */
export const INBOUND_UNBOUND_STEPS = [
  '当面报取件码（可复制当面话术，勿发群）',
  '引导客户打开查件页绑定微信通知',
  '客户绑定后点「补发通知」，已在库件会自动收码',
] as const;

/** 入库未绑定：组合提醒（含取件码，仅一对一） */
export function buildInboundUnboundComboScript(opts: {
  pickupCode: string;
  stationName?: string;
  recipientName?: string | null;
  collectDueAmount?: number | null;
}): string {
  return [
    buildFacePickupScript(opts),
    '',
    buildBindGuideScript({ stationName: opts.stationName }),
  ].join('\n');
}

const METHOD_LABEL: Record<string, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  other: '其他',
};

/** 收款出库后给客户的确认话术（可复制微信/当面说） */
export function buildCollectReceiptScript(opts: {
  amount: number;
  method?: string | null;
  trackingNumber?: string | null;
  pickupCode?: string | null;
  stationName?: string;
  recipientName?: string | null;
}): string {
  const who = opts.recipientName?.trim() ? `${opts.recipientName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  const amount = Number(opts.amount || 0).toFixed(2);
  const method =
    (opts.method && METHOD_LABEL[opts.method]) ||
    (opts.method?.trim() ? opts.method.trim() : '当面');
  const parts = [
    `${who}您已在${station}取件。`,
    `已收妥到付/货款 ¥${amount}（${method}）。`,
  ];
  if (opts.trackingNumber?.trim()) {
    parts.push(`运单 ${opts.trackingNumber.trim()}。`);
  } else if (opts.pickupCode?.trim()) {
    parts.push(`取件码 ${opts.pickupCode.trim()}。`);
  }
  parts.push('请妥善保管包裹，祝您生活愉快。');
  return parts.join('');
}

/** 免收说明（仅店员留痕/对客解释，勿群发完整隐私） */
export function buildCollectWaiveScript(opts: {
  amount: number;
  note?: string | null;
  stationName?: string;
}): string {
  const station = opts.stationName?.trim() || '驿站';
  const amount = Number(opts.amount || 0).toFixed(2);
  const note = opts.note?.trim() ? `原因：${opts.note.trim()}。` : '';
  return `【${station}】本件原应收 ¥${amount}，已按店内规则免收。${note}如有疑问请到店咨询。`;
}

/** 预约到店当面/微信一对一告知（勿发企微群含完整手机号） */
export function buildAppointmentFaceScript(opts: {
  slotDate: string;
  slotLabel: string;
  recipientName?: string | null;
  stationName?: string;
}): string {
  const who = opts.recipientName?.trim() ? `${opts.recipientName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  return [
    `${who}您已预约${station}到店。`,
    `时段：${opts.slotDate} ${opts.slotLabel}。`,
    '到店报手机号或取件码即可。若要微信收提醒，可在查件页绑定微信通知。',
  ].join('');
}

/** 寄件进度一对一告知（勿发企微群） */
export function buildShippingFaceScript(opts: {
  shippingNo: string;
  statusLabel: string;
  senderName?: string | null;
  receiverName?: string | null;
  courierName?: string | null;
  freight?: number | null;
  stationName?: string;
}): string {
  const who = opts.senderName?.trim() ? `${opts.senderName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  const parts = [
    `${who}您在${station}的寄件单 ${opts.shippingNo} 当前状态：${opts.statusLabel}。`,
  ];
  if (opts.receiverName?.trim()) parts.push(`收件人 ${opts.receiverName.trim()}。`);
  if (opts.courierName?.trim()) parts.push(`承运 ${opts.courierName.trim()}。`);
  if (opts.freight != null && Number(opts.freight) > 0) {
    parts.push(`运费 ¥${Number(opts.freight).toFixed(2)}。`);
  }
  parts.push('如有疑问请到店或联系店员。');
  return parts.join('');
}

/** 店内未绑定/私信失败跟进清单（含完整手机号，仅内部用，勿发群） */
export function buildUnboundFollowupScript(
  items: Array<{
    phone: string;
    phoneMasked?: string | null;
    recipientName?: string | null;
    unbound?: number;
    pushFailed?: number;
  }>,
  opts?: { stationName?: string },
): string {
  const need = (items || []).filter(
    (i) => Number(i.unbound || 0) > 0 || Number(i.pushFailed || 0) > 0,
  );
  const station = opts?.stationName?.trim() || '本驿站';
  if (need.length === 0) {
    return [
      `【${station}·跟进清单】当前没有未绑定/私信失败客户。`,
      buildBindGuideScript({ stationName: station }),
    ].join('\n');
  }
  const lines = need.map((i, idx) => {
    const phone = String(i.phone || i.phoneMasked || '').trim() || '未知号码';
    const name = i.recipientName?.trim() ? ` ${i.recipientName.trim()}` : '';
    const parts: string[] = [];
    if (Number(i.unbound || 0) > 0) parts.push(`未绑定${i.unbound}次`);
    if (Number(i.pushFailed || 0) > 0) parts.push(`私信失败${i.pushFailed}次`);
    return `${idx + 1}. ${phone}${name}（${parts.join('，') || '需跟进'}）`;
  });
  return [
    `【${station}·未绑定/私信失败跟进清单】共 ${need.length} 人（仅店内使用，勿发群）`,
    ...lines,
    '',
    '跟进方式：当面报码 / 电话告知；并引导客户在查件页绑定微信，下次自动收码。',
    '',
    '通用绑定引导（不含取件码，可一对一发客户）：',
    buildBindGuideScript({ stationName: station }),
  ].join('\n');
}

