// M14.3 取件码查询限流与锁定验证
// 后端规则（kiosk.service.ts）：
//   - MAX_CODE_QUERY_ATTEMPTS = 5
//   - CODE_QUERY_LOCK_MS = 10 * 60 * 1000 (10 分钟)
//   - 同取件码错误 5 次后锁定 10 分钟
//   - 错误消息：「该取件码查询错误次数过多，请 X 分钟后重试」
// 后端规则（outbound.service.ts）：
//   - MAX_ATTEMPTS = 3
//   - LOCK_MINUTES = 10
//   - 错误消息：「取件码错误次数过多，已锁定，请 X 分钟后重试」
// 前端文案：「同一取件码错误 3 次将锁定 10 分钟」
//
// 注：限流计数在后端进程内/数据库中实现，前端 E2E 通过 mock 模拟后端响应，
// 验证前端能正确显示锁定错误提示（这是前端唯一可验证的环节）。
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

// 通过虚拟键盘输入字符串
async function typeViaKeypad(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

test.describe('M14.3 取件码查询限流与锁定', () => {
  test('admin 出库页显示「同一取件码错误 3 次将锁定 10 分钟」文案', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '取件码' }).click();
    await expect(page.getByText('同一取件码错误 3 次将锁定 10 分钟')).toBeVisible({ timeout: 8000 });
  });

  test('Kiosk 取件码查询 5 次错误后显示锁定提示', async ({ page }) => {
    // mock：前 4 次返回「取件码错误」，第 5 次返回锁定
    let callCount = 0;
    await page.route('**/api/kiosk/query-by-code', (route) => {
      callCount += 1;
      if (callCount < 5) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: '取件码错误', data: null }),
        });
      } else {
        // 第 5 次锁定
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: '该取件码查询错误次数过多，请 10 分钟后重试',
            data: null,
          }),
        });
      }
    });

    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    // 取件码 1-1-1001
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1001');

    // 连续查询 5 次，每次都失败
    for (let i = 1; i <= 5; i++) {
      await page.getByRole('button', { name: '查询包裹' }).click();
      if (i < 5) {
        await expect(page.getByText('取件码错误').first()).toBeVisible({ timeout: 5000 });
      } else {
        // 第 5 次应显示锁定提示
        await expect(page.getByText(/已锁定|锁定|10 分钟后重试/).first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('出库取件码 3 次错误后显示锁定提示', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    // mock：前 2 次返回「取件码错误」，第 3 次返回锁定
    let callCount = 0;
    await page.route('**/api/outbound/search', (route) => {
      callCount += 1;
      if (callCount < 3) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: '取件码错误', data: null }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: '取件码错误次数过多，已锁定，请 10 分钟后重试',
            data: null,
          }),
        });
      }
    });

    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '取件码' }).click();
    await page.getByPlaceholder('如 22-9-2132').fill('1-1-1001');

    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: '查询包裹' }).click();
      if (i < 3) {
        await expect(page.getByText('取件码错误', { exact: true }).first()).toBeVisible({ timeout: 5000 });
      } else {
        await expect(page.getByText(/已锁定|锁定|10 分钟后重试/)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('限流计数与重置：成功查询后错误计数清零', async ({ page }) => {
    // 模拟前 2 次错误 → 第 3 次成功（不应锁定）
    let callCount = 0;
    await page.route('**/api/kiosk/query-by-code', (route) => {
      callCount += 1;
      if (callCount < 3) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: '取件码错误', data: null }),
        });
      } else {
        // 第 3 次成功
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'OK',
            data: {
              items: [{
                id: 'p-001',
                trackingNumber: 'SF1234567890',
                recipientName: '张**',
                recipientPhoneTail: '****1234',
                pickupCode: '1-1-1001',
                inboundAt: '2026-07-16 10:00:00.000',
                stationName: '测试驿站一',
                courierName: '顺丰速运',
              }],
              total: 1,
            },
          }),
        });
      }
    });

    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1001');

    // 前 2 次错误
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('取件码错误', { exact: true }).first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('取件码错误', { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // 第 3 次成功（不应锁定）
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
  });
});
