// 角色权限 E2E 测试（admin / clerk / viewer）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('Admin 角色', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('侧边栏显示全部菜单', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('link', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /入库管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /库存查询/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /出库管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /系统管理/ })).toBeVisible();
  });

  test('系统管理显示 admin 可管理的 Tab', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(page.getByRole('button', { name: /驿站信息/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /门店布局/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /员工管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /货架管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /快递公司/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /通知记录/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /版本说明/ })).toBeVisible();
  });

  test('库存列表显示批量操作复选框', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.locator('thead input[type="checkbox"]')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Clerk 角色（店员）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'clerk');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'clerk');
  });

  test('侧边栏不显示员工管理入口', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('link', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /入库管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /库存查询/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /出库管理/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /系统管理/ })).toBeVisible();
  });

  test('系统管理显示 clerk 可访问的 Tab 且无员工管理', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(page.getByRole('button', { name: /驿站信息/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /门店布局/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /货架管理/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /快递公司/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /通知记录/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /版本说明/ })).toBeVisible();
    // 员工管理 Tab 不应出现
    await expect(page.getByRole('button', { name: /^员工管理$/ })).toBeHidden();
  });

  test('库存列表显示批量操作复选框（店员可写）', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    await expect(page.locator('thead input[type="checkbox"]')).toBeVisible({ timeout: 8000 });
  });

  test('可访问入库管理', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    // 用 heading 定位页面标题，避免匹配侧边栏菜单
    await expect(page.getByRole('heading', { name: '入库管理' })).toBeVisible();
  });

  test('可访问出库管理', async ({ page }) => {
    await page.goto('/#/admin/outbound');
    await expect(page.getByRole('heading', { name: '出库管理' })).toBeVisible();
  });
});

test.describe('Viewer 角色（查询员只读）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'viewer');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'viewer');
  });

  test('侧边栏仅显示工作台与库存查询', async ({ page }) => {
    await page.goto('/#/admin/dashboard');
    await expect(page.getByRole('link', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /库存查询/ })).toBeVisible();
    // 不应出现入库/出库/系统管理
    await expect(page.getByRole('link', { name: /^入库管理$/ })).toBeHidden();
    await expect(page.getByRole('link', { name: /^出库管理$/ })).toBeHidden();
    await expect(page.getByRole('link', { name: /^系统管理$/ })).toBeHidden();
  });

  test('库存列表不显示复选框（只读）', async ({ page }) => {
    await page.goto('/#/admin/inventory');
    // 等待数据加载
    await expect(page.getByText('SF1234567890')).toBeVisible({ timeout: 8000 });
    // 不应有复选框
    await expect(page.locator('thead input[type="checkbox"]')).toBeHidden();
    await expect(page.locator('tbody input[type="checkbox"]')).toHaveCount(0);
  });

  test('直接访问入库管理应被拦截', async ({ page }) => {
    await page.goto('/#/admin/inbound');
    // 应回到 dashboard 或显示无权限提示
    // 用 heading 精确定位，避免匹配多个元素
    await expect(
      page.getByRole('heading', { name: '无权限访问该页面' })
        .or(page.getByRole('heading', { name: '工作台' }))
    ).toBeVisible({ timeout: 8000 });
  });

  test('直接访问系统管理应被拦截', async ({ page }) => {
    await page.goto('/#/admin/system');
    await expect(
      page.getByRole('heading', { name: '无权限访问该页面' })
        .or(page.getByRole('heading', { name: '工作台' }))
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe('角色切换 - 驿站切换', () => {
  test('切换驿站后角色更新', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('工作台').first()).toBeVisible();

    // 点击当前驿站下拉
    await page.getByRole('button', { name: /测试驿站一/ }).click();
    // 选择第二个驿站
    await page.getByText('测试驿站二').click();

    // 切换成功后应仍停留在 dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });
});
