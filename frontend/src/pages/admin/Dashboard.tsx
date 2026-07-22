import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DashboardData, DashboardHourly } from '@/types/stats';
import type { Shelf } from '@/types/admin';
import { useShelves } from '@/hooks/useDictionary';
import { useDashboard } from '@/hooks/useDashboardData';
import { useLayoutConfig } from '@/hooks/useSystemAdmin';
import { useAuth } from '@/utils/auth';

const WarehouseScreen = React.lazy(() =>
  import('@/components/warehouse3d').then((m) => ({ default: m.WarehouseScreen })),
);
const StationLayoutTab = React.lazy(() => import('./system/tabs/StationLayoutTab'));

const WarehouseFallback: React.FC<{ height?: string | number }> = ({ height = 360 }) => (
  <div
    className="flex items-center justify-center bg-gray-50 text-sm text-gray-400"
    style={{ height }}
  >
    正在加载 3D 视图...
  </div>
);

// 工作台 Dashboard：概览卡片 + 小时趋势 + 待办 + 数字孪生大屏入口
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { stations, currentStationId } = useAuth();
  const stationName =
    stations.find((s) => s.id === currentStationId)?.name || '智能快递驿站';
  const { data: shelves = [] } = useShelves();
  const { data, isLoading, error } = useDashboard();
  const { data: layoutRes, isLoading: layoutQueryLoading } = useLayoutConfig();
  const layoutConfig = layoutRes?.layoutConfig ?? null;
  const layoutLoading = layoutQueryLoading && !layoutRes;

  if (isLoading && !data) {
    return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  }
  if (error) {
    return (
      <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
        {error instanceof Error ? error.message : '加载失败'}
      </div>
    );
  }
  if (!data) return null;

  const isEditingLayout = searchParams.get('layout') === 'edit';
  const isScreenMode = searchParams.get('view') === 'screen';
  const viewShelves = shelves.map(toWarehouseShelf);

  if (isScreenMode) {
    return (
      <React.Suspense fallback={<WarehouseFallback height="100vh" />}>
        <WarehouseScreen
          stationName={stationName}
          data={data}
          shelves={viewShelves}
          layoutConfig={layoutConfig}
          layoutLoading={layoutLoading}
          onExit={() => setSearchParams({})}
          onTodoClick={(type) => navigate(type === 'overdue' ? '/admin/overdue' : '/admin/exception')}
        />
      </React.Suspense>
    );
  }

  if (isEditingLayout) {
    return (
      <div className="w-full space-y-5">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">工作台 · 调整门店布局</h1>
            <p className="mt-1 text-sm text-gray-500">拖动货架、入口或区域后，统一保存全部改动。</p>
          </div>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            返回工作台
          </button>
        </div>
        <React.Suspense fallback={<WarehouseFallback height={520} />}>
          <StationLayoutTab />
        </React.Suspense>
      </div>
    );
  }

  const { today, yesterday, hourly, todo } = data;

  const cards: Array<{
    label: string;
    value: number;
    yesterday?: number;
    color: string;
    bg: string;
    href?: string;
  }> = [
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
    {
      label: '当前在库',
      value: today.inStock,
      color: 'text-primary',
      bg: 'bg-primaryLight',
      href: '/admin/inventory?status=in_stock',
    },
    {
      label: '当前滞留',
      value: today.overdue,
      color: 'text-warning',
      bg: 'bg-warning/10',
      href: '/admin/overdue',
    },
    {
      label: '当前异常',
      value: today.exception,
      color: 'text-danger',
      bg: 'bg-danger/10',
      href: '/admin/exception',
    },
  ];

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">工作台</h1>
          <p className="mt-1 text-xs text-gray-500">运营概览与待办处理；数字孪生统一进入全屏大屏查看。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSearchParams({ view: 'screen' })}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            数字孪生大屏
          </button>
          <button
            type="button"
            onClick={() => setSearchParams({ layout: 'edit' })}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            调整布局
          </button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const body = (
            <>
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
            </>
          );
          if (c.href) {
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => navigate(c.href!)}
                className={`rounded-lg ${c.bg} p-4 text-left transition hover:opacity-90`}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={c.label} className={`rounded-lg ${c.bg} p-4`}>
              {body}
            </div>
          );
        })}
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
              type="button"
              onClick={() => navigate('/admin/overdue')}
              className="flex w-full flex-col rounded-md bg-warning/5 px-3 py-3 text-left hover:bg-warning/10"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">超期待提醒</span>
                <span className="text-lg font-bold text-warning">{todo.overdueWarn}</span>
              </div>
              {todo.overdueWarn === 0 && (
                <span className="mt-1 text-xs text-gray-400">
                  暂无滞留（自动扫描将在 1.3 滞留件模块提供）
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/exception')}
              className="flex w-full flex-col rounded-md bg-danger/5 px-3 py-3 text-left hover:bg-danger/10"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">异常件未处理</span>
                <span className="text-lg font-bold text-danger">
                  {todo.exceptionUnresolved}
                </span>
              </div>
              {todo.exceptionUnresolved === 0 && (
                <span className="mt-1 text-xs text-gray-400">
                  暂无异常，可在库存列表批量标记
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

function toWarehouseShelf(shelf: Shelf) {
  return {
    number: shelf.number,
    sizeType: shelf.size_type,
    layers: shelf.layers,
    description: shelf.description,
    posX: shelf.pos_x,
    posY: shelf.pos_y,
    rotation: shelf.rotation,
    zone: shelf.zone,
    inStockCount: shelf.in_stock_count,
    remainingCapacity: shelf.remaining_capacity,
    capacityPerLayer: shelf.capacity_per_layer,
  };
}

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
