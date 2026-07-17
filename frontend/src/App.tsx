import React from 'react';
import { AppRoutes } from './routes';

const App: React.FC = () => {
  // 路由配置见 src/routes/index.tsx，四组路由前缀均懒加载
  return <AppRoutes />;
};

export default App;
