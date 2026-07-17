import React, { useState } from 'react';
import * as adminService from '@/services/admin';
import { useCouriers, useInvalidateCouriers } from '@/hooks/useDictionary';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import type { CourierCompany } from '@/types/admin';

// 快递公司管理 Tab：列表 + 新增 + 编辑（名称/客服电话/前缀/排序/状态）
// 权限：admin 可读可改；clerk 只读（隐藏新增/编辑按钮）
const CourierTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);
  // 字典数据走 React Query 缓存（inventory 只读接口，admin/clerk 均可读）
  const { data: list = [], isLoading: loading, error: queryError } = useCouriers();
  const invalidateCouriers = useInvalidateCouriers();
  const error = queryError ? (queryError instanceof Error ? queryError.message : '加载失败') : '';
  const [showAdd, setShowAdd] = useState(false);
  const [newCourier, setNewCourier] = useState({
    name: '',
    code: '',
    servicePhone: '',
    trackingPrefixes: '',
    sortOrder: 0,
  });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    service_phone: '',
    tracking_prefixes: '',
    sort_order: 0,
    status: 'active' as 'active' | 'disabled',
  });
  const [actionError, setActionError] = useState('');

  const parsePrefixes = (s: string): string[] =>
    s
      .split(/[,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setActionError('');
    if (!newCourier.name.trim() || !newCourier.code.trim()) {
      setActionError('名称和代码不能为空');
      return;
    }
    setAdding(true);
    try {
      await adminService.createCourier({
        name: newCourier.name.trim(),
        code: newCourier.code.trim().toUpperCase(),
        servicePhone: newCourier.servicePhone.trim() || undefined,
        trackingPrefixes: parsePrefixes(newCourier.trackingPrefixes),
        sortOrder: newCourier.sortOrder,
      });
      setShowAdd(false);
      setNewCourier({ name: '', code: '', servicePhone: '', trackingPrefixes: '', sortOrder: 0 });
      invalidateCouriers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: CourierCompany) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      service_phone: c.service_phone || '',
      tracking_prefixes: (c.tracking_prefixes || []).join(', '),
      sort_order: c.sort_order,
      status: c.status,
    });
  };

  const handleSaveEdit = async (c: CourierCompany) => {
    try {
      await adminService.updateCourier(c.id, {
        name: editForm.name.trim(),
        service_phone: editForm.service_phone.trim() || null,
        tracking_prefixes: parsePrefixes(editForm.tracking_prefixes),
        sort_order: editForm.sort_order,
        status: editForm.status,
      });
      setEditingId(null);
      invalidateCouriers();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">快递公司列表（{list.length}）</h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primaryHover"
          >
            {showAdd ? '取消' : '+ 新增快递公司'}
          </button>
        )}
      </div>

      {(actionError || error) && (
        <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {actionError || error}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primaryLight/30 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">名称 *</label>
              <input
                type="text"
                value={newCourier.name}
                onChange={(e) => setNewCourier({ ...newCourier, name: e.target.value })}
                placeholder="如 顺丰速运"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">代码 *</label>
              <input
                type="text"
                value={newCourier.code}
                onChange={(e) => setNewCourier({ ...newCourier, code: e.target.value })}
                placeholder="如 SF"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">客服电话</label>
              <input
                type="text"
                value={newCourier.servicePhone}
                onChange={(e) => setNewCourier({ ...newCourier, servicePhone: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">排序</label>
              <input
                type="number"
                value={newCourier.sortOrder}
                onChange={(e) =>
                  setNewCourier({ ...newCourier, sortOrder: Number(e.target.value) })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-gray-600">运单号前缀（逗号分隔）</label>
              <input
                type="text"
                value={newCourier.trackingPrefixes}
                onChange={(e) =>
                  setNewCourier({ ...newCourier, trackingPrefixes: e.target.value })
                }
                placeholder="如 SF, SF1"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {adding ? '添加中...' : '确认新增'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">加载中...</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">暂无快递公司</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">名称</th>
                <th className="px-3 py-2 text-left font-medium">代码</th>
                <th className="px-3 py-2 text-left font-medium">客服电话</th>
                <th className="px-3 py-2 text-left font-medium">前缀</th>
                <th className="px-3 py-2 text-left font-medium">排序</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {editingId === c.id ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.code}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === c.id ? (
                      <input
                        type="text"
                        value={editForm.service_phone}
                        onChange={(e) =>
                          setEditForm({ ...editForm, service_phone: e.target.value })
                        }
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      c.service_phone || '-'
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === c.id ? (
                      <input
                        type="text"
                        value={editForm.tracking_prefixes}
                        onChange={(e) =>
                          setEditForm({ ...editForm, tracking_prefixes: e.target.value })
                        }
                        className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      (c.tracking_prefixes || []).join(', ') || '-'
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === c.id ? (
                      <input
                        type="number"
                        value={editForm.sort_order}
                        onChange={(e) =>
                          setEditForm({ ...editForm, sort_order: Number(e.target.value) })
                        }
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      c.sort_order
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === c.id ? (
                      <select
                        value={editForm.status}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            status: e.target.value as 'active' | 'disabled',
                          })
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="active">启用</option>
                        <option value="disabled">禁用</option>
                      </select>
                    ) : (
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          c.status === 'active'
                            ? 'bg-success/10 text-success'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {c.status === 'active' ? '启用' : '禁用'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingId === c.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSaveEdit(c)}
                          className="text-xs text-primary hover:underline"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          取消
                        </button>
                      </div>
                    ) : canEdit ? (
                      <button
                        onClick={() => startEdit(c)}
                        className="text-xs text-primary hover:underline"
                      >
                        编辑
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CourierTab;
