import React, { useEffect, useState } from 'react';
import * as inventoryService from '@/services/inventory';
import * as adminService from '@/services/admin';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import type { Station } from '@/types/admin';

// 驿站信息 Tab：展示当前驿站基础信息与滞留规则阈值
// 权限：admin 可读可改；clerk 只读（输入框禁用、隐藏保存按钮）
const StationTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);
  const [station, setStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
  });

  useEffect(() => {
    // 店员用只读接口，管理员也用只读接口读取（写操作走 adminService）
    inventoryService
      .fetchStation()
      .then((s) => {
        setStation(s);
        setForm({
          name: s.name || '',
          address: s.address || '',
          contactPhone: s.contact_phone || '',
          businessHours: s.business_hours || '',
          floorPlanUrl: s.floor_plan_url || '',
          overdueWarnDays: s.overdue_warn_days,
          overdueRemindDays: s.overdue_remind_days,
          overdueReturnDays: s.overdue_return_days,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const updated = await adminService.updateStation(form);
      setStation(updated);
      setSuccess('驿站信息已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-sm text-gray-500">加载中...</div>;
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
            <p className="mt-1 text-xs text-gray-400">二次短信提醒</p>
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

      {error && (
        <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      {success && (
        <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{success}</div>
      )}

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
