// 工作台 Dashboard E2E 测试
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn, DASHBOARD_DATA } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

test.describe('工作台概览', () => {
  test('显示 5 张概览卡片及数据', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('工作台').first()).toBeVisible();

    // 用 exact 匹配避免匹配到「今日入库/出库趋势」
    await expect(page.getByText('今日入库', { exact: true })).toBeVisible();
    await expect(page.getByText('今日出库', { exact: true })).toBeVisible();
    await expect(page.getByText('当前在库', { exact: true })).toBeVisible();
    await expect(page.getByText('当前滞留', { exact: true })).toBeVisible();
    await expect(page.getByText('当前异常', { exact: true })).toBeVisible();

    // 检查数据值（在卡片内）
    const inboundCard = page.locator('div', { hasText: '今日入库' }).filter({ has: page.locator('.text-2xl') }).first();
    await expect(inboundCard).toBeVisible();
  });

  test('显示环比数据', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByText(/昨日/).first()).toBeVisible();
  });

  test('显示趋势图 SVG', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('heading', { name: '今日入库/出库趋势' })).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible();
    // 图例：入库/出库（在趋势图容器内）
    const chartContainer = page.locator('.overflow-x-auto').first();
    await expect(chartContainer.getByText('入库').first()).toBeVisible();
    await expect(chartContainer.getByText('出库').first()).toBeVisible();
  });
});

test.describe('待办提醒', () => {
  test('显示超期待提醒卡片', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('待办提醒', { exact: true })).toBeVisible();
    await expect(page.getByText('超期待提醒', { exact: true })).toBeVisible();
    // 用 button 容器定位数字，避免 getByText('3') 匹配到多个元素
    const overdueBtn = page.locator('button', { hasText: '超期待提醒' });
    await expect(overdueBtn.locator('.text-warning')).toHaveText(
      DASHBOARD_DATA.todo.overdueWarn.toString(),
    );
  });

  test('显示异常件未处理卡片', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    const exceptionBtn = page
      .getByRole('button', { name: /异常件未处理/ })
      .filter({ hasText: '去处理' });
    await expect(exceptionBtn).toBeVisible();
    await expect(exceptionBtn).toContainText(DASHBOARD_DATA.todo.exceptionUnresolved.toString());
  });

  test('点击超期待提醒跳转滞留件列表', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await page.getByText('超期待提醒', { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/overdue/);
  });

  test('点击异常件跳转异常件列表', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await page
      .getByRole('button', { name: /异常件未处理/ })
      .filter({ hasText: '去处理' })
      .click();
    await expect(page).toHaveURL(/\/admin\/exception/);
  });
});

test.describe('Dashboard 异常处理', () => {
  test('接口失败显示错误提示', async ({ page }) => {
    await page.route('**/api/stats/dashboard', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '加载失败', data: null }),
      });
    });

    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('加载失败')).toBeVisible();
  });
});
