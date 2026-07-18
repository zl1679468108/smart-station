// 系统管理 E2E 测试（5 个 Tab）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockLogin(page, 'admin');
  await mockBusinessApis(page);
  await setLoggedIn(page, 'admin');
});

test.describe('系统管理 Tab 结构', () => {
  test('admin 显示 5 个 Tab', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(page.getByRole('heading', { name: '系统管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: /驿站信息/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /员工管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /货架管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /快递公司/ })).toBeVisible();
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

  test('显示近 3 个版本（1.2.1 / 1.2.0 / 1.1.0）', async ({ page }) => {
    await page.goto('/#/admin/system');
    await page.getByRole('button', { name: /版本说明/ }).click();
    await expect(page.getByText('v1.2.1', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('v1.2.0', { exact: true })).toBeVisible();
    await expect(page.getByText('v1.1.0', { exact: true })).toBeVisible();
    // 1.0.0 已不在近 3 个版本展示范围
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
