import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  TrendResult,
  TrendGranularity,
  FunnelResult,
  RetentionResult,
  PeakHoursResult,
} from '@/types/stats-report';
import {
  useStatsTrend,
  useStatsFunnel,
  useStatsRetention,
  useStatsPeakHours,
} from '@/hooks/useStatsReport';
import PageHeader from '@/components/ui/PageHeader';

const GRANULARITY_TABS: { key: TrendGranularity; label: string; span: number }[] = [
  { key: 'day', label: '日', span: 14 },
  { key: 'week', label: '周', span: 12 },
  { key: 'month', label: '月', span: 12 },
];

const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
];

const StatsPage: React.FC = () => {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [days, setDays] = useState(30);

  const span = GRANULARITY_TABS.find((t) => t.key === granularity)?.span || 14;
  const trendQuery = useStatsTrend(granularity, span);
  const funnelQuery = useStatsFunnel(days);
  const retentionQuery = useStatsRetention(days);
  const peakQuery = useStatsPeakHours(days);

  const trend = trendQuery.data ?? null;
  const funnel = funnelQuery.data ?? null;
  const retention = retentionQuery.data ?? null;
  const peak = peakQuery.data ?? null;
  const rangeLoading =
    funnelQuery.isPending || retentionQuery.isPending || peakQuery.isPending;

  return (
    <div className="w-full space-y-4">
      <PageHeader title="数据统计" description="业务量趋势、转化漏斗、滞留率与取件高峰" />

      {/* 业务量趋势 */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-gray-700">业务量趋势</h2>
          <div className="flex gap-1">
            {GRANULARITY_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setGranularity(t.key)}
                className={`rounded-lg px-3 py-1 text-sm ${
                  granularity === t.key
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {trend && trend.points.length > 0 ? (
          <TrendChart points={trend.points} />
        ) : (
          <div className="py-12 text-center text-sm text-gray-400">暂无趋势数据</div>
        )}
      </section>

      {/* 时间窗口切换 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">统计窗口</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 转化漏斗 */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-gray-700">转化漏斗</h2>
          {funnel ? <FunnelChart funnel={funnel} /> : <ChartEmpty loading={rangeLoading} />}
        </section>

        {/* 滞留率 */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">滞留率</h2>
            {retention && (
              <span className="text-sm text-gray-500">
                总体 <span className="font-semibold text-danger">{retention.rate}%</span>
                （{retention.overdue}/{retention.total}）
              </span>
            )}
          </div>
          {retention ? <RetentionChart retention={retention} /> : <ChartEmpty loading={rangeLoading} />}
        </section>
      </div>

      {/* 取件高峰 */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">取件高峰（按小时）</h2>
          {peak && peak.peakHour != null && (
            <span className="text-sm text-gray-500">
              高峰时段 <span className="font-semibold text-primary">{peak.peakHour}:00</span>
            </span>
          )}
        </div>
        {peak ? <PeakChart peak={peak} /> : <ChartEmpty loading={rangeLoading} />}
      </section>
    </div>
  );
};

const ChartEmpty: React.FC<{ loading: boolean }> = ({ loading }) => (
  <div className="py-12 text-center text-sm text-gray-400">{loading ? '加载中…' : '暂无数据'}</div>
);

// ============ 趋势图（纯 SVG 双折线） ============
const TrendChart: React.FC<{ points: TrendResult['points'] }> = ({ points }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const H = 220;
  const PAD_L = 32;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 40;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setW(Math.max(480, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxVal = useMemo(
    () => Math.max(1, ...points.map((p) => Math.max(p.inbound, p.outbound))),
    [points],
  );
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xStep = innerW / Math.max(1, points.length - 1);
  const yScale = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
  const xScale = (i: number) => PAD_L + i * xStep;
  const buildPath = (key: 'inbound' | 'outbound') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p[key])}`).join(' ');
  const yTicks = [0, Math.ceil(maxVal / 2), maxVal];
  const labelStep = Math.ceil(points.length / 8);

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={yScale(t)} x2={W - PAD_R} y2={yScale(t)} stroke="#f0f0f0" strokeWidth={1} />
            <text x={PAD_L - 5} y={yScale(t) + 3} textAnchor="end" fontSize="10" fill="#999">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={xScale(i)} y={H - 20} textAnchor="middle" fontSize="9" fill="#999">
              {p.label.slice(5)}
            </text>
          ) : null,
        )}
        <path d={buildPath('inbound')} fill="none" stroke="#3B82F6" strokeWidth={2} />
        <path d={buildPath('outbound')} fill="none" stroke="#10B981" strokeWidth={2} />
      </svg>
      <div className="mt-2 flex items-center justify-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: '#3B82F6' }} />入库
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: '#10B981' }} />出库
        </span>
      </div>
    </div>
  );
};

// ============ 转化漏斗（水平条） ============
const FunnelChart: React.FC<{ funnel: FunnelResult }> = ({ funnel }) => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
  return (
    <div className="space-y-2">
      {funnel.stages.map((s, i) => (
        <div key={s.key}>
          <div className="mb-0.5 flex items-center justify-between text-xs text-gray-500">
            <span>{s.label}</span>
            <span>
              {s.count} · {s.percent}%
            </span>
          </div>
          <div className="h-6 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="flex h-full items-center justify-end pr-2 text-xs font-medium text-white"
              style={{ width: `${Math.max(s.percent, 2)}%`, backgroundColor: colors[i % colors.length] }}
            >
              {s.percent >= 12 ? `${s.count}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============ 滞留率（按快递公司柱状） ============
const RetentionChart: React.FC<{ retention: RetentionResult }> = ({ retention }) => {
  if (retention.couriers.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">暂无数据</div>;
  }
  const maxRate = Math.max(1, ...retention.couriers.map((c) => c.rate));
  return (
    <div className="space-y-2">
      {retention.couriers.map((c) => (
        <div key={c.courierCompanyId || 'unknown'} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-xs text-gray-600">{c.courierName}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
            <div
              className="h-full rounded bg-danger/80"
              style={{ width: `${(c.rate / maxRate) * 100}%`, minWidth: c.rate > 0 ? 4 : 0 }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs text-gray-500">
            {c.rate}%（{c.overdue}/{c.total}）
          </span>
        </div>
      ))}
    </div>
  );
};

// ============ 取件高峰（柱状热力） ============
const PeakChart: React.FC<{ peak: PeakHoursResult }> = ({ peak }) => {
  const maxCount = Math.max(1, ...peak.hours.map((h) => h.count));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-[480px] items-end gap-1" style={{ height: 160 }}>
        {peak.hours.map((h) => {
          const ratio = h.count / maxCount;
          return (
            <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">{h.count || ''}</span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(ratio * 130, h.count > 0 ? 4 : 0)}px`,
                  backgroundColor: `rgba(255, 106, 0, ${0.25 + ratio * 0.75})`,
                }}
                title={`${h.hour}:00 · ${h.count} 件`}
              />
              <span className="text-[10px] text-gray-500">{h.hour}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {peak.weekdays.map((w) => (
          <span key={w.weekday} className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
            {w.label} {w.count}
          </span>
        ))}
      </div>
    </div>
  );
};

export default StatsPage;
