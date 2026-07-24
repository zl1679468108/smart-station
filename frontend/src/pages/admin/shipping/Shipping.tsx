import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as shippingService from '@/services/shipping';
import { fetchCouriers } from '@/services/inventory';
import type { CourierCompany } from '@/types/admin';
import type {
  ShippingItem,
  ShippingStatus,
  AddressItem,
  AddressRole,
  AddressTag,
  FreightBreakdown,
  CreateShippingBody,
} from '@/types/shipping';
import { useAuth } from '@/utils/auth';
import { canWrite } from '@/utils/permission';
import { notifyError, notifySuccess } from '@/utils/notification';
import { buildBindGuideScript, buildShippingFaceScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';

type Tab = 'orders' | 'address';

const STATUS_LABEL: Record<ShippingStatus, string> = {
  pending: '待处理',
  picked: '已取件',
  shipped: '已发出',
  cancelled: '已取消',
};

const STATUS_BADGE: Record<ShippingStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  picked: 'bg-blue-100 text-blue-800',
  shipped: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

const PICKUP_LABEL: Record<string, string> = {
  in_store: '到店寄件',
  door: '上门取件',
};

const TAG_LABEL: Record<string, string> = {
  home: '家',
  company: '公司',
  school: '学校',
  other: '其他',
};

const STATUS_TABS: { key: '' | ShippingStatus; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'picked', label: '已取件' },
  { key: 'shipped', label: '已发出' },
  { key: 'cancelled', label: '已取消' },
];

const EMPTY_FORM: CreateShippingBody = {
  courierCompanyId: '',
  pickupType: 'in_store',
  pickupAddress: '',
  senderName: '',
  senderPhone: '',
  senderAddress: '',
  receiverName: '',
  receiverPhone: '',
  receiverAddress: '',
  itemType: '',
  weight: 1,
  insuredAmount: 0,
  note: '',
};

const EMPTY_ADDRESS = {
  role: 'sender' as AddressRole,
  name: '',
  phone: '',
  address: '',
  tag: 'home' as AddressTag,
};

const ShippingPage: React.FC = () => {
  const { user } = useAuth();
  const writable = canWrite(user?.role);

  const [tab, setTab] = useState<Tab>('orders');
  const [couriers, setCouriers] = useState<CourierCompany[]>([]);

  useEffect(() => {
    fetchCouriers()
      .then(setCouriers)
      .catch(() => setCouriers([]));
  }, []);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="寄件管理"
        description="寄件下单、上门取件、运费试算与地址簿；可复制进度话术、按手机看通知"
      />

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'orders'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          寄件单
        </button>
        <button
          type="button"
          onClick={() => setTab('address')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'address'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          地址簿
        </button>
      </div>

      {tab === 'orders' ? (
        <OrdersTab couriers={couriers} writable={writable} />
      ) : (
        <AddressTab writable={writable} />
      )}
    </div>
  );
};

// ===== 寄件单 Tab =====

const OrdersTab: React.FC<{ couriers: CourierCompany[]; writable: boolean }> = ({
  couriers,
  writable,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [lastTip, setLastTip] = useState<string | null>(null);
  const statusFromQuery = searchParams.get('status') as ShippingStatus | null;
  const initialStatus: '' | ShippingStatus =
    statusFromQuery && ['pending', 'picked', 'shipped', 'cancelled'].includes(statusFromQuery)
      ? statusFromQuery
      : '';

  const [status, setStatus] = useState<'' | ShippingStatus>(initialStatus);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ShippingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (
      statusFromQuery &&
      ['pending', 'picked', 'shipped', 'cancelled'].includes(statusFromQuery) &&
      statusFromQuery !== status
    ) {
      setStatus(statusFromQuery);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFromQuery]);

  const changeStatusFilter = (next: '' | ShippingStatus) => {
    setStatus(next);
    setPage(1);
    const sp = new URLSearchParams(searchParams);
    if (!next) sp.delete('status');
    else sp.set('status', next);
    setSearchParams(sp, { replace: true });
  };

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateShippingBody>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [estimate, setEstimate] = useState<FreightBreakdown | null>(null);
  const [estimating, setEstimating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await shippingService.fetchShippingList({
        status: status || undefined,
        keyword: submittedKeyword || undefined,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      notifyError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, submittedKeyword, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEstimate(null);
    setShowCreate(true);
  };

  const onEstimate = async () => {
    if (!form.courierCompanyId) {
      notifyError('请先选择快递公司');
      return;
    }
    setEstimating(true);
    try {
      const r = await shippingService.estimateFreight({
        courierCompanyId: form.courierCompanyId,
        weight: Number(form.weight) || 1,
        insuredAmount: Number(form.insuredAmount) || 0,
      });
      setEstimate(r);
    } catch (e: any) {
      notifyError(e?.message || '试算失败');
    } finally {
      setEstimating(false);
    }
  };

  const onCreate = async () => {
    if (!form.senderName || !form.senderPhone || !form.senderAddress) {
      notifyError('请填写完整发件人信息');
      return;
    }
    if (!form.receiverName || !form.receiverPhone || !form.receiverAddress) {
      notifyError('请填写完整收件人信息');
      return;
    }
    setCreating(true);
    try {
      await shippingService.createShipping({
        ...form,
        courierCompanyId: form.courierCompanyId || undefined,
        weight: Number(form.weight) || 1,
        insuredAmount: Number(form.insuredAmount) || 0,
      });
      setShowCreate(false);
      setPage(1);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const onAdvance = async (item: ShippingItem, next: ShippingStatus) => {
    if (advancingId) return;
    if (next === 'cancelled') {
      const ok = window.confirm(`确认取消寄件单 ${item.shippingNo}？取消后不可恢复。`);
      if (!ok) return;
    }
    setAdvancingId(item.id);
    try {
      await shippingService.updateShippingStatus(item.id, next);
      const tip = `寄件单 ${item.shippingNo} 已更新为「${STATUS_LABEL[next]}」`;
      setLastTip(tip);
      notifySuccess(tip);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '操作失败');
    } finally {
      setAdvancingId(null);
    }
  };

  const nextAction = (item: ShippingItem): { label: string; next: ShippingStatus } | null => {
    if (item.status === 'pending') return { label: '标记已取件', next: 'picked' };
    if (item.status === 'picked') return { label: '标记已发出', next: 'shipped' };
    return null;
  };

    return (
    <div className="space-y-4">
      {lastTip && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <p>{lastTip}</p>
          <button type="button" className="underline" onClick={() => setLastTip(null)}>
            关闭
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/70 px-3 py-2">
        <p className="text-[11px] text-orange-900">
          寄件进度请一对一告知客户；可复制话术，或按发件手机号查看通知记录。
        </p>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const ok = await copyText(buildBindGuideScript());
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
        {STATUS_TABS.map((t) => (
        <button
            key={t.key || 'all'}
            type="button"
            onClick={() => changeStatusFilter(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              status === t.key
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSubmittedKeyword(keyword);
          }}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="寄件单号/手机号/姓名"
            className="w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
            搜索
          </button>
        </form>
        {writable && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            寄件下单
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无寄件单" description="可点击「寄件下单」创建" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const action = nextAction(item);
            return (
              <div key={item.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{item.shippingNo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {PICKUP_LABEL[item.pickupType]}
                      </span>
                      {item.courier && (
                        <span className="text-xs text-gray-500">{item.courier.name}</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {item.senderName} {item.senderPhone} → {item.receiverName}{' '}
                      {item.receiverPhone}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {item.itemType ? `${item.itemType} · ` : ''}
                      {item.weight}kg · 运费 ¥{item.freight}
                      {item.insuredAmount ? ` · 保价 ¥${item.insuredAmount}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        void (async () => {
                          const ok = await copyText(
                            buildShippingFaceScript({
                              shippingNo: item.shippingNo,
                              statusLabel: STATUS_LABEL[item.status],
                              senderName: item.senderName,
                              receiverName: item.receiverName,
                              courierName: item.courier?.name,
                              freight: item.freight,
                            }),
                          );
                          if (ok) notifySuccess('已复制寄件进度话术（一对一告知，勿发群）');
                          else notifyError('复制失败');
                        })();
                      }}
                    >
                      复制话术
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        const phone = (item.senderPhone || '').replace(/\D/g, '').slice(0, 11);
                        navigate(
                          phone
                            ? `/admin/system?tab=notify&phone=${encodeURIComponent(phone)}`
                            : '/admin/system?tab=notify',
                        );
                      }}
                    >
                      看通知
                    </button>
                    {writable && action && (
                      <button
                        type="button"
                        disabled={advancingId === item.id}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90 disabled:opacity-60"
                        onClick={() => onAdvance(item, action.next)}
                      >
                        {advancingId === item.id ? '处理中…' : action.label}
                      </button>
                    )}
                    {writable && item.status === 'pending' && (
                      <button
                        type="button"
                        disabled={advancingId === item.id}
                        className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-60"
                        onClick={() => onAdvance(item, 'shipped')}
                        title="到店即寄，跳过已取件"
                      >
                        直接发出
                      </button>
                    )}
                    {writable && (item.status === 'pending' || item.status === 'picked') && (
                      <button
                        type="button"
                        disabled={advancingId === item.id}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        onClick={() => onAdvance(item, 'cancelled')}
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            onChange={setPage}
          />
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="寄件下单"
        widthClassName="max-w-2xl"
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">快递公司</label>
            <select
              value={form.courierCompanyId}
              onChange={(e) => setForm((f) => ({ ...f, courierCompanyId: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">未选择</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">取件方式</label>
            <select
              value={form.pickupType}
              onChange={(e) =>
                setForm((f) => ({ ...f, pickupType: e.target.value as 'in_store' | 'door' }))
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="in_store">到店寄件</option>
              <option value="door">上门取件</option>
            </select>
          </div>
        </div>

        {form.pickupType === 'door' && (
          <div className="mt-3">
            <label className="mb-1 block text-sm text-gray-600">上门取件地址</label>
            <input
              value={form.pickupAddress}
              onChange={(e) => setForm((f) => ({ ...f, pickupAddress: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-700">发件人</p>
            <input
              value={form.senderName}
              onChange={(e) => setForm((f) => ({ ...f, senderName: e.target.value }))}
              placeholder="姓名"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              value={form.senderPhone}
              onChange={(e) => setForm((f) => ({ ...f, senderPhone: e.target.value }))}
              placeholder="手机号"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={form.senderAddress}
              onChange={(e) => setForm((f) => ({ ...f, senderAddress: e.target.value }))}
              placeholder="地址"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2 rounded-lg bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-700">收件人</p>
            <input
              value={form.receiverName}
              onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))}
              placeholder="姓名"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              value={form.receiverPhone}
              onChange={(e) => setForm((f) => ({ ...f, receiverPhone: e.target.value }))}
              placeholder="手机号"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={form.receiverAddress}
              onChange={(e) => setForm((f) => ({ ...f, receiverAddress: e.target.value }))}
              placeholder="地址"
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">物品类型</label>
            <input
              value={form.itemType}
              onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))}
              placeholder="如 文件/衣物"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">重量(kg)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">保价金额(¥)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.insuredAmount}
              onChange={(e) => setForm((f) => ({ ...f, insuredAmount: Number(e.target.value) }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg bg-orange-50 p-3">
          <button
            type="button"
            disabled={estimating}
            onClick={onEstimate}
            className="rounded-lg border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60"
          >
            {estimating ? '试算中…' : '运费试算'}
          </button>
          {estimate ? (
            <div className="text-sm text-gray-700">
              首重 ¥{estimate.firstWeightPrice}（{estimate.firstWeightKg}kg）+ 续重{' '}
              {estimate.additionalWeight}kg × ¥{estimate.additionalPrice}
              {estimate.insureFee ? ` + 保价 ¥${estimate.insureFee}` : ''} ={' '}
              <span className="font-semibold text-primary">¥{estimate.freight}</span>
              {estimate.usedDefaultRate && (
                <span className="ml-1 text-xs text-amber-600">（默认费率，未配置）</span>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-400">填写快递公司与重量后可试算</span>
          )}
        </div>
      </Modal>
    </div>
  );
};

// ===== 地址簿 Tab =====

const AddressTab: React.FC<{ writable: boolean }> = ({ writable }) => {
  const [role, setRole] = useState<'' | AddressRole>('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AddressItem[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await shippingService.fetchAddressList({ role: role || undefined, pageSize: 100 });
      setItems(res.items);
    } catch (e: any) {
      notifyError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_ADDRESS);
    setShowForm(true);
  };

  const openEdit = (a: AddressItem) => {
    setEditId(a.id);
    setForm({
      role: a.role,
      name: a.name,
      phone: a.phone,
      address: a.address,
      tag: (a.tag || 'other') as AddressTag,
    });
    setShowForm(true);
  };

  const onSave = async () => {
    if (!form.name || !form.phone || !form.address) {
      notifyError('请填写完整姓名/手机号/地址');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await shippingService.updateAddress(editId, form);
      } else {
        await shippingService.createAddress(form);
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (a: AddressItem) => {
    try {
      await shippingService.deleteAddress(a.id);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as '' | AddressRole)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          <option value="">全部</option>
          <option value="sender">发件人</option>
          <option value="receiver">收件人</option>
        </select>
        {writable && (
          <button
            type="button"
            onClick={openCreate}
            className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            新增地址
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无地址" description="可点击「新增地址」添加常用联系人" />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{a.name}</span>
                    <span className="text-sm text-gray-500">{a.phone}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {a.role === 'sender' ? '发件人' : '收件人'}
                    </span>
                    {a.tag && (
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                        {TAG_LABEL[a.tag]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{a.address}</p>
                </div>
                {writable && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={() => openEdit(a)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={() => onDelete(a)}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? '编辑地址' : '新增地址'}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={() => setShowForm(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
              onClick={onSave}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-600">角色</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AddressRole }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="sender">发件人</option>
                <option value="receiver">收件人</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">标签</label>
              <select
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value as AddressTag }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="home">家</option>
                <option value="company">公司</option>
                <option value="school">学校</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="姓名"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="手机号"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="地址"
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      </Modal>
    </div>
  );
};

export default ShippingPage;
