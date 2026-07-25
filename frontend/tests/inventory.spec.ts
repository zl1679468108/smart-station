// 库存查询 E2E 测试
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn, PARCELS } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

test.describe('库存列表', () => {
  test('显示筛选栏与列表', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    // 用 heading 定位页面标题（侧边栏菜单也叫"库存查询"）
    await expect(page.getByRole('heading', { name: '库存查询' })).toBeVisible();
    // 筛选项
    await expect(page.getByPlaceholder('手机号')).toBeVisible();
    await expect(page.getByPlaceholder('运单号（模糊）')).toBeVisible();
    await expect(page.getByPlaceholder('取件码')).toBeVisible();
    await expect(page.getByRole('button', { name: '查询' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重置' })).toBeVisible();
  });

  test('列表展示包裹数据', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    // 等待加载完成
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('张三')).toBeVisible();
    await expect(page.getByText('1-1-1001')).toBeVisible();
    // "顺丰速运"同时出现在表格和 select 选项中，用表格单元格定位
    await expect(page.locator('td', { hasText: '顺丰速运' })).toBeVisible();
  });

  test('状态色块展示', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    // 等待列表加载完成
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    // 状态标签在表格中
    await expect(page.locator('td').filter({ hasText: '在库' }).first()).toBeVisible();
    await expect(page.locator('td').filter({ hasText: '滞留' }).first()).toBeVisible();
    await expect(page.locator('td').filter({ hasText: '异常' }).first()).toBeVisible();
  });

  test('点击查询按钮触发查询', async ({ page }) => {
    let queryRequested = false;
    await page.route('**/api/inventory?**', (route) => {
      queryRequested = true;
      route.continue();
    });

    await page.goto('/#/admin/inventory');
    await page.getByPlaceholder('手机号').fill('13800001234');
    await page.getByRole('button', { name: '查询' }).click();
    expect(queryRequested).toBeTruthy();
  });

  test('重置按钮清空筛选', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await page.getByPlaceholder('手机号').fill('13800001234');
    await page.getByPlaceholder('取件码').fill('1-1-1001');
    await page.getByRole('button', { name: '重置' }).click();
    await expect(page.getByPlaceholder('手机号')).toHaveValue('');
    await expect(page.getByPlaceholder('取件码')).toHaveValue('');
  });

  test('点击详情跳转详情页', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '详情' }).first().click();
    await expect(page).toHaveURL(/\/admin\/inventory\/p-\d+/);
  });

  test('补发到件使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    const firstRow = page.getByRole('row').filter({ hasText: 'SF1234567890' });
    await firstRow.getByRole('button', { name: '补发到件' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '补发到件通知' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/运单 SF1234567890/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认补发' }).click();
    await expect(page.getByText('取件码已私信到客户微信').first()).toBeVisible({ timeout: 8000 });
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('库存详情页', () => {
  test('显示包裹基础信息', async ({ page }) => {
    await page.goto('/#/admin/inventory/p-001');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('张三')).toBeVisible();
    await expect(page.getByText('13800001234')).toBeVisible();
    await expect(page.getByText('1-1-1001')).toBeVisible();
    // 详情页用 span 容器显示快递公司名，避免匹配 select 选项
    await expect(page.locator('span', { hasText: '顺丰速运' }).first()).toBeVisible();
  });

  test('显示状态轨迹时间线', async ({ page }) => {
    await page.goto('/#/admin/inventory/p-001');
    await expect(page.getByText('扫码入库').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('管理员').first()).toBeVisible();
  });

  test('补发到件失败后显示再发入口', async ({ page }) => {
    await page.route('**/api/inbound/*/resend-notice', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '模拟私信失败', data: null }),
      });
    });

    await page.goto('/#/admin/inventory/p-001');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '补发到件通知' }).click();

    await expect(page.getByText('到件通知回执：补发失败，可再发一次')).toBeVisible();
    await expect(page.getByRole('button', { name: '再发一次' })).toBeVisible();
  });

  test('发滞留提醒使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/inventory/p-002');
    await expect(page.getByText('ZTO9876543210')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '发滞留提醒' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '补发滞留提醒' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/向客户补发滞留提醒/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认发送' }).click();
    await expect(page.getByText(/提醒已发送|已发送|滞留提醒/).first()).toBeVisible({ timeout: 8000 });
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('批量操作', () => {
  test('全选/反选', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });

    // 表头复选框
    const headerCheckbox = page.locator('thead input[type="checkbox"]');
    await headerCheckbox.check();
    // 应显示已选数量
    await expect(page.getByText(/已选 \d+ 项/)).toBeVisible();
    await headerCheckbox.uncheck();
    await expect(page.getByText(/已选 \d+ 项/)).toBeHidden();
  });

  test('勾选后显示批量操作栏', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await expect(page.getByText('批量标记异常')).toBeVisible();
    await expect(page.getByText('清除选择')).toBeVisible();
  });

  test('批量标记异常弹窗', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByText('批量标记异常').click();

    await expect(page.getByText(/批量标记异常/).first()).toBeVisible();
    await expect(page.getByPlaceholder('请输入异常原因')).toBeVisible();
    await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认标记' })).toBeVisible();
  });

  test('不填原因确认显示统一提醒', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByText('批量标记异常').click();

    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: '确认标记' }).click();
    await expect(page.getByRole('alert').getByText('请输入异常原因')).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
  });

  test('填原因确认标记成功', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByText('批量标记异常').click();
    await page.getByPlaceholder('请输入异常原因').fill('外包装破损');
    await page.getByRole('button', { name: '确认标记' }).click();

    // 弹窗关闭
    await expect(page.getByPlaceholder('请输入异常原因')).toBeHidden({ timeout: 8000 });
  });

  test('清除选择按钮清空选中', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByText('清除选择').click();
    await expect(page.getByText(/已选 \d+ 项/)).toBeHidden();
  });

  test('批量补发到件使用页面内确认弹窗', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/admin/inventory');
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    await page.locator('tbody input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: '批量补发到件' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '批量补发到件通知' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/对已选 1 件/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认补发' }).click();
    await expect(page.getByText('已补发 1 件到件通知', { exact: true }).first()).toBeVisible({
      timeout: 8000,
    });
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('库存空状态', () => {
  test('列表为空显示空状态', async ({ page }) => {
    await page.route('**/api/inventory?**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK', data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } }),
      });
    });

    await page.goto('/#/admin/inventory');
    await expect(page.getByText('暂无数据')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('未查询到符合条件的包裹')).toBeVisible();
  });
});

test.describe('库存接口错误', () => {
  test('列表接口失败显示错误提示', async ({ page }) => {
    await page.route('**/api/inventory?**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, message: '查询失败', data: null }) });
    });

    await page.goto('/#/admin/inventory');
    await expect(page.getByText('查询失败')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('库存 URL 深链（O1）', () => {
  test('?status=overdue 自动选中滞留并只展示滞留件', async ({ page }) => {
    await page.goto('/#/admin/inventory?status=overdue');
    await expect(page.getByRole('heading', { name: '库存查询' })).toBeVisible();
    // 状态下拉为筛选栏第一个 select
    await expect(page.locator('select').first()).toHaveValue('overdue');
    await expect(page.locator('td').filter({ hasText: '滞留' }).first()).toBeVisible({ timeout: 8000 });
    // mock 过滤后不应出现在库行
    await expect(page.locator('td').filter({ hasText: '在库' })).toHaveCount(0);
  });

  test('?status=exception 自动筛选异常件', async ({ page }) => {
    await page.goto('/#/admin/inventory?status=exception');
    await expect(page.locator('select').first()).toHaveValue('exception');
    await expect(page.locator('td').filter({ hasText: '异常' }).first()).toBeVisible({ timeout: 8000 });
  });

  test('重置清空 URL query string', async ({ page }) => {
    await page.goto('/#/admin/inventory?status=overdue');
    await page.getByRole('button', { name: '重置' }).click();
    await expect.poll(() => page.url()).toMatch(/#\/admin\/inventory\/?$/);
    await expect(page.locator('select').first()).toHaveValue('');
  });
});
