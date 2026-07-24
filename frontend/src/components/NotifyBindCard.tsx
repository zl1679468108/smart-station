import React, { useEffect, useRef, useState } from 'react';
import * as kioskService from '@/services/kiosk';
import type { NotifyGuide, WxPusherBindStartResult } from '@/types/kiosk';

/**
 * 取件通知公示 + WxPusher 扫码绑定
 * - 企微群：仅公告（不含取件码）
 * - WxPusher：扫码关注后一对一收完整取件码
 */
const NotifyBindCard: React.FC<{
  /** 可从 layout 缓存传入，缺省则自行拉取 */
  guide?: NotifyGuide | null;
  stationName?: string | null;
  compact?: boolean;
}> = ({ guide: guideProp, stationName, compact = false }) => {
  const [guide, setGuide] = useState<NotifyGuide | null>(guideProp ?? null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [session, setSession] = useState<WxPusherBindStartResult | null>(null);
  const [pollHint, setPollHint] = useState<string>('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (guideProp) {
      setGuide(guideProp);
      return;
    }
    let cancelled = false;
    kioskService
      .getNotifyGuide()
      .then((res) => {
        if (!cancelled) setGuide(res.guide);
      })
      .catch(() => {
        /* 引导失败不阻塞查件 */
      });
    return () => {
      cancelled = true;
    };
  }, [guideProp]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const clearPoll = () => {
    stopped.current = true;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  useEffect(() => () => clearPoll(), []);

  if (!guide) return null;

  const handleSendCode = async () => {
    if (sending || countdown > 0) return;
    setMsg(null);
    if (!/^1\d{10}$/.test(phone)) {
      setMsg({ type: 'err', text: '请输入正确的 11 位手机号' });
      return;
    }
    setSending(true);
    try {
      const res = await kioskService.sendCode(phone);
      if (res.devCode) {
        setCode(res.devCode);
        setMsg({ type: 'ok', text: `验证码已发送（开发态：${res.devCode}）` });
      } else {
        setMsg({ type: 'ok', text: '验证码已发送，5 分钟内有效' });
      }
      setCountdown(60);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '验证码发送失败' });
    } finally {
      setSending(false);
    }
  };

  const schedulePoll = (qrCode: string, intervalSec: number) => {
    clearPoll();
    stopped.current = false;
    const tick = async () => {
      if (stopped.current) return;
      try {
        const res = await kioskService.pollWxPusherBind({ qrCode });
        if (res.status === 'done') {
          setMsg({ type: 'ok', text: res.message || '绑定成功' });
          setPollHint('');
          setSession(null);
          setCode('');
          clearPoll();
          return;
        }
        if (res.status === 'expired') {
          setMsg({ type: 'err', text: res.message || '二维码已过期' });
          setPollHint('');
          setSession(null);
          clearPoll();
          return;
        }
        setPollHint(res.message || '等待扫码关注…');
        const next = Math.max(res.pollIntervalSec || intervalSec || 12, 10);
        pollTimer.current = setTimeout(tick, next * 1000);
      } catch (err) {
        setPollHint(err instanceof Error ? err.message : '轮询失败，稍后重试');
        pollTimer.current = setTimeout(tick, Math.max(intervalSec, 12) * 1000);
      }
    };
    // 首次稍等再查，给用户扫码时间
    pollTimer.current = setTimeout(tick, Math.max(intervalSec, 12) * 1000);
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (starting) return;
    setMsg(null);
    if (!/^1\d{10}$/.test(phone)) {
      setMsg({ type: 'err', text: '请输入正确的 11 位手机号' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMsg({ type: 'err', text: '请输入 6 位验证码' });
      return;
    }
    setStarting(true);
    clearPoll();
    setSession(null);
    try {
      const res = await kioskService.startWxPusherBind({ phone, code });
      setSession(res);
      setPollHint('请用微信扫码关注，关注成功后自动绑定');
      setMsg({ type: 'ok', text: res.message });
      schedulePoll(res.qrCode, res.pollIntervalSec || 12);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '生成二维码失败' });
    } finally {
      setStarting(false);
    }
  };

  const bindGuide =
    guide.wxpusherGuide ||
    '1. 输入收件手机号并获取验证码\n2. 生成关注二维码\n3. 微信扫码关注后自动绑定';

  return (
    <section
      className={`rounded-lg border border-orange-100 bg-orange-50/60 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800">
            {guide.title}
            {stationName ? ` · ${stationName}` : ''}
          </h3>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-600">
            {guide.content}
          </p>
        </div>
        {guide.bindEnabled && (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (open) {
                clearPoll();
              }
            }}
            className="min-h-[44px] shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primaryHover"
          >
            {open ? '收起' : '绑定通知'}
          </button>
        )}
      </div>

      {/* 企微群公示 + 个人绑定说明 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-white/80 bg-white/80 p-3">
          <p className="text-xs font-medium text-gray-700">企业微信公告群</p>
          <p className="mt-1 text-xs text-gray-500">{guide.wecomJoinTip}</p>
          {guide.wecomQrUrl ? (
            <img
              src={guide.wecomQrUrl}
              alt="企业微信群二维码"
              className="mt-2 h-28 w-28 rounded border border-gray-100 object-contain"
            />
          ) : (
            <p className="mt-2 text-xs text-amber-700">
              管理员尚未上传入群二维码。请到「系统管理 → 驿站信息」配置公示。
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            群消息仅含手机尾号公告，
            <strong className="font-medium text-gray-500">不含取件码</strong>。
          </p>
        </div>

        <div className="rounded-md border border-white/80 bg-white/80 p-3">
          <p className="text-xs font-medium text-gray-700">个人微信私信（推荐 · WxPusher）</p>
          <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{bindGuide}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            扫码关注后，到件/滞留提醒含取件码，仅你微信可见。
          </p>
        </div>
      </div>

      {open && guide.bindEnabled && (
        <form
          onSubmit={handleStart}
          className="mt-3 space-y-3 rounded-md border border-primary/20 bg-white p-3"
        >
          <p className="text-xs text-gray-500">
            使用收件手机号验证后生成关注二维码，微信扫码即可绑定到件通知。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="11 位手机号"
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                className="min-h-[44px] min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sending || countdown > 0 || phone.length !== 11}
                className="min-h-[44px] shrink-0 rounded-md bg-primaryLight px-3 text-xs text-primary disabled:opacity-50"
              >
                {countdown > 0 ? `${countdown}s` : sending ? '发送中' : '验证码'}
              </button>
            </div>
          </div>

          {session && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-primary/30 bg-orange-50/40 p-3">
              <img
                src={session.qrUrl}
                alt="WxPusher 关注二维码"
                className="h-40 w-40 rounded border border-gray-100 bg-white object-contain"
              />
              <p className="text-center text-xs text-gray-600">
                请用微信扫码关注
                {session.phoneMasked ? `（${session.phoneMasked}）` : ''}
              </p>
              {pollHint && <p className="text-center text-xs text-primary">{pollHint}</p>}
              <p className="text-center text-[11px] text-gray-400">
                二维码约 30 分钟有效 · 自动检测扫码状态
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {msg && (
              <p className={`text-xs ${msg.type === 'ok' ? 'text-success' : 'text-danger'}`}>
                {msg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={starting}
              className="ml-auto min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {starting ? '生成中...' : session ? '重新生成二维码' : '生成关注二维码'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default NotifyBindCard;
