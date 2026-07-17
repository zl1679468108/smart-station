// 出库管理 E2E 测试（查询 + 确认两步流程）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

test.describe('出库页面结构', () => {
  test('显示两个 Tab', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    // 用 heading 定位页面标题，避免匹配侧边栏菜单
    await expect(page.getByRole('heading', { name: '出库管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '人工辅助出库' })).toBeVisible();
    await expect(page.getByRole('button', { name: '出库记录' })).toBeVisible();
  });

  test('默认显示人工辅助出库 Tab', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    // 三个查询方式 Tab
    await expect(page.getByRole('button', { name: '手机号' })).toBeVisible();
    await expect(page.getByRole('button', { name: '运单号' })).toBeVisible();
    await expect(page.getByRole('button', { name: '取件码' })).toBeVisible();
  });

  test('切换到出库记录 Tab', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '出库记录' }).click();
    // "全部方式"是 select 的 option，未展开时不可见，改用 select 本身定位
    await expect(page.locator('select').filter({ hasText: '全部方式' })).toBeVisible({ timeout: 8000 });
  });
});

test.describe('手机号查询', () => {
  test('格式错误显示 Toast', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('12345');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('请输入正确的 11 位手机号')).toBeVisible();
  });

  test('正确手机号查询返回结果', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('SF1234567890')).toBeVisible();
    await expect(page.getByText('张三')).toBeVisible();
    await expect(page.getByText('1-1-1001')).toBeVisible();
  });

  test('查询无结果显示空状态', async ({ page }) => {
    await page.route('**/api/outbound/search', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK', data: { items: [], total: 0 } }),
      });
    });

    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('未查询到在库包裹')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('运单号查询', () => {
  test('空运单号显示 Toast', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '运单号' }).click();
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('请输入运单号')).toBeVisible();
  });

  test('正确运单号查询返回结果', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '运单号' }).click();
    await page.getByPlaceholder('扫描或输入运单号').fill('SF1234567890');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('取件码查询', () => {
  test('格式错误显示 Toast', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '取件码' }).click();
    await page.getByPlaceholder('如 22-9-2132').fill('123');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('取件码格式不正确')).toBeVisible();
  });

  test('正确取件码查询返回结果', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '取件码' }).click();
    await page.getByPlaceholder('如 22-9-2132').fill('1-1-1001');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
  });

  test('显示锁定提示文案', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '取件码' }).click();
    await expect(page.getByText('同一取件码错误 3 次将锁定 10 分钟')).toBeVisible();
  });
});

test.describe('确认出库流程', () => {
  test('点击确认出库弹出二次确认弹窗', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '确认出库' }).click();

    await expect(page.getByText('确认出库').first()).toBeVisible();
    await expect(page.getByText(/确认将运单号/)).toBeVisible();
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认出库' }).last()).toBeVisible();
  });

  test('取消确认关闭弹窗', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '确认出库' }).click();
    await page.getByRole('button', { name: '取消' }).click();

    await expect(page.getByText('确认将运单号')).toBeHidden();
  });

  test('确认后出库成功从列表移除', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '确认出库' }).click();
    await page.getByRole('button', { name: '确认出库' }).last().click();

    // 成功 Toast
    await expect(page.getByText(/已出库/)).toBeVisible({ timeout: 8000 });
    // 列表中应移除该包裹
    await expect(page.getByText('找到 1 个在库包裹')).toBeHidden();
  });

  test('出库失败显示错误 Toast', async ({ page }) => {
    await page.route('**/api/outbound/manual', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '包裹已出库', data: null }),
      });
    });

    await page.goto('/#/admin/outbound');
    await page.getByPlaceholder('收件人 11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('找到 1 个在库包裹')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '确认出库' }).click();
    await page.getByRole('button', { name: '确认出库' }).last().click();

    await expect(page.getByText('包裹已出库')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('出库记录列表', () => {
  test('显示记录列表', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '出库记录' }).click();
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('张三')).toBeVisible();
    await expect(page.getByText('人工').first()).toBeVisible();
  });

  test('显示筛选栏', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '出库记录' }).click();
    // select 中的 option 在未展开时为 hidden，改用读取选项列表验证
    await expect.poll(async () => {
      const options = await page.locator('select').filter({ hasText: '全部方式' }).locator('option').allTextContents();
      return options;
    }, { timeout: 8000 }).toEqual(['全部方式', '人工辅助', '自助扫描']);
  });

  test('空记录显示空状态', async ({ page }) => {
    await page.route('**/api/outbound/records?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK', data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      });
    });

    await page.goto('/#/admin/outbound');
    await page.getByRole('button', { name: '出库记录' }).click();
    await expect(page.getByText('暂无出库记录')).toBeVisible({ timeout: 8000 });
  });
});
