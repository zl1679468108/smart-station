import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

// 移动 H5 布局：顶部返回栏
const MLayout: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex h-12 items-center border-b border-gray-200 bg-white px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-600"
        >
          <span>‹</span>
          <span>返回</span>
        </button>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default MLayout;
