import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DashboardData, DashboardHourly } from '@/types/stats';
import type { Shelf } from '@/types/admin';
import { useShelves } from '@/hooks/useDictionary';
import { useDashboard, useDashboardEvents } from '@/hooks/useDashboardData';
import type { DashboardEvent } from '@/types/stats';
import { useLayoutConfig } from '@/hooks/useSystemAdmin';
import { useAuth } from '@/utils/auth';
import PageHeader from '@/components/ui/PageHeader';
import { buildBindGuideScript } from '@/utils/staffScripts';
import { copyText } from '@/utils/stationVisit';
import { notifyError, notifySuccess } from '@/utils/notification';
import * as shiftService from '@/services/shift';
import type { ShiftItem } from '@/types/shift';
import * as financeService from '@/services/finance';
import type { CashDaySummary } from '@/types/finance';

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
  const {
    data: recentEvents = [],
    isLoading: eventsLoading,
    error: eventsError,
  } = useDashboardEvents(8, { refetchInterval: 30000 });
  const { data: layoutRes, isLoading: layoutQueryLoading } = useLayoutConfig();
  const layoutConfig = layoutRes?.layoutConfig ?? null;
  const layoutLoading = layoutQueryLoading && !layoutRes;
  const [currentShift, setCurrentShift] = useState<ShiftItem | null | undefined>(undefined);
  const [cashToday, setCashToday] = useState<CashDaySummary | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await shiftService.fetchCurrentShift();
        if (!cancelled) setCurrentShift(s);
      } catch {
        if (!cancelled) setCurrentShift(null);
      }
    })();
    void (async () => {
      try {
        const c = await financeService.getCashDay();
        if (!cancelled) setCashToday(c);
      } catch {
        if (!cancelled) setCashToday(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentStationId]);


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
          onTodoClick={(type) => {
            // 退出大屏后再跳业务页，避免深链被全屏态挡住
            setSearchParams({});
            if (type === 'overdue') {
              navigate('/admin/overdue?from=dashboard');
              return;
            }
            if (type === 'exception') {
              navigate('/admin/exception');
              return;
            }
            if (type === 'notify_unbound') {
              navigate('/admin/system?tab=notify&filter=unbound&view=byPhone');
              return;
            }
            if (type === 'notify_failed') {
              navigate('/admin/system?tab=notify&filter=push_failed');
              return;
            }
            if (type === 'notify_pushed') {
              navigate('/admin/system?tab=notify&filter=pushed');
              return;
            }
            navigate('/admin/system?tab=notify&filter=today');
          }}
        />
      </React.Suspense>
    );
  }

  if (isEditingLayout) {
    return (
      <div className="w-full space-y-5">
        <PageHeader
          className="border-b border-gray-200 pb-3"
          title="工作台 · 调整门店布局"
          description="拖动货架、入口或区域后，统一保存全部改动。"
          actions={
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              返回工作台
            </button>
          }
        />
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
      <PageHeader
        title="工作台"
        description="运营概览与待办处理；数字孪生统一进入全屏大屏查看。"
        actions={
          <>
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
          </>
        }
      />

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

      {/* 班次状态条 */}
      {currentShift !== undefined && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 ${
            currentShift
              ? 'border-emerald-100 bg-emerald-50/80'
              : 'border-amber-100 bg-amber-50/80'
          }`}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800">
              {currentShift ? '当前已开班' : '尚未开班'}
            </div>
            <p className="mt-0.5 text-xs text-gray-600">
              {currentShift
                ? `本班入库 ${currentShift.inboundCount} · 出库 ${currentShift.outboundCount} · 收款 ${currentShift.collectPaidCount} 笔 / ¥${Number(currentShift.collectPaidTotal || 0).toFixed(2)}`
                : '开班后系统会按班次汇总入库、出库和收款，交班时更好对账。'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/shifts')}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              currentShift ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {currentShift ? '去交班' : '去开班'}
          </button>
        </div>
      )}

      {/* 今日到件触达：整卡看今日，标签深链到触达筛选 */}
      {data.notify && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/system?tab=notify&filter=today')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/admin/system?tab=notify&filter=today');
            }
          }}
          className="w-full cursor-pointer rounded-lg border border-orange-100 bg-orange-50/80 px-4 py-3 text-left transition hover:bg-orange-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-gray-800">今日到件触达</div>
              <p className="mt-0.5 text-xs text-gray-600">
                看客户有没有真正收到取件码私信（点数字可筛选对应记录）
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>已绑定客户 {data.notify.activeBindings} 人</div>
              {data.notify.inboundNotices > 0 && (
                <div className="mt-0.5 font-medium text-gray-700">
                  私信率{' '}
                  {Math.round(
                    (data.notify.customerPushed / data.notify.inboundNotices) * 100,
                  )}
                  %
                  <span className="ml-1 font-normal text-gray-500">
                    （{data.notify.customerPushed}/{data.notify.inboundNotices}）
                  </span>
                </div>
              )}
            </div>
          </div>
          {data.notify.inboundNotices > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (data.notify.customerPushed / data.notify.inboundNotices) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/admin/system?tab=notify&filter=pushed');
              }}
              className="rounded-md bg-white px-2.5 py-1 text-emerald-700 ring-1 ring-transparent hover:ring-emerald-200"
            >
              已私信 {data.notify.customerPushed}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/admin/system?tab=notify&filter=unbound&view=byPhone');
              }}
              className="rounded-md bg-white px-2.5 py-1 text-orange-700 ring-1 ring-transparent hover:ring-orange-200"
            >
              未绑定 {data.notify.customerUnbound}
            </button>
            {data.notify.customerPushFailed > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/admin/system?tab=notify&filter=push_failed');
                }}
                className="rounded-md bg-white px-2.5 py-1 text-amber-700 ring-1 ring-transparent hover:ring-amber-200"
              >
                私信失败 {data.notify.customerPushFailed}
              </button>
            )}
            {data.notify.sendFailed > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/admin/system?tab=notify&filter=failed&today=1');
                }}
                className="rounded-md bg-white px-2.5 py-1 text-red-700 ring-1 ring-transparent hover:ring-red-200"
              >
                发送失败 {data.notify.sendFailed}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/admin/system?tab=notify&filter=inbound');
              }}
              className="rounded-md bg-white px-2.5 py-1 text-gray-600 ring-1 ring-transparent hover:ring-gray-200"
            >
              到件通知 {data.notify.inboundNotices} 次
            </button>
          </div>
          {data.notify.customerUnbound > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] text-orange-800/80">
                未绑定客户不会收到微信私信，可当面报码或复制话术引导绑定；绑定后可在通知记录重发。
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void (async () => {
                    const ok = await copyText(
                      buildBindGuideScript({ stationName }),
                    );
                    if (ok) notifySuccess('已复制绑定引导话术（不含取件码）');
                    else notifyError('复制失败');
                  })();
                }}
                className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
              >
                复制绑定话术
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/admin/system?tab=notify&filter=unbound&view=byPhone');
                }}
                className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
              >
                按手机号跟进
              </button>
            </div>
          )}
        </div>
      )}

      {/* 最近业务动态：可点进库存/通知跟进 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-gray-700">最近业务动态</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              入库/出库/异常等实时动态；未绑定会单独提示，点进去可跟进
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.notify && data.notify.customerUnbound > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')
                }
                className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-100"
              >
                未绑定 {data.notify.customerUnbound} · 去跟进
              </button>
            )}
            <button
              type="button"
              onClick={() => setSearchParams({ view: 'screen' })}
              className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              打开大屏
            </button>
          </div>
        </div>
        {eventsError ? (
          <p className="text-xs text-danger">
            {eventsError instanceof Error ? eventsError.message : '动态加载失败'}
          </p>
        ) : eventsLoading && recentEvents.length === 0 ? (
          <p className="text-xs text-gray-400">加载中…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.notify &&
              (data.notify.customerUnbound > 0 || data.notify.customerPushFailed > 0) && (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm text-orange-900">
                      {data.notify.customerUnbound > 0
                        ? `今日有 ${data.notify.customerUnbound} 次到件未绑定，客户收不到微信私信`
                        : `今日有 ${data.notify.customerPushFailed} 次私信失败`}
                      {data.notify.customerUnbound > 0 &&
                      data.notify.customerPushFailed > 0
                        ? `，另有 ${data.notify.customerPushFailed} 次私信失败`
                        : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      当面报码或引导绑定后，可在通知记录补发
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        data.notify!.customerUnbound > 0
                          ? '/admin/system?tab=notify&filter=unbound&view=byPhone'
                          : '/admin/system?tab=notify&filter=push_failed',
                      )
                    }
                    className="shrink-0 rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
                  >
                    去处理
                  </button>
                </li>
              )}
            {recentEvents.length === 0 ? (
              <li className="py-3 text-xs text-gray-400">暂无业务动态</li>
            ) : (
              recentEvents.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => navigate(eventDeepLink(ev))}
                    className="flex w-full items-start justify-between gap-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-800">{ev.text}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {formatEventClock(ev.createdAt)}
                        {ev.trackingNumber ? ` · 运单 ${ev.trackingNumber}` : ''}
                        {ev.pickupCode ? ` · 取件码 ${ev.pickupCode}` : ''}
                      </p>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${eventToneClass(ev.tone)}`}
                    >
                      {eventToneLabel(ev)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
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
              onClick={() =>
                navigate(
                  todo.overdueWarn > 0
                    ? '/admin/overdue?from=dashboard'
                    : '/admin/overdue',
                )
              }
              className="flex w-full flex-col rounded-md bg-warning/5 px-3 py-3 text-left hover:bg-warning/10"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">超期待提醒</span>
                <span className="text-lg font-bold text-warning">{todo.overdueWarn}</span>
              </div>
              {todo.overdueWarn === 0 ? (
                <span className="mt-1 text-xs text-gray-400">
                  暂无滞留件，可在滞留页手动扫描提醒
                </span>
              ) : (
                <span className="mt-1 text-xs text-warning/90">
                  点击去滞留页扫描/发提醒
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
            <button
              type="button"
              onClick={() => navigate('/admin/shipping?status=pending')}
              className="flex w-full flex-col rounded-md bg-sky-50 px-3 py-3 text-left hover:bg-sky-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">寄件待处理</span>
                <span className="text-lg font-bold text-sky-700">
                  {todo.shippingPending ?? 0}
                </span>
              </div>
              {(todo.shippingPending ?? 0) === 0 ? (
                <span className="mt-1 text-xs text-gray-400">暂无待处理寄件单</span>
              ) : (
                <span className="mt-1 text-xs text-sky-700/80">点击处理下单客户寄件</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/shipping?status=picked')}
              className="flex w-full flex-col rounded-md bg-indigo-50 px-3 py-3 text-left hover:bg-indigo-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">寄件待发出</span>
                <span className="text-lg font-bold text-indigo-700">
                  {todo.shippingPicked ?? 0}
                </span>
              </div>
              {(todo.shippingPicked ?? 0) === 0 ? (
                <span className="mt-1 text-xs text-gray-400">无待发出寄件</span>
              ) : (
                <span className="mt-1 text-xs text-indigo-700/80">已取件，待交快递发出</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const pending = todo.appointmentPending ?? 0;
                if (pending > 0) {
                  navigate('/admin/appointments?status=pending&date=today');
                } else if ((todo.appointmentToday ?? 0) > 0) {
                  navigate('/admin/appointments?date=today');
                } else {
                  navigate('/admin/appointments?date=today');
                }
              }}
              className="flex w-full flex-col rounded-md bg-violet-50 px-3 py-3 text-left hover:bg-violet-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">今日预约到店</span>
                <span className="text-lg font-bold text-violet-700">
                  {todo.appointmentToday ?? 0}
                </span>
              </div>
              {(todo.appointmentToday ?? 0) === 0 ? (
                <span className="mt-1 text-xs text-gray-400">今日暂无待接待预约</span>
              ) : (
                <span className="mt-1 text-xs text-violet-700/80">
                  待确认 {todo.appointmentPending ?? 0} 条，点击处理
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/shifts')}
              className={`flex w-full flex-col rounded-md px-3 py-3 text-left ${
                currentShift
                  ? 'bg-emerald-50 hover:bg-emerald-100/80'
                  : 'bg-amber-50 hover:bg-amber-100/80'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">交接班</span>
                <span
                  className={`text-sm font-bold ${
                    currentShift ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {currentShift === undefined
                    ? '…'
                    : currentShift
                      ? '已开班'
                      : '未开班'}
                </span>
              </div>
              {currentShift ? (
                <span className="mt-1 text-xs text-emerald-800/80">
                  本班入库 {currentShift.inboundCount} · 出库 {currentShift.outboundCount} · 收款 ¥
                  {Number(currentShift.collectPaidTotal || 0).toFixed(2)}（点此交班）
                </span>
              ) : (
                <span className="mt-1 text-xs text-amber-800/80">
                  建议先开班再入库/出库，便于交班汇总收款
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/outbound?unpaid=1')}
              className="flex w-full flex-col rounded-md bg-rose-50 px-3 py-3 text-left hover:bg-rose-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">待收款包裹</span>
                <span className="text-lg font-bold text-rose-700">
                  {todo.collectUnpaid ?? 0}
                </span>
              </div>
              {(todo.collectUnpaid ?? 0) === 0 ? (
                <span className="mt-1 text-xs text-gray-400">无到付/代收货款待收</span>
              ) : (
                <span className="mt-1 text-xs text-rose-700/80">取件时收款，点击去出库收</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/finance?tab=cash')}
              className="flex w-full flex-col rounded-md bg-teal-50 px-3 py-3 text-left hover:bg-teal-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">今日收款日结</span>
                <span className="text-lg font-bold text-teal-700">
                  {cashToday === undefined
                    ? '…'
                    : cashToday
                      ? `¥${Number(cashToday.total || 0).toFixed(2)}`
                      : '→'}
                </span>
              </div>
              {cashToday ? (
                <span className="mt-1 text-xs text-teal-700/80">
                  已收 {cashToday.paidCount || 0} 笔
                  {Number(cashToday.unpaidInStock || 0) > 0
                    ? ` · 在库待收 ${cashToday.unpaidInStock} 件`
                    : ''}
                  {' · 点此看明细'}
                </span>
              ) : (
                <span className="mt-1 text-xs text-teal-700/80">到付/货款按收款方式汇总</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const m = todo.financeMonth || '';
                const q = new URLSearchParams();
                if (m) q.set('month', m);
                // 不锁死 status，便于同时看到「未对账」与「有差异」
                navigate(`/admin/finance?${q.toString()}`);
              }}
              className="flex w-full flex-col rounded-md bg-emerald-50 px-3 py-3 text-left hover:bg-emerald-100/80"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-gray-600">
                  财务未对账{todo.financeMonth ? `（${todo.financeMonth}）` : ''}
                </span>
                <span className="text-lg font-bold text-emerald-700">
                  {todo.financeUnreconciled ?? 0}
                </span>
              </div>
              {(todo.financeUnreconciled ?? 0) === 0 ? (
                <span className="mt-1 text-xs text-gray-400">上月账单已对清或尚未生成</span>
              ) : (
                <span className="mt-1 text-xs text-emerald-700/80">含未对账/有差异，点击去对账</span>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};


function formatEventClock(iso: string) {
  if (!iso) return '--:--';
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(iso)) return iso.slice(11, 16);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function eventDeepLink(ev: DashboardEvent) {
  if (ev.eventType?.startsWith('exception')) return '/admin/exception';
  if (ev.eventType?.startsWith('overdue')) return '/admin/overdue?from=dashboard';
  if (ev.trackingNumber) {
    return `/admin/inventory?trackingNumber=${encodeURIComponent(ev.trackingNumber)}`;
  }
  if (ev.pickupCode) {
    return `/admin/inventory?pickupCode=${encodeURIComponent(ev.pickupCode)}`;
  }
  return '/admin/inventory';
}

function eventToneLabel(ev: DashboardEvent) {
  if (ev.eventType === 'inbound') return '入库';
  if (ev.eventType === 'outbound') return '出库';
  if (ev.eventType?.startsWith('overdue')) return '滞留';
  if (ev.eventType?.startsWith('exception')) return '异常';
  if (ev.tone === 'warn') return '关注';
  if (ev.tone === 'danger') return '处理';
  if (ev.tone === 'ok') return '正常';
  return '动态';
}

function eventToneClass(tone: DashboardEvent['tone']) {
  if (tone === 'warn') return 'bg-amber-50 text-amber-800';
  if (tone === 'danger') return 'bg-red-50 text-red-700';
  if (tone === 'ok') return 'bg-emerald-50 text-emerald-700';
  return 'bg-sky-50 text-sky-700';
}

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
