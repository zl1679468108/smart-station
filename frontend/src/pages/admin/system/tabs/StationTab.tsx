import React, { useEffect, useState } from 'react';
import * as adminService from '@/services/admin';
import { useStation, useSetStationCache } from '@/hooks/useSystemAdmin';
import { useInvalidateKioskLayout } from '@/hooks/useKioskLayout';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';

// 驿站信息 Tab：展示当前驿站基础信息与滞留规则阈值
// 权限：admin 可读可改；clerk 只读（输入框禁用、隐藏保存按钮）
// 数据：React Query 缓存（useStation），保存后 setQueryData 同步
const StationTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);
  const { data: station, isLoading: loading, error: queryError } = useStation();
  const setStationCache = useSetStationCache();
  const invalidateKioskLayout = useInvalidateKioskLayout();
  const [saving, setSaving] = useState(false);

  // 可编辑字段
  const [form, setForm] = useState({
    name: '',
    address: '',
    contactPhone: '',
    businessHours: '',
    floorPlanUrl: '',
    overdueWarnDays: 3,
    overdueRemindDays: 7,
    overdueReturnDays: 15,
    notifyTitle: '',
    notifyContent: '',
    wecomQrUrl: '',
    wecomJoinTip: '',
    serverchanGuide: '',
    serverchanGuideUrl: '',
    wxpusherGuide: '',
    pushplusGuide: '',
    pushplusGuideUrl: 'https://www.pushplus.plus/',
    bindEnabled: true,
  });

  // 缓存数据到达/更新时同步表单（写后 setQueryData 也会走这里）
  useEffect(() => {
    if (!station) return;
    const nc = station.notify_config || {};
    setForm({
      name: station.name || '',
      address: station.address || '',
      contactPhone: station.contact_phone || '',
      businessHours: station.business_hours || '',
      floorPlanUrl: station.floor_plan_url || '',
      overdueWarnDays: station.overdue_warn_days,
      overdueRemindDays: station.overdue_remind_days,
      overdueReturnDays: station.overdue_return_days,
      notifyTitle: nc.title || '',
      notifyContent: nc.content || '',
      wecomQrUrl: nc.wecomQrUrl || '',
      wecomJoinTip: nc.wecomJoinTip || '',
      serverchanGuide: nc.serverchanGuide || '',
      serverchanGuideUrl: nc.serverchanGuideUrl || '',
      wxpusherGuide: nc.wxpusherGuide || '',
      pushplusGuide: nc.pushplusGuide || '',
      pushplusGuideUrl: nc.pushplusGuideUrl || 'https://www.pushplus.plus/',
      bindEnabled: nc.bindEnabled !== false,
    });
  }, [station]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const updated = await adminService.updateStation({
        name: form.name,
        address: form.address,
        contactPhone: form.contactPhone,
        businessHours: form.businessHours,
        floorPlanUrl: form.floorPlanUrl,
        overdueWarnDays: form.overdueWarnDays,
        overdueRemindDays: form.overdueRemindDays,
        overdueReturnDays: form.overdueReturnDays,
        notifyConfig: {
          title: form.notifyTitle,
          content: form.notifyContent,
          wecomQrUrl: form.wecomQrUrl,
          wecomJoinTip: form.wecomJoinTip,
          serverchanGuide: form.serverchanGuide,
          serverchanGuideUrl: form.serverchanGuideUrl,
          wxpusherGuide: form.wxpusherGuide,
          pushplusGuide: form.pushplusGuide,
          pushplusGuideUrl: form.pushplusGuideUrl,
          bindEnabled: form.bindEnabled,
        },
      });
      setStationCache(updated);
      invalidateKioskLayout();
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
  if (queryError) {
    return (
      <div className="py-10 text-center text-sm text-danger">
        {queryError instanceof Error ? queryError.message : '加载失败'}
      </div>
    );
  }
  if (!station) return <div className="py-10 text-center text-sm text-danger">驿站不存在</div>;

  // readonly 标志：店员查看时所有输入框禁用
  const inputDisabled = saving || !canEdit;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* 基础信息 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-700">基础信息</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">驿站名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">联系电话</label>
            <input
              type="text"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-gray-600">地址</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">营业时间</label>
            <input
              type="text"
              value={form.businessHours}
              onChange={(e) => setForm({ ...form, businessHours: e.target.value })}
              placeholder="如 08:00-22:00"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">货架平面图 URL</label>
            <input
              type="url"
              value={form.floorPlanUrl}
              onChange={(e) => setForm({ ...form, floorPlanUrl: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
        </div>
      </section>

      {/* 滞留规则阈值 */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-700">滞留规则阈值（天）</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-gray-600">预警天数</label>
            <input
              type="number"
              min={1}
              value={form.overdueWarnDays}
              onChange={(e) => setForm({ ...form, overdueWarnDays: Number(e.target.value) })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
            <p className="mt-1 text-xs text-gray-400">超过此天数进入预警</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">提醒天数</label>
            <input
              type="number"
              min={1}
              value={form.overdueRemindDays}
              onChange={(e) => setForm({ ...form, overdueRemindDays: Number(e.target.value) })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
            <p className="mt-1 text-xs text-gray-400">二次通知提醒</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">退回天数</label>
            <input
              type="number"
              min={1}
              value={form.overdueReturnDays}
              onChange={(e) => setForm({ ...form, overdueReturnDays: Number(e.target.value) })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
            <p className="mt-1 text-xs text-gray-400">超过此天数标记退回</p>
          </div>
        </div>
      </section>


      {/* 通知公示（客户绑定引导） */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-medium text-gray-700">通知公示与客户绑定</h2>
        <p className="mb-4 text-xs text-gray-400">
          企业微信群仅发脱敏公告（不含取件码）。客户侧展示用大白话（微信扫一扫/专属绑定码）。后台可分别配置扫码与「其他方式」说明。
          以下内容会展示在 /query 与 /m 查询页。
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-gray-600">公示标题</label>
            <input
              type="text"
              value={form.notifyTitle}
              onChange={(e) => setForm({ ...form, notifyTitle: e.target.value })}
              placeholder="取件消息通知"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-gray-600">公示说明</label>
            <textarea
              value={form.notifyContent}
              onChange={(e) => setForm({ ...form, notifyContent: e.target.value })}
              rows={3}
              placeholder="说明绑定后如何收通知、企微群不含取件码等"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">企微群二维码图片 URL</label>
            <input
              type="url"
              value={form.wecomQrUrl}
              onChange={(e) => setForm({ ...form, wecomQrUrl: e.target.value })}
              placeholder="https://... 群二维码图片地址"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">入群提示文案</label>
            <input
              type="text"
              value={form.wecomJoinTip}
              onChange={(e) => setForm({ ...form, wecomJoinTip: e.target.value })}
              placeholder="扫码加入驿站公告群（仅公告，不含取件码）"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-gray-600">扫码绑定步骤说明（客户可见）</label>
            <textarea
              value={form.wxpusherGuide}
              onChange={(e) => setForm({ ...form, wxpusherGuide: e.target.value })}
              rows={3}
              placeholder="1. 输入手机号验证... 2. 生成关注二维码... 3. 微信扫码自动绑定..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
            <p className="mt-1 text-xs text-gray-400">
              后端需配置环境变量 WXPUSHER_APP_TOKEN（在 WxPusher 管理后台创建应用获取）。
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm text-gray-600">其他绑定方式说明（客户可见，避免写专业名词）</label>
            <textarea
              value={form.pushplusGuide}
              onChange={(e) => setForm({ ...form, pushplusGuide: e.target.value })}
              rows={2}
              placeholder="1. 在网页用微信登录... 2. 复制专属绑定码..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">其他方式官网链接</label>
            <input
              type="url"
              value={form.pushplusGuideUrl}
              onChange={(e) => setForm({ ...form, pushplusGuideUrl: e.target.value })}
              placeholder="https://www.pushplus.plus/"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={inputDisabled}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="bindEnabled"
              type="checkbox"
              checked={form.bindEnabled}
              onChange={(e) => setForm({ ...form, bindEnabled: e.target.checked })}
              disabled={inputDisabled}
              className="h-4 w-4 rounded border-gray-300 text-primary"
            />
            <label htmlFor="bindEnabled" className="text-sm text-gray-600">
              允许客户在查询页绑定个人通知
            </label>
          </div>
        </div>
      </section>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      )}
    </form>
  );
};

export default StationTab;
