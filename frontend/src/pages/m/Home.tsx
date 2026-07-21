import React, { useState, useEffect, useRef } from 'react';
import * as kioskService from '@/services/kiosk';
import type { KioskParcelItem, KioskQueryResult } from '@/types/kiosk';
import EmptyState from '@/components/ui/EmptyState';

// H5 远端查件：手机号 + 验证码 → 在库包裹列表（仅查看，不可出库）
const Home: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [result, setResult] = useState<KioskParcelItem[] | null>(null);
  const [queriedPhoneTail, setQueriedPhoneTail] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleSendCode = async () => {
    if (sendingCode || countdown > 0) return;
    setError('');
    setInfo('');
    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    setSendingCode(true);
    try {
      await kioskService.sendCode(phone);
      setInfo('验证码已发送，5 分钟内有效');
      setCountdown(60);
      codeRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setInfo('');
    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位验证码');
      return;
    }
    setSubmitting(true);
    try {
      const tail = phone.slice(-4);
      const res: KioskQueryResult = await kioskService.queryByPhone(tail, code);
      setResult(res.items || []);
      setQueriedPhoneTail(tail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setCode('');
    setError('');
    setInfo('');
    setQueriedPhoneTail('');
  };

  // ===== 查询结果列表 =====
  if (result !== null) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">
            查询结果（尾号 {queriedPhoneTail}）
          </h2>
          <button
            onClick={handleReset}
            className="text-sm text-primary hover:underline"
          >
            重新查询
          </button>
        </div>

        {result.length === 0 ? (
          <div className="rounded-lg bg-white">
            <EmptyState
              title="未查询到您的在库包裹"
              description="可能已出库或尚未到达"
              className="py-10"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {result.map((item) => (
              <div key={item.id} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">取件码</span>
                    <span className="font-mono text-lg font-bold text-primary">
                      {item.pickupCode || '-'}
                    </span>
                  </div>
                  <span className="rounded bg-info/10 px-2 py-0.5 text-xs text-info">在库</span>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span className="text-gray-400">运单号</span>
                    <span className="font-medium text-gray-800">{item.trackingNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">快递公司</span>
                    <span>{item.courierName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">驿站</span>
                    <span>{item.stationName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">入库时间</span>
                    <span>{new Date(item.inboundAt).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
              </div>
            ))}
            <p className="px-2 py-3 text-center text-xs text-gray-400">
              请凭取件码到对应驿站货架取件，再到扫描机自助出库
            </p>
          </div>
        )}
      </div>
    );
  }

  // ===== 查询表单 =====
  return (
    <div>
      <h1 className="mb-2 text-xl font-bold text-gray-800">取件查询</h1>
      <p className="mb-6 text-sm text-gray-500">输入手机号查询您的在库包裹</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">手机号</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="11 位手机号"
            className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary"
            disabled={submitting}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">验证码</label>
          <div className="flex gap-2">
            <input
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位验证码"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm tracking-widest outline-none focus:border-primary"
              disabled={submitting}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || countdown > 0 || phone.length !== 11}
              className="min-w-[100px] rounded-md bg-primaryLight px-3 py-2.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中' : '获取验证码'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        {info && (
          <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{info}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
        >
          {submitting ? '查询中...' : '查询包裹'}
        </button>
      </form>
    </div>
  );
};

export default Home;
