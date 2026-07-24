import React, { useCallback, useEffect, useState } from 'react';
import * as kioskService from '@/services/kiosk';
import type {
  AppointmentDay,
  AppointmentItem,
  AppointmentSlot,
  AppointmentSlotsResult,
} from '@/types/appointment';
import { buildAppointmentFaceScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';

type Props = {
  /** 查件成功后的手机号，预填 */
  defaultPhone?: string | null;
  /** 引导去绑定微信通知（查件页顶部） */
  onBindClick?: () => void;
};

/**
 * 轻量预约到店：选日期 → 选时段 → 留手机号
 */
const PickupAppointmentCard: React.FC<Props> = ({ defaultPhone, onBindClick }) => {
  const [open, setOpen] = useState(false);
  const [slotsData, setSlotsData] = useState<AppointmentSlotsResult | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [phone, setPhone] = useState(defaultPhone || '');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [dayIdx, setDayIdx] = useState(0);
  const [selected, setSelected] = useState<AppointmentSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<AppointmentItem | null>(null);
  const [mine, setMine] = useState<AppointmentItem[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineQueried, setMineQueried] = useState(false);

  useEffect(() => {
    if (defaultPhone && /^1\d{10}$/.test(defaultPhone)) {
      setPhone(defaultPhone);
    }
  }, [defaultPhone]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    setError(null);
    try {
      const data = await kioskService.getAppointmentSlots();
      setSlotsData(data);
      // 默认选第一个有可用时段的日期
      const idx = data.days.findIndex((d) => d.slots.some((s) => s.available));
      setDayIdx(idx >= 0 ? idx : 0);
      setSelected(null);
    } catch (e: any) {
      setError(e?.message || '加载可约时段失败');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (open && !slotsData && !loadingSlots) {
      void loadSlots();
    }
  }, [open, slotsData, loadingSlots, loadSlots]);

  const day: AppointmentDay | undefined = slotsData?.days[dayIdx];

  const loadMine = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setError('请先填写 11 位手机号，再查我的预约');
      return;
    }
    setMineLoading(true);
    setError(null);
    setMineQueried(true);
    try {
      const res = await kioskService.myAppointments(phone);
      setMine(res.items || []);
    } catch (e: any) {
      setError(e?.message || '查询预约失败');
      setMine([]);
    } finally {
      setMineLoading(false);
    }
  };


  // 展开且已有手机号时，自动拉一次「我的预约」
  useEffect(() => {
    if (!open) return;
    if (!/^1\d{10}$/.test(phone)) return;
    void loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在展开/手机号齐时自动查
  }, [open, phone]);

  const submit = async () => {
    if (!day || !selected) {
      setError('请选择日期和时段');
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      setError('请填写正确的 11 位手机号');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const item = await kioskService.createAppointment({
        phone,
        recipientName: name.trim() || undefined,
        slotDate: day.date,
        slotStart: selected.start,
        slotEnd: selected.end,
        note: note.trim() || undefined,
      });
      setSuccess(item);
      setSelected(null);
      setOpen(true);
      await loadSlots();
      void loadMine();
    } catch (e: any) {
      setError(e?.message || '预约失败');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    if (!/^1\d{10}$/.test(phone)) return;
    if (!window.confirm('确定取消这条预约吗？')) return;
    try {
      await kioskService.cancelAppointment(id, phone);
      void loadMine();
      void loadSlots();
    } catch (e: any) {
      setError(e?.message || '取消失败');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-gray-900">预约到店取件</div>
          <div className="text-xs text-gray-500">选个空闲时段再来，少排队、不跑空</div>
        </div>
        <span className="text-xs text-primary">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
              <p className="font-semibold">
                预约成功：{success.slotDate} {success.slotLabel}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                {success.notifyHint ||
                  '请按预约时段到店；取件码仍以查件结果 / 货架标签为准。'}
              </p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-emerald-800/90">
                <li>到店报手机号或取件码即可</li>
                <li>群里不会公开你的取件码</li>
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                {onBindClick && (
                  <button
                    type="button"
                    onClick={onBindClick}
                    className="min-h-[40px] rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primaryHover"
                  >
                    {(success.notifyHint || '').includes('未绑定') ||
                    (success.notifyHint || '').includes('绑定')
                      ? '去绑定微信收提醒'
                      : '管理微信提醒'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const ok = await copyText(
                        buildAppointmentFaceScript({
                          slotDate: success.slotDate,
                          slotLabel: success.slotLabel,
                          recipientName: success.recipientName,
                        }),
                      );
                      // 查件页无 toast 全局时用 alert 太重；静默失败即可，成功靠按钮文案
                      if (!ok) {
                        // keep silent on kiosk; clipboard may be restricted
                      }
                    })();
                  }}
                  className="min-h-[40px] rounded-md border border-emerald-200 bg-white px-3 text-xs text-emerald-900 hover:bg-emerald-100/50"
                >
                  复制预约信息
                </button>
                <button
                  type="button"
                  onClick={() => setSuccess(null)}
                  className="min-h-[40px] rounded-md border border-emerald-200 bg-white px-3 text-xs text-emerald-900 hover:bg-emerald-100/50"
                >
                  继续预约
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              手机号 <span className="text-danger">*</span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="收件手机号"
              />
            </label>
            <label className="block text-xs text-gray-600">
              称呼（选填）
              <input
                type="text"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="方便店员称呼"
              />
            </label>
          </div>

          {loadingSlots && <p className="text-xs text-gray-500">正在加载可约时段…</p>}

          {slotsData && (
            <>
              <div className="flex flex-wrap gap-2">
                {slotsData.days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setDayIdx(i);
                      setSelected(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ${
                      dayIdx === i
                        ? 'bg-primary text-white ring-primary'
                        : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {d.isToday ? '今天' : d.weekday} {d.date.slice(5)}
                  </button>
                ))}
              </div>

              {day && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {day.slots.map((s) => {
                    const active =
                      selected?.start === s.start && selected?.end === s.end;
                    return (
                      <button
                        key={`${s.start}-${s.end}`}
                        type="button"
                        disabled={!s.available}
                        onClick={() => setSelected(s)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'border-primary bg-orange-50 text-primary'
                            : s.available
                              ? 'border-gray-200 bg-white text-gray-800 hover:border-primary/40'
                              : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                        }`}
                      >
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs opacity-80">
                          {s.available
                            ? `还可约 ${s.remaining} 人`
                            : s.reason || '不可约'}
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
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="例如：大件、需要帮助"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {submitting ? '提交中…' : '确认预约'}
            </button>
            <button
              type="button"
              disabled={mineLoading}
              onClick={() => void loadMine()}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {mineLoading ? '查询中…' : '查我的预约'}
            </button>
          </div>

          {mineQueried && !mineLoading && mine.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              这个手机号暂无有效预约。可在上方选时段提交，或换个手机号再查。
            </div>
          )}

          {mine.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-gray-600">我的预约（{mine.length}）</div>
                <button
                  type="button"
                  disabled={mineLoading}
                  onClick={() => void loadMine()}
                  className="text-[11px] text-primary hover:underline disabled:opacity-60"
                >
                  刷新
                </button>
              </div>
              {mine.map((m) => {
                const tone =
                  m.status === 'confirmed'
                    ? 'bg-blue-50 text-blue-700'
                    : m.status === 'pending'
                      ? 'bg-amber-50 text-amber-700'
                      : m.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : m.status === 'cancelled' || m.status === 'no_show'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-gray-50 text-gray-600';
                const tip =
                  m.status === 'pending'
                    ? '待店员确认，请留意微信或到店报手机号'
                    : m.status === 'confirmed'
                      ? '已确认，请按时到店取件'
                      : m.status === 'completed'
                        ? '已完成取件'
                        : m.status === 'cancelled'
                          ? '已取消'
                          : m.status === 'no_show'
                            ? '未到店'
                            : m.statusLabel;
                return (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800">
                        {m.slotDate} {m.slotLabel}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                          {m.statusLabel}
                        </span>
                        <span className="text-[11px] text-gray-500">{tip}</span>
                      </div>
                    </div>
                    {['pending', 'confirmed'].includes(m.status) && (
                      <button
                        type="button"
                        onClick={() => void cancel(m.id)}
                        className="shrink-0 text-xs text-gray-500 underline hover:text-danger"
                      >
                        取消预约
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-gray-400">
            预约只表示「大概什么时候来」，取件码仍以查件结果 / 货架标签为准，不会群发隐私信息。
          </p>
        </div>
      )}
    </div>
  );
};

export default PickupAppointmentCard;
