import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './utils/auth';
import { LoadingProvider } from './utils/loading';
import './styles/globals.scss';

// React Query：默认缓存 5 分钟，避免短时间内重复请求
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  },
});

// 注意：不使用 React.StrictMode。
// StrictMode 在开发模式下会故意双次执行 useEffect，本项目数据获取基于
// useEffect + 手动 fetch（非 useQuery），双执行会导致每个接口被调用两次。
// 生产构建不受影响。如需恢复 StrictMode 的开发期检查，可重新包裹。
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <HashRouter>
      <AuthProvider>
        <LoadingProvider>
          <App />
        </LoadingProvider>
      </AuthProvider>
    </HashRouter>
  </QueryClientProvider>,
);
