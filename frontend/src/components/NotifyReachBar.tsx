import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboardData';
import { buildBindShareScript } from '@/utils/staffScripts';
import { notifyError, notifySuccess } from '@/utils/notification';
import { copyText } from '@/utils/stationVisit';

export type NotifyReachBarContext = 'inbound' | 'inventory' | 'overdue' | 'exception' | 'outbound' | 'appointments' | 'shipping' | 'shifts' | 'finance' | 'generic';

/**
 * 运营触达条：与工作台同源的今日到件私信/未绑定/失败，
 * 用于入库、库存等高峰页面，避免回工作台才能跟进。
 */
const NotifyReachBar: React.FC<{
  className?: string;
  context?: NotifyReachBarContext;
}> = ({ className = '', context = 'generic' }) => {
  const navigate = useNavigate();
  const { data, isFetching } = useDashboard({ refetchInterval: 45000 });
  const notify = data?.notify;

  if (!notify) {
    return isFetching ? (
      <div
        className={`rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-400 ${className}`}
      >
        正在同步今日触达…
      </div>
    ) : null;
  }

  const rate =
    notify.inboundNotices > 0
      ? Math.round((notify.customerPushed / notify.inboundNotices) * 100)
      : null;
  const needFollow =
    notify.customerUnbound > 0 || notify.customerPushFailed > 0 || notify.sendFailed > 0;

  const subtitle =
    context === 'inbound'
      ? '本站全天数据；入库成功后会自动刷新。未绑定客户收不到微信取件码。'
      : context === 'inventory'
        ? '本站全天数据。补发到件/滞留提醒前，可先看未绑定再按手机号跟进。'
        : context === 'overdue'
          ? '本站全天数据。发滞留提醒前先看未绑定；未绑定只能当面报码，群里不发取件码。'
          : context === 'exception'
            ? '本站全天数据。异常跟进时可补发到件；未绑定请当面联系客户。'
            : context === 'outbound'
              ? '本站全天数据。取件高峰可顺带引导未绑定客户下次自动收码。'
              : context === 'appointments'
                ? '本站全天数据。确认预约前可看未绑定；未绑定请当面/电话告知时段。'
                : context === 'shipping'
                  ? '本站全天数据。寄件进度通知依赖客户绑定；未绑定请当面告知。'
                  : context === 'shifts'
                    ? '本站全天数据。交班时把未绑定/私信失败交接给下一班当面跟进。'
                    : context === 'finance'
                      ? '本站全天数据。日结对账时可顺带看未绑定；客户到店付款时引导绑定。'
                      : '本站全天数据。未绑定客户收不到微信取件码，请当面报码或引导绑定。';

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        needFollow
          ? 'border-orange-200 bg-orange-50/80'
          : 'border-emerald-100 bg-emerald-50/50'
      } ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-sm font-medium text-gray-800">今日到件触达</p>
            {rate != null && (
              <span className="text-[11px] text-gray-600">
                件次私信率 {rate}%（{notify.customerPushed}/{notify.inboundNotices}）
              </span>
            )}
            {typeof notify.uniqueRecipients === 'number' &&
              notify.uniqueRecipients > 0 && (
                <span className="text-[11px] text-gray-600">
                  人数覆盖{' '}
                  {Math.round(
                    ((notify.uniquePushedRecipients || 0) / notify.uniqueRecipients) * 100,
                  )}
                  %（{notify.uniquePushedRecipients || 0}/{notify.uniqueRecipients} 人）
                </span>
              )}
            {isFetching && <span className="text-[10px] text-gray-400">刷新中</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const ok = await copyText(buildBindShareScript());
                if (ok) notifySuccess('已复制绑定引导（不含取件码）');
                else notifyError('复制失败');
              })();
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            复制绑定话术
          </button>
          {notify.customerUnbound > 0 && (
            <button
              type="button"
              onClick={() =>
                navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')
              }
              className="rounded-md border border-orange-200 bg-white px-2 py-1 text-[11px] font-medium text-orange-800 hover:bg-orange-50"
            >
              按手机号跟进
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/admin/system?tab=notify&filter=today')}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
          >
            通知记录
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => navigate('/admin/system?tab=notify&filter=pushed')}
          className="rounded-full bg-white px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50"
        >
          已私信 {notify.customerPushed}
        </button>
        <button
          type="button"
          onClick={() =>
            navigate('/admin/system?tab=notify&filter=unbound&view=byPhone')
          }
          className={`rounded-full bg-white px-2.5 py-1 ring-1 hover:bg-orange-50 ${
            notify.customerUnbound > 0
              ? 'font-medium text-orange-800 ring-orange-200'
              : 'text-gray-600 ring-gray-200'
          }`}
        >
          未绑定 {notify.customerUnbound}
        </button>
        {notify.customerPushFailed > 0 && (
          <button
            type="button"
            onClick={() => navigate('/admin/system?tab=notify&filter=push_failed')}
            className="rounded-full bg-white px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-100 hover:bg-amber-50"
          >
            私信失败 {notify.customerPushFailed}
          </button>
        )}
        {notify.sendFailed > 0 && (
          <button
            type="button"
            onClick={() => navigate('/admin/system?tab=notify&filter=failed&today=1')}
            className="rounded-full bg-white px-2.5 py-1 font-medium text-red-700 ring-1 ring-red-100 hover:bg-red-50"
          >
            发送失败 {notify.sendFailed}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/admin/system?tab=notify&filter=inbound')}
          className="rounded-full bg-white px-2.5 py-1 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
        >
          到件通知 {notify.inboundNotices}
        </button>
        <span className="self-center text-[11px] text-gray-500">
          已绑定 {notify.activeBindings} 人
          {typeof notify.todayNewBindings === 'number' && notify.todayNewBindings > 0
            ? ` · 今日新绑 ${notify.todayNewBindings}`
            : ''}
        </span>
      </div>
      {needFollow && (
        <p className="mt-2 text-[11px] text-orange-900/90">
          {notify.customerUnbound > 0
            ? '有未绑定：当面报码，或复制绑定话术让客户查件绑定后再补发。'
            : '有私信/发送失败：到通知记录点补发，或当面告知取件码。'}
        </p>
      )}
    </div>
  );
};

export default NotifyReachBar;
