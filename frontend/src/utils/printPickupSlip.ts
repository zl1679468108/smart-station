/**
 * 取件码小票打印（浏览器原生 print，适配热敏/A4）
 * 店内贴货架/当面报码用；手机号脱敏，不进群。
 */

export interface PickupSlipInput {
  stationName?: string | null;
  pickupCode: string;
  trackingNumber?: string | null;
  shelfNumber?: number | null;
  shelfLayer?: number | null;
  shelfPosition?: number | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  courierCompanyName?: string | null;
  inboundAt?: string | null;
  collectDueAmount?: number | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskPhone(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  return String(phone || '').trim() || '—';
}

function maskName(name?: string | null): string {
  const text = String(name || '').trim();
  if (!text) return '—';
  if (text.length === 1) return text;
  return `${text[0]}${'*'.repeat(Math.min(text.length - 1, 2))}`;
}

function shelfLine(item: PickupSlipInput): string {
  if (item.shelfNumber == null) return '—';
  const layer = item.shelfLayer != null ? String(item.shelfLayer) : '-';
  const pos =
    item.shelfPosition != null ? String(item.shelfPosition).padStart(4, '0') : '----';
  return `${item.shelfNumber}号架 · 第${layer}层 · ${pos}`;
}

function slipBlock(item: PickupSlipInput, index: number, total: number): string {
  const station = escapeHtml(String(item.stationName || '智能快递驿站').trim() || '智能快递驿站');
  const code = escapeHtml(String(item.pickupCode || '').trim());
  const tracking = escapeHtml(String(item.trackingNumber || '').trim() || '—');
  const courier = escapeHtml(String(item.courierCompanyName || '').trim() || '—');
  const name = escapeHtml(maskName(item.recipientName));
  const phone = escapeHtml(maskPhone(item.recipientPhone));
  const shelf = escapeHtml(shelfLine(item));
  const time = escapeHtml(String(item.inboundAt || '').trim() || '—');
  const due = Number(item.collectDueAmount || 0);
  const dueLine =
    due > 0
      ? `<div class="row due"><span>待收款</span><strong>¥${due.toFixed(2)}</strong></div>`
      : '';
  const pageHint =
    total > 1
      ? `<div class="meta">第 ${index + 1} / ${total} 张</div>`
      : '';

  return `
  <section class="slip">
    <div class="station">${station}</div>
    <div class="title">取件码小票</div>
    ${pageHint}
    <div class="code">${code}</div>
    <div class="row"><span>货架位</span><strong>${shelf}</strong></div>
    <div class="row"><span>运单号</span><strong class="mono">${tracking}</strong></div>
    <div class="row"><span>快递</span><strong>${courier}</strong></div>
    <div class="row"><span>收件人</span><strong>${name} ${phone}</strong></div>
    <div class="row"><span>入库时间</span><strong>${time}</strong></div>
    ${dueLine}
    <div class="tip">凭取件码到店取件 · 群里不会公开取件码</div>
  </section>`;
}

function buildDocument(items: PickupSlipInput[]): string {
  const body = items.map((item, index) => slipBlock(item, index, items.length)).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>取件码小票</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #fff;
    }
    .slip {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto 12px;
      padding: 8px 6px 10px;
      border: 1px dashed #bbb;
      page-break-after: always;
      break-after: page;
    }
    .slip:last-child {
      page-break-after: auto;
      break-after: auto;
      margin-bottom: 0;
    }
    .station {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .title {
      margin-top: 2px;
      text-align: center;
      font-size: 11px;
      color: #555;
    }
    .meta {
      margin-top: 4px;
      text-align: center;
      font-size: 10px;
      color: #777;
    }
    .code {
      margin: 10px 0 8px;
      text-align: center;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.12em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.15;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.4;
    }
    .row span { color: #666; flex-shrink: 0; }
    .row strong { text-align: right; font-weight: 600; word-break: break-all; }
    .row.due strong { color: #b91c1c; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tip {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px dashed #ccc;
      text-align: center;
      font-size: 10px;
      color: #555;
      line-height: 1.4;
    }
    @media print {
      body { padding: 0; }
      .slip {
        width: 72mm;
        border: none;
        margin: 0 auto;
      }
    }
  </style>
</head>
<body>
${body}
<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      try { window.focus(); window.print(); } catch (e) {}
    }, 80);
  });
</script>
</body>
</html>`;
}

/** 打印一张或多张取件码小票；返回是否成功唤起打印窗口 */
export function printPickupSlips(input: PickupSlipInput | PickupSlipInput[]): boolean {
  const list = (Array.isArray(input) ? input : [input]).filter(
    (item) => String(item?.pickupCode || '').trim().length > 0,
  );
  if (list.length === 0) return false;

  const html = buildDocument(list);
  const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export function printPickupSlip(input: PickupSlipInput): boolean {
  return printPickupSlips(input);
}

export interface OutboundReceiptInput {
  stationName?: string | null;
  pickupCode?: string | null;
  trackingNumber?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  amountText?: string | null;
  outboundAt?: string | null;
}

/** 出库取件回执（给客户/店内留存，手机号脱敏） */
export function printOutboundReceipt(input: OutboundReceiptInput): boolean {
  const station = escapeHtml(String(input.stationName || '智能快递驿站').trim() || '智能快递驿站');
  const code = escapeHtml(String(input.pickupCode || '').trim() || '—');
  const tracking = escapeHtml(String(input.trackingNumber || '').trim() || '—');
  const name = escapeHtml(maskName(input.recipientName));
  const phone = escapeHtml(maskPhone(input.recipientPhone));
  const amount = escapeHtml(String(input.amountText || '').trim());
  const time = escapeHtml(String(input.outboundAt || '').trim() || new Date().toLocaleString('zh-CN'));
  const amountRow = amount
    ? `<div class="row"><span>收款</span><strong>${amount}</strong></div>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>取件回执</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #fff;
    }
    .slip {
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 10px 6px 12px;
      border: 1px dashed #bbb;
    }
    .station { text-align: center; font-size: 13px; font-weight: 600; }
    .title { margin-top: 2px; text-align: center; font-size: 12px; color: #047857; font-weight: 700; }
    .badge {
      margin: 10px auto 8px;
      width: fit-content;
      padding: 4px 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #047857;
      font-size: 12px;
      font-weight: 700;
    }
    .code {
      margin: 6px 0 10px;
      text-align: center;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.1em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
      font-size: 11px;
      line-height: 1.4;
    }
    .row span { color: #666; flex-shrink: 0; }
    .row strong { text-align: right; font-weight: 600; word-break: break-all; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tip {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px dashed #ccc;
      text-align: center;
      font-size: 10px;
      color: #555;
      line-height: 1.4;
    }
    @media print {
      body { padding: 0; }
      .slip { border: none; }
    }
  </style>
</head>
<body>
  <section class="slip">
    <div class="station">${station}</div>
    <div class="title">取件回执</div>
    <div class="badge">已取件</div>
    <div class="code">${code}</div>
    <div class="row"><span>运单号</span><strong class="mono">${tracking}</strong></div>
    <div class="row"><span>收件人</span><strong>${name} ${phone}</strong></div>
    ${amountRow}
    <div class="row"><span>出库时间</span><strong>${time}</strong></div>
    <div class="tip">感谢取件 · 如有疑问请到店出示本回执</div>
  </section>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
      }, 80);
    });
  </script>
</body>
</html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

export interface ShippingReceiptInput {
  stationName?: string | null;
  shippingNo: string;
  statusLabel?: string | null;
  pickupTypeLabel?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  courierName?: string | null;
  itemType?: string | null;
  weight?: number | null;
  freight?: number | null;
  insuredAmount?: number | null;
  createdAt?: string | null;
}

/** 寄件回执（店内留存 / 交给客户，手机号脱敏） */
export function printShippingReceipt(input: ShippingReceiptInput): boolean {
  const station = escapeHtml(String(input.stationName || '智能快递驿站').trim() || '智能快递驿站');
  const no = escapeHtml(String(input.shippingNo || '').trim() || '—');
  const status = escapeHtml(String(input.statusLabel || '已登记').trim());
  const pickup = escapeHtml(String(input.pickupTypeLabel || '').trim() || '—');
  const sender = escapeHtml(`${maskName(input.senderName)} ${maskPhone(input.senderPhone)}`.trim());
  const receiver = escapeHtml(`${maskName(input.receiverName)} ${maskPhone(input.receiverPhone)}`.trim());
  const courier = escapeHtml(String(input.courierName || '').trim() || '—');
  const itemType = escapeHtml(String(input.itemType || '').trim() || '—');
  const weight = input.weight != null ? `${Number(input.weight)}kg` : '—';
  const freight = input.freight != null ? `¥${Number(input.freight).toFixed(2)}` : '—';
  const insured =
    input.insuredAmount != null && Number(input.insuredAmount) > 0
      ? `¥${Number(input.insuredAmount).toFixed(2)}`
      : '—';
  const time = escapeHtml(String(input.createdAt || '').trim() || '—');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>寄件回执</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 8px; color: #111;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #fff;
    }
    .slip {
      width: 72mm; max-width: 100%; margin: 0 auto;
      padding: 10px 6px 12px; border: 1px dashed #bbb;
    }
    .station { text-align: center; font-size: 13px; font-weight: 600; }
    .title { margin-top: 2px; text-align: center; font-size: 12px; color: #0369a1; font-weight: 700; }
    .code {
      margin: 10px 0 8px; text-align: center; font-size: 20px; font-weight: 800;
      letter-spacing: 0.06em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      word-break: break-all;
    }
    .badge {
      margin: 0 auto 8px; width: fit-content; padding: 3px 10px; border-radius: 999px;
      background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 700;
    }
    .row {
      display: flex; justify-content: space-between; gap: 8px;
      margin-top: 4px; font-size: 11px; line-height: 1.4;
    }
    .row span { color: #666; flex-shrink: 0; }
    .row strong { text-align: right; font-weight: 600; word-break: break-all; }
    .tip {
      margin-top: 10px; padding-top: 6px; border-top: 1px dashed #ccc;
      text-align: center; font-size: 10px; color: #555; line-height: 1.4;
    }
    @media print { body { padding: 0; } .slip { border: none; } }
  </style>
</head>
<body>
  <section class="slip">
    <div class="station">${station}</div>
    <div class="title">寄件回执</div>
    <div class="code">${no}</div>
    <div class="badge">${status}</div>
    <div class="row"><span>取件方式</span><strong>${pickup}</strong></div>
    <div class="row"><span>快递公司</span><strong>${courier}</strong></div>
    <div class="row"><span>寄件人</span><strong>${sender}</strong></div>
    <div class="row"><span>收件人</span><strong>${receiver}</strong></div>
    <div class="row"><span>物品/重量</span><strong>${itemType} · ${weight}</strong></div>
    <div class="row"><span>运费</span><strong>${freight}</strong></div>
    <div class="row"><span>保价</span><strong>${insured}</strong></div>
    <div class="row"><span>登记时间</span><strong>${time}</strong></div>
    <div class="tip">请妥善保管 · 查询进度请到店出示寄件单号</div>
  </section>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
      }, 80);
    });
  </script>
</body>
</html>`;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
