// 财务结算 E2E 测试（M25.6）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('财务结算（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('月结账单列表显示公司与净额', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await expect(page.getByRole('heading', { name: '财务结算' })).toBeVisible();
    await expect(page.getByText('顺丰速运').first()).toBeVisible();
    await expect(page.getByText('中通快递').first()).toBeVisible();
  });

  test('admin 显示生成账单按钮', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await expect(page.getByRole('button', { name: '生成账单' })).toBeVisible();
  });

  test('生成账单后提示结果', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await page.getByRole('button', { name: '生成账单' }).click();
    await expect(page.getByText(/已生成 2 张账单/)).toBeVisible();
  });

  test('打开账单明细弹窗', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await page.getByRole('button', { name: '明细' }).first().click();
    await expect(page.getByRole('heading', { name: '账单明细' })).toBeVisible();
  });

  test('打开对账弹窗并确认', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await page.getByRole('button', { name: '对账' }).first().click();
    await expect(page.getByRole('heading', { name: '账单对账' })).toBeVisible();
    await page.getByRole('button', { name: '确认对账' }).click();
    await expect(page.getByRole('heading', { name: '财务结算' })).toBeVisible();
  });

  test('切换到费率配置 Tab 显示费率', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await page.getByRole('button', { name: '费率配置' }).click();
    await expect(page.getByText('顺丰速运').first()).toBeVisible();
  });
});

test.describe('财务结算（clerk 非管理员）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'clerk');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'clerk');
  });

  test('clerk 不显示生成账单按钮', async ({ page }) => {
    await page.goto('/#/admin/finance');
    await expect(page.getByRole('heading', { name: '财务结算' })).toBeVisible();
    await expect(page.getByRole('button', { name: '生成账单' })).toHaveCount(0);
  });
});
