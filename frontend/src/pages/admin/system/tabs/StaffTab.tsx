import React, { useState } from 'react';
import * as adminService from '@/services/admin';
import { useStaff, useInvalidateStaff } from '@/hooks/useSystemAdmin';
import type { Staff } from '@/types/admin';

const roleLabel: Record<string, string> = {
  admin: '管理员',
  clerk: '店员',
  viewer: '查询员',
};

// 员工管理 Tab：列表 + 新增 + 角色编辑 + 启用/禁用
const StaffTab: React.FC = () => {
  // 员工列表走 React Query 缓存；写操作后 invalidate 刷新
  const { data: list = [], isLoading: loading, error: queryError } = useStaff();
  const invalidateStaff = useInvalidateStaff();
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newStaff, setNewStaff] = useState({
    phone: '',
    username: '',
    password: '',
    role: 'clerk' as 'admin' | 'clerk' | 'viewer',
  });
  const [adding, setAdding] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'clerk' | 'viewer'>('clerk');
  const [editUsername, setEditUsername] = useState('');
  // 重置密码相关状态
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadError = queryError
    ? queryError instanceof Error
      ? queryError.message
      : '加载失败'
    : '';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setError('');
    if (!/^1\d{10}$/.test(newStaff.phone)) {
      setError('手机号格式不正确');
      return;
    }
    // 密码规则与后端 CreateStaffDto 一致：8-32 位且含字母+数字
    // 留空时后端会在"新建用户"分支抛出"新增用户必须提供初始密码"
    if (newStaff.password && !/^(?=.*[a-zA-Z])(?=.*\d).{8,32}$/.test(newStaff.password)) {
      setError('密码需 8-32 位且含字母+数字');
      return;
    }
    setAdding(true);
    try {
      const created = await adminService.createStaff(newStaff);
      setCreatedPassword(created.initialPassword || null);
      setShowAdd(false);
      setNewStaff({ phone: '', username: '', password: '', role: 'clerk' });
      invalidateStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleStatus = async (staff: Staff) => {
    const next = staff.status === 'active' ? 'disabled' : 'active';
    try {
      await adminService.setStaffStatus(staff.id, next);
      invalidateStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const startEdit = (staff: Staff) => {
    setEditingId(staff.id);
    setEditRole(staff.role);
    setEditUsername(staff.username);
  };

  const handleSaveEdit = async (staff: Staff) => {
    try {
      await adminService.updateStaff(staff.id, { role: editRole, username: editUsername });
      setEditingId(null);
      invalidateStaff();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  const startReset = (staff: Staff) => {
    setResettingId(staff.id);
    setResetPassword('');
  };

  const handleResetPassword = async (staff: Staff) => {
    if (resetting) return;
    setError('');
    // 若用户自定义密码，前端做一次轻量校验（后端 class-validator 会再校验一次）
    if (resetPassword && !/^(?=.*[a-zA-Z])(?=.*\d).{8,32}$/.test(resetPassword)) {
      setError('密码需 8-32 位且含字母+数字');
      return;
    }
    setResetting(true);
    try {
      const payload = resetPassword ? { password: resetPassword } : {};
      const result = await adminService.resetStaffPassword(staff.id, payload);
      setCreatedPassword(result.newPassword);
      setResettingId(null);
      setResetPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">员工列表（{list.length}）</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primaryHover"
        >
          {showAdd ? '取消' : '+ 添加员工'}
        </button>
      </div>

      {(error || loadError) && <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error || loadError}</div>}

      {/* 新增表单 */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="mb-4 space-y-3 rounded-lg border border-primary/30 bg-primaryLight/30 p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">手机号 *</label>
              <input
                type="tel"
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                placeholder="11 位手机号"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">用户名</label>
              <input
                type="text"
                value={newStaff.username}
                onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">初始密码（新用户必填）</label>
              <input
                type="text"
                value={newStaff.password}
                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                placeholder="8-32 位，含字母+数字"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">角色</label>
              <select
                value={newStaff.role}
                onChange={(e) =>
                  setNewStaff({ ...newStaff, role: e.target.value as typeof newStaff.role })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={adding}
              >
                <option value="admin">管理员</option>
                <option value="clerk">店员</option>
                <option value="viewer">查询员</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            若手机号已存在账号，将复用并建立本驿站员工关系（无需填密码）；否则创建新用户。
          </p>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primaryHover disabled:opacity-60"
          >
            {adding ? '添加中...' : '确认添加'}
          </button>
        </form>
      )}

      {/* 新建用户后的初始密码提示 */}
      {createdPassword && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="font-medium text-warning">新密码（请转交并提示尽快修改）：</div>
          <div className="mt-1 select-all font-mono text-base tracking-wider text-gray-800">
            {createdPassword}
          </div>
          <button
            onClick={() => setCreatedPassword(null)}
            className="mt-2 text-xs text-gray-500 underline"
          >
            我已记录，关闭
          </button>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">加载中...</div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">暂无员工</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">姓名</th>
                <th className="px-3 py-2 text-left font-medium">手机号</th>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">加入时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((s) => (
                <React.Fragment key={s.id}>
                <tr className={s.status === 'disabled' ? 'bg-gray-50/50' : ''}>
                  <td className="px-3 py-2 text-gray-800">
                    {editingId === s.id ? (
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      s.username || '-'
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{s.phone}</td>
                  <td className="px-3 py-2">
                    {editingId === s.id ? (
                      <select
                        value={editRole}
                        onChange={(e) =>
                          setEditRole(e.target.value as 'admin' | 'clerk' | 'viewer')
                        }
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      >
                        <option value="admin">管理员</option>
                        <option value="clerk">店员</option>
                        <option value="viewer">查询员</option>
                      </select>
                    ) : (
                      <span className="rounded bg-primaryLight px-2 py-0.5 text-xs text-primary">
                        {roleLabel[s.role] || s.role}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        s.status === 'active'
                          ? 'bg-success/10 text-success'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {s.status === 'active' ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {s.joinedAt ? new Date(s.joinedAt).toLocaleDateString('zh-CN') : '-'}
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
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-primary hover:underline"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => startReset(s)}
                          className="text-xs text-primary hover:underline"
                        >
                          重置密码
                        </button>
                        <button
                          onClick={() => handleToggleStatus(s)}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          {s.status === 'active' ? '禁用' : '启用'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {/* 重置密码行内表单 */}
                {resettingId === s.id && (
                  <tr className="bg-warning/5">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-600">新密码：</span>
                        <input
                          type="text"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          placeholder="留空将生成 8 位随机密码"
                          className="w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary"
                          disabled={resetting}
                        />
                        <button
                          onClick={() => handleResetPassword(s)}
                          disabled={resetting}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:bg-primaryHover disabled:opacity-60"
                        >
                          {resetting ? '重置中...' : '确认重置'}
                        </button>
                        <button
                          onClick={() => {
                            setResettingId(null);
                            setResetPassword('');
                          }}
                          disabled={resetting}
                          className="text-xs text-gray-500 hover:underline disabled:opacity-60"
                        >
                          取消
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-gray-500">
                        8-32 位含字母+数字；重置后该员工所有设备将立即下线，需使用新密码重新登录。
                      </p>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StaffTab;
