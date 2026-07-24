import React, { useCallback, useEffect, useState } from 'react';
import * as appointmentService from '@/services/appointment';
import type {
  AppointmentItem,
  AppointmentSlot,
  AppointmentSlotsResult,
  AppointmentStatus,
} from '@/types/appointment';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import { notifyError, notifySuccess } from '@/utils/notification';

function todayBeijing(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'completed', label: '已到店' },
  { value: 'cancelled', label: '已取消' },
  { value: 'no_show', label: '未到店' },
];

const statusTone: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  no_show: 'bg-red-50 text-red-700',
};

const AppointmentsPage: React.FC = () => {
  const [slotDate, setSlotDate] = useState(todayBeijing());
  const [status, setStatus] = useState('');
  const [phone, setPhone] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 代客预约
  const [createOpen, setCreateOpen] = useState(false);
  const [slotsData, setSlotsData] = useState<AppointmentSlotsResult | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [cPhone, setCPhone] = useState('');
  const [cName, setCName] = useState('');
  const [cNote, setCNote] = useState('');
  const [cDayIdx, setCDayIdx] = useState(0);
  const [cSlot, setCSlot] = useState<AppointmentSlot | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appointmentService.fetchAppointments({
        slotDate: slotDate || undefined,
        status: status || undefined,
        phone: phone.trim() || undefined,
        page,
        pageSize: 15,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      notifyError(e?.message || '加载预约失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [slotDate, status, phone, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = async () => {
    setCreateOpen(true);
    setCSlot(null);
    setCNote('');
    setSlotsLoading(true);
    try {
      const data = await appointmentService.fetchAppointmentSlots();
      setSlotsData(data);
      const idx = data.days.findIndex((d) => d.slots.some((s) => s.available));
      setCDayIdx(idx >= 0 ? idx : 0);
    } catch (e: any) {
      notifyError(e?.message || '加载可约时段失败');
      setSlotsData(null);
    } finally {
      setSlotsLoading(false);
    }
  };

  const submitCreate = async () => {
    const day = slotsData?.days[cDayIdx];
    if (!day || !cSlot) {
      notifyError('请选择日期和时段');
      return;
    }
    if (!/^1\d{10}$/.test(cPhone)) {
      notifyError('请填写 11 位手机号');
      return;
    }
    setCreating(true);
    try {
      const item = await appointmentService.createStaffAppointment({
        phone: cPhone,
        recipientName: cName.trim() || undefined,
        slotDate: day.date,
        slotStart: cSlot.start,
        slotEnd: cSlot.end,
        note: cNote.trim() || undefined,
      });
      notifySuccess(item.notifyHint || '代客预约已登记');
      setCreateOpen(false);
      setCPhone('');
      setCName('');
      setCNote('');
      setCSlot(null);
      setSlotDate(day.date);
      setStatus('');
      setPage(1);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '代客预约失败');
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (id: string, next: AppointmentStatus) => {
    setBusyId(id);
    try {
      await appointmentService.updateAppointmentStatus(id, next);
      await load();
    } catch (e: any) {
      notifyError(e?.message || '更新失败');
    } finally {
      setBusyId(null);
    }
  };

  const day = slotsData?.days[cDayIdx];

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="预约取件"
        description="客户可在查件页自助预约；店员也可代客登记（电话咨询等）。时段按驿站营业时间过滤。"
        actions={
          <button
            type="button"
            onClick={() => void openCreate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
          >
            代客预约
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-xs text-gray-600">
          预约日期
          <input
            type="date"
            value={slotDate}
            onChange={(e) => {
              setPage(1);
              setSlotDate(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          状态
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          手机号
          <input
            type="search"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                void load();
              }
            }}
            placeholder="尾号或完整号"
            className="mt-1 block w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load();
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover"
        >
          查询
        </button>
        <button
          type="button"
          onClick={() => {
            setSlotDate(todayBeijing());
            setStatus('pending');
            setPhone('');
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
        >
          今日待确认
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500">加载中…</div>
        ) : items.length === 0 ? (
          <EmptyState title="暂无预约" description="可点右上角「代客预约」，或让客户在查件页自助提交" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">时段</th>
                  <th className="px-4 py-3 font-medium">客户</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">来源/备注</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {row.slotDate} {row.slotStart}-{row.slotEnd}
                      </div>
                      <div className="text-xs text-gray-500">{row.slotLabel}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.recipientName || '客户'}</div>
                      <div className="text-xs text-gray-600">{row.recipientPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusTone[row.status] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-500">
                      {row.source === 'admin' ? '店员代约' : '客户自助'}
                      {row.note || row.cancelReason ? ` · ${row.note || row.cancelReason}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'pending' && (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void updateStatus(row.id, 'confirmed')}
                            className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                          >
                            确认
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(row.status) && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => void updateStatus(row.id, 'completed')}
                              className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                            >
                              已到店
                            </button>
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => void updateStatus(row.id, 'no_show')}
                              className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                            >
                              未到
                            </button>
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => void updateStatus(row.id, 'cancelled')}
                              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                            >
                              取消
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / 15))}
        pageSize={15}
        total={total}
        onChange={(p) => setPage(p)}
      />

      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="代客预约"
        widthClassName="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            电话咨询等场景：帮客户登记到店时段。登记后默认为「已确认」
            {slotsData?.businessHours ? `；当前营业 ${slotsData.businessHours}` : ''}
            。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              手机号 *
              <input
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="收件手机号"
              />
            </label>
            <label className="block text-xs text-gray-600">
              称呼（选填）
              <input
                type="text"
                maxLength={20}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {slotsLoading && <p className="text-xs text-gray-500">加载可约时段…</p>}

          {slotsData && (
            <>
              <div className="flex flex-wrap gap-2">
                {slotsData.days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setCDayIdx(i);
                      setCSlot(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                      cDayIdx === i
                        ? 'bg-primary text-white ring-primary'
                        : 'bg-white text-gray-700 ring-gray-200'
                    }`}
                  >
                    {d.isToday ? '今天' : d.weekday} {d.date.slice(5)}
                  </button>
                ))}
              </div>
              {day && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {day.slots.map((s) => {
                    const active = cSlot?.start === s.start && cSlot?.end === s.end;
                    return (
                      <button
                        key={`${s.start}-${s.end}`}
                        type="button"
                        disabled={!s.available}
                        onClick={() => setCSlot(s)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm ${
                          active
                            ? 'border-primary bg-orange-50 text-primary'
                            : s.available
                              ? 'border-gray-200 hover:border-primary/40'
                              : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                        }`}
                      >
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs opacity-80">
                          {s.available ? `还可约 ${s.remaining}` : s.reason || '不可约'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <label className="block text-xs text-gray-600">
            备注（选填）
            <input
              type="text"
              maxLength={100}
              value={cNote}
              onChange={(e) => setCNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="例如：客户电话预约"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void submitCreate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {creating ? '提交中…' : '确认登记'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AppointmentsPage;
