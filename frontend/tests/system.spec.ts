// 系统管理 E2E 测试
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

test.describe('系统管理 Tab 结构', () => {
  test('admin 显示关键 Tab', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(page.getByRole('heading', { name: '系统管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: /驿站信息/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /门店布局/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /员工管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /货架管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /快递公司/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /通知记录/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /版本说明/ })).toBeVisible();
  });
});

test.describe('驿站信息 Tab', () => {
  test('显示驿站信息', async ({ page }) => {
    await page.goto('/#/admin/system');
    // 驿站信息显示在 input value 中，用 CSS 属性选择器定位
    await expect(page.locator('input[value="测试驿站一"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('input[value="测试地址 100 号"]')).toBeVisible();
    await expect(page.locator('input[value="08:00-22:00"]')).toBeVisible();
  });
});

test.describe('员工管理 Tab', () => {
  test('显示员工列表', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /员工管理/ }).click();
    await expect(page.getByText('管理员').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('店员甲').first()).toBeVisible();
    await expect(page.getByText('13800000001')).toBeVisible();
  });

  test('员工状态操作失败使用统一提醒，不弹原生 alert', async ({ page }) => {
    await page.route('**/api/admin/staff/sf-002/status', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '禁用失败', data: null }),
      });
    });

    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /员工管理/ }).click();
    const clerkRow = page.getByRole('row').filter({ hasText: '店员甲' });
    await expect(clerkRow).toBeVisible({ timeout: 8000 });
    await clerkRow.getByRole('button', { name: '禁用' }).click();

    await expect(page.getByRole('alert').getByText('操作失败')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('禁用失败').first()).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('货架管理 Tab', () => {
  test('显示货架列表', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /货架管理/ }).click();
    // 货架号显示为"1号"（无空格）
    await expect(page.getByText('1号').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('小件').first()).toBeVisible();
    await expect(page.getByText('5号')).toBeVisible();
    await expect(page.getByText('中件').first()).toBeVisible();
  });

  test('货架状态展示', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /货架管理/ }).click();
    // 启用/禁用状态
    await expect(page.getByText('启用').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('快递公司 Tab', () => {
  test('显示快递公司列表', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /快递公司/ }).click();
    await expect(page.getByText('顺丰速运')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('中通快递')).toBeVisible();
    await expect(page.getByText('SF').first()).toBeVisible();
  });

  test('状态色块展示', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /快递公司/ }).click();
    await expect(page.getByText('启用').first()).toBeVisible({ timeout: 10000 });
    // 圆通速递为 disabled 状态
    await expect(page.getByText('禁用').first()).toBeVisible();
  });
});

test.describe('通知记录 Tab', () => {
  test('重新发送通知使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/system?tab=notify');
    await page.getByRole('button', { name: /发送记录/ }).click();
    await expect(page.getByText('到件通知').first()).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: '重新发送' }).first().click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('重新发送通知')).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/确认向 138\*\*\*\*1234/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认重发' }).click();
    await expect(page.getByText(/取件码已私信到客户微信/)).toBeVisible({ timeout: 8000 });
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('版本说明 Tab', () => {
  test('显示系统介绍', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /版本说明/ }).click();
    // 系统名称在 h2 中
    await expect(page.getByRole('heading', { name: '智能快递驿站' })).toBeVisible({ timeout: 8000 });
    // 版本号显示为"v1.2.1"（exact 匹配避免匹配多处）
    await expect(page.getByText('v1.2.1', { exact: true })).toBeVisible();
  });

  test('显示版本日志', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /版本说明/ }).click();
    await expect(page.getByText('版本更新日志')).toBeVisible({ timeout: 8000 });
    // 最新版本（1.2.1）日志条目
    await expect(page.getByText('/query 门户顶部展示当前驿站信息')).toBeVisible();
  });

  test('显示近 3 个版本（1.2.8 / 1.2.1 / 1.2.0）', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /版本说明/ }).click();
    await expect(page.getByText('v1.2.8', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('v1.2.1', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('v1.2.0', { exact: true })).toBeVisible();
    await expect(page.getByText('v1.1.0', { exact: true })).toBeHidden();
    await expect(page.getByText('v1.0.0', { exact: true })).toBeHidden();
  });
});

test.describe('默认 Tab 与切换', () => {
  test('默认选中驿站信息 Tab', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(page.getByRole('button', { name: /驿站信息/ })).toHaveClass(/border-primary/);
  });

  test('切换 Tab 后内容更新', async ({ page }) => {
    await page.goto('/#/admin/system');
    // 等待驿站信息加载完成
    await expect(page.locator('input[value="测试驿站一"]')).toBeVisible({ timeout: 8000 });

    // 切换到货架管理
    await page.getByRole('button', { name: /货架管理/ }).click();
    await expect(page.getByText('1号').first()).toBeVisible({ timeout: 10000 });
    // 驿站信息 input 不再显示
    await expect(page.locator('input[value="测试驿站一"]')).toBeHidden();
  });
});
