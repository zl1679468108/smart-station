import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as inventoryService from '@/services/inventory';
import {
  useInvalidateInventoryDetail,
  useInvalidateInventoryList,
  useParcelDetail,
} from '@/hooks/useInventoryData';
import { useInvalidateDashboard } from '@/hooks/useDashboardData';
import type { ParcelStatus } from '@/types/inventory';

const STATUS_META: Record<ParcelStatus, { label: string; cls: string }> = {
  in_stock: { label: '在库', cls: 'bg-info/10 text-info' },
  out_stock: { label: '已出库', cls: 'bg-success/10 text-success' },
  overdue: { label: '滞留', cls: 'bg-warning/10 text-warning' },
  exception: { label: '异常', cls: 'bg-danger/10 text-danger' },
  returned: { label: '退回', cls: 'bg-gray-200 text-gray-600' },
};

const EVENT_LABEL: Record<string, string> = {
  inbound: '入库',
  outbound: '出库',
  overdue_warn: '滞留预警',
  overdue_remind: '滞留提醒',
  exception_register: '标记异常',
  exception_resolve: '解除异常',
  return_start: '开始退回',
  return_complete: '退回完成',
  note: '备注',
};

// 入库方式枚举映射（与后端 ss_parcels.inbound_method 一致）
const INBOUND_METHOD_LABEL: Record<string, string> = {
  scan: '扫码',
  manual: '手动',
  batch: '批量',
};

// 出库方式枚举映射（与后端 ss_parcels.outbound_method 一致）
const OUTBOUND_METHOD_LABEL: Record<string, string> = {
  manual: '人工辅助',
  self_service: '自助扫描',
};

// 库存详情页：基础信息卡 + 状态轨迹时间线
const ParcelDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading, error } = useParcelDetail(id);
  const invalidateDetail = useInvalidateInventoryDetail();
  const invalidateList = useInvalidateInventoryList();
  const invalidateDashboard = useInvalidateDashboard();
  const [freightInput, setFreightInput] = useState('');
  const [codInput, setCodInput] = useState('');
  const [collectNoteInput, setCollectNoteInput] = useState('');
  const [savingCollect, setSavingCollect] = useState(false);
  const [collectError, setCollectError] = useState('');

  useEffect(() => {
    if (!detail) return;
    setFreightInput(
      Number(detail.freightCollectAmount || 0) > 0
        ? String(detail.freightCollectAmount)
        : '',
    );
    setCodInput(Number(detail.codAmount || 0) > 0 ? String(detail.codAmount) : '');
    setCollectNoteInput(detail.collectNote || '');
  }, [detail?.id, detail?.freightCollectAmount, detail?.codAmount, detail?.collectNote]);

  if (isLoading) return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  if (error) {
    return (
      <div className="py-10 text-center text-sm text-danger">
        {error instanceof Error ? error.message : '加载失败'}
      </div>
    );
  }
  if (!detail) return <div className="py-10 text-center text-sm text-gray-400">包裹不存在</div>;

  const statusMeta = STATUS_META[detail.status];

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/admin/inventory')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回列表
        </button>
        <h1 className="text-lg font-semibold text-gray-800">包裹详情</h1>
        <div className="w-20" />
      </div>

      {/* 基础信息 */}
      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">基础信息</h2>
          <span className={`rounded px-2 py-0.5 text-xs ${statusMeta.cls}`}>
            {statusMeta.label}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <InfoItem label="运单号" value={detail.trackingNumber} />
          <InfoItem label="取件码" value={detail.pickupCode || '-'} highlight />
          <InfoItem label="收件人" value={detail.recipientName} />
          <InfoItem label="手机号" value={detail.recipientPhone} />
          <InfoItem
            label="快递公司"
            value={detail.courier ? `${detail.courier.name}（${detail.courier.code}）` : '-'}
          />
          <InfoItem
            label="包裹大小"
            value={
              detail.size
                ? detail.size === 'small'
                  ? '小件'
                  : detail.size === 'medium'
                    ? '中件'
                    : '大件'
                : '-'
            }
          />
          <InfoItem
            label="入库时间"
            value={detail.inboundAt ? new Date(detail.inboundAt).toLocaleString('zh-CN') : '-'}
          />
          {(detail.status === 'in_stock' || detail.status === 'overdue') && (
            <InfoItem
              label="在库天数"
              value={`${detail.daysInStock ?? 0} 天`}
            />
          )}
          <InfoItem
            label="入库方式"
            value={detail.inboundMethod ? INBOUND_METHOD_LABEL[detail.inboundMethod] ?? detail.inboundMethod : '-'}
          />
          <InfoItem
            label="出库时间"
            value={detail.outboundAt ? new Date(detail.outboundAt).toLocaleString('zh-CN') : '-'}
          />
          <InfoItem
            label="出库方式"
            value={detail.outboundMethod ? OUTBOUND_METHOD_LABEL[detail.outboundMethod] ?? detail.outboundMethod : '-'}
          />
          {detail.returnedAt && (
            <InfoItem
              label="退回时间"
              value={new Date(detail.returnedAt).toLocaleString('zh-CN')}
            />
          )}
          {detail.returnTrackingNumber && (
            <InfoItem label="退回运单号" value={detail.returnTrackingNumber} />
          )}
          <InfoItem label="入库操作人" value={detail.inboundOperator || '-'} />
          <InfoItem label="出库操作人" value={detail.outboundOperator || '-'} />
          <InfoItem
            label="到付运费"
            value={
              Number(detail.freightCollectAmount || 0) > 0
                ? `¥${Number(detail.freightCollectAmount || 0).toFixed(2)}`
                : '-'
            }
          />
          <InfoItem
            label="代收货款"
            value={
              Number(detail.codAmount || 0) > 0
                ? `¥${Number(detail.codAmount || 0).toFixed(2)}`
                : '-'
            }
          />
          <InfoItem
            label="收款状态"
            value={
              detail.collectStatus === 'unpaid'
                ? `待收款 ¥${Number(detail.collectDueAmount || 0).toFixed(2)}`
                : detail.collectStatus === 'paid'
                  ? `已收款${
                      detail.collectPaidMethod
                        ? `（${
                            { cash: '现金', wechat: '微信', alipay: '支付宝', other: '其他' }[
                              detail.collectPaidMethod
                            ] || detail.collectPaidMethod
                          }）`
                        : ''
                    }`
                  : detail.collectStatus === 'waived'
                    ? '已免收'
                    : '无需收款'
            }
          />
          {detail.collectPaidAt && (
            <InfoItem
              label="收款时间"
              value={new Date(detail.collectPaidAt).toLocaleString('zh-CN')}
            />
          )}
        </div>
        {detail.note && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="mb-1 text-xs text-gray-500">备注</div>
            <div className="text-sm text-gray-700">{detail.note}</div>
          </div>
        )}
        {(detail.status === 'in_stock' || detail.status === 'overdue') &&
          (detail.collectStatus === 'none' || detail.collectStatus === 'unpaid') && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-sm font-medium text-gray-700">改价（到付 / 代收货款）</h3>
              <p className="mb-3 text-[11px] text-gray-400">
                仅未出库且未收款时可改。金额清零则变为「无需收款」。
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">到付运费（元）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={freightInput}
                    onChange={(e) => setFreightInput(e.target.value)}
                    disabled={savingCollect}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">代收货款（元）</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={codInput}
                    onChange={(e) => setCodInput(e.target.value)}
                    disabled={savingCollect}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs text-gray-500">改价备注（可选）</label>
                <input
                  type="text"
                  value={collectNoteInput}
                  onChange={(e) => setCollectNoteInput(e.target.value.slice(0, 100))}
                  disabled={savingCollect}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="如：面单金额更正"
                />
              </div>
              {collectError && <p className="mt-2 text-xs text-danger">{collectError}</p>}
              <button
                type="button"
                disabled={savingCollect || !id}
                onClick={async () => {
                  if (!id) return;
                  setSavingCollect(true);
                  setCollectError('');
                  try {
                    await inventoryService.updateCollect(id, {
                      freightCollectAmount: freightInput.trim()
                        ? Number(freightInput)
                        : 0,
                      codAmount: codInput.trim() ? Number(codInput) : 0,
                      note: collectNoteInput.trim() || undefined,
                    });
                    invalidateDetail();
                    invalidateList();
                    invalidateDashboard();
                  } catch (e) {
                    setCollectError(e instanceof Error ? e.message : '改价失败');
                  } finally {
                    setSavingCollect(false);
                  }
                }}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
              >
                {savingCollect ? '保存中…' : '保存收款金额'}
              </button>
            </div>
          )}
      </section>

      {/* 状态轨迹时间线 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-700">状态轨迹</h2>
        {detail.events.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400">暂无轨迹</div>
        ) : (
          <ol className="relative border-l border-gray-200 pl-6">
            {detail.events.map((ev, idx) => (
              <li key={ev.id} className="mb-5 last:mb-0">
                <span className="absolute -left-1.5 mt-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-2 ring-white" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">
                    {EVENT_LABEL[ev.eventType] || ev.eventType}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(ev.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                {ev.description && (
                  <p className="mt-0.5 text-sm text-gray-600">{ev.description}</p>
                )}
                {ev.eventType === 'outbound' &&
                  ev.metadata &&
                  typeof ev.metadata === 'object' &&
                  (ev.metadata as {
                    verify?: {
                      type?: string;
                      phoneTail?: string;
                      note?: string;
                      evidenceUrl?: string;
                      signatureUrl?: string;
                    };
                  }).verify?.type === 'phone_tail' && (
                    <div className="mt-1 space-y-1">
                      <p className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        身份核验：手机后4位
                        {(ev.metadata as { verify?: { phoneTail?: string } }).verify?.phoneTail
                          ? ` · **${(ev.metadata as { verify?: { phoneTail?: string } }).verify?.phoneTail}`
                          : ''}
                        {(ev.metadata as { verify?: { note?: string } }).verify?.note
                          ? ` · ${(ev.metadata as { verify?: { note?: string } }).verify?.note}`
                          : ''}
                      </p>
                      {(ev.metadata as { verify?: { evidenceUrl?: string } }).verify?.evidenceUrl && (
                        <a
                          href={(ev.metadata as { verify?: { evidenceUrl?: string } }).verify?.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] text-primary hover:underline"
                        >
                          查看拍照留证
                        </a>
                      )}
                      {(ev.metadata as { verify?: { signatureUrl?: string } }).verify?.signatureUrl && (
                        <a
                          href={(ev.metadata as { verify?: { signatureUrl?: string } }).verify?.signatureUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] text-primary hover:underline"
                        >
                          查看取件签名
                        </a>
                      )}
                    </div>
                  )}
                {ev.operatorName && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    操作人：{ev.operatorName}
                    {ev.operatorType ? `（${ev.operatorType === 'staff' ? '工作人员' : '自助'}）` : ''}
                  </p>
                )}
                {idx === 0 && (
                  <p className="mt-0.5 text-xs text-gray-400">最新</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

const InfoItem: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div className="flex gap-3">
    <span className="w-24 shrink-0 text-gray-500">{label}</span>
    <span className={highlight ? 'font-mono text-base font-bold text-primary' : 'text-gray-800'}>
      {value}
    </span>
  </div>
);

export default ParcelDetailPage;
