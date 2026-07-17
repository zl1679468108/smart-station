// 入库管理 E2E 测试
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

// 辅助：通过 label 文本定位同容器内的 input
function inputByLabel(page: import('@playwright/test').Page, labelText: string) {
  return page.getByText(labelText, { exact: true }).locator('xpath=following-sibling::input');
}

test.describe('入库页面结构', () => {
  test('显示三个 Tab 切换', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    // 用 heading 定位页面标题，避免匹配到侧边栏菜单项
    await expect(page.getByRole('heading', { name: '入库管理' })).toBeVisible();
    // Tab 按钮：用 exact 避免匹配到其他元素
    await expect(page.getByRole('button', { name: '扫码入库', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '手动录入', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '批量导入', exact: true })).toBeVisible();
  });

  test('默认显示扫码入库 Tab', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await expect(page.getByText('运单号（扫码）')).toBeVisible();
  });

  test('切换到手动录入 Tab', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '手动录入' }).click();
    await expect(page.getByText('快递公司（留空自动识别）')).toBeVisible();
  });

  test('切换到批量导入 Tab', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '批量导入' }).click();
    await expect(page.getByText('批量导入（CSV 粘贴）')).toBeVisible();
  });
});

test.describe('扫码入库', () => {
  test('空运单号提交显示错误', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '确认入库' }).click();
    await expect(page.getByText('请扫描或输入运单号')).toBeVisible();
  });

  test('仅运单号无收件人信息显示错误', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByPlaceholder('扫描或输入运单号').fill('SF1234567890');
    await page.getByRole('button', { name: '确认入库' }).click();
    await expect(page.getByText('请填写收件人姓名和手机号')).toBeVisible();
  });

  test('完整信息入库成功', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByPlaceholder('扫描或输入运单号').fill('SF1234567890');
    await inputByLabel(page, '收件人姓名').fill('张三');
    await page.getByPlaceholder('11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '确认入库' }).click();

    await expect(page.getByText('入库成功')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('取件码', { exact: true })).toBeVisible();
    // 表单应被清空
    await expect(page.getByPlaceholder('扫描或输入运单号')).toHaveValue('');
  });

  test('包裹大小选择器显示可用货架号', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    // 等待 React Query 加载货架数据（1,2 号为小件 active 货架）
    await expect(page.getByText('1,2 号')).toBeVisible({ timeout: 10000 });
  });

  test('切换包裹大小为大型件', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    // 等待货架数据加载
    await expect(page.getByText('1,2 号')).toBeVisible({ timeout: 10000 });
    // 点击大件按钮
    await page.getByText('大件', { exact: true }).click();
    await expect(page.getByText('8 号')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('手动录入', () => {
  test('字段缺失显示错误', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '手动录入' }).click();
    await page.getByRole('button', { name: '确认入库' }).click();
    await expect(page.getByText('运单号、收件人姓名、手机号不能为空')).toBeVisible();
  });

  test('完整手动录入成功', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '手动录入' }).click();
    await inputByLabel(page, '运单号 *').fill('SF9999999999');
    await inputByLabel(page, '收件人姓名 *').fill('李四');
    await inputByLabel(page, '收件人手机号 *').fill('13900005678');
    await page.getByRole('button', { name: '确认入库' }).click();

    await expect(page.getByText('入库成功')).toBeVisible({ timeout: 8000 });
  });

  test('快递公司下拉显示启用中的公司', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '手动录入' }).click();
    // 快递公司 select 是页面中第一个 select（紧跟在"快递公司（留空自动识别）"label 后）
    // 等待 React Query 加载快递公司数据，通过轮询 option 列表
    await expect.poll(async () => {
      const options = await page.locator('select').first().locator('option').allTextContents();
      return options.some((o) => o.includes('顺丰速运'));
    }, { timeout: 10000, intervals: [500, 1000, 2000] }).toBeTruthy();
    // 再次读取选项做断言
    const courierSelect = page.locator('select').first();
    const options = await courierSelect.locator('option').allTextContents();
    // 顺丰速运（active）应在列表中
    expect(options.some((o) => o.includes('顺丰速运'))).toBeTruthy();
    // 圆通速递（disabled）不应在列表中
    expect(options.some((o) => o.includes('圆通速递'))).toBeFalsy();
  });
});

test.describe('批量导入', () => {
  test('字段不足显示错误', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '批量导入' }).click();
    // 填入仅一个字段（字段不足）
    await page.locator('textarea').fill('SF1234567890');
    await page.getByRole('button', { name: '开始导入' }).click();

    await expect(page.getByText(/字段不足|字段不能为空/)).toBeVisible({ timeout: 8000 });
  });

  test('手机号格式错误显示错误', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '批量导入' }).click();
    await page.locator('textarea').fill('SF1234567890,张三,12345');
    await page.getByRole('button', { name: '开始导入' }).click();

    await expect(page.getByText('手机号格式不正确')).toBeVisible({ timeout: 8000 });
  });

  test('正确格式批量导入成功', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByRole('button', { name: '批量导入' }).click();
    await page.locator('textarea').fill(
      'SF1234567890,张三,13800001234,易碎品\nZTO9876543210,李四,13900005678',
    );
    await page.getByRole('button', { name: '开始导入' }).click();

    await expect(page.getByText('导入结果')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('总计：2')).toBeVisible();
    await expect(page.getByText('成功：2')).toBeVisible();
    await expect(page.getByText('失败：0')).toBeVisible();
  });
});

test.describe('入库成功展示', () => {
  test('显示取件码大字号', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    await page.getByPlaceholder('扫描或输入运单号').fill('SF1234567890');
    await inputByLabel(page, '收件人姓名').fill('张三');
    await page.getByPlaceholder('11 位手机号').fill('13800001234');
    await page.getByRole('button', { name: '确认入库' }).click();

    await expect(page.getByText('入库成功')).toBeVisible({ timeout: 8000 });
    // 取件码格式 X-X-XXXX，大字号显示
    await expect(page.locator('.font-mono.text-2xl')).toBeVisible();
  });
});
