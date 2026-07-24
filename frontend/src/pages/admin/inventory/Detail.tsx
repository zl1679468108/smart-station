import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useParcelDetail } from '@/hooks/useInventoryData';
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
        </div>
        {detail.note && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="mb-1 text-xs text-gray-500">备注</div>
            <div className="text-sm text-gray-700">{detail.note}</div>
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
                  (ev.metadata as { verify?: { type?: string; phoneTail?: string; note?: string } })
                    .verify?.type === 'phone_tail' && (
                    <p className="mt-1 inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                      身份核验：手机后4位
                      {(ev.metadata as { verify?: { phoneTail?: string } }).verify?.phoneTail
                        ? ` · **${(ev.metadata as { verify?: { phoneTail?: string } }).verify?.phoneTail}`
                        : ''}
                      {(ev.metadata as { verify?: { note?: string } }).verify?.note
                        ? ` · ${(ev.metadata as { verify?: { note?: string } }).verify?.note}`
                        : ''}
                    </p>
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
