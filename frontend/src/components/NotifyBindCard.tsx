import React, { useEffect, useRef, useState } from 'react';
import * as kioskService from '@/services/kiosk';
import type { NotifyGuide, WxPusherBindStartResult } from '@/types/kiosk';

type BindChannelTab = 'wxpusher' | 'pushplus';

/**
 * 取件通知公示 + 客户绑定
 * - 企微群：仅公告（不含取件码）
 * - 主路径：微信扫一扫
 * - 备选：专属绑定码
 */
const NotifyBindCard: React.FC<{
  guide?: NotifyGuide | null;
  stationName?: string | null;
  compact?: boolean;
  /** 预填手机号（查件成功后引导） */
  initialPhone?: string;
  /** 外部强制展开绑定区 */
  forceOpen?: boolean;
  /** 默认通道 */
  defaultChannel?: BindChannelTab;
  onBound?: (channel: string) => void;
}> = ({
  guide: guideProp,
  stationName,
  compact = false,
  initialPhone,
  forceOpen,
  defaultChannel = 'wxpusher',
  onBound,
}) => {
  const [guide, setGuide] = useState<NotifyGuide | null>(guideProp ?? null);
  const [open, setOpen] = useState(Boolean(forceOpen));
  const [channel, setChannel] = useState<BindChannelTab>(defaultChannel);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [phone, setPhone] = useState(initialPhone || '');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [binding, setBinding] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [session, setSession] = useState<WxPusherBindStartResult | null>(null);
  const [pollHint, setPollHint] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const panelRef = useRef<HTMLFormElement | null>(null);

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
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [guideProp]);

  useEffect(() => {
    if (initialPhone) setPhone(initialPhone);
  }, [initialPhone]);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      // 滚动到绑定区
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }, [forceOpen]);

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
          if (res.catchupPushed && res.catchupPushed > 0) {
            setPollHint(`已为你补发 ${res.catchupPushed} 件在库取件码，请打开微信查看`);
          } else if (res.catchupInStock && res.catchupInStock > 0) {
            setPollHint('有在库包裹，请到店凭取件码取件或再查一次');
          } else {
            setPollHint('');
          }
          setSession(null);
          setCode('');
          clearPoll();
          onBound?.(res.channel || 'wxpusher');
          return;
        }
        if (res.status === 'expired') {
          setMsg({ type: 'err', text: res.message || '二维码已过期' });
          setPollHint('');
          setSession(null);
          clearPoll();
          return;
        }
        setPollHint(res.message || '请用微信扫一扫，完成后会自动绑定…');
        const next = Math.max(res.pollIntervalSec || intervalSec || 12, 10);
        pollTimer.current = setTimeout(tick, next * 1000);
      } catch (err) {
        setPollHint(err instanceof Error ? err.message : '轮询失败，稍后重试');
        pollTimer.current = setTimeout(tick, Math.max(intervalSec, 12) * 1000);
      }
    };
    pollTimer.current = setTimeout(tick, Math.max(intervalSec, 12) * 1000);
  };

  const handleStartWx = async (e: React.FormEvent) => {
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
      setPollHint('请用微信扫一扫，完成后会自动绑定');
      setMsg({ type: 'ok', text: res.message });
      schedulePoll(res.qrCode, res.pollIntervalSec || 12);
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '生成二维码失败' });
    } finally {
      setStarting(false);
    }
  };

  const handleBindPushPlus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (binding) return;
    setMsg(null);
    if (!/^1\d{10}$/.test(phone)) {
      setMsg({ type: 'err', text: '请输入正确的 11 位手机号' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMsg({ type: 'err', text: '请输入 6 位验证码' });
      return;
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token.trim())) {
      setMsg({ type: 'err', text: '专属绑定码格式不正确，请重新复制粘贴' });
      return;
    }
    setBinding(true);
    try {
      const res = await kioskService.bindPushPlus({
        phone,
        code,
        token: token.trim(),
      });
      setMsg({ type: 'ok', text: res.message });
      if (res.catchupPushed && res.catchupPushed > 0) {
        setPollHint(`已为你补发 ${res.catchupPushed} 件在库取件码，请打开微信查看`);
      } else {
        setPollHint('');
      }
      setToken('');
      setCode('');
      onBound?.(res.channel || 'pushplus');
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '绑定失败' });
    } finally {
      setBinding(false);
    }
  };

  const wxGuide =
    guide.wxpusherGuide ||
    '1. 填收件手机号，点「验证码」\n2. 点「生成二维码」\n3. 微信扫一扫完成\n4. 以后有件，微信直接收码';
  const ppGuide =
    guide.pushplusGuide ||
    '适合已有其他推送工具的用户。\n1. 在对应网页用微信登录\n2. 复制你的「专属绑定码」\n3. 回到这里填写手机号和验证码，粘贴绑定码即可';

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
              if (open) clearPoll();
            }}
            className="min-h-[44px] shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primaryHover"
          >
            {open ? '收起' : '扫一扫收码'}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-white/80 bg-white/80 p-3">
          <p className="text-xs font-medium text-gray-700">驿站通知群</p>
          <p className="mt-1 text-xs text-gray-500">
            {guide.wecomJoinTip || '扫码加入通知群，只发到件提醒，不公开取件码'}
          </p>
          {guide.wecomQrUrl ? (
            <img
              src={guide.wecomQrUrl}
              alt="驿站通知群二维码"
              className="mt-2 h-28 w-28 rounded border border-gray-100 object-contain"
            />
          ) : (
            <p className="mt-2 text-xs text-amber-700">入群二维码暂未上传，可联系店员。</p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            群里只会看到手机尾号提醒，
            <strong className="font-medium text-gray-500">不会公开你的取件码</strong>。
          </p>
        </div>

        <div className="rounded-md border border-white/80 bg-white/80 p-3">
          <p className="text-xs font-medium text-gray-700">微信自动收码（推荐）</p>
          <p className="mt-1 text-xs text-gray-500">
            绑定后，包裹到了会直接发到你的微信（只有你能看到取件码）。
            没绑定就到店查件或看货架。
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-gray-500">
            <li>· 点「扫一扫收码」→ 填手机号 → 微信扫一扫</li>
            <li>· 下次有件不用反复查，微信直接告诉你</li>
          </ul>
        </div>
      </div>

      {open && guide.bindEnabled && (
        <form
          ref={panelRef}
          onSubmit={channel === 'wxpusher' ? handleStartWx : handleBindPushPlus}
          className="mt-3 space-y-3 rounded-md border border-primary/20 bg-white p-3"
        >
          {/* 主路径：只讲微信扫一扫 */}
          {channel === 'wxpusher' && (
            <p className="whitespace-pre-line text-xs text-gray-500">{wxGuide}</p>
          )}

          {/* 次要入口：默认隐藏专业通道 */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !showAdvanced;
                setShowAdvanced(next);
                setMsg(null);
                if (!next) {
                  setChannel('wxpusher');
                  setToken('');
                } else {
                  setChannel('pushplus');
                  clearPoll();
                  setSession(null);
                }
              }}
              className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-600"
            >
              {showAdvanced ? '返回微信扫一扫' : '其他绑定方式（可选）'}
            </button>
          </div>

          {channel === 'pushplus' && showAdvanced && (
            <>
              <p className="whitespace-pre-line text-xs text-gray-500">{ppGuide}</p>
              {guide.pushplusGuideUrl && (
                <a
                  href={guide.pushplusGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[36px] items-center text-xs text-primary underline"
                >
                  打开网页获取专属绑定码
                </a>
              )}
            </>
          )}

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

          {channel === 'pushplus' && (
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value.trim())}
              placeholder="粘贴你的专属绑定码"
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-primary"
              autoComplete="off"
            />
          )}

          {channel === 'wxpusher' && session && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-primary/30 bg-orange-50/40 p-3">
              <img
                src={session.qrUrl}
                alt="微信绑定二维码"
                className="h-40 w-40 rounded border border-gray-100 bg-white object-contain"
              />
              <p className="text-center text-xs text-gray-600">
                请用微信扫一扫
                {session.phoneMasked ? `（${session.phoneMasked}）` : ''}
              </p>
              {pollHint && <p className="text-center text-xs text-primary">{pollHint}</p>}
              <p className="text-center text-[11px] text-gray-400">
                二维码约 30 分钟有效，扫完会自动完成绑定
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
              disabled={channel === 'wxpusher' ? starting : binding}
              className="ml-auto min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {channel === 'wxpusher'
                ? starting
                  ? '生成中...'
                  : session
                    ? '重新生成二维码'
                    : '生成二维码'
                : binding
                  ? '绑定中...'
                  : '确认绑定'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default NotifyBindCard;
