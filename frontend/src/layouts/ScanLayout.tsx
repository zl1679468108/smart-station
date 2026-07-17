import React from 'react';
import { Outlet } from 'react-router-dom';

// 出库扫描机布局：全屏，顶部状态条
const ScanLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen flex-col bg-gray-900">
      <header className="flex h-10 items-center justify-between bg-black px-6 text-sm text-white">
        <span>智能快递驿站 · 出库扫描机</span>
        <span className="text-gray-400">在线</span>
      </header>
      <main className="flex flex-1 items-center justify-center overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
};

export default ScanLayout;
