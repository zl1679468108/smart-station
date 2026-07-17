import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/utils/auth';
import Icon from '@/components/ui/Icon';

type Role = 'admin' | 'clerk' | 'viewer';

interface RequireRoleProps {
  /** 允许访问的角色列表 */
  roles: Role[];
  children: React.ReactNode;
}

/**
 * 角色路由守卫
 * 用于保护需要特定角色才能访问的路由（如 /admin/system 仅 admin）
 *
 * - 未登录：重定向到登录页
 * - 已登录但角色不匹配：渲染无权限提示页（带返回工作台按钮）
 * - 角色匹配：渲染子路由
 *
 * 注意：这是前端 UX 层防护，后端接口仍需 @Roles() / AdminGuard 做真实拦截
 */
const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        加载中...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  // user.role 为 null 时（异常情况）放行，交给后端拦截
  if (user.role && !roles.includes(user.role as Role)) {
    const roleLabel: Record<string, string> = {
      admin: '管理员',
      clerk: '店员',
      viewer: '查询员',
    };
    const allowedLabel = roles.map((r) => roleLabel[r]).join('、');
    const currentLabel = roleLabel[user.role] || user.role;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <Icon name="lock" size={48} className="text-gray-300" />
        <h2 className="text-lg font-medium text-gray-700">无权限访问该页面</h2>
        <p className="max-w-sm text-sm text-gray-500">
          当前页面仅 <span className="font-medium text-gray-700">{allowedLabel}</span> 可访问，
          你的当前角色是 <span className="font-medium text-primary">{currentLabel}</span>。
          如需访问，请联系管理员调整角色。
        </p>
        <button
          onClick={() => navigate('/admin/dashboard', { replace: true })}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primaryHover"
        >
          返回工作台
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireRole;
