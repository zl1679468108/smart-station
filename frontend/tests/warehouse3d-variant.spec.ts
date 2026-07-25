// Warehouse3D variant 精确回归
// - guide：取件导览，显示点击漫游提示与取件位置指引
// - screen：数字孪生大屏，显示全屏 HUD 与巡航/漫游角标
// - editor：布局编辑，显示模型库与编辑画布，不显示只读漫游提示
import { test, expect, type Page } from '@playwright/test';
import {
  mockBusinessApis,
  mockLayoutApis,
  mockLogin,
  setLoggedIn,
} from './helpers/mock';

async function queryParcel(page: Page) {
  await page.goto('/#/query');
  for (const d of '13800001234') {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: '查询包裹' }).click();
  await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
}

test.describe('Warehouse3D variant 预设', () => {
  test('guide：查询页显示取件导览、位置指引与点击漫游提示', async ({ page }) => {
    await mockBusinessApis(page);
    await mockLayoutApis(page);

    await queryParcel(page);

    await expect(page.getByRole('heading', { name: '货架位置 3D 视图' })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('点击地面漫游 · 拖拽旋转 · 滚轮缩放')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('1-1-1001').first()).toBeVisible();
    await expect(page.getByText(/请前往 A 区 1 号货架/)).toBeVisible();
  });

  test('screen：大屏显示 HUD、巡航/漫游角标和 3D 画布', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await mockLayoutApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/dashboard?view=screen');

    await expect(page.getByText('位置 / 状态 · 自动巡航 / 点击漫游')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('今日入库', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('货架压力明细')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('editor：布局编辑显示模型库和编辑画布，不显示只读漫游提示', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await mockLayoutApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/dashboard?layout=edit');

    await expect(page.getByText('工作台 · 调整门店布局', { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByRole('heading', { name: '模型库' })).toBeVisible({ timeout: 8000 });
    await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('点击地面漫游 · 拖拽旋转 · 滚轮缩放')).toHaveCount(0);
  });
});
