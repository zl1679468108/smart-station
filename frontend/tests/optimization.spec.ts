// 1.2.8 稳定性优化回归（O1/O3/O5/O8 相关 UI 断言，API 走 mock）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('O5/O9 工作台待办与深链', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('工作台滞留待办点击跳转滞留件管理', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /超期待提醒/ }).click();
    await expect(page).toHaveURL(/\/admin\/overdue/);
    await expect(page.getByRole('heading', { name: '滞留件管理' })).toBeVisible();
  });

  test('工作台异常卡片可点击跳转异常件管理', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '当前异常' }).click();
    await expect(page).toHaveURL(/\/admin\/exception/);
    await expect(page.getByRole('heading', { name: '异常件管理' })).toBeVisible();
  });
});

test.describe('O5 WarehouseScreen 无 TODO 文案', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('数字孪生大屏待办速览不显示 TODO 占位', async ({ page }) => {
    await page.goto('/#/admin/dashboard?view=screen');
    await expect(page.getByText('待办速览')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('待办速览').locator('..')).not.toContainText('TODO');
  });
});

test.describe('版本说明 1.2.8', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('系统管理版本 Tab 显示 1.2.8', async ({ page }) => {
    await page.goto('/#/admin/system');
    // 点击版本说明 Tab（文案可能含「版本」）
    const versionTab = page.getByRole('button', { name: /版本/ }).first();
    if (await versionTab.isVisible().catch(() => false)) {
      await versionTab.click();
    } else {
      // 也可能是 tab role
      await page.getByText('版本说明').click();
    }
    await expect(page.getByText('1.2.8').first()).toBeVisible({ timeout: 8000 });
  });
});
