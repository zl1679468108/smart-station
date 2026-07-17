import React, { useState, useMemo } from 'react';
import Icon, { IconName } from '@/components/ui/Icon';
import { useAuth } from '@/utils/auth';
import StationTab from './tabs/StationTab';
import StaffTab from './tabs/StaffTab';
import ShelfTab from './tabs/ShelfTab';
import CourierTab from './tabs/CourierTab';
import VersionTab from './tabs/VersionTab';
import StationLayoutTab from './tabs/StationLayoutTab';

type TabKey = 'station' | 'stationLayout' | 'staff' | 'shelves' | 'couriers' | 'version';
type Role = 'admin' | 'clerk' | 'viewer';

// 全部 Tab 配置；roles 字段控制可见角色：
// - 驿站信息/货架/快递公司/版本说明/仓库布局：admin + clerk（店员只读，写操作按钮在 Tab 内按角色显隐）
// - 员工管理：仅 admin（员工信息敏感，店员不可见）
const allTabs: { key: TabKey; label: string; icon: IconName; roles: Role[] }[] = [
  { key: 'station', label: '驿站信息', icon: 'box', roles: ['admin', 'clerk'] },
  { key: 'stationLayout', label: '仓库布局', icon: 'inbox', roles: ['admin', 'clerk'] },
  { key: 'staff', label: '员工管理', icon: 'user', roles: ['admin'] },
  { key: 'shelves', label: '货架管理', icon: 'inbox', roles: ['admin', 'clerk'] },
  { key: 'couriers', label: '快递公司', icon: 'package', roles: ['admin', 'clerk'] },
  { key: 'version', label: '版本说明', icon: 'settings', roles: ['admin', 'clerk'] },
];

// 系统管理页：Tab 切换子模块
// 路由守卫已限制 admin + clerk 可进入；店员可见部分 Tab，写操作按钮在 Tab 内按 canManageSystem 显隐
const System: React.FC = () => {
  const { user } = useAuth();
  const role = (user?.role as Role) || null;

  // 按角色过滤可见 Tab
  const tabs = useMemo(() => {
    if (!role) return allTabs;
    return allTabs.filter((t) => t.roles.includes(role));
  }, [role]);

  // 默认选中第一个可见 Tab
  const [active, setActive] = useState<TabKey>(tabs[0]?.key || 'station');

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-lg font-semibold text-gray-800">系统管理</h1>

      {/* Tab 头 */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="min-h-[400px]">
        {active === 'station' && <StationTab />}
        {active === 'stationLayout' && <StationLayoutTab />}
        {active === 'staff' && <StaffTab />}
        {active === 'shelves' && <ShelfTab />}
        {active === 'couriers' && <CourierTab />}
        {active === 'version' && <VersionTab />}
      </div>
    </div>
  );
};

export default System;
