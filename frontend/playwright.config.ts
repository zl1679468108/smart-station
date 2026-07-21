import { defineConfig, devices } from '@playwright/test';

// Playwright 配置：智能快递驿站前端 E2E 测试
// 测试通过 route 拦截 mock 后端 API，独立于后端运行
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // 共享 localStorage，串行更稳定
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:3031',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 8_000,
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 不启动 webServer：测试需手动启动 dev server（npm run start）
  // 因为端口可能被占用切换（如 3031 → 3032），手动启动更灵活
});
