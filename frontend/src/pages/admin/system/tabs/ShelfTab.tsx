import React, { useState } from 'react';
import * as adminService from '@/services/admin';
import { useShelves, useInvalidateShelves } from '@/hooks/useDictionary';
import { useInvalidateKioskLayout } from '@/hooks/useKioskLayout';
import { useAuth } from '@/utils/auth';
import { canManageSystem } from '@/utils/permission';
import { notifyError } from '@/utils/notification';
import type { Shelf, ShelfSizeType } from '@/types/admin';

const SIZE_LABEL: Record<ShelfSizeType, string> = {
  small: '小件',
  medium: '中件',
  large: '大件',
};

const SIZE_CLS: Record<ShelfSizeType, string> = {
  small: 'bg-info/10 text-info',
  medium: 'bg-warning/10 text-warning',
  large: 'bg-danger/10 text-danger',
};

// 货架管理 Tab：列表 + 新增 + 编辑（货架号/大小类型/层数/每层容量/描述/状态）
// 权限：admin 可读可改；clerk 只读（隐藏新增/编辑按钮）
const ShelfTab: React.FC = () => {
  const { user } = useAuth();
  const canEdit = canManageSystem(user?.role);
  // 字典数据走 React Query 缓存（inventory 只读接口，admin/clerk 均可读）
  const { data: list = [], isLoading: loading, error: queryError } = useShelves();
  const invalidateShelves = useInvalidateShelves();
  const invalidateKioskLayout = useInvalidateKioskLayout();
  const error = queryError ? (queryError instanceof Error ? queryError.message : '加载失败') : '';
  const [showAdd, setShowAdd] = useState(false);
  const [newShelf, setNewShelf] = useState({
    number: 1,
    sizeType: 'small' as ShelfSizeType,
    layers: 4,
    capacityPerLayer: 50,
    description: '',
  });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    number: 1,
    sizeType: 'small' as ShelfSizeType,
    layers: 4,
    capacityPerLayer: 50,
    description: '',
    status: 'active' as 'active' | 'disabled',
  });
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    if (newShelf.number < 1) {
      notifyError('货架号必须大于 0');
      return;
    }
    setAdding(true);
    try {
      await adminService.createShelf({
        number: newShelf.number,
        sizeType: newShelf.sizeType,
        layers: newShelf.layers || undefined,
        capacityPerLayer: newShelf.capacityPerLayer || undefined,
        description: newShelf.description.trim() || undefined,
      });
      setShowAdd(false);
      setNewShelf({ number: 1, sizeType: 'small', layers: 4, capacityPerLayer: 50, description: '' });
      invalidateShelves();
      invalidateKioskLayout();
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (s: Shelf) => {
    setEditingId(s.id);
    setEditForm({
      number: s.number,
      sizeType: s.size_type,
      layers: s.layers,
      capacityPerLayer: s.capacity_per_layer,
      description: s.description || '',
      status: s.status,
    });
  };

  const handleSaveEdit = async (s: Shelf) => {
    if (editForm.number < 1) {
      notifyError('货架号必须大于 0');
      return;
    }
    try {
      await adminService.updateShelf(s.id, {
        number: editForm.number,
        sizeType: editForm.sizeType,
        layers: editForm.layers,
        capacityPerLayer: editForm.capacityPerLayer,
        description: editForm.description.trim() || undefined,
        status: editForm.status,
      });
      setEditingId(null);
      invalidateShelves();
      invalidateKioskLayout();
    } catch {
      // 接口错误已由全局 notification 统一提示
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">货架列表（{list.length}）</h2>
        {canEdit && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primaryHover"
          >
            {showAdd ? '取消' : '+ 新增货架'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primaryLight/30 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">货架号 *</label>
              <input
                type="number"
                min={1}
                value={newShelf.number}
                onChange={(e) => setNewShelf({ ...newShelf, number: Number(e.target.value) })}
                placeholder="如 1~10"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">大小类型 *</label>
              <select
                value={newShelf.sizeType}
                onChange={(e) => setNewShelf({ ...newShelf, sizeType: e.target.value as ShelfSizeType })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              >
                <option value="small">小件</option>
                <option value="medium">中件</option>
                <option value="large">大件</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">层数</label>
              <input
                type="number"
                min={1}
                value={newShelf.layers}
                onChange={(e) => setNewShelf({ ...newShelf, layers: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">每层容量</label>
              <input
                type="number"
                min={1}
                value={newShelf.capacityPerLayer}
                onChange={(e) => setNewShelf({ ...newShelf, capacityPerLayer: Number(e.target.value) })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm text-gray-600">描述</label>
              <input
                type="text"
                value={newShelf.description}
                onChange={(e) => setNewShelf({ ...newShelf, description: e.target.value })}
                placeholder="如 1号货架-小件"
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
        <div className="py-8 text-center text-sm text-gray-400">暂无货架，请新增</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">货架号</th>
                <th className="px-3 py-2 text-left font-medium">类型</th>
                <th className="px-3 py-2 text-left font-medium">层数</th>
                <th className="px-3 py-2 text-left font-medium">每层容量</th>
                <th className="px-3 py-2 text-left font-medium">在库/总容量</th>
                <th className="px-3 py-2 text-left font-medium">剩余容量</th>
                <th className="px-3 py-2 text-left font-medium">描述</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {editingId === s.id ? (
                      <input
                        type="number"
                        min={1}
                        value={editForm.number}
                        onChange={(e) =>
                          setEditForm({ ...editForm, number: Number(e.target.value) })
                        }
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      `${s.number}号`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === s.id ? (
                      <select
                        value={editForm.sizeType}
                        onChange={(e) =>
                          setEditForm({ ...editForm, sizeType: e.target.value as ShelfSizeType })
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="small">小件</option>
                        <option value="medium">中件</option>
                        <option value="large">大件</option>
                      </select>
                    ) : (
                      <span className={`rounded px-2 py-0.5 text-xs ${SIZE_CLS[s.size_type]}`}>
                        {SIZE_LABEL[s.size_type]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === s.id ? (
                      <input
                        type="number"
                        min={1}
                        value={editForm.layers}
                        onChange={(e) => setEditForm({ ...editForm, layers: Number(e.target.value) })}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      `${s.layers} 层`
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === s.id ? (
                      <input
                        type="number"
                        min={1}
                        value={editForm.capacityPerLayer}
                        onChange={(e) =>
                          setEditForm({ ...editForm, capacityPerLayer: Number(e.target.value) })
                        }
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      `${s.capacity_per_layer} 件`
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    <span className="font-medium text-gray-700">{s.in_stock_count}</span>
                    <span className="text-gray-400"> / {s.layers * s.capacity_per_layer} 件</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`font-medium ${
                        s.remaining_capacity <= 0
                          ? 'text-danger'
                          : s.remaining_capacity <= s.layers * s.capacity_per_layer * 0.1
                            ? 'text-warning'
                            : 'text-success'
                      }`}
                    >
                      {s.remaining_capacity} 件
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      s.description || '-'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === s.id ? (
                      <select
                        value={editForm.status}
                        onChange={(e) =>
                          setEditForm({ ...editForm, status: e.target.value as 'active' | 'disabled' })
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="active">启用</option>
                        <option value="disabled">禁用</option>
                      </select>
                    ) : (
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          s.status === 'active' ? 'bg-success/10 text-success' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {s.status === 'active' ? '启用' : '禁用'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editingId === s.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSaveEdit(s)}
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
                        onClick={() => startEdit(s)}
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

      <p className="mt-3 text-xs text-gray-400">
        取件码格式：货架号-层号-件号，如 3-2-9903 = 第 3 号货架第 2 层第 9903 号
        <br />
        货架号与数量不限，大小类型可随时调整；当货架上有在库包裹时不支持改类型，需先清空该货架。
      </p>
    </div>
  );
};

export default ShelfTab;
