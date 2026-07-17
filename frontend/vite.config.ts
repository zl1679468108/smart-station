import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3031,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      // 用 decodeURIComponent 解码，避免路径含中文（如「前端」）时被 URL 编码导致找不到目录
      '@': decodeURIComponent(new URL('./src', import.meta.url).pathname),
    },
  },
});
