import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as exceptionService from '@/services/exception';
import { useExceptionList, useInvalidateExceptionList } from '@/hooks/useExceptionData';
import * as inventoryService from '@/services/inventory';
import type {
  ExceptionResolution,
  ExceptionStatus,
  ExceptionType,
} from '@/types/exception';
import type { ParcelListItem } from '@/types/inventory';
import { useAuth } from '@/utils/auth';
import { canWrite } from '@/utils/permission';
import { notifyError, notifySuccess } from '@/utils/notification';
import * as inboundService from '@/services/inbound';
import { buildBindShareScript, buildFacePickupScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import PageHeader from '@/components/ui/PageHeader';
import NotifyReachBar from '@/components/NotifyReachBar';
import Modal from '@/components/ui/Modal';
import OutboundBindNudge from '@/components/OutboundBindNudge';
import { printPickupSlip } from '@/utils/printPickupSlip';
import SearchSelect, { type SearchSelectOption } from '@/components/ui/SearchSelect';

const TYPE_LABEL: Record<ExceptionType, string> = {
  lost: '丢失',
  damaged: '破损',
  wrong_address: '地址错误',
  refused: '拒收',
  other: '其他',
};

const STATUS_LABEL: Record<ExceptionStatus, string> = {
  registered: '已登记',
  processing: '处理中',
  resolved: '已解决',
  compensated: '已赔偿',
};

const RESOLUTION_OPTIONS: { value: ExceptionResolution; label: string }[] = [
  { value: 'compensate', label: '赔偿' },
  { value: 'return', label: '退回' },
  { value: 'destroy', label: '销毁' },
  { value: 'redeliver', label: '重新投递' },
];

const PARCEL_STATUS_LABEL: Record<string, string> = {
  in_stock: '在库',
  overdue: '滞留',
  exception: '异常',
  out_stock: '已出库',
  returned: '已退回',
};

const EMPTY_CREATE_FORM = {
  parcelId: '',
  type: 'other' as ExceptionType,
  description: '',
};

const ExceptionPage: React.FC = () => {
  const { user, stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '智能快递驿站';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const writable = canWrite(user?.role);

  const [status, setStatus] = useState<ExceptionStatus | ''>(
    (searchParams.get('status') as ExceptionStatus) || '',
  );
  const [type, setType] = useState<ExceptionType | ''>('');
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [parcelKeyword, setParcelKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [parcelOptions, setParcelOptions] = useState<ParcelListItem[]>([]);
  const [form, setForm] = useState(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  const [processId, setProcessId] = useState<string | null>(null);
  const [processForm, setProcessForm] = useState({
    status: 'processing' as ExceptionStatus,
    resolution: 'compensate' as ExceptionResolution,
    resolutionNote: '',
  });
  const [processing, setProcessing] = useState(false);

  const pageSize = 20;

  const { data, isLoading, refetch } = useExceptionList({
    status: status || undefined,
    type: type || undefined,
    keyword: submittedKeyword || undefined,
    page,
    pageSize,
  });
  const invalidateException = useInvalidateExceptionList();

  const loading = isLoading;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const parcelSelectOptions = useMemo<SearchSelectOption[]>(
    () =>
      parcelOptions.map((p) => ({
        value: p.id,
        label: `${p.trackingNumber}${p.pickupCode ? ` · ${p.pickupCode}` : ''}`,
        hint: p.recipientName || undefined,
        badge: PARCEL_STATUS_LABEL[p.status] || p.status,
      })),
    [parcelOptions],
  );

  const openCreate = () => {
    setParcelKeyword('');
    setParcelOptions([]);
    setForm(EMPTY_CREATE_FORM);
    setShowCreate(true);
  };

  const searchParcels = async () => {
    const kw = parcelKeyword.trim();
    if (!kw) {
      notifyError('请输入运单号/取件码/手机号');
      return;
    }
    setSearching(true);
    try {
      // 异常可登记于在库/滞留/已异常包裹，这里不限定单一状态，改为按关键字模糊匹配
      const isPhone = /^\d{6,}$/.test(kw);
      const isPickup = /-/.test(kw);
      const res = await inventoryService.fetchInventory({
        trackingNumber: !isPhone && !isPickup ? kw : undefined,
        pickupCode: isPickup ? kw : undefined,
        phone: isPhone ? kw : undefined,
        page: 1,
        pageSize: 20,
      });
      const options = (res.items || []).filter((p) =>
        ['in_stock', 'overdue', 'exception'].includes(p.status),
      );
      setParcelOptions(options);
      if (options.length === 1) {
        setForm((f) => ({ ...f, parcelId: options[0].id }));
      } else if (options.length === 0) {
        notifyError('未找到可登记异常的在库/滞留包裹');
      }
    } catch (e: any) {
      notifyError(e?.message || '搜索包裹失败');
    } finally {
      setSearching(false);
    }
  };

  const onCreate = async () => {
    if (!form.parcelId || !form.description.trim()) {
      notifyError('请选择包裹并填写描述');
      return;
    }
    setCreating(true);
    try {
      await exceptionService.createException({
        parcelId: form.parcelId,
        type: form.type,
        description: form.description.trim(),
      });
      setShowCreate(false);
      await invalidateException();
    } catch (e: any) {
      notifyError(e?.message || '登记失败');
    } finally {
      setCreating(false);
    }
  };

  const onProcess = async () => {
    if (!processId) return;
    setProcessing(true);
    try {
      await exceptionService.updateException(processId, {
        status: processForm.status,
        resolution:
          processForm.status === 'resolved' || processForm.status === 'compensated'
            ? processForm.resolution
            : undefined,
        resolutionNote: processForm.resolutionNote || undefined,
      });
      setProcessId(null);
      await invalidateException();
    } catch (e: any) {
      notifyError(e?.message || '更新失败');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="异常件管理"
        description="登记、处理丢失/破损/错投；可看包裹、补发到件、复制当面话术"
        actions={
          writable && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              登记异常
            </button>
          )
        }
      />

      <NotifyReachBar className="mb-3" context="exception" />

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-2">
        <p className="text-[11px] text-orange-900">
          异常件常需联系客户：可看包裹详情、补发到件通知，或复制当面话术（勿发群）。
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/system?tab=notify&filter=today')}
          className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
        >
          今日通知
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const ok = await copyText(buildBindShareScript());
              if (ok) notifySuccess('已复制绑定引导（不含取件码）');
              else notifyError('复制失败');
            })();
          }}
          className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
        >
          复制绑定话术
        </button>
      </div>


      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ExceptionStatus | '');
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">全部状态</option>
          {(Object.keys(STATUS_LABEL) as ExceptionStatus[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as ExceptionType | '');
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">全部类型</option>
          {(Object.keys(TYPE_LABEL) as ExceptionType[]).map((k) => (
            <option key={k} value={k}>
              {TYPE_LABEL[k]}
            </option>
          ))}
        </select>
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedKeyword(keyword);
            if (submittedKeyword === keyword) refetch();
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="运单/取件码/描述"
            className="w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
            搜索
          </button>
        </form>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无异常件" description="可点击「登记异常」添加记录" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      {TYPE_LABEL[item.type]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {STATUS_LABEL[item.status]}
                    </span>
                    {item.parcel && (
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => navigate(`/admin/inventory/${item.parcel!.id}`)}
                      >
                        {item.parcel.trackingNumber}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{item.description}</p>
                  {item.parcel && (
                    <p className="mt-1 text-xs text-gray-600">
                      {item.parcel.recipientName || '客户'}
                      {item.parcel.recipientPhone
                        ? ` · ${item.parcel.recipientPhone}`
                        : ''}
                      {item.parcel.pickupCode
                        ? ` · 取件码 ${item.parcel.pickupCode}`
                        : ''}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    登记 {item.createdAt}
                    {item.resolution ? ` · 处理：${item.resolution}` : ''}
                  </p>
                  {(item.parcel || item.parcelId) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                        onClick={() =>
                          navigate(
                            `/admin/inventory/${item.parcel?.id || item.parcelId}`,
                          )
                        }
                      >
                        看包裹
                      </button>
                      {item.parcel?.recipientPhone && (
                        <button
                          type="button"
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            const phone = item.parcel!.recipientPhone
                              .replace(/\D/g, '')
                              .slice(0, 11);
                            navigate(
                              phone
                                ? `/admin/system?tab=notify&phone=${encodeURIComponent(phone)}`
                                : '/admin/system?tab=notify',
                            );
                          }}
                        >
                          看通知
                        </button>
                      )}
                      {item.parcel?.pickupCode && (
                        <button
                          type="button"
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            void (async () => {
                              const ok = await copyText(
                                buildFacePickupScript({
                                  pickupCode: item.parcel!.pickupCode,
                                  recipientName: item.parcel!.recipientName,
                                }),
                              );
                              if (ok) notifySuccess('已复制当面话术（含取件码，勿发群）');
                              else notifyError('复制失败');
                            })();
                          }}
                        >
                          复制当面话术
                        </button>
                      )}
                      {item.parcel?.pickupCode && (
                        <button
                          type="button"
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            const ok = printPickupSlip({
                              stationName,
                              pickupCode: item.parcel!.pickupCode,
                              trackingNumber: item.parcel!.trackingNumber,
                              recipientName: item.parcel!.recipientName,
                              recipientPhone: item.parcel!.recipientPhone,
                              inboundAt: item.parcel!.inboundAt,
                            });
                            if (ok) notifySuccess('已打开打印预览');
                            else notifyError('无法打开打印窗口，请检查浏览器是否拦截弹窗');
                          }}
                        >
                          打印小票
                        </button>
                      )}
                      {writable &&
                        item.parcel &&
                        (item.parcel.status === 'in_stock' ||
                          item.parcel.status === 'overdue') && (
                          <button
                            type="button"
                            disabled={resendingId === (item.parcel?.id || item.parcelId)}
                            className="rounded border border-primary/30 bg-orange-50 px-2 py-1 text-[11px] text-primary hover:bg-orange-100 disabled:opacity-60"
                            onClick={() => {
                              const pid = item.parcel?.id || item.parcelId;
                              void (async () => {
                                if (!pid) return;
                                const ok = window.confirm(
                                  '补发到件通知？\n\n已绑定会私信取件码；未绑定请当面联系。',
                                );
                                if (!ok) return;
                                setResendingId(pid);
                                try {
                                  const r = await inboundService.resendInboundNotice(pid);
                                  notifySuccess(r.staffMessage || '已尝试补发');
                                } catch (e: any) {
                                  notifyError(e?.message || '补发失败');
                                } finally {
                                  setResendingId(null);
                                }
                              })();
                            }}
                          >
                            {resendingId === (item.parcel?.id || item.parcelId)
                              ? '补发中…'
                              : '补发到件'}
                          </button>
                        )}
                    </div>
                  )}
                </div>
                {writable && item.status !== 'resolved' && item.status !== 'compensated' && (
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setProcessId(item.id);
                      setProcessForm({
                        status: item.status === 'registered' ? 'processing' : 'resolved',
                        resolution: 'compensate',
                        resolutionNote: '',
                      });
                    }}
                  >
                    处理
                  </button>
                )}
              </div>
            </div>
          ))}
          <Pagination page={page} pageSize={pageSize} total={total} totalPages={Math.max(1, Math.ceil(total / pageSize))} onChange={setPage} />
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="登记异常"
        widthClassName="max-w-lg"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => setShowCreate(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={creating}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
              onClick={onCreate}
            >
              {creating ? '提交中…' : '提交'}
            </button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-sm text-gray-600">
            <span className="mr-0.5 text-danger">*</span>包裹
          </label>
          <div className="flex gap-2">
          <input
            value={parcelKeyword}
            onChange={(e) => setParcelKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                searchParcels();
              }
            }}
            placeholder="运单号/取件码/手机号"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={searchParcels}
            disabled={searching}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        <SearchSelect
          value={form.parcelId}
          onChange={(value) => setForm((f) => ({ ...f, parcelId: value }))}
          options={parcelSelectOptions}
          placeholder={parcelOptions.length ? '选择包裹' : '请先搜索包裹'}
          emptyText="未找到可登记的包裹"
          disabled={parcelOptions.length === 0}
        />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">异常类型</label>
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ExceptionType }))}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          {(Object.keys(TYPE_LABEL) as ExceptionType[]).map((k) => (
            <option key={k} value={k}>
              {TYPE_LABEL[k]}
            </option>
          ))}
        </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">
            <span className="mr-0.5 text-danger">*</span>异常描述
          </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          placeholder="异常描述"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        </div>
      </Modal>

      <Modal
        open={processId !== null}
        onClose={() => setProcessId(null)}
        title="处理异常"
        footer={
          <>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => setProcessId(null)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={processing}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
              onClick={onProcess}
            >
              {processing ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <select
          value={processForm.status}
          onChange={(e) =>
            setProcessForm((f) => ({ ...f, status: e.target.value as ExceptionStatus }))
          }
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        >
          <option value="processing">处理中</option>
          <option value="resolved">已解决</option>
          <option value="compensated">已赔偿</option>
        </select>
        {(processForm.status === 'resolved' || processForm.status === 'compensated') && (
          <select
            value={processForm.resolution}
            onChange={(e) =>
              setProcessForm((f) => ({
                ...f,
                resolution: e.target.value as ExceptionResolution,
              }))
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {RESOLUTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <textarea
          value={processForm.resolutionNote}
          onChange={(e) => setProcessForm((f) => ({ ...f, resolutionNote: e.target.value }))}
          rows={3}
          placeholder="处理说明"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </Modal>
    </div>
  );
};

export default ExceptionPage;
