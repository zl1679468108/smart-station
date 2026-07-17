import React, { useState, useEffect } from 'react';
import { useAuth } from '@/utils/auth';
import * as authService from '@/services/auth';

// 个人资料页：展示手机号/邮箱（只读），可编辑用户名和头像 URL
const Profile: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setMessage(null);
    if (!username.trim()) {
      setMessage({ type: 'error', text: '用户名不能为空' });
      return;
    }
    setSaving(true);
    try {
      await authService.updateProfile({ username: username.trim(), avatarUrl: avatarUrl.trim() || undefined });
      await refreshProfile();
      setMessage({ type: 'success', text: '资料已更新' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : '更新失败',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const userInitial = (user.username || user.phone || 'U').charAt(0).toUpperCase();
  const roleLabel: Record<string, string> = {
    admin: '管理员',
    clerk: '店员',
    viewer: '查询员',
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-lg font-semibold text-gray-800">个人资料</h1>

      <div className="space-y-6">
        {/* 只读信息卡 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-700">账号信息</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primaryLight text-2xl font-medium text-primary">
              {userInitial}
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">手机号</span>
                <span className="text-gray-800">{user.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">邮箱</span>
                <span className="text-gray-800">{user.email || '未绑定'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">角色</span>
                {user.role ? (
                  <span className="rounded bg-primaryLight px-2 py-0.5 text-xs text-primary">
                    {roleLabel[user.role] || user.role}
                  </span>
                ) : (
                  <span className="text-gray-400">未分配</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 可编辑资料卡 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-700">编辑资料</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={100}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">头像 URL</label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-gray-400">留空使用默认首字母头像</p>
            </div>

            {message && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  message.type === 'success'
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryHover disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Profile;
