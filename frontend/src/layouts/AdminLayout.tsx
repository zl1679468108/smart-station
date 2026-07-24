import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/utils/auth';
import Icon, { IconName } from '@/components/ui/Icon';
import Logo from '@/components/brand/Logo';

type Role = 'admin' | 'clerk' | 'viewer';

// 工作人员后台侧边栏菜单项
// roles 字段控制可见角色（按 PRD 4.12.2 角色权限边界）：
// - 工作台：全员可见
// - 入库/出库：admin + clerk
// - 库存查询：全员可见（viewer 只读）
// - 系统管理：admin + clerk（店员可查看驿站信息/货架/快递公司/版本说明，写操作仅 admin）
const menuItems: { path: string; label: string; icon: IconName; roles: Role[] }[] = [
  { path: '/admin/dashboard', label: '工作台', icon: 'dashboard', roles: ['admin', 'clerk', 'viewer'] },
  { path: '/admin/inbound', label: '入库管理', icon: 'inbox', roles: ['admin', 'clerk'] },
  { path: '/admin/inventory', label: '库存查询', icon: 'search', roles: ['admin', 'clerk', 'viewer'] },
  { path: '/admin/outbound', label: '出库管理', icon: 'outbound', roles: ['admin', 'clerk'] },
  { path: '/admin/overdue', label: '滞留件', icon: 'clock', roles: ['admin', 'clerk', 'viewer'] },
  { path: '/admin/exception', label: '异常件', icon: 'alert', roles: ['admin', 'clerk', 'viewer'] },
  { path: '/admin/shipping', label: '寄件管理', icon: 'send', roles: ['admin', 'clerk'] },
  { path: '/admin/finance', label: '财务结算', icon: 'wallet', roles: ['admin', 'clerk'] },
  { path: '/admin/stats', label: '数据统计', icon: 'chart', roles: ['admin', 'clerk'] },
  { path: '/admin/shifts', label: '交接班', icon: 'user', roles: ['admin', 'clerk'] },
  { path: '/admin/appointments', label: '预约取件', icon: 'clock', roles: ['admin', 'clerk'] },
  { path: '/admin/system', label: '系统管理', icon: 'settings', roles: ['admin', 'clerk'] },
];

// 工作人员后台布局：PC 左侧边栏 + 顶部用户菜单 + 主内容区；平板底部 TabBar
const AdminLayout: React.FC = () => {
  const { user, stations, currentStationId, initializing, logout, switchStation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stationOpen, setStationOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const stationRef = useRef<HTMLDivElement>(null);

  // 点外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (stationRef.current && !stationRef.current.contains(e.target as Node)) setStationOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 守卫：初始化中显示 loading；未登录跳登录页并记录来源
  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        加载中...
      </div>
    );
  }
  if (!user) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  const handleSwitchStation = async (stationId: string) => {
    if (stationId === currentStationId) {
      setStationOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await switchStation(stationId);
      setStationOpen(false);
    } catch {
      // 接口错误已由全局 notification 统一提示
    } finally {
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/admin/login', { replace: true });
    } finally {
      setLoggingOut(false);
      setLogoutConfirm(false);
    }
  };

  const currentStation = stations.find((s) => s.id === currentStationId);
  const userInitial = (user.username || user.phone || 'U').charAt(0).toUpperCase();
  const roleLabel: Record<string, string> = {
    admin: '管理员',
    clerk: '店员',
    viewer: '查询员',
  };

  // 按当前用户角色过滤菜单项（user.role 可能为 null，此时展示全部）
  const visibleMenuItems =
    user.role && user.role.length > 0
      ? menuItems.filter((item) => item.roles.includes(user.role as Role))
      : menuItems;

  return (
    <div className="flex h-screen flex-col bg-gray-50 lg:flex-row">
      {/* PC 侧边栏 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex h-14 items-center px-5">
          <Logo variant="full" size={28} title="Smart Station" />
        </div>
        <nav className="flex-1 py-2">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-primaryLight font-medium text-primary'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 自助查询入口：admin + clerk 可见，新窗口打开 /#/query（公开页面，无需登录） */}
        {user.role && ['admin', 'clerk'].includes(user.role as Role) && (
          <div className="border-t border-gray-200 p-3">
            <a
              href="/#/query"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-primary"
              title="在新窗口打开取件自助查询页"
            >
              <Icon name="externalLink" size={18} />
              <span>自助查询</span>
            </a>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 顶部用户菜单 */}
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
          {/* 左：当前驿站切换 */}
          <div className="relative" ref={stationRef}>
            {stations.length > 0 && (
              <button
                onClick={() => setStationOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Logo size={16} className="shrink-0" />
                <span className="font-medium">
                  {currentStation?.name || '选择驿站'}
                </span>
                {stations.length > 1 && (
                  <Icon name="chevronDown" size={14} className="text-gray-400" />
                )}
              </button>
            )}
            {stationOpen && stations.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {stations.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSwitchStation(s.id)}
                    disabled={switching}
                    className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-gray-50 ${
                      s.id === currentStationId ? 'text-primary' : 'text-gray-700'
                    }`}
                  >
                    <span>{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      {roleLabel[s.role] || s.role}
                      {s.id === currentStationId && <Icon name="check" size={12} className="text-primary" />}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 右：用户菜单 */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primaryLight text-sm font-medium text-primary">
                {userInitial}
              </span>
              <span className="hidden text-sm text-gray-700 sm:inline">{user.username}</span>
              <Icon name="chevronDown" size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <div className="border-b border-gray-100 px-3 py-2">
                  <div className="text-sm font-medium text-gray-800">{user.username}</div>
                  <div className="text-xs text-gray-500">{user.phone}</div>
                  {user.role && (
                    <div className="mt-1 inline-block rounded bg-primaryLight px-1.5 py-0.5 text-xs text-primary">
                      {roleLabel[user.role] || user.role}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/admin/profile');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Icon name="user" size={16} />
                  个人资料
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/admin/password');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Icon name="lock" size={16} />
                  修改密码
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setLogoutConfirm(true);
                  }}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
                >
                  <Icon name="logout" size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </header>

        {/* 主内容区 */}
        <main className="page-layout-main flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* 平板底部 TabBar */}
      <nav className="flex border-t border-gray-200 bg-white lg:hidden">
        {visibleMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                isActive ? 'text-primary' : 'text-gray-500'
              }`
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 登出二次确认弹窗 */}
      {logoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-base font-medium text-gray-800">确认退出登录？</h3>
            <p className="mb-4 text-sm text-gray-500">退出后需要重新登录才能使用系统。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLogoutConfirm(false)}
                disabled={loggingOut}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-md bg-danger px-3 py-1.5 text-sm text-white hover:bg-danger/90 disabled:opacity-60"
              >
                {loggingOut ? '退出中...' : '确认退出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
