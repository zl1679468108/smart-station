import React, { useCallback, useEffect, useState } from 'react';
import * as kioskService from '@/services/kiosk';
import type {
  AppointmentDay,
  AppointmentItem,
  AppointmentSlot,
  AppointmentSlotsResult,
} from '@/types/appointment';

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
    try {
      const res = await kioskService.myAppointments(phone);
      setMine(res.items || []);
    } catch (e: any) {
      setError(e?.message || '查询预约失败');
    } finally {
      setMineLoading(false);
    }
  };

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
              {(success.notifyHint || '').includes('未绑定') ||
              (success.notifyHint || '').includes('绑定微信') ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {onBindClick && (
                    <button
                      type="button"
                      onClick={onBindClick}
                      className="min-h-[40px] rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primaryHover"
                    >
                      去绑定微信收提醒
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSuccess(null)}
                    className="min-h-[40px] rounded-md border border-emerald-200 bg-white px-3 text-xs text-emerald-900 hover:bg-emerald-100/50"
                  >
                    继续预约
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSuccess(null)}
                  className="mt-2 text-[11px] text-emerald-800 underline"
                >
                  再约一个时段
                </button>
              )}
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

          {mine.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600">我的预约</div>
              {mine.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-800">
                      {m.slotDate} {m.slotLabel}
                    </div>
                    <div className="text-xs text-gray-500">{m.statusLabel}</div>
                  </div>
                  {['pending', 'confirmed'].includes(m.status) && (
                    <button
                      type="button"
                      onClick={() => void cancel(m.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      取消
                    </button>
                  )}
                </div>
              ))}
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
