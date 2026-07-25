// 寄件管理 E2E 测试（M25.6）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('寄件管理（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('寄件单列表显示单号与状态', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await expect(page.getByRole('heading', { name: '寄件管理' })).toBeVisible();
    await expect(page.getByText('JJ20260715000001')).toBeVisible();
    await expect(page.getByText('待处理').first()).toBeVisible();
    await expect(page.getByText('已取件').first()).toBeVisible();
  });

  test('状态 Tab 过滤只显示待处理', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await page.getByRole('button', { name: '待处理', exact: true }).click();
    await expect(page.getByText('JJ20260715000001')).toBeVisible();
    await expect(page.getByText('JJ20260716000002')).toHaveCount(0);
  });

  test('打开寄件下单弹窗并试算运费', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await page.getByRole('button', { name: '寄件下单' }).click();
    await expect(page.getByRole('heading', { name: '寄件下单' })).toBeVisible();
    // 选择快递公司后再试算（未选会提示错误）
    await page.locator('select').first().selectOption('c-001');
    await page.getByRole('button', { name: /试算/ }).first().click();
    await expect(page.getByText(/首重/).first()).toBeVisible();
  });

  test('切换到地址簿 Tab 显示地址', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await page.getByRole('button', { name: '地址簿' }).click();
    await expect(page.getByText('北京市朝阳区测试路 1 号')).toBeVisible();
    await expect(page.getByText('上海市浦东新区示范街 2 号')).toBeVisible();
  });

  test('取消寄件单使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/shipping');
    await expect(page.getByText('JJ20260715000001')).toBeVisible({ timeout: 8000 });
    const firstOrder = page.locator('.rounded-xl').filter({ hasText: 'JJ20260715000001' }).first();
    await firstOrder.getByRole('button', { name: '取消' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '取消寄件单' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/JJ20260715000001/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认取消' }).click();
    await expect(
      page.locator('main').getByText('寄件单 JJ20260715000001 已更新为「已取消」'),
    ).toBeVisible({ timeout: 8000 });
    await expect(firstOrder.getByText('已取消').first()).toBeVisible({ timeout: 8000 });
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('寄件管理（clerk 可写）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'clerk');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'clerk');
  });

  test('clerk 显示寄件下单按钮', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await expect(page.getByRole('heading', { name: '寄件管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '寄件下单' })).toBeVisible();
  });
});

test.describe('寄件管理（viewer 无权限）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'viewer');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'viewer');
  });

  test('viewer 被路由守卫拦截', async ({ page }) => {
    await page.goto('/#/admin/shipping');
    await expect(page.getByText('无权限访问该页面')).toBeVisible();
    await expect(page.getByRole('button', { name: '寄件下单' })).toHaveCount(0);
  });
});
