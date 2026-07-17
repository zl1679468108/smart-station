import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/utils/auth';
import Icon from '@/components/ui/Icon';

// 登录页：账号（手机号或邮箱）+ 密码，对接 /api/auth/login
const Login: React.FC = () => {
  const { user, initializing, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 来源页（守卫重定向时携带），登录成功后回跳
  const from = (location.state as { from?: string })?.from || '/admin/dashboard';

  // 已登录则跳走（避免已登录还能看到登录页）
  useEffect(() => {
    if (!initializing && user) {
      navigate(from, { replace: true });
    }
  }, [user, initializing, from, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (!account.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      await login(account.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primaryLight to-gray-100 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
            <Icon name="box" size={26} />
          </div>
          <h1 className="text-xl font-bold text-gray-800">智能快递驿站</h1>
          <p className="mt-1 text-sm text-gray-500">工作人员登录</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">账号</label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="手机号或邮箱"
              autoComplete="username"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              disabled={loading}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm outline-none transition-colors focus:border-primary"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || initializing}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
