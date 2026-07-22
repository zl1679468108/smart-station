// 滞留件管理 E2E 测试（M24.6）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('滞留件管理（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('列表显示级别徽标与阈值', async ({ page }) => {
    await page.goto('/#/admin/overdue');
    await expect(page.getByRole('heading', { name: '滞留件管理' })).toBeVisible();
    await expect(page.getByText(/阈值：预警/)).toBeVisible();
    await expect(page.getByText('预警 · 6 天')).toBeVisible();
    await expect(page.getByText('提醒 · 11 天')).toBeVisible();
    await expect(page.getByText('待退回 · 18 天')).toBeVisible();
  });

  test('级别 Tab 过滤只显示对应级别', async ({ page }) => {
    await page.goto('/#/admin/overdue');
    await page.getByRole('button', { name: /^待退回/ }).click();
    await expect(page).toHaveURL(/level=return/);
    await expect(page.getByText('待退回 · 18 天')).toBeVisible();
    await expect(page.getByText('预警 · 6 天')).toHaveCount(0);
  });

  test('立即扫描后提示扫描结果', async ({ page }) => {
    await page.goto('/#/admin/overdue');
    await page.getByRole('button', { name: '立即扫描' }).click();
    await expect(page.getByText(/扫描完成：标记滞留 2/)).toBeVisible();
  });

  test('标记退回中', async ({ page }) => {
    await page.goto('/#/admin/overdue');
    await page.getByRole('button', { name: '标记退回中' }).first().click();
    await expect(page.getByRole('heading', { name: '滞留件管理' })).toBeVisible();
  });
});

test.describe('滞留件管理（viewer 只读）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'viewer');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'viewer');
  });

  test('viewer 不显示扫描与退回按钮', async ({ page }) => {
    await page.goto('/#/admin/overdue');
    await expect(page.getByRole('heading', { name: '滞留件管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '立即扫描' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '标记退回中' })).toHaveCount(0);
  });
});
