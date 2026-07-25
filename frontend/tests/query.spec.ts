// /query 用户自助查询门户 E2E 测试
import { test, expect } from '@playwright/test';
import { mockBusinessApis } from './helpers/mock';

test.beforeEach(async ({ page }) => {
  await mockBusinessApis(page);
});

// 通过虚拟键盘点击输入数字（用于 readOnly input）
async function typeViaKeypad(page: import('@playwright/test').Page, digits: string) {
  for (const d of digits) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

// 点击退格键
async function backspace(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '⌫' }).click();
}

// 点击清空按钮
async function clear(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '清空' }).click();
}

test.describe('Query 页面结构', () => {
  test('显示三种查询方式 Tab', async ({ page }) => {
    await page.goto('/#/query');
    // header 中「智能快递驿站」出现在主标题 fallback 与副标题两处，取首个
    await expect(page.getByText('智能快递驿站').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '手机号' })).toBeVisible();
    await expect(page.getByRole('button', { name: '运单号' })).toBeVisible();
    await expect(page.getByRole('button', { name: '取件码' })).toBeVisible();
  });

  test('默认选中手机号 Tab', async ({ page }) => {
    await page.goto('/#/query');
    await expect(page.getByRole('heading', { name: '手机号查询' })).toBeVisible();
    await expect(page.getByPlaceholder('11 位手机号')).toBeVisible();
  });

  test('切换到运单号 Tab', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    await expect(page.getByRole('heading', { name: '运单号查询' })).toBeVisible();
  });

  test('切换到取件码 Tab', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    await expect(page.getByRole('heading', { name: '取件码查询' })).toBeVisible();
  });
});

test.describe('虚拟键盘', () => {
  test('手机号 Tab 显示数字键盘', async ({ page }) => {
    await page.goto('/#/query');
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '0', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '⌫' })).toBeVisible();
  });

  test('运单号 Tab 显示模式切换按钮', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    // 运单号 Tab 允许切换数字/字母键盘
    await expect(page.getByRole('button', { name: 'ABC 字母' })).toBeVisible({ timeout: 8000 });
  });

  test('运单号 Tab 可切换数字/字母', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    // 默认数字键盘，点击切换到字母键盘
    await page.getByRole('button', { name: 'ABC 字母' }).click();
    await expect(page.getByRole('button', { name: 'Q', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Z', exact: true })).toBeVisible();
    // 切换回数字
    await page.getByRole('button', { name: '123 数字' }).click();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
  });

  test('切换 Tab 后键盘模式跟随当前查询方式重置', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    await page.getByRole('button', { name: 'ABC 字母' }).click();
    await expect(page.getByRole('button', { name: 'Q', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '手机号' }).click();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Q', exact: true })).toHaveCount(0);
  });

  test('取件码 Tab 显示横杠按钮', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    await expect(page.getByRole('button', { name: '-', exact: true })).toBeVisible();
  });

  test('点击数字键盘输入到输入框', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: '8', exact: true }).click();
    await expect(page.getByPlaceholder('11 位手机号')).toHaveValue('138');
  });

  test('退格键删除字符', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await backspace(page);
    await expect(page.getByPlaceholder('11 位手机号')).toHaveValue('1');
  });

  test('清空按钮清空输入', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await clear(page);
    await expect(page.getByPlaceholder('11 位手机号')).toHaveValue('');
  });

  test('实体键盘可输入当前查询框', async ({ page }) => {
    await page.goto('/#/query');
    await expect(page.getByPlaceholder('11 位手机号')).toBeFocused({ timeout: 8000 });
    await page.keyboard.type('13800001234');
    await expect(page.getByPlaceholder('11 位手机号')).toHaveValue('13800001234');
    await page.keyboard.press('Backspace');
    await expect(page.getByPlaceholder('11 位手机号')).toHaveValue('1380000123');
  });
});

test.describe('手机号查询', () => {
  test('格式错误显示 Toast', async ({ page }) => {
    await page.goto('/#/query');
    // 输入 5 位数字（格式错误）
    await typeViaKeypad(page, '12345');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('请输入正确的 11 位手机号')).toBeVisible();
  });

  test('正确手机号查询成功', async ({ page }) => {
    await page.goto('/#/query');
    await typeViaKeypad(page, '13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('1-1-1001')).toBeVisible();
  });

  test('查询结果显示脱敏信息', async ({ page }) => {
    await page.goto('/#/query');
    await typeViaKeypad(page, '13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
    // mock 返回脱敏后的姓名
    await expect(page.getByText('张**')).toBeVisible();
  });
});

test.describe('运单号查询', () => {
  test('空运单号显示 Toast', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('请输入运单号')).toBeVisible();
  });

  test('键盘输入运单号查询成功', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '运单号' }).click();
    // 默认数字键盘，先切换到字母模式输入 SF
    await page.getByRole('button', { name: 'ABC 字母' }).click();
    await page.getByRole('button', { name: 'S', exact: true }).click();
    await page.getByRole('button', { name: 'F', exact: true }).click();
    // 切换回数字模式输入 1234567890
    await page.getByRole('button', { name: '123 数字' }).click();
    await typeViaKeypad(page, '1234567890');

    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('取件码查询', () => {
  test('格式错误显示 Toast', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    // 输入格式错误的取件码 1--1
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('取件码格式不正确')).toBeVisible();
  });

  test('键盘输入取件码查询成功', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    // 取件码 1-1-1001
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1');
    await page.getByRole('button', { name: '-', exact: true }).click();
    await typeViaKeypad(page, '1001');

    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
  });

  test('支持后端允许的较长取件码格式', async ({ page }) => {
    await page.goto('/#/query');
    await page.getByRole('button', { name: '取件码' }).click();
    for (const ch of '123-12-123456') {
      await page.getByRole('button', { name: ch, exact: true }).click();
    }

    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('空状态', () => {
  test('查询无结果显示空状态', async ({ page }) => {
    await page.route('**/api/kiosk/query-by-phone-direct', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OK', data: { items: [], total: 0 } }),
      });
    });

    await page.goto('/#/query');
    await typeViaKeypad(page, '13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('未查询到在库包裹')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('预约到店', () => {
  test('取消预约使用页面内确认弹窗，不弹原生 confirm', async ({ page }) => {
    let nativeDialogSeen = false;
    page.on('dialog', async (dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/#/query');
    await typeViaKeypad(page, '13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();
    await expect(page.getByText('找到 1 个包裹')).toBeVisible({ timeout: 8000 });

    await page.getByText('预约到店取件').click();
    await expect(page.getByText('我的预约（1）')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '取消预约' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: '取消预约' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(/2026-07-25 10:00-10:30/)).toBeVisible();
    expect(nativeDialogSeen).toBe(false);

    await page.getByRole('button', { name: '确认取消' }).click();
    await expect(page.getByText('已取消预约', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('已取消').first()).toBeVisible();
    expect(nativeDialogSeen).toBe(false);
  });
});

test.describe('Toast 提示', () => {
  test('查询失败显示错误 Toast', async ({ page }) => {
    await page.route('**/api/kiosk/query-by-phone-direct', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '查询失败', data: null }),
      });
    });

    await page.goto('/#/query');
    await typeViaKeypad(page, '13800001234');
    await page.getByRole('button', { name: '查询包裹' }).click();

    await expect(page.getByText('查询失败').first()).toBeVisible({ timeout: 8000 });
  });
});


test.describe('H5 设备模式', () => {
  test('device=h5 显示返回栏、隐藏虚拟键盘且可用原生输入', async ({ page }) => {
    await page.goto('/#/query?device=h5');
    await expect(page.getByText('远端查件')).toBeVisible();
    await expect(page.getByRole('button', { name: '返回' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '手机号查询' })).toBeVisible();
    // 虚拟键盘数字键不应出现
    await expect(page.getByRole('button', { name: '1', exact: true })).toHaveCount(0);
    const phone = page.getByPlaceholder('11 位手机号');
    await phone.fill('13800001234');
    await expect(phone).toHaveValue('13800001234');
  });

  test('默认 portal 模式仍显示虚拟键盘', async ({ page }) => {
    await page.goto('/#/query');
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
  });
});
