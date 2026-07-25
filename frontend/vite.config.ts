import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发: base=/  → http://127.0.0.1:3031/#/admin
// 生产构建: base=/smart-station/ → https://zlspace.site/smart-station/#/admin
// 可用 VITE_BASE 覆盖（例如预览子路径：VITE_BASE=/smart-station/ npm run start）
export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE ?? (mode === 'production' ? '/smart-station/' : '/');

  return {
    plugins: [react()],
    base,
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
  };
});
