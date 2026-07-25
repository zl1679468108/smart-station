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
    await expect(page.getByText(/扫描完成：标记滞留 2/).first()).toBeVisible();
  });

  test('单件发提醒使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/overdue');
    await expect(page.getByText('ZTO9876543210')).toBeVisible({ timeout: 8000 });
    const firstItem = page.locator('.space-y-2 > div').filter({ hasText: 'ZTO9876543210' });
    await firstItem.getByRole('button', { name: '发提醒' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '补发滞留提醒' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/运单 ZTO9876543210/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认发送' }).click();
    await expect(page.getByText('单件提醒触达')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('滞留提醒已私信到客户微信').first()).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
  });

  test('本页发提醒使用页面内确认弹窗', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/overdue');
    await expect(page.getByText('ZTO9876543210')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /本页发提醒/ }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '本页批量发提醒' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/对本页 3 条滞留件/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认发送' }).click();
    await expect(page.getByText('本页批量提醒触达（3 条）')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('已发送 3 条滞留提醒').first()).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
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
