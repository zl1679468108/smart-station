import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as inventoryService from '@/services/inventory';
import * as overdueService from '@/services/overdue';
import * as inboundService from '@/services/inbound';
import { notifyError, notifySuccess } from '@/utils/notification';
import { copyText } from '@/utils/stationVisit';
import { printPickupSlip } from '@/utils/printPickupSlip';
import { useAuth } from '@/utils/auth';
import { buildBindShareScript, buildFacePickupScript } from '@/utils/staffScripts';
import OutboundBindNudge from '@/components/OutboundBindNudge';
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
  const { stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '智能快递驿站';
  const { data: detail, isLoading, error } = useParcelDetail(id);
  const invalidateDetail = useInvalidateInventoryDetail();
  const invalidateList = useInvalidateInventoryList();
  const invalidateDashboard = useInvalidateDashboard();
  const [freightInput, setFreightInput] = useState('');
  const [codInput, setCodInput] = useState('');
  const [collectNoteInput, setCollectNoteInput] = useState('');
  const [savingCollect, setSavingCollect] = useState(false);
  const [collectError, setCollectError] = useState('');
  const [resendingNotice, setResendingNotice] = useState(false);
  const [lastNotify, setLastNotify] = useState<{
    message: string;
    customerBound?: boolean;
    customerPushed?: boolean;
  } | null>(null);
  const [remindingOverdue, setRemindingOverdue] = useState(false);
  const [lastRemindHint, setLastRemindHint] = useState<string | null>(null);
  const [lastRemindUnbound, setLastRemindUnbound] = useState(false);
  const [lastRemindPushFailed, setLastRemindPushFailed] = useState(false);

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
          <div className="sm:col-span-2">
            <InfoItem label="取件码" value={detail.pickupCode || '-'} highlight />
            {(detail.status === 'in_stock' || detail.status === 'overdue') && detail.pickupCode && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={async () => {
                    const ok = await copyText(detail.pickupCode);
                    if (ok) notifySuccess('取件码已复制');
                    else notifyError('复制失败');
                  }}
                >
                  复制取件码
                </button>
                <button
                  type="button"
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    const ok = printPickupSlip({
                      stationName,
                      pickupCode: detail.pickupCode || '',
                      trackingNumber: detail.trackingNumber,
                      shelfNumber: detail.shelf?.number,
                      shelfLayer: detail.shelfLayer,
                      shelfPosition: detail.shelfPosition,
                      recipientName: detail.recipientName,
                      recipientPhone: detail.recipientPhone,
                      courierCompanyName: detail.courier?.name,
                      inboundAt: detail.inboundAt,
                      collectDueAmount: detail.collectDueAmount,
                    });
                    if (ok) notifySuccess('已打开打印预览');
                    else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
                  }}
                >
                  打印小票
                </button>
                <button
                  type="button"
                  className="rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs text-orange-800 hover:bg-orange-50"
                  onClick={async () => {
                    const ok = await copyText(
                      buildFacePickupScript({
                        pickupCode: detail.pickupCode,
                        recipientName: detail.recipientName,
                      }),
                    );
                    if (ok) notifySuccess('已复制当面话术（含取件码，勿发群）');
                    else notifyError('复制失败');
                  }}
                >
                  复制当面话术
                </button>
                <button
                  type="button"
                  className="rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs text-orange-800 hover:bg-orange-50"
                  onClick={async () => {
                    const ok = await copyText(buildBindShareScript());
                    if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                    else notifyError('复制失败');
                  }}
                >
                  复制绑定话术
                </button>
                <button
                  type="button"
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-primary hover:text-primary"
                  onClick={() => {
                    const phone = (detail.recipientPhone || '').replace(/\D/g, '').slice(0, 11);
                    const q = phone
                      ? `tab=notify&phone=${encodeURIComponent(phone)}`
                      : 'tab=notify&filter=inbound';
                    navigate(`/admin/system?${q}`);
                  }}
                >
                  看通知记录
                </button>
                <button
                  type="button"
                  disabled={resendingNotice}
                  className="rounded-md border border-primary/30 bg-orange-50 px-3 py-1.5 text-xs text-primary hover:bg-orange-100 disabled:opacity-60"
                  onClick={async () => {
                    if (resendingNotice || !id) return;
                    setResendingNotice(true);
                    try {
                      const r = await inboundService.resendInboundNotice(id);
                      setLastNotify({
                        message: r.staffMessage || '已尝试补发通知',
                        customerBound: r.customerBound,
                        customerPushed: r.customerPushed,
                      });
                      notifySuccess(r.staffMessage || '已尝试补发通知');
                      invalidateDetail();
                      invalidateList();
                      invalidateDashboard();
                    } catch (e: any) {
                      notifyError(e?.message || '补发失败');
                    } finally {
                      setResendingNotice(false);
                    }
                  }}
                >
                  {resendingNotice ? '补发中…' : '补发到件通知'}
                </button>
                {(detail.status === 'overdue' ||
                  (detail.status === 'in_stock' && Number(detail.daysInStock || 0) >= 3)) && (
                  <button
                    type="button"
                    disabled={remindingOverdue}
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    onClick={async () => {
                      if (remindingOverdue || !id) return;
                      const ok = window.confirm(
                        '向客户补发滞留提醒？\n\n已绑定微信会私信取件码；未绑定仅旁路通知（不含取件码）。',
                      );
                      if (!ok) return;
                      setRemindingOverdue(true);
                      try {
                        const r = await overdueService.remindOverdue(id);
                        setLastRemindHint(r.staffMessage || '提醒已发送');
                        setLastRemindUnbound(!r.customerBound);
                        setLastRemindPushFailed(Boolean(r.customerBound && !r.customerPushed));
                        notifySuccess(r.staffMessage || '提醒已发送');
                        invalidateDetail();
                        invalidateList();
                        invalidateDashboard();
                      } catch (e: any) {
                        notifyError(e?.message || '发送失败');
                      } finally {
                        setRemindingOverdue(false);
                      }
                    }}
                  >
                    {remindingOverdue ? '提醒中…' : '发滞留提醒'}
                  </button>
                )}
              </div>
            )}
            {lastNotify && (
              <div className="mt-2 rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p>到件通知回执：{lastNotify.message}</p>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setLastNotify(null)}
                  >
                    关闭
                  </button>
                </div>
                {lastNotify.customerBound && !lastNotify.customerPushed && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={resendingNotice}
                      className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      onClick={async () => {
                        if (resendingNotice || !id) return;
                        setResendingNotice(true);
                        try {
                          const r = await inboundService.resendInboundNotice(id);
                          setLastNotify({
                            message: r.staffMessage || '已再发',
                            customerBound: r.customerBound,
                            customerPushed: r.customerPushed,
                          });
                          notifySuccess(r.staffMessage || '已再发');
                          invalidateDashboard();
                        } catch (e: any) {
                          notifyError(e?.message || '再发失败');
                        } finally {
                          setResendingNotice(false);
                        }
                      }}
                    >
                      {resendingNotice ? '再发中…' : '再发一次'}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] text-amber-900 hover:bg-amber-50"
                      onClick={() =>
                        navigate('/admin/system?tab=notify&filter=push_failed&days=1')
                      }
                    >
                      看今日私信失败
                    </button>
                  </div>
                )}
                {lastNotify.customerBound === false && (
                  <p className="mt-1.5 text-[11px] text-orange-900/90">
                    客户未绑定：当面报码，或复制绑定话术；绑定后会自动/可再补发取件码。
                  </p>
                )}
                {lastNotify.customerPushed && (
                  <p className="mt-1.5 text-[11px] text-emerald-800">取件码已私信到客户微信。</p>
                )}
              </div>
            )}
            {lastRemindHint && (
              <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p>滞留提醒回执：{lastRemindHint}</p>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setLastRemindHint(null);
                      setLastRemindUnbound(false);
                      setLastRemindPushFailed(false);
                    }}
                  >
                    关闭
                  </button>
                </div>
                {lastRemindUnbound ? (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-orange-900">
                      客户未绑定：催取时顺便引导绑定，绑定后可再发提醒私信取件码。
                    </p>
                    <OutboundBindNudge phone={detail.recipientPhone} variant="admin" />
                  </div>
                ) : lastRemindPushFailed ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <p className="w-full text-[11px] font-medium text-amber-900">
                      客户已绑定但私信失败，可再发一次。
                    </p>
                    <button
                      type="button"
                      disabled={remindingOverdue}
                      className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      onClick={async () => {
                        if (remindingOverdue || !id) return;
                        setRemindingOverdue(true);
                        try {
                          const r = await overdueService.remindOverdue(id);
                          setLastRemindHint(r.staffMessage || '已再发');
                          setLastRemindUnbound(!r.customerBound);
                          setLastRemindPushFailed(Boolean(r.customerBound && !r.customerPushed));
                          notifySuccess(r.staffMessage || '已再发');
                          invalidateDashboard();
                        } catch (e: any) {
                          notifyError(e?.message || '再发失败');
                        } finally {
                          setRemindingOverdue(false);
                        }
                      }}
                    >
                      {remindingOverdue ? '再发中…' : '再发滞留提醒'}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[11px] text-amber-900 hover:bg-amber-50"
                      onClick={() =>
                        navigate(
                          '/admin/system?tab=notify&filter=push_failed&days=1&template=overdue_remind',
                        )
                      }
                    >
                      看滞留私信失败
                    </button>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[11px] text-emerald-800">
                    客户已绑定：微信应能收到取件码，可少说绑定话术。
                  </p>
                )}
              </div>
            )}
          </div>
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
        {detail.collectStatus === 'unpaid' &&
          Number(detail.collectDueAmount || 0) > 0 &&
          (detail.status === 'in_stock' || detail.status === 'overdue') && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-100 bg-rose-50 px-3 py-2.5">
              <p className="text-xs text-rose-800">
                待收款 ¥{Number(detail.collectDueAmount || 0).toFixed(2)}，取件时需当面收妥
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/admin/outbound?tracking=${encodeURIComponent(detail.trackingNumber)}`,
                  )
                }
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
              >
                去出库收款
              </button>
            </div>
          )}
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
