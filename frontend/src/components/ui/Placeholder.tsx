import React from 'react';
import EmptyState from './EmptyState';

interface PlaceholderProps {
  title: string;
  description?: string;
}

// 通用占位组件：用于未实现的页面，复用全局 EmptyState
const Placeholder: React.FC<PlaceholderProps> = ({ title, description = '开发中' }) => {
  return <EmptyState title={title} description={description} />;
};

export default Placeholder;
