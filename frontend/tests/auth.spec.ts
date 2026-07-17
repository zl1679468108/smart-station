// 登录流程 E2E 测试
import { test, expect } from '@playwright/test';
import { mockLogin, mockBusinessApis, setLoggedIn, ADMIN_USER } from './helpers/mock';

test.describe('登录流程', () => {
  test('显示登录表单', async ({ page }) => {
    await page.goto('/#/admin/login');
    await expect(page.getByText('智能快递驿站')).toBeVisible();
    await expect(page.getByText('工作人员登录')).toBeVisible();
    await expect(page.getByPlaceholder('手机号或邮箱')).toBeVisible();
    await expect(page.getByPlaceholder('请输入密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });

  test('空账号密码提交显示错误提示', async ({ page }) => {
    await page.goto('/#/admin/login');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('请输入账号和密码')).toBeVisible();
  });

  test('仅账号不填密码显示错误', async ({ page }) => {
    await page.goto('/#/admin/login');
    await page.getByPlaceholder('手机号或邮箱').fill('13800000001');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('请输入账号和密码')).toBeVisible();
  });

  test('登录失败显示错误信息', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: '账号或密码错误', data: null }),
      });
    });

    await page.goto('/#/admin/login');
    await page.getByPlaceholder('手机号或邮箱').fill('13800000001');
    await page.getByPlaceholder('请输入密码').fill('wrongpassword');
    await page.getByRole('button', { name: '登录' }).click();

    await expect(page.getByText('账号或密码错误')).toBeVisible();
  });

  test('登录成功跳转到工作台', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);

    await page.goto('/#/admin/login');
    await page.getByPlaceholder('手机号或邮箱').fill('13800000001');
    await page.getByPlaceholder('请输入密码').fill('station123');
    await page.getByRole('button', { name: '登录' }).click();

    // 应跳转到 dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByText('工作台').first()).toBeVisible();
  });

  test('已登录用户访问登录页自动跳转', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/login');

    // 应自动跳转到 dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('密码显隐切换', async ({ page }) => {
    await page.goto('/#/admin/login');
    const passwordInput = page.getByPlaceholder('请输入密码');
    await passwordInput.fill('secret123');

    // 默认 password 类型
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // 点击显示
    await page.getByRole('button', { name: '显示' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // 点击隐藏
    await page.getByRole('button', { name: '隐藏' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('登录中按钮禁用并显示加载文案', async ({ page }) => {
    // 延迟响应以观察 loading 状态
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'OK',
          data: { token: 'tok', user: ADMIN_USER, stations: [] },
        }),
      });
    });
    await mockBusinessApis(page);

    await page.goto('/#/admin/login');
    await page.getByPlaceholder('手机号或邮箱').fill('13800000001');
    await page.getByPlaceholder('请输入密码').fill('station123');
    await page.getByRole('button', { name: '登录' }).click();

    // 应显示「登录中...」并禁用
    await expect(page.getByRole('button', { name: '登录中...' })).toBeVisible();
    await expect(page.getByRole('button', { name: '登录中...' })).toBeDisabled();
  });
});

test.describe('登出流程', () => {
  test('退出登录需二次确认', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('工作台').first()).toBeVisible();

    // 点击用户菜单
    await page.getByRole('button', { name: /管理员/ }).click();
    await page.getByText('退出登录').click();

    // 二次确认弹窗
    await expect(page.getByText('确认退出登录？')).toBeVisible();
    await page.getByRole('button', { name: '取消' }).click();
    await expect(page.getByText('确认退出登录？')).toBeHidden();
  });

  test('确认退出后返回登录页', async ({ page }) => {
    await mockLogin(page, 'admin');
    await mockBusinessApis(page);
    await setLoggedIn(page, 'admin');

    await page.goto('/#/admin/dashboard');
    await expect(page.getByText('工作台').first()).toBeVisible();

    // 退出
    await page.getByRole('button', { name: /管理员/ }).click();
    await page.getByText('退出登录').click();
    await page.getByRole('button', { name: '确认退出' }).click();

    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('未授权跳转', () => {
  test('未登录访问后台自动跳转登录页', async ({ page }) => {
    await mockBusinessApis(page);
    await page.goto('/#/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('401 响应清除 token 并跳登录页', async ({ page }) => {
    await mockLogin(page, 'admin');
    // profile 返回 401
    await page.route('**/api/auth/profile', (route) => {
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: '未授权', data: null }) });
    });

    await page.goto('/#/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
