import React, { useCallback, useEffect, useState } from 'react';
import * as adminService from '@/services/admin';
import type { NotifyBindingItem, NotifyLogItem } from '@/types/admin';
import { formatBeijingTimestamp } from '@/utils/date';
import EmptyState from '@/components/ui/EmptyState';

/**
 * 通知可观测：客户绑定 + 最近发送记录
 * 仅展示脱敏信息，便于试验期排查「谁绑了、发没发出去」
 */
const NotifyTab: React.FC = () => {
  const [bindings, setBindings] = useState<NotifyBindingItem[]>([]);
  const [logs, setLogs] = useState<NotifyLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sub, setSub] = useState<'bindings' | 'logs'>('bindings');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [b, l] = await Promise.all([
        adminService.listNotifyBindings(80),
        adminService.listNotifyLogs(80),
      ]);
      setBindings(b.items || []);
      setLogs(l.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          查看客户是否已绑定微信通知，以及到件/提醒是否发送成功。敏感内容已脱敏。
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-[40px] rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 hover:bg-gray-50"
        >
          刷新
        </button>
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(
          [
            { key: 'bindings' as const, label: `客户绑定（${bindings.length}）` },
            { key: 'logs' as const, label: `发送记录（${logs.length}）` },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            className={`min-h-[40px] flex-1 rounded-md text-xs font-medium ${
              sub === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'bindings' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {bindings.length === 0 ? (
            <EmptyState title="暂无客户绑定" description="客户在查件页绑定后会出现在这里" />
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">手机号</th>
                  <th className="px-3 py-2 font-medium">方式</th>
                  <th className="px-3 py-2 font-medium">目标（脱敏）</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono text-xs text-gray-800">{b.phoneMasked}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{b.channelLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{b.targetMasked}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          b.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.status === 'active' ? '有效' : b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {formatBeijingTimestamp(b.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sub === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <EmptyState title="暂无发送记录" description="入库/滞留/验证码通知会写到这里" />
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-lg border bg-white p-3 ${
                  log.status === 'failed'
                    ? 'border-red-100'
                    : log.status === 'sent'
                      ? 'border-gray-200'
                      : 'border-amber-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-800">{log.templateLabel}</span>
                    <span className="font-mono text-xs text-gray-500">{log.phoneMasked}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        log.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {log.status === 'sent' ? '已发送' : log.status === 'failed' ? '失败' : log.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {formatBeijingTimestamp(log.createdAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{log.content}</p>
                {log.channelSummary && (
                  <p className="mt-1 text-[11px] text-gray-400">通道：{log.channelSummary}</p>
                )}
                {log.errorMessage && (
                  <p className="mt-1 text-[11px] text-red-600">错误：{log.errorMessage}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotifyTab;
