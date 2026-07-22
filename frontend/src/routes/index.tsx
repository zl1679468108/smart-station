import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from '@/layouts/AdminLayout';
import ScanLayout from '@/layouts/ScanLayout';
import MLayout from '@/layouts/MLayout';
import QueryLayout from '@/layouts/QueryLayout';
import RequireRole from '@/components/RequireRole';

// 四组路由前缀的页面均用 React.lazy 懒加载
const Dashboard = React.lazy(() => import('@/pages/admin/Dashboard'));
const Login = React.lazy(() => import('@/pages/admin/Login'));
const Profile = React.lazy(() => import('@/pages/admin/Profile'));
const Password = React.lazy(() => import('@/pages/admin/Password'));
const System = React.lazy(() => import('@/pages/admin/system/System'));
const Inbound = React.lazy(() => import('@/pages/admin/inbound/Inbound'));
const Inventory = React.lazy(() => import('@/pages/admin/inventory/Inventory'));
const InventoryDetail = React.lazy(() => import('@/pages/admin/inventory/Detail'));
const Outbound = React.lazy(() => import('@/pages/admin/outbound/Outbound'));
const Overdue = React.lazy(() => import('@/pages/admin/overdue/Overdue'));
const Exception = React.lazy(() => import('@/pages/admin/exception/Exception'));
const Shipping = React.lazy(() => import('@/pages/admin/shipping/Shipping'));
const Finance = React.lazy(() => import('@/pages/admin/finance/Finance'));
const Scan = React.lazy(() => import('@/pages/scan/Scan'));
const MHome = React.lazy(() => import('@/pages/m/Home'));
const QueryHome = React.lazy(() => import('@/pages/query/Home'));

const Loading: React.FC = () => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500">加载中...</div>
);

// 路由配置：/admin/* /scan/* /m/* /query/* 四组，根路径重定向到工作台
// /admin/login 独立于 AdminLayout，避免被路由守卫拦截
export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />

        {/* 登录页独立，不进 AdminLayout */}
        <Route path="/admin/login" element={<Login />} />

        {/* 工作人员后台（守卫在 AdminLayout 内） */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="password" element={<Password />} />

          {/* 入库管理：admin + clerk */}
          <Route
            path="inbound"
            element={
              <RequireRole roles={['admin', 'clerk']}>
                <Inbound />
              </RequireRole>
            }
          />
          {/* 库存查询：全员可读（含 viewer 只读） */}
          <Route path="inventory" element={<Inventory />} />
          <Route path="inventory/:id" element={<InventoryDetail />} />
          {/* 出库管理：admin + clerk */}
          <Route
            path="outbound"
            element={
              <RequireRole roles={['admin', 'clerk']}>
                <Outbound />
              </RequireRole>
            }
          />
          {/* 滞留件 / 异常件：全员可读，写操作页内按 canWrite 控制 */}
          <Route path="overdue" element={<Overdue />} />
          <Route path="exception" element={<Exception />} />
          {/* 寄件管理：admin + clerk */}
          <Route
            path="shipping"
            element={
              <RequireRole roles={['admin', 'clerk']}>
                <Shipping />
              </RequireRole>
            }
          />
          {/* 财务结算：admin + clerk（费率/生成/对账仅 admin，页内控制） */}
          <Route
            path="finance"
            element={
              <RequireRole roles={['admin', 'clerk']}>
                <Finance />
              </RequireRole>
            }
          />
          {/* 系统管理：admin + clerk（店员可查看驿站信息/货架/快递公司/版本说明，写操作仅 admin） */}
          <Route
            path="system"
            element={
              <RequireRole roles={['admin', 'clerk']}>
                <System />
              </RequireRole>
            }
          />
        </Route>

        {/* 取件自助查询已合并到 /query 门户 */}

        {/* 出库扫描机 */}
        <Route path="/scan" element={<ScanLayout />}>
          <Route index element={<Scan />} />
        </Route>

        {/* 移动 H5 */}
        <Route path="/m" element={<MLayout />}>
          <Route index element={<MHome />} />
        </Route>

        {/* 用户自助查询门户（1.1.0 新增，三端统一入口） */}
        <Route path="/query" element={<QueryLayout />}>
          <Route index element={<QueryHome />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
