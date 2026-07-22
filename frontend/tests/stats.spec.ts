// 数据统计 E2E 测试（M26.3）
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn } from './helpers/mock';

test.describe('数据统计（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');
  });

  test('页面渲染四类图表区块', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.getByRole('heading', { name: '数据统计' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '业务量趋势' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '转化漏斗' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '滞留率' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /取件高峰/ })).toBeVisible();
  });

  test('趋势图渲染 SVG', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('切换趋势粒度到周', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await page.getByRole('button', { name: '周', exact: true }).click();
    await expect(page.getByRole('heading', { name: '业务量趋势' })).toBeVisible();
  });

  test('漏斗显示各阶段件数', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.getByText('入库').first()).toBeVisible();
    await expect(page.getByText('出库').first()).toBeVisible();
  });

  test('滞留率显示总体与快递公司', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.getByText('顺丰速运').first()).toBeVisible();
    await expect(page.getByText('中通快递').first()).toBeVisible();
  });

  test('高峰显示峰值时段', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.getByText(/高峰时段/)).toBeVisible();
    await expect(page.getByText('18:00')).toBeVisible();
  });
});

test.describe('数据统计（viewer 无权限）', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page, 'viewer');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'viewer');
  });

  test('viewer 被路由守卫拦截', async ({ page }) => {
    await page.goto('/#/admin/stats');
    await expect(page.getByText('无权限访问该页面')).toBeVisible();
  });
});
