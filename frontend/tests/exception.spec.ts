// 异常件管理 E2E 测试（M24.6）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('异常件管理（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('列表显示类型与状态标签', async ({ page }) => {
    await page.goto('/#/admin/exception');
    await expect(page.getByRole('heading', { name: '异常件管理' })).toBeVisible();
    await expect(page.getByText('外包装严重破损，内部物品可能受损')).toBeVisible();
    await expect(page.locator('span', { hasText: '破损' }).first()).toBeVisible();
    await expect(page.locator('span', { hasText: '已登记' }).first()).toBeVisible();
  });

  test('状态筛选只显示处理中', async ({ page }) => {
    await page.goto('/#/admin/exception');
    await page.locator('select').first().selectOption('processing');
    await expect(page.getByText('包裹在库丢失，多次查找未果')).toBeVisible();
    await expect(page.getByText('外包装严重破损，内部物品可能受损')).toHaveCount(0);
  });

  test('打开登记异常弹窗', async ({ page }) => {
    await page.goto('/#/admin/exception');
    await page.getByRole('button', { name: '登记异常' }).click();
    await expect(page.getByText('异常类型')).toBeVisible();
    await expect(page.getByPlaceholder('运单号/取件码/手机号')).toBeVisible();
  });

  test('打开处理异常弹窗并保存', async ({ page }) => {
    await page.goto('/#/admin/exception');
    await page.getByRole('button', { name: '处理' }).first().click();
    await expect(page.getByRole('heading', { name: '处理异常' })).toBeVisible();
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByRole('heading', { name: '异常件管理' })).toBeVisible();
  });
});

test.describe('异常件管理（viewer 只读）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'viewer');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'viewer');
  });

  test('viewer 不显示登记与处理按钮', async ({ page }) => {
    await page.goto('/#/admin/exception');
    await expect(page.getByRole('heading', { name: '异常件管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '登记异常' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '处理' })).toHaveCount(0);
  });
});
