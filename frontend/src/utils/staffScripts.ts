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
    '绑定后下次到件会直接私信取件码；未绑定请到店查件或看货架。',
  ].join('');
}

/** 当面告知取件码（仅一对一面告/电话，勿发到企微群） */
export function buildFacePickupScript(opts: {
  pickupCode: string;
  stationName?: string;
  recipientName?: string | null;
}): string {
  const who = opts.recipientName?.trim() ? `${opts.recipientName.trim()}，` : '';
  const station = opts.stationName?.trim() || '驿站';
  return [
    `${who}您的快递已到${station}。`,
    `取件码：${opts.pickupCode}。`,
    '请凭码到店取件。若要微信自动收码，可在查件页绑定微信通知。',
  ].join('');
}

/** 未绑定客户短提示（UI 展示用） */
export const UNBOUND_FACE_HINT =
  '客户还没绑定微信：请当面报取件码，或复制话术告知；引导扫码绑定后可再点补发。';

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

