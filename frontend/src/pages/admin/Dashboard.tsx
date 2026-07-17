import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as statsService from '@/services/stats';
import type { DashboardData, DashboardHourly } from '@/types/stats';

// 工作台 Dashboard：概览卡片 + 小时趋势 + 待办
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    statsService
      .fetchDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  }
  if (error) {
    return <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>;
  }
  if (!data) return null;

  const { today, yesterday, hourly, todo } = data;

  const cards = [
    {
      label: '今日入库',
      value: today.inbound,
      yesterday: yesterday.inbound,
      color: 'text-info',
      bg: 'bg-info/10',
    },
    {
      label: '今日出库',
      value: today.outbound,
      yesterday: yesterday.outbound,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    { label: '当前在库', value: today.inStock, color: 'text-primary', bg: 'bg-primaryLight' },
    { label: '当前滞留', value: today.overdue, color: 'text-warning', bg: 'bg-warning/10' },
    { label: '当前异常', value: today.exception, color: 'text-danger', bg: 'bg-danger/10' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">工作台</h1>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-lg ${c.bg} p-4`}>
            <div className="text-xs text-gray-600">{c.label}</div>
            <div className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</div>
            {typeof c.yesterday === 'number' && (
              <div className="mt-1 text-xs text-gray-500">
                昨日 {c.yesterday}
                {c.yesterday === 0 && c.value > 0 ? (
                  <span className="ml-1 text-success">↑ 新增</span>
                ) : c.yesterday > 0 ? (
                  <span
                    className={
                      c.value >= c.yesterday ? 'ml-1 text-success' : 'ml-1 text-danger'
                    }
                  >
                    {c.value >= c.yesterday ? '↑' : '↓'}
                    {Math.abs(
                      Math.round(((c.value - c.yesterday) / c.yesterday) * 100),
                    )}
                    %
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 今日小时趋势 + 待办 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-gray-700">今日入库/出库趋势</h2>
          <TrendChart hourly={hourly} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">待办提醒</h2>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/admin/inventory?status=overdue')}
              className="flex w-full items-center justify-between rounded-md bg-warning/5 px-3 py-3 text-left hover:bg-warning/10"
            >
              <span className="text-sm text-gray-600">超期待提醒</span>
              <span className="text-lg font-bold text-warning">{todo.overdueWarn}</span>
            </button>
            <button
              onClick={() => navigate('/admin/inventory?status=exception')}
              className="flex w-full items-center justify-between rounded-md bg-danger/5 px-3 py-3 text-left hover:bg-danger/10"
            >
              <span className="text-sm text-gray-600">异常件未处理</span>
              <span className="text-lg font-bold text-danger">
                {todo.exceptionUnresolved}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ 趋势图（纯 SVG 双折线） ============
const TrendChart: React.FC<{ hourly: DashboardHourly[] }> = ({ hourly }) => {
  const W = 600;
  const H = 200;
  const PAD_L = 30;
  const PAD_R = 10;
  const PAD_T = 10;
  const PAD_B = 24;

  const maxVal = useMemo(() => {
    const m = Math.max(1, ...hourly.map((h) => Math.max(h.inbound, h.outbound)));
    return m;
  }, [hourly]);

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xStep = innerW / Math.max(1, hourly.length - 1);
  const yScale = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
  const xScale = (i: number) => PAD_L + i * xStep;

  const buildPath = (key: 'inbound' | 'outbound') =>
    hourly.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(h[key])}`).join(' ');

  // y 轴刻度
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 400 }}>
        {/* y 轴刻度线 */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={yScale(t)}
              x2={W - PAD_R}
              y2={yScale(t)}
              stroke="#f0f0f0"
              strokeWidth={1}
            />
            <text x={PAD_L - 5} y={yScale(t) + 3} textAnchor="end" fontSize="10" fill="#999">
              {t}
            </text>
          </g>
        ))}
        {/* x 轴刻度 */}
        {hourly.map((h, i) =>
          h.hour % 2 === 0 ? (
            <text
              key={i}
              x={xScale(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#999"
            >
              {h.hour}
            </text>
          ) : null,
        )}
        {/* 入库折线 */}
        <path d={buildPath('inbound')} fill="none" stroke="#3B82F6" strokeWidth={2} />
        {/* 出库折线 */}
        <path d={buildPath('outbound')} fill="none" stroke="#10B981" strokeWidth={2} />
      </svg>
      <div className="mt-2 flex items-center justify-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 bg-info" />入库
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 bg-success" />出库
        </span>
        <span className="text-gray-400">单位：件（8:00-22:00）</span>
      </div>
    </div>
  );
};

export default Dashboard;
