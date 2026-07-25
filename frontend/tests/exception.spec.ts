// 异常件管理 E2E 测试（M24.6）
import { test, expect } from '@playwright/test';
import { EXCEPTION_ITEMS, mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

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

  test('补发到件使用页面内确认弹窗，失败后显示再发入口', async ({ page }) => {
    await page.route('**/api/exception**', (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() !== 'GET' || !url.pathname.endsWith('/api/exception')) {
        return route.fallback();
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'OK',
          data: {
            items: [
              {
                ...EXCEPTION_ITEMS[0],
                parcel: { ...EXCEPTION_ITEMS[0].parcel!, status: 'in_stock' },
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
        }),
      });
    });
    await page.route('**/api/inbound/*/resend-notice', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '模拟私信失败', data: null }),
      });
    });
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/exception');
    await expect(page.getByText('外包装严重破损，内部物品可能受损')).toBeVisible();
    await page.getByRole('button', { name: '补发到件' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '补发到件通知' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/运单 YTO1111222233/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认补发' }).click();
    await expect(page.getByText('补发回执：补发失败，可再发一次')).toBeVisible();
    await expect(page.getByRole('button', { name: '再发一次' })).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
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
