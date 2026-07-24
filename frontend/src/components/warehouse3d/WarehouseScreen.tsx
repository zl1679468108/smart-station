import React, { useEffect, useMemo, useState } from 'react';
import Warehouse3D from './Warehouse3D';
import { preloadStationAssets } from './assets';
import type { WarehouseShelf } from './types';
import type { StationLayoutConfig } from '@/types/kiosk';
import type { DashboardData } from '@/types/stats';
import { useDashboard, useDashboardEvents } from '@/hooks/useDashboardData';
import {
  getOccupancyRatio,
  getRemainingCapacity,
  getShelfCapacity,
} from './occupancy';

export type WarehouseScreenTodoType =
  | 'overdue'
  | 'exception'
  | 'notify_today'
  | 'notify_unbound'
  | 'notify_failed'
  | 'notify_pushed';

export interface WarehouseScreenProps {
  stationName?: string;
  data: DashboardData;
  shelves: WarehouseShelf[];
  layoutConfig?: StationLayoutConfig | null;
  layoutLoading?: boolean;
  onExit: () => void;
  /** 点击待办/触达条目 */
  onTodoClick?: (type: WarehouseScreenTodoType) => void;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatNow(date: Date) {
  const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  return {
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} 星期${week}`,
  };
}

const WarehouseScreen: React.FC<WarehouseScreenProps> = ({
  stationName = '智能快递驿站',
  data,
  shelves,
  layoutConfig = null,
  layoutLoading = false,
  onExit,
  onTodoClick,
}) => {
  const [now, setNow] = useState(() => formatNow(new Date()));
  // 平板默认收起侧栏，把舞台留给 3D；PC 默认展开
  const [leftCollapsed, setLeftCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1199px)').matches : false,
  );
  const [rightCollapsed, setRightCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1199px)').matches : false,
  );
  const { data: liveData = data } = useDashboard({
    initialData: data,
    refetchInterval: 15000,
  });
  const {
    data: events = [],
    isLoading: eventsLoading,
    error: eventsError,
  } = useDashboardEvents(24, { refetchInterval: 15000 });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(formatNow(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    preloadStationAssets().catch(() => {
      /* 无 GLB 时静默回退程序化模型 */
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1199px)');
    const apply = () => {
      // 仅在断点切换时同步默认收起策略，不覆盖用户手动展开/收起意图以外的情况：
      // 进入平板 -> 收起；回到 PC -> 展开
      if (mq.matches) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      } else {
        setLeftCollapsed(false);
        setRightCollapsed(false);
      }
    };
    // 不在 mount 再强制覆盖（已用 initial state），只监听后续变化
    const onChange = () => apply();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const shelfStats = useMemo(() => {
    const totalInStock = shelves.reduce((sum, s) => sum + (s.inStockCount ?? 0), 0);
    const totalCapacity = shelves.reduce((sum, s) => sum + getShelfCapacity(s), 0);
    const busy = shelves
      .map((s) => ({
        number: s.number,
        ratio: getOccupancyRatio(s),
        inStock: s.inStockCount ?? 0,
        remaining: getRemainingCapacity(s),
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5);
    const occupancy = totalCapacity > 0 ? totalInStock / totalCapacity : 0;
    const highRisk = shelves.filter((s) => getOccupancyRatio(s) >= 0.85).length;
    return { totalInStock, totalCapacity, busy, occupancy, highRisk, shelfCount: shelves.length };
  }, [shelves]);

  const formatEventTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    // createdAt 已是后端转北京时间字符串时直接截取
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(iso)) {
      return iso.slice(11, 16);
    }
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const notify = liveData.notify;
  const notifyCues = useMemo(() => {
    const items: Array<{
      time: string;
      text: string;
      tone: 'ok' | 'warn' | 'danger' | 'info';
      key: string;
      action?: WarehouseScreenTodoType;
    }> = [];
    if (!notify || notify.inboundNotices <= 0) return items;
    const t = now.time.slice(0, 5);
    if (notify.customerUnbound > 0) {
      items.push({
        key: 'notify-unbound',
        time: t,
        text: `今日 ${notify.customerUnbound} 次到件未绑定，客户收不到微信私信`,
        tone: 'warn',
        action: 'notify_unbound',
      });
    }
    if (notify.customerPushFailed > 0) {
      items.push({
        key: 'notify-failed',
        time: t,
        text: `今日 ${notify.customerPushFailed} 次私信失败，可到通知记录补发`,
        tone: 'danger',
        action: 'notify_failed',
      });
    }
    if (notify.customerPushed > 0 && notify.customerUnbound === 0 && notify.customerPushFailed === 0) {
      items.push({
        key: 'notify-ok',
        time: t,
        text: `今日到件私信正常（${notify.customerPushed}/${notify.inboundNotices}）`,
        tone: 'ok',
        action: 'notify_pushed',
      });
    }
    return items;
  }, [notify, now.time]);

  const feed = useMemo(() => {
    type FeedItem = {
      time: string;
      text: string;
      tone: 'ok' | 'warn' | 'danger' | 'info';
      key: string;
      action?: WarehouseScreenTodoType;
    };
    const cues = notifyCues;
    if (events.length > 0) {
      const mapped: FeedItem[] = events.slice(0, 10).map((e) => ({
        time: formatEventTime(e.createdAt),
        text: e.text,
        tone: e.tone,
        key: e.id,
      }));
      return [...cues, ...mapped].slice(0, 12);
    }
    // 无事件时回退合成动态，避免空白
    const items: FeedItem[] = [...cues];
    const h = liveData.hourly[liveData.hourly.length - 1];
    if (h) {
      items.push({
        key: 'hourly',
        time: `${pad2(h.hour)}:00`,
        text: `本时段入库 ${h.inbound} 件 · 出库 ${h.outbound} 件`,
        tone: 'info',
      });
    }
    if (liveData.todo.overdueWarn > 0) {
      items.push({
        key: 'overdue',
        time: now.time.slice(0, 5),
        text: `${liveData.todo.overdueWarn} 件超期待提醒`,
        tone: 'warn',
        action: 'overdue',
      });
    }
    if (liveData.todo.exceptionUnresolved > 0) {
      items.push({
        key: 'exception',
        time: now.time.slice(0, 5),
        text: `${liveData.todo.exceptionUnresolved} 件异常待处理`,
        tone: 'danger',
        action: 'exception',
      });
    }
    items.push({
      key: 'stock',
      time: now.time.slice(0, 5),
      text: `当前在库 ${liveData.today.inStock} 件 · 货架 ${shelfStats.shelfCount} 组`,
      tone: 'ok',
    });
    return items.slice(0, 12);
  }, [events, liveData, now.time, shelfStats.shelfCount, notifyCues]);

  const tickerText = useMemo(() => {
    // 底部 ticker 不再复读左侧 KPI 数字，只补场景/动态语义信息
    const parts: string[] = [];
    if (shelfStats.highRisk > 0) {
      parts.push(`${shelfStats.highRisk} 组货架高占用(≥85%)`);
    } else {
      parts.push('货架压力整体平稳');
    }
    if (shelfStats.busy[0]) {
      const top = shelfStats.busy[0];
      parts.push(`压力最高 #${top.number}（${Math.round(top.ratio * 100)}%）`);
    }
    if (notify && notify.inboundNotices > 0) {
      const rate =
        notify.inboundNotices > 0
          ? Math.round((notify.customerPushed / notify.inboundNotices) * 100)
          : 0;
      parts.push(
        `到件私信率 ${rate}%（${notify.customerPushed}/${notify.inboundNotices}）`,
      );
      if (notify.customerUnbound > 0) {
        parts.push(`未绑定 ${notify.customerUnbound} 次，需当面报码或引导绑定`);
      }
      if (notify.customerPushFailed > 0) {
        parts.push(`私信失败 ${notify.customerPushFailed} 次可补发`);
      }
    }
    if (events.length > 0) {
      parts.push(
        ...events.slice(0, 3).map((e) => `${formatEventTime(e.createdAt)} ${e.text}`),
      );
    } else if (eventsLoading) {
      parts.push('业务动态同步中');
    } else {
      parts.push('暂无新业务动态');
    }
    parts.push('场景：位置与状态 · 侧栏：统计与明细');
    return parts.join('   ·   ');
  }, [shelfStats.highRisk, shelfStats.busy, events, eventsLoading, notify]);

  return (
    <div className="ws-screen">
      <div className="ws-screen__frame" />

      <header className="ws-screen__header">
        <div className="ws-screen__brand">
          <i className="ws-screen__brand-dot" />
          LIVE · 仓内数字孪生
        </div>
        <div className="ws-screen__title">
          <h1>{stationName}</h1>
          <p>SMART STATION DIGITAL TWIN</p>
        </div>
        <div className="ws-screen__header-right">
          <div className="ws-screen__clock">
            <strong>{now.time}</strong>
            <span>{now.date}</span>
          </div>
          <button type="button" className="ws-screen__exit" onClick={onExit}>
            退出大屏 Esc
          </button>
        </div>
      </header>

      <div
        className={[
          'ws-screen__body',
          leftCollapsed ? 'ws-screen__body--left-collapsed' : '',
          rightCollapsed ? 'ws-screen__body--right-collapsed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <aside className={`ws-screen__panel ws-screen__panel--left${leftCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className="ws-screen__panel-toggle ws-screen__panel-toggle--left"
            aria-label={leftCollapsed ? '展开左侧信息栏' : '收起左侧信息栏'}
            title={leftCollapsed ? '展开左侧' : '收起左侧'}
            onClick={() => setLeftCollapsed((v) => !v)}
          >
            {leftCollapsed ? '›' : '‹'}
          </button>
          <div className="ws-screen__panel-content">
          <section className="ws-card">
            <div className="ws-card__title">
              运营统计 <span>STATS</span>
            </div>
            <div className="ws-kpi-grid">
              <div className="ws-kpi ws-kpi--inbound">
                <label>今日入库</label>
                <strong>{liveData.today.inbound}</strong>
                <em>昨日 {liveData.yesterday.inbound}</em>
              </div>
              <div className="ws-kpi ws-kpi--outbound">
                <label>今日出库</label>
                <strong>{liveData.today.outbound}</strong>
                <em>昨日 {liveData.yesterday.outbound}</em>
              </div>
              <div className="ws-kpi ws-kpi--stock">
                <label>当前在库</label>
                <strong>{liveData.today.inStock}</strong>
                <em>仓容利用率 {(shelfStats.occupancy * 100).toFixed(1)}%</em>
              </div>
              <div className="ws-kpi ws-kpi--overdue">
                <label>当前滞留</label>
                <strong>{liveData.today.overdue}</strong>
                <em>待提醒 {liveData.todo.overdueWarn}</em>
              </div>
              <div className="ws-kpi ws-kpi--exception">
                <label>当前异常</label>
                <strong>{liveData.today.exception}</strong>
                <em>未处理 {liveData.todo.exceptionUnresolved}</em>
              </div>
              <div className="ws-kpi ws-kpi--todo">
                <label>货架组数</label>
                <strong>{shelfStats.shelfCount}</strong>
                <em>高占用 {shelfStats.highRisk}</em>
              </div>
            </div>
          </section>

          <section className="ws-card">
            <div className="ws-card__title">
              货架压力明细 <span>DETAIL</span>
            </div>
            <div className="ws-list">
              {shelfStats.busy.length === 0 && (
                <div className="ws-list-item">
                  <span>暂无货架库存数据</span>
                </div>
              )}
              {shelfStats.busy.map((item) => (
                <div key={item.number} className="ws-list-item ws-pressure-item">
                  <div className="ws-pressure-item__head">
                    <b>#{item.number}</b>
                    <strong>{Math.round(item.ratio * 100)}%</strong>
                  </div>
                  <div className="ws-pressure-item__meta">
                    在库 {item.inStock} · 余量 {item.remaining}
                  </div>
                  <div className="ws-bar">
                    <i style={{ width: `${Math.round(item.ratio * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          </div>
        </aside>

        <main className="ws-stage">
          <div className="ws-stage__badge">位置 / 状态 · 自动巡航 / 点击漫游</div>
          <Warehouse3D
            variant="screen"
            shelves={shelves}
            layoutConfig={layoutConfig}
            layoutLoading={layoutLoading}
            showOccupancy
            height="100%"
            className="ws-stage__canvas h-full rounded-none"
          />
        </main>

        <aside className={`ws-screen__panel ws-screen__panel--right${rightCollapsed ? ' is-collapsed' : ''}`}>
          <button
            type="button"
            className="ws-screen__panel-toggle ws-screen__panel-toggle--right"
            aria-label={rightCollapsed ? '展开右侧信息栏' : '收起右侧信息栏'}
            title={rightCollapsed ? '展开右侧' : '收起右侧'}
            onClick={() => setRightCollapsed((v) => !v)}
          >
            {rightCollapsed ? '‹' : '›'}
          </button>
          <div className="ws-screen__panel-content">
          <section className="ws-card">
            <div className="ws-card__title">
              出入库趋势 <span>HOURLY</span>
            </div>
            <ScreenTrendChart hourly={liveData.hourly} />
          </section>

          <section className="ws-card">
            <div className="ws-card__title">
              实时动态 <span>EVENTS</span>
            </div>
            <div className="ws-feed">
              {eventsError && (
                <div className="ws-feed-item">
                  <time>--</time>
                  <strong>事件接口暂不可用，已显示本地概览</strong>
                  <em>降级</em>
                </div>
              )}
              {!eventsError && eventsLoading && feed.length === 0 && (
                <div className="ws-feed-item">
                  <time>--</time>
                  <strong>正在同步业务动态...</strong>
                  <em>加载</em>
                </div>
              )}
              {feed.map((item, idx) => {
                const clickable = Boolean(item.action && onTodoClick);
                const Tag: 'button' | 'div' = clickable ? 'button' : 'div';
                return (
                  <Tag
                    key={('key' in item && item.key) || `${item.text}-${idx}`}
                    type={clickable ? 'button' : undefined}
                    className={`ws-feed-item ${
                      item.tone === 'warn'
                        ? 'ws-feed-item--warn'
                        : item.tone === 'danger'
                          ? 'ws-feed-item--danger'
                          : item.tone === 'ok'
                            ? 'ws-feed-item--ok'
                            : ''
                    }`}
                    onClick={
                      clickable && item.action
                        ? () => onTodoClick?.(item.action!)
                        : undefined
                    }
                    style={
                      clickable
                        ? {
                            width: '100%',
                            textAlign: 'left',
                            cursor: 'pointer',
                            background: 'transparent',
                            border: 'none',
                            color: 'inherit',
                            font: 'inherit',
                          }
                        : undefined
                    }
                  >
                    <time>{item.time}</time>
                    <strong>{item.text}</strong>
                    <em>
                      {item.action
                        ? '跟进'
                        : item.tone === 'warn'
                          ? '关注'
                          : item.tone === 'danger'
                            ? '处理'
                            : item.tone === 'ok'
                              ? '正常'
                              : '同步'}
                    </em>
                  </Tag>
                );
              })}
            </div>
          </section>

          <section className="ws-card">
            <div className="ws-card__title">
              到件触达 <span>NOTIFY</span>
            </div>
            {notify && notify.inboundNotices > 0 ? (
              <div className="ws-list">
                <button
                  type="button"
                  className="ws-list-item"
                  onClick={() => onTodoClick?.('notify_today')}
                  style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                >
                  <span>到件通知</span>
                  <b style={{ color: '#93c5fd' }}>{notify.inboundNotices}</b>
                </button>
                <button
                  type="button"
                  className="ws-list-item"
                  onClick={() => onTodoClick?.('notify_pushed')}
                  style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                >
                  <span>已私信</span>
                  <b style={{ color: '#34d399' }}>{notify.customerPushed}</b>
                </button>
                <button
                  type="button"
                  className="ws-list-item"
                  onClick={() => onTodoClick?.('notify_unbound')}
                  style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                >
                  <span>未绑定（收不到码）</span>
                  <b style={{ color: notify.customerUnbound > 0 ? '#fbbf24' : '#94a3b8' }}>
                    {notify.customerUnbound}
                  </b>
                </button>
                {notify.customerPushFailed > 0 && (
                  <button
                    type="button"
                    className="ws-list-item"
                    onClick={() => onTodoClick?.('notify_failed')}
                    style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                  >
                    <span>私信失败</span>
                    <b style={{ color: '#f87171' }}>{notify.customerPushFailed}</b>
                  </button>
                )}
                <div className="ws-list-item" style={{ opacity: 0.85 }}>
                  <span style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {notify.customerUnbound > 0
                      ? '未绑定请当面报码，或引导客户查件绑定后再补发'
                      : '客户绑定后可自动微信私信取件码'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="ws-list">
                <div className="ws-list-item">
                  <span style={{ fontSize: 12, opacity: 0.8 }}>今日暂无到件通知</span>
                </div>
              </div>
            )}
          </section>

          <section className="ws-card">
            <div className="ws-card__title">待办速览</div>
            <div className="ws-list">
              <button
                type="button"
                className="ws-list-item"
                onClick={() => onTodoClick?.('overdue')}
                style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
              >
                <span>超期待提醒</span>
                <b style={{ color: '#fbbf24' }}>{liveData.todo.overdueWarn}</b>
              </button>
              <button
                type="button"
                className="ws-list-item"
                onClick={() => onTodoClick?.('exception')}
                style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
              >
                <span>异常件未处理</span>
                <b style={{ color: '#f87171' }}>{liveData.todo.exceptionUnresolved}</b>
              </button>
              {notify && notify.customerUnbound > 0 && (
                <button
                  type="button"
                  className="ws-list-item"
                  onClick={() => onTodoClick?.('notify_unbound')}
                  style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                >
                  <span>未绑定待跟进</span>
                  <b style={{ color: '#fbbf24' }}>{notify.customerUnbound}</b>
                </button>
              )}
              {notify && notify.customerPushFailed > 0 && (
                <button
                  type="button"
                  className="ws-list-item"
                  onClick={() => onTodoClick?.('notify_failed')}
                  style={{ width: '100%', textAlign: 'left', cursor: onTodoClick ? 'pointer' : 'default' }}
                >
                  <span>私信失败待补发</span>
                  <b style={{ color: '#f87171' }}>{notify.customerPushFailed}</b>
                </button>
              )}
            </div>
          </section>
          </div>
        </aside>
      </div>

      <footer className="ws-screen__footer">
        <div>Smart Station Digital Twin · 橙科技仓内孪生</div>
        <div className="ws-screen__ticker">
          <span>{tickerText}</span>
        </div>
        <div>按 Esc 退出演示</div>
      </footer>
    </div>
  );
};

const ScreenTrendChart: React.FC<{ hourly: DashboardData['hourly'] }> = ({ hourly }) => {
  const W = 520;
  const H = 140;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 20;
  const maxVal = Math.max(1, ...hourly.map((h) => Math.max(h.inbound, h.outbound)));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xStep = innerW / Math.max(1, hourly.length - 1);
  const yScale = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
  const xScale = (i: number) => PAD_L + i * xStep;
  const buildPath = (key: 'inbound' | 'outbound') =>
    hourly.map((h, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(h[key])}`).join(' ');
  const buildArea = (key: 'inbound' | 'outbound') => {
    if (hourly.length === 0) return '';
    const line = buildPath(key);
    const lastX = xScale(hourly.length - 1);
    const firstX = xScale(0);
    return `${line} L ${lastX} ${PAD_T + innerH} L ${firstX} ${PAD_T + innerH} Z`;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="ws-chart">
        <defs>
          <linearGradient id="wsInboundFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wsOutboundFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => {
          const y = yScale(maxVal * t);
          return (
            <line
              key={t}
              x1={PAD_L}
              y1={y}
              x2={W - PAD_R}
              y2={y}
              stroke="rgba(148,163,184,0.18)"
              strokeWidth={1}
            />
          );
        })}
        <path d={buildArea('inbound')} fill="url(#wsInboundFill)" />
        <path d={buildArea('outbound')} fill="url(#wsOutboundFill)" />
        <path d={buildPath('inbound')} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
        <path d={buildPath('outbound')} fill="none" stroke="#34d399" strokeWidth={2.2} />
        {hourly.map((h, i) =>
          h.hour % 3 === 0 ? (
            <text
              key={h.hour}
              x={xScale(i)}
              y={H - 4}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {h.hour}
            </text>
          ) : null,
        )}
      </svg>
      <div className="ws-legend">
        <span>
          <i style={{ background: '#38bdf8' }} />
          入库
        </span>
        <span>
          <i style={{ background: '#34d399' }} />
          出库
        </span>
      </div>
    </div>
  );
};

export default WarehouseScreen;
