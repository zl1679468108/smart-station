import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/utils/auth';
import * as authService from '@/services/auth';

// 密码修改页：旧密码 + 新密码 + 确认新密码
// 新密码规则：8-32 位，需含字母+数字，且不能与旧密码相同
// 修改成功后销毁全部会话，需重新登录
const Password: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validate = (): string | null => {
    if (!oldPassword) return '请输入旧密码';
    if (!newPassword) return '请输入新密码';
    if (newPassword.length < 8 || newPassword.length > 32) return '新密码需 8-32 位';
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(newPassword)) return '新密码需包含字母和数字';
    if (newPassword === oldPassword) return '新密码不能与旧密码相同';
    if (newPassword !== confirmPassword) return '两次输入的新密码不一致';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword({ oldPassword, newPassword });
      // 后端已销毁全部会话，前端清除本地态并跳登录页
      await logout();
      alert('密码修改成功，请重新登录');
      navigate('/admin/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">修改密码</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">旧密码</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-400">8-32 位，需含字母和数字</p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={saving}
            />
          </div>

          {error && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          )}

          <div className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            修改密码后会自动退出登录，需使用新密码重新登录。
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
            >
              {saving ? '提交中...' : '确认修改'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default Password;
