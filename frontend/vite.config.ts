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
  build: {
    rollupOptions: {
      output: {
        // 将 3D 相关重依赖拆成独立 chunk，减轻 /query 与其它页面主包体积
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // 合并 three 生态，避免 three-fx ↔ three-vendor 循环依赖
          if (
            id.includes('/three/') ||
            id.includes('/@react-three/') ||
            id.includes('/three-stdlib/') ||
            id.includes('/postprocessing/') ||
            id.includes('/gsap/')
          ) {
            return 'three-vendor';
          }
          return undefined;
        },
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
