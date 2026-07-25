// 测试 mock 工具：统一拦截后端 API
// 所有响应遵循后端 ResponseInterceptor 格式：{ success, message, data }
import { Page, Route } from '@playwright/test';

// ===== Mock 数据 fixtures =====

export const ADMIN_USER = {
  id: 'u-admin-001',
  phone: '13800000001',
  email: 'admin@station.com',
  username: '管理员',
  avatarUrl: null,
  currentStationId: 'st-001',
  role: 'admin' as const,
};

export const CLERK_USER = {
  ...ADMIN_USER,
  id: 'u-clerk-001',
  phone: '13800000002',
  username: '店员甲',
  role: 'clerk' as const,
};

export const VIEWER_USER = {
  ...ADMIN_USER,
  id: 'u-viewer-001',
  phone: '13800000003',
  username: '查询员甲',
  role: 'viewer' as const,
};

export const STATIONS = [
  { id: 'st-001', name: '测试驿站一', role: 'admin' as const, isActive: true, isActiveStation: true },
  { id: 'st-002', name: '测试驿站二', role: 'clerk' as const, isActive: false, isActiveStation: true },
];

export const SHELVES = [
  { id: 'sh-001', number: 1, size_type: 'small' as const, layers: 4, capacity_per_layer: 20, description: '小件货架', status: 'active' as const, created_at: '2026-07-01 00:00:00.000', in_stock_count: 5, remaining_capacity: 75 },
  { id: 'sh-002', number: 2, size_type: 'small' as const, layers: 4, capacity_per_layer: 20, description: null, status: 'active' as const, created_at: '2026-07-01 00:00:00.000', in_stock_count: 0, remaining_capacity: 80 },
  { id: 'sh-005', number: 5, size_type: 'medium' as const, layers: 3, capacity_per_layer: 10, description: null, status: 'active' as const, created_at: '2026-07-01 00:00:00.000', in_stock_count: 2, remaining_capacity: 28 },
  { id: 'sh-008', number: 8, size_type: 'large' as const, layers: 2, capacity_per_layer: 5, description: null, status: 'active' as const, created_at: '2026-07-01 00:00:00.000', in_stock_count: 1, remaining_capacity: 9 },
  { id: 'sh-003', number: 3, size_type: 'small' as const, layers: 4, capacity_per_layer: 20, description: null, status: 'disabled' as const, created_at: '2026-07-01 00:00:00.000', in_stock_count: 0, remaining_capacity: 80 },
];

export const COURIERS = [
  { id: 'c-001', name: '顺丰速运', code: 'SF', service_phone: '95338', tracking_prefixes: ['SF'], status: 'active' as const, sort_order: 1, created_at: '2026-07-01 00:00:00.000' },
  { id: 'c-002', name: '中通快递', code: 'ZTO', service_phone: '95311', tracking_prefixes: ['ZTO'], status: 'active' as const, sort_order: 2, created_at: '2026-07-01 00:00:00.000' },
  { id: 'c-003', name: '圆通速递', code: 'YTO', service_phone: null, tracking_prefixes: ['YTO'], status: 'disabled' as const, sort_order: 3, created_at: '2026-07-01 00:00:00.000' },
];

export const PARCELS = [
  {
    id: 'p-001',
    trackingNumber: 'SF1234567890',
    recipientName: '张三',
    recipientPhone: '13800001234',
    pickupCode: '1-1-1001',
    status: 'in_stock' as const,
    size: 'small' as const,
    inboundAt: '2026-07-16 10:00:00.000',
    outboundAt: null,
    note: '易碎品',
    courier: { id: 'c-001', name: '顺丰速运', code: 'SF' },
    shelf: { id: 'sh-001', number: 1, sizeType: 'small' as const, layers: 4, capacityPerLayer: 20 },
  },
  {
    id: 'p-002',
    trackingNumber: 'ZTO9876543210',
    recipientName: '李四',
    recipientPhone: '13900005678',
    pickupCode: '2-2-2002',
    status: 'overdue' as const,
    size: 'small' as const,
    inboundAt: '2026-07-10 14:00:00.000',
    outboundAt: null,
    note: null,
    courier: { id: 'c-002', name: '中通快递', code: 'ZTO' },
    shelf: { id: 'sh-002', number: 2, sizeType: 'small' as const, layers: 4, capacityPerLayer: 20 },
  },
  {
    id: 'p-003',
    trackingNumber: 'YTO1111222233',
    recipientName: '王五',
    recipientPhone: '13700009876',
    pickupCode: null,
    status: 'exception' as const,
    size: 'medium' as const,
    inboundAt: '2026-07-12 09:00:00.000',
    outboundAt: null,
    note: '外包装破损',
    courier: { id: 'c-003', name: '圆通速递', code: 'YTO' },
    shelf: { id: 'sh-005', number: 5, sizeType: 'medium' as const, layers: 3, capacityPerLayer: 10 },
  },
];

export const OVERDUE_ITEMS = [
  {
    id: 'p-002',
    trackingNumber: 'ZTO9876543210',
    pickupCode: '2-2-2002',
    recipientName: '李四',
    recipientPhone: '13900005678',
    inboundAt: '2026-07-10 14:00:00.000',
    days: 6,
    level: 'warn' as const,
    returnStage: 'none' as const,
    status: 'overdue',
    note: null,
    shelf: { id: 'sh-002', number: 2, sizeType: 'small' },
    courier: { id: 'c-002', name: '中通快递', code: 'ZTO' },
  },
  {
    id: 'p-010',
    trackingNumber: 'SF5555666677',
    pickupCode: '3-1-3010',
    recipientName: '赵六',
    recipientPhone: '13600001111',
    inboundAt: '2026-07-05 09:00:00.000',
    days: 11,
    level: 'remind' as const,
    returnStage: 'none' as const,
    status: 'overdue',
    note: null,
    shelf: { id: 'sh-005', number: 5, sizeType: 'medium' },
    courier: { id: 'c-001', name: '顺丰速运', code: 'SF' },
  },
  {
    id: 'p-011',
    trackingNumber: 'YTO7777888899',
    pickupCode: '8-1-8011',
    recipientName: '孙七',
    recipientPhone: '13500002222',
    inboundAt: '2026-06-28 09:00:00.000',
    days: 18,
    level: 'return' as const,
    returnStage: 'none' as const,
    status: 'overdue',
    note: null,
    shelf: { id: 'sh-008', number: 8, sizeType: 'large' },
    courier: { id: 'c-003', name: '圆通速递', code: 'YTO' },
  },
];

export const EXCEPTION_ITEMS = [
  {
    id: 'ex-001',
    type: 'damaged' as const,
    description: '外包装严重破损，内部物品可能受损',
    status: 'registered' as const,
    resolution: null,
    resolutionNote: null,
    attachments: [],
    responsibleUserId: null,
    createdBy: 'u-admin-001',
    createdAt: '2026-07-12 09:30:00.000',
    updatedAt: '2026-07-12 09:30:00.000',
    resolvedAt: null,
    parcelId: 'p-003',
    parcel: {
      id: 'p-003',
      trackingNumber: 'YTO1111222233',
      pickupCode: '5-1-5003',
      recipientName: '王五',
      recipientPhone: '13700009876',
      status: 'exception',
      inboundAt: '2026-07-12 09:00:00.000',
    },
  },
  {
    id: 'ex-002',
    type: 'lost' as const,
    description: '包裹在库丢失，多次查找未果',
    status: 'processing' as const,
    resolution: null,
    resolutionNote: null,
    attachments: [],
    responsibleUserId: null,
    createdBy: 'u-admin-001',
    createdAt: '2026-07-13 11:00:00.000',
    updatedAt: '2026-07-13 12:00:00.000',
    resolvedAt: null,
    parcelId: 'p-020',
    parcel: {
      id: 'p-020',
      trackingNumber: 'SF2222333344',
      pickupCode: '1-2-1020',
      recipientName: '周八',
      recipientPhone: '13400003333',
      status: 'exception',
      inboundAt: '2026-07-11 10:00:00.000',
    },
  },
];

export const SHIPPINGS = [
  {
    id: 'sp-001',
    shippingNo: 'JJ20260715000001',
    pickupType: 'in_store' as const,
    pickupTime: null,
    pickupAddress: null,
    senderName: '张三',
    senderPhone: '13800001234',
    senderAddress: '北京市朝阳区测试路 1 号',
    receiverName: '李四',
    receiverPhone: '13900005678',
    receiverAddress: '上海市浦东新区示范街 2 号',
    itemType: '文件',
    weight: 1,
    insuredAmount: 0,
    freight: 12,
    status: 'pending' as const,
    note: null,
    createdAt: '2026-07-15 10:00:00.000',
    updatedAt: '2026-07-15 10:00:00.000',
    courierCompanyId: 'c-001',
    courier: { id: 'c-001', name: '顺丰速运', code: 'SF' },
  },
  {
    id: 'sp-002',
    shippingNo: 'JJ20260716000002',
    pickupType: 'door' as const,
    pickupTime: '2026-07-17 14:00:00.000',
    pickupAddress: '北京市海淀区上门路 8 号',
    senderName: '王五',
    senderPhone: '13700009876',
    senderAddress: '北京市海淀区上门路 8 号',
    receiverName: '赵六',
    receiverPhone: '13600001111',
    receiverAddress: '广州市天河区收货巷 3 号',
    itemType: '数码产品',
    weight: 3,
    insuredAmount: 2000,
    freight: 26,
    status: 'picked' as const,
    note: null,
    createdAt: '2026-07-16 09:00:00.000',
    updatedAt: '2026-07-16 09:30:00.000',
    courierCompanyId: 'c-002',
    courier: { id: 'c-002', name: '中通快递', code: 'ZTO' },
  },
];

export const ADDRESSES = [
  {
    id: 'ad-001',
    role: 'sender' as const,
    name: '张三',
    phone: '13800001234',
    address: '北京市朝阳区测试路 1 号',
    tag: 'company' as const,
    createdAt: '2026-07-01 00:00:00.000',
    updatedAt: '2026-07-01 00:00:00.000',
  },
  {
    id: 'ad-002',
    role: 'receiver' as const,
    name: '李四',
    phone: '13900005678',
    address: '上海市浦东新区示范街 2 号',
    tag: 'home' as const,
    createdAt: '2026-07-02 00:00:00.000',
    updatedAt: '2026-07-02 00:00:00.000',
  },
];

export const RATES = [
  {
    id: 'rate-001',
    courierCompanyId: 'c-001',
    courier: { id: 'c-001', name: '顺丰速运', code: 'SF' },
    effectiveMonth: '2026-07',
    firstWeightPrice: 12,
    additionalPrice: 2,
    firstWeightKg: 1,
    collectRate: 0.8,
    deliverRate: 0.5,
    insureRate: 0.005,
    createdAt: '2026-07-01 00:00:00.000',
    updatedAt: '2026-07-01 00:00:00.000',
  },
];

export const BILLS = [
  {
    id: 'bill-001',
    courierCompanyId: 'c-001',
    courier: { id: 'c-001', name: '顺丰速运', code: 'SF' },
    billMonth: '2026-06',
    collectCount: 120,
    deliverCount: 110,
    shippingCount: 8,
    receivable: 151,
    payable: 96,
    netAmount: 55,
    status: 'unreconciled' as const,
    reconciledAmount: null,
    reconciledNote: null,
    generatedAt: '2026-07-01 03:00:00.000',
    reconciledAt: null,
    createdAt: '2026-07-01 03:00:00.000',
    updatedAt: '2026-07-01 03:00:00.000',
  },
  {
    id: 'bill-002',
    courierCompanyId: 'c-002',
    courier: { id: 'c-002', name: '中通快递', code: 'ZTO' },
    billMonth: '2026-06',
    collectCount: 90,
    deliverCount: 85,
    shippingCount: 5,
    receivable: 100,
    payable: 60,
    netAmount: 40,
    status: 'reconciled' as const,
    reconciledAmount: 40,
    reconciledNote: '对账一致',
    generatedAt: '2026-07-01 03:00:00.000',
    reconciledAt: '2026-07-03 10:00:00.000',
    createdAt: '2026-07-01 03:00:00.000',
    updatedAt: '2026-07-03 10:00:00.000',
  },
];

export const DASHBOARD_DATA = {
  today: { inbound: 12, outbound: 8, inStock: 56, overdue: 3, exception: 1 },
  yesterday: { inbound: 10, outbound: 7 },
  hourly: Array.from({ length: 15 }, (_, i) => ({
    hour: 8 + i,
    inbound: Math.floor(Math.random() * 5) + 1,
    outbound: Math.floor(Math.random() * 4) + 1,
  })),
  todo: { overdueWarn: 3, exceptionUnresolved: 1 },
};

export const NOTIFY_LOGS = [
  {
    id: 'nl-001',
    templateCode: 'inbound_notice',
    templateLabel: '到件通知',
    phone: '13800001234',
    phoneMasked: '138****1234',
    recipientName: '张三',
    content: '【测试驿站一】您有包裹已到，取件码 1-1-1001，请凭码到对应货架取件。',
    status: 'sent',
    statusLabel: '已发送',
    errorMessage: null,
    channels: [
      { key: 'customer', ok: false, label: '客户未绑定' },
      { key: 'wecom', ok: true, label: '通知群已发脱敏公告' },
    ],
    channelSummary: '通知群已发脱敏公告',
    customerReach: 'unbound' as const,
    customerReachLabel: '未私信',
    canResend: true,
    parcelId: 'p-001',
    sentAt: '2026-07-16 10:01:00.000',
    createdAt: '2026-07-16 10:01:00.000',
  },
  {
    id: 'nl-002',
    templateCode: 'inbound_notice',
    templateLabel: '到件通知',
    phone: '13900005678',
    phoneMasked: '139****5678',
    recipientName: '李四',
    content: '【测试驿站一】您有包裹已到，取件码 2-2-2002，请凭码到对应货架取件。',
    status: 'sent',
    statusLabel: '已发送',
    errorMessage: null,
    channels: [{ key: 'customer', ok: false, label: '客户私信失败' }],
    channelSummary: '客户私信失败',
    customerReach: 'push_failed' as const,
    customerReachLabel: '私信失败',
    canResend: true,
    parcelId: 'p-002',
    sentAt: '2026-07-16 10:05:00.000',
    createdAt: '2026-07-16 10:05:00.000',
  },
];

export const NOTIFY_PHONE_SUMMARIES = [
  {
    phone: '13800001234',
    phoneMasked: '138****1234',
    recipientName: '张三',
    total: 1,
    sent: 1,
    failed: 0,
    unbound: 1,
    pushed: 0,
    pushFailed: 0,
    lastAt: '2026-07-16 10:01:00.000',
    lastTemplateCode: 'inbound_notice',
    lastTemplateLabel: '到件通知',
    lastReach: 'unbound' as const,
    lastReachLabel: '未私信',
    hasBinding: false,
    resendLogIds: ['nl-001'],
  },
  {
    phone: '13900005678',
    phoneMasked: '139****5678',
    recipientName: '李四',
    total: 1,
    sent: 1,
    failed: 0,
    unbound: 0,
    pushed: 0,
    pushFailed: 1,
    lastAt: '2026-07-16 10:05:00.000',
    lastTemplateCode: 'inbound_notice',
    lastTemplateLabel: '到件通知',
    lastReach: 'push_failed' as const,
    lastReachLabel: '私信失败',
    hasBinding: true,
    resendLogIds: ['nl-002'],
  },
];

// ===== Mock 响应辅助 =====

function ok<T>(data: T) {
  return { success: true, message: 'OK', data };
}

function fail(message: string) {
  return { success: false, message, data: null };
}

// ===== 路由匹配辅助 =====

function matchApi(url: string, pattern: string): boolean {
  // pattern 如 "POST /api/auth/login"
  const [method, path] = pattern.split(' ');
  // 简化匹配：仅检查 path 前缀（忽略 query string）
  const u = new URL(url, 'http://test');
  return u.pathname === path;
}

// ===== 核心 mock 注册 =====

export interface MockOptions {
  // 自定义某接口的响应覆盖
  overrides?: Record<string, unknown>;
  // 跳过默认 mock，由外部完全自定义
  skipDefaults?: boolean;
}

// 默认登录态：admin
export async function mockLogin(page: Page, role: 'admin' | 'clerk' | 'viewer' = 'admin') {
  const user = role === 'admin' ? ADMIN_USER : role === 'clerk' ? CLERK_USER : VIEWER_USER;
  const stationsForRole = role === 'admin' ? STATIONS : [
    { ...STATIONS[0], role: role as 'admin' | 'clerk' | 'viewer', isActive: true },
  ];

  await page.route('**/api/auth/login', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        token: 'mock-token-' + role,
        user,
        stations: stationsForRole,
      })),
    });
  });

  await page.route('**/api/auth/profile', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ ...user, stations: stationsForRole })),
    });
  });

  await page.route('**/api/auth/logout', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ message: '已登出' })),
    });
  });

  await page.route('**/api/auth/switch-station', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ currentStationId: 'st-002', role })),
    });
  });
}

// mock 公共业务接口（已登录后访问页面用）
export async function mockBusinessApis(page: Page) {
  // ===== Stats =====
  await page.route('**/api/stats/dashboard', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(DASHBOARD_DATA)),
    });
  });

  await page.route('**/api/stats/dashboard/events**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok([])),
    });
  });

  await page.route('**/api/stats/bind-conversion**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        days: 7,
        summary: {
          inboundNotices: 10,
          customerPushed: 8,
          customerUnbound: 2,
          customerPushFailed: 0,
          uniqueRecipients: 8,
          uniquePushedRecipients: 6,
          newBindings: 2,
          activeBindings: 6,
          pushRate: 80,
          coverRate: 75,
          bindRate: 25,
        },
        points: [],
      })),
    });
  });

  await page.route('**/api/shifts/current', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(null)),
    });
  });

  // 后台布局配置会在管理端初始化时预取，默认 mock 避免请求落到真实后端触发 401。
  await page.route('**/api/admin/station/layout-config', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        stationId: 'st-001',
        stationName: '测试驿站一',
        layoutConfig: DEFAULT_LAYOUT_CONFIG,
      })),
    });
  });

  await page.route('**/api/admin/notify/bindings**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      })),
    });
  });

  await page.route('**/api/admin/notify/logs**', (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathname = url.pathname;

    if (method === 'POST' && pathname.endsWith('/resend-batch')) {
      const body = JSON.parse(route.request().postData() || '{}');
      const ids = Array.isArray(body.ids) ? body.ids : [];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          total: ids.length,
          pushed: ids.length,
          failed: 0,
          staffMessage: `已补发 ${ids.length} 条通知`,
          results: ids.map((id: string) => ({
            logId: id,
            ok: true,
            customerBound: true,
            customerPushed: true,
            phoneMasked: NOTIFY_LOGS.find((log) => log.id === id)?.phoneMasked,
          })),
        })),
      });
      return;
    }

    const resendMatch = pathname.match(/\/api\/admin\/notify\/logs\/([^/]+)\/resend$/);
    if (method === 'POST' && resendMatch) {
      const id = decodeURIComponent(resendMatch[1]);
      const log = NOTIFY_LOGS.find((item) => item.id === id) || NOTIFY_LOGS[0];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          logId: id,
          templateCode: log.templateCode,
          templateLabel: log.templateLabel,
          phoneMasked: log.phoneMasked,
          attempted: true,
          customerBound: true,
          customerPushed: true,
          customerChannels: ['customer'],
          staffMessage: '取件码已私信到客户微信',
          channelResults: [{ key: 'customer', ok: true, label: '客户微信已私信' }],
        })),
      });
      return;
    }

    if (method === 'GET' && pathname.endsWith('/by-phone')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          items: NOTIFY_PHONE_SUMMARIES,
          total: NOTIFY_PHONE_SUMMARIES.length,
          scanned: NOTIFY_LOGS.length,
          days: Number(url.searchParams.get('days') || 1),
          excludeBound: url.searchParams.get('excludeBound') === '1',
        })),
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/admin/notify/logs') {
      const reach = url.searchParams.get('reach');
      const items = reach
        ? NOTIFY_LOGS.filter((log) => log.customerReach === reach)
        : NOTIFY_LOGS;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          items,
          total: items.length,
          page: Number(url.searchParams.get('page') || 1),
          pageSize: Number(url.searchParams.get('limit') || 40),
        })),
      });
      return;
    }

    route.fallback();
  });

  // ===== Inventory（只读接口，店员可访问） =====
  await page.route('**/api/inventory/shelves', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // 返回带坐标的货架（后端 listShelves 包含 pos_x/pos_y/rotation/zone 字段）
      body: JSON.stringify(ok(SHELVES_WITH_POS)),
    });
  });

  await page.route('**/api/inventory/couriers', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(COURIERS)),
    });
  });

  await page.route('**/api/inventory/station', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id: 'st-001',
        name: '测试驿站一',
        address: '测试地址 100 号',
        contact_phone: '010-12345678',
        business_hours: '08:00-22:00',
        floor_plan_url: null,
        overdue_warn_days: 3,
        overdue_remind_days: 5,
        overdue_return_days: 7,
        sms_enabled: false,
        status: 'active',
        created_at: '2026-07-01 00:00:00.000',
        updated_at: '2026-07-01 00:00:00.000',
      })),
    });
  });

  // 库存列表（按 URL query 过滤 status/phone 等，支撑深链与筛选 e2e）
  await page.route('**/api/inventory?**', (route) => {
    const url = new URL(route.request().url());
    let items = [...PARCELS];
    const status = url.searchParams.get('status');
    if (status) items = items.filter((p) => p.status === status);
    const phone = url.searchParams.get('phone');
    if (phone) items = items.filter((p) => (p.recipientPhone || '').includes(phone));
    const trackingNumber = url.searchParams.get('trackingNumber');
    if (trackingNumber) {
      items = items.filter((p) =>
        (p.trackingNumber || '').toUpperCase().includes(trackingNumber.toUpperCase()),
      );
    }
    const pickupCode = url.searchParams.get('pickupCode');
    if (pickupCode) items = items.filter((p) => (p.pickupCode || '') === pickupCode);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
        totalPages: Math.max(1, Math.ceil(items.length / Number(url.searchParams.get('pageSize') || 20))),
      })),
    });
  });

  // 库存详情
  await page.route('**/api/inventory/*', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').pop();
    // 对于非包裹 id 的请求（shelves/couriers/station/batch-exception），交给更具体的 handler
    if (id === 'shelves' || id === 'couriers' || id === 'station' || id === 'batch-exception') {
      return route.fallback();
    }
    const parcel = PARCELS.find((p) => p.id === id);
    if (parcel) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          ...parcel,
          shelfLayer: 1,
          shelfPosition: 1,
          returnedAt: null,
          returnTrackingNumber: null,
          inboundMethod: 'scan',
          outboundMethod: null,
          createdAt: parcel.inboundAt,
          updatedAt: parcel.inboundAt,
          courier: parcel.courier ? { ...parcel.courier, servicePhone: null } : null,
          inboundOperator: '管理员',
          outboundOperator: null,
          events: [
            { id: 'e-001', eventType: 'inbound', operatorType: 'staff', operatorName: '管理员', description: '扫码入库', metadata: null, createdAt: parcel.inboundAt },
          ],
        })),
      });
    } else {
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(fail('包裹不存在')) });
    }
  });

  // 批量标记异常
  await page.route('**/api/inventory/batch-exception', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ updated: 2, skipped: 1 })),
    });
  });

  // ===== Inbound =====
  await page.route('**/api/inbound/check-tracking', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        exists: false,
        trackingNumber: body.trackingNumber || '',
        message: '可入库',
      })),
    });
  });

  await page.route('**/api/inbound/check-tracking-batch', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const trackingNumbers: string[] = body.trackingNumbers || [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        total: trackingNumbers.length,
        ready: trackingNumbers.length,
        blocked: 0,
        stockDuplicate: 0,
        batchDuplicate: 0,
        staffMessage: `预检完成：${trackingNumbers.length} 条可导入`,
        items: trackingNumbers.map((trackingNumber, index) => ({
          index,
          trackingNumber,
          exists: false,
          inBatchDuplicate: false,
          blocked: false,
          message: '可导入',
        })),
      })),
    });
  });

  await page.route('**/api/inbound', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id: 'p-new-' + Date.now(),
        trackingNumber: body.trackingNumber,
        pickupCode: '1-1-' + Math.floor(1000 + Math.random() * 9000),
        shelfNumber: 1,
        shelfLayer: 1,
        shelfPosition: Math.floor(Math.random() * 20) + 1,
        inboundAt: '2026-07-16 15:00:00.000',
        courierCompanyCode: 'SF',
        courierCompanyName: '顺丰速运',
      })),
    });
  });

  await page.route('**/api/inbound/batch', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const items = body.items || [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        total: items.length,
        succeeded: items.length,
        failed: 0,
        results: items.map((item: any, index: number) => ({
          index,
          result: {
            id: `p-batch-${index + 1}`,
            trackingNumber: item.trackingNumber,
            recipientName: item.recipientName,
            recipientPhone: item.recipientPhone,
            pickupCode: `${index + 1}-1-${1001 + index}`,
            shelfNumber: index + 1,
            shelfLayer: 1,
            shelfPosition: index + 1,
            inboundAt: '2026-07-16 15:00:00.000',
            courierCompanyCode: 'SF',
            courierCompanyName: '顺丰速运',
          },
        })),
        errors: [],
      })),
    });
  });

  await page.route('**/api/inbound/resend-notice-batch', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        total: ids.length,
        pushed: ids.length,
        unbound: 0,
        failed: 0,
        staffMessage: `已补发 ${ids.length} 件到件通知`,
        results: ids.map((id) => ({
          id,
          ok: true,
          enabled: true,
          attempted: true,
          customerBound: true,
          customerPushed: true,
          customerChannels: ['customer'],
          staffMessage: '取件码已私信到客户微信',
        })),
      })),
    });
  });

  await page.route('**/api/inbound/*/resend-notice', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').slice(-2)[0];
    const parcel = PARCELS.find((p) => p.id === id) || PARCELS[0];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id,
        enabled: true,
        attempted: true,
        customerBound: true,
        customerPushed: true,
        customerChannels: ['customer'],
        staffMessage: '取件码已私信到客户微信',
        trackingNumber: parcel.trackingNumber,
        pickupCode: parcel.pickupCode,
      })),
    });
  });

  // ===== Outbound =====
  await page.route('**/api/outbound/search', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [
          {
            id: 'p-001',
            trackingNumber: 'SF1234567890',
            recipientName: '张三',
            recipientPhone: '13800001234',
            pickupCode: '1-1-1001',
            status: 'in_stock',
            inboundAt: '2026-07-16 10:00:00.000',
            courierName: '顺丰速运',
          },
        ],
        total: 1,
      })),
    });
  });

  await page.route('**/api/outbound/manual', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id: 'p-001',
        trackingNumber: 'SF1234567890',
        recipientName: '张三',
        recipientPhone: '13800001234',
        pickupCode: '1-1-1001',
        courierName: '顺丰速运',
        outboundAt: '2026-07-16 16:00:00.000',
        outboundMethod: 'manual' as const,
      })),
    });
  });

  await page.route('**/api/outbound/self-service', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id: 'p-001',
        trackingNumber: 'SF1234567890',
        recipientName: '张三',
        recipientPhone: '13800001234',
        pickupCode: '1-1-1001',
        courierName: '顺丰速运',
        outboundAt: '2026-07-16 16:00:00.000',
        outboundMethod: 'self_service' as const,
      })),
    });
  });

  await page.route('**/api/outbound/records?**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [
          {
            id: 'or-001',
            trackingNumber: 'SF1234567890',
            recipientName: '张三',
            recipientPhone: '13800001234',
            pickupCode: '1-1-1001',
            outboundAt: '2026-07-16 16:00:00.000',
            outboundMethod: 'manual' as const,
            inboundAt: '2026-07-16 10:00:00.000',
            operatorName: '管理员',
            courierName: '顺丰速运',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      })),
    });
  });

  // ===== Admin（管理操作） =====
  await page.route('**/api/admin/station', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          id: 'st-001', name: '测试驿站一', address: '测试地址 100 号',
          contact_phone: '010-12345678', business_hours: '08:00-22:00',
          floor_plan_url: null, overdue_warn_days: 3, overdue_remind_days: 5,
          overdue_return_days: 7, sms_enabled: false, status: 'active',
          created_at: '2026-07-01 00:00:00.000', updated_at: '2026-07-01 00:00:00.000',
        })),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ id: 'st-001', name: '更新后驿站' })) });
    }
  });

  await page.route('**/api/admin/staff', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 'sf-001', role: 'admin', status: 'active', joinedAt: '2026-07-01 00:00:00.000', userId: 'u-001', phone: '13800000001', email: 'admin@station.com', username: '管理员', avatarUrl: null, userStatus: 'active' },
          { id: 'sf-002', role: 'clerk', status: 'active', joinedAt: '2026-07-02 00:00:00.000', userId: 'u-002', phone: '13800000002', email: null, username: '店员甲', avatarUrl: null, userStatus: 'active' },
        ])),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ id: 'sf-new', role: 'clerk', status: 'active', joinedAt: '2026-07-16 00:00:00.000', userId: 'u-new', phone: '13800000099', email: null, username: '新店员', avatarUrl: null, userStatus: 'active', initialPassword: 'abc123' })) });
    }
  });

  await page.route('**/api/admin/staff/**', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/');
    const id = parts[parts.indexOf('staff') + 1];
    const staff = [
      { id: 'sf-001', role: 'admin', status: 'active', joinedAt: '2026-07-01 00:00:00.000', userId: 'u-001', phone: '13800000001', email: 'admin@station.com', username: '管理员', avatarUrl: null, userStatus: 'active' },
      { id: 'sf-002', role: 'clerk', status: 'active', joinedAt: '2026-07-02 00:00:00.000', userId: 'u-002', phone: '13800000002', email: null, username: '店员甲', avatarUrl: null, userStatus: 'active' },
    ].find((item) => item.id === id);

    if (method === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ ...(staff || { id }), ...body })),
      });
      return;
    }

    if (method === 'PATCH' && url.pathname.endsWith('/status')) {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ id, status: body.status || 'active' })),
      });
      return;
    }

    if (method === 'PATCH' && url.pathname.endsWith('/reset-password')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ id, newPassword: 'Reset1234' })),
      });
      return;
    }

    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(fail('员工不存在')) });
  });

  await page.route('**/api/admin/shelves', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(SHELVES)),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(SHELVES[0])) });
    }
  });

  await page.route('**/api/admin/couriers', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(COURIERS)),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(COURIERS[0])) });
    }
  });

  // ===== Kiosk 公开接口 =====
  await page.route('**/api/kiosk/send-code', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ sent: true, ttlSeconds: 300 })),
    });
  });

  await page.route('**/api/kiosk/query-by-phone', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
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
      })),
    });
  });

  await page.route('**/api/kiosk/query-by-phone-direct', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [{
          id: 'p-001', trackingNumber: 'SF1234567890', recipientName: '张**',
          recipientPhoneTail: '****1234', pickupCode: '1-1-1001',
          inboundAt: '2026-07-16 10:00:00.000', stationName: '测试驿站一', courierName: '顺丰速运',
        }],
        total: 1,
      })),
    });
  });

  await page.route('**/api/kiosk/query-by-tracking', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [{
          id: 'p-001', trackingNumber: 'SF1234567890', recipientName: '张**',
          recipientPhoneTail: '****1234', pickupCode: '1-1-1001',
          inboundAt: '2026-07-16 10:00:00.000', stationName: '测试驿站一', courierName: '顺丰速运',
        }],
        total: 1,
      })),
    });
  });

  await page.route('**/api/kiosk/query-by-code', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items: [{
          id: 'p-001', trackingNumber: 'SF1234567890', recipientName: '张**',
          recipientPhoneTail: '****1234', pickupCode: '1-1-1001',
          inboundAt: '2026-07-16 10:00:00.000', stationName: '测试驿站一', courierName: '顺丰速运',
        }],
        total: 1,
      })),
    });
  });

  let appointmentCancelled = false;
  await page.route('**/api/kiosk/appointment**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const appointment = {
      id: '11111111-1111-1111-1111-111111111111',
      stationId: 'st-001',
      recipientPhone: '****1234',
      recipientPhoneFull: '13800001234',
      recipientName: '张三',
      slotDate: '2026-07-25',
      slotStart: '10:00',
      slotEnd: '10:30',
      slotLabel: '10:00-10:30',
      note: null,
      status: appointmentCancelled ? 'cancelled' as const : 'confirmed' as const,
      statusLabel: appointmentCancelled ? '已取消' : '已确认',
      source: 'public',
      cancelReason: null,
      handledBy: null,
      handledByName: null,
      handledAt: null,
      createdAt: '2026-07-24 10:00:00.000',
      updatedAt: '2026-07-24 10:00:00.000',
      notifyHint: '预约已确认，请按时到店',
    };

    if (req.method() === 'GET' && url.pathname.endsWith('/api/kiosk/appointment/slots')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          stationId: 'st-001',
          stationName: '测试驿站一',
          businessHours: '08:00-22:00',
          address: '测试地址 100 号',
          contactPhone: '010-12345678',
          maxPerSlot: 6,
          days: [
            {
              date: '2026-07-25',
              weekday: '周六',
              isToday: true,
              slots: [
                {
                  start: '10:00',
                  end: '10:30',
                  label: '10:00-10:30',
                  booked: 1,
                  remaining: 5,
                  available: true,
                  reason: null,
                },
              ],
            },
          ],
        })),
      });
      return;
    }

    if (req.method() === 'POST' && url.pathname.endsWith('/api/kiosk/appointment/my')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ items: [appointment] })),
      });
      return;
    }

    if (req.method() === 'POST' && url.pathname.endsWith('/cancel')) {
      appointmentCancelled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          ...appointment,
          status: 'cancelled',
          statusLabel: '已取消',
          cancelReason: '用户自助取消',
          updatedAt: '2026-07-24 10:05:00.000',
        })),
      });
      return;
    }

    if (req.method() === 'POST' && url.pathname.endsWith('/api/kiosk/appointment')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          ...appointment,
          status: 'pending',
          statusLabel: '待确认',
          notifyHint: '预约成功，请等待店员确认',
        })),
      });
      return;
    }

    route.fallback();
  });

  // ===== Overdue（滞留件，M24） =====
  await page.route('**/api/overdue/scan', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        scanned: 3,
        markedOverdue: 2,
        warned: 1,
        reminded: 1,
        returnCandidates: 0,
      })),
    });
  });

  await page.route('**/api/overdue/*/return', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').slice(-2)[0];
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id,
        returnStage: body.action === 'complete' ? 'returned' : 'returning',
      })),
    });
  });

  await page.route('**/api/overdue/remind-batch', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        total: ids.length,
        pushed: ids.length,
        unbound: 0,
        failed: 0,
        staffMessage: `已发送 ${ids.length} 条滞留提醒`,
        results: ids.map((id) => ({
          id,
          ok: true,
          customerBound: true,
          customerPushed: true,
          staffMessage: '滞留提醒已私信到客户微信',
        })),
      })),
    });
  });

  await page.route('**/api/overdue/*/remind', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').slice(-2)[0];
    const item = OVERDUE_ITEMS.find((p) => p.id === id);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        id,
        days: item?.days ?? 4,
        trackingNumber: item?.trackingNumber,
        pickupCode: item?.pickupCode,
        customerBound: true,
        customerPushed: true,
        staffMessage: '滞留提醒已私信到客户微信',
      })),
    });
  });

  await page.route('**/api/overdue**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const level = url.searchParams.get('level');
    let items = [...OVERDUE_ITEMS];
    if (level) items = items.filter((i) => i.level === level);
    const keyword = url.searchParams.get('keyword');
    if (keyword) {
      items = items.filter(
        (i) =>
          i.trackingNumber.includes(keyword) ||
          i.pickupCode.includes(keyword) ||
          i.recipientPhone.includes(keyword),
      );
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
        counts: {
          all: OVERDUE_ITEMS.length,
          warn: OVERDUE_ITEMS.filter((i) => i.level === 'warn').length,
          remind: OVERDUE_ITEMS.filter((i) => i.level === 'remind').length,
          return: OVERDUE_ITEMS.filter((i) => i.level === 'return').length,
        },
        thresholds: { warnDays: 3, remindDays: 7, returnDays: 15 },
      })),
    });
  });

  // ===== Exception（异常件，M24） =====
  await page.route('**/api/exception**', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const tail = url.pathname.split('/').pop();

    // POST /api/exception 登记
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          id: 'ex-new-' + Date.now(),
          type: body.type || 'other',
          description: body.description || '',
          status: 'registered',
          resolution: null,
          resolutionNote: null,
          attachments: [],
          responsibleUserId: null,
          createdBy: 'u-admin-001',
          createdAt: '2026-07-16 15:00:00.000',
          updatedAt: '2026-07-16 15:00:00.000',
          resolvedAt: null,
          parcelId: body.parcelId,
          parcel: null,
        })),
      });
      return;
    }

    // PATCH /api/exception/:id 处理
    if (method === 'PATCH') {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          ...EXCEPTION_ITEMS[0],
          id: tail,
          status: body.status || 'processing',
          resolution: body.resolution || null,
          resolutionNote: body.resolutionNote || null,
        })),
      });
      return;
    }

    // GET /api/exception/:id 详情
    if (tail && tail !== 'exception' && !url.search) {
      const found = EXCEPTION_ITEMS.find((e) => e.id === tail) || EXCEPTION_ITEMS[0];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok(found)),
      });
      return;
    }

    // GET /api/exception 列表
    let items = [...EXCEPTION_ITEMS];
    const status = url.searchParams.get('status');
    if (status) items = items.filter((i) => i.status === status);
    const type = url.searchParams.get('type');
    if (type) items = items.filter((i) => i.type === type);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
      })),
    });
  });

  // ===== Shipping（寄件，M25） =====
  const shippingStatusById = new Map<string, string>();
  await page.route('**/api/shipping/list**', (route) => {
    const url = new URL(route.request().url());
    let items = SHIPPINGS.map((item) => ({
      ...item,
      status: (shippingStatusById.get(item.id) || item.status) as typeof item.status,
    }));
    const status = url.searchParams.get('status');
    if (status) items = items.filter((i) => i.status === status);
    const pickupType = url.searchParams.get('pickupType');
    if (pickupType) items = items.filter((i) => i.pickupType === pickupType);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
      })),
    });
  });

  await page.route('**/api/shipping/estimate', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const weight = Number(body.weight) || 1;
    const additionalWeight = Math.max(0, Math.ceil(weight - 1));
    const freightBeforeInsure = 12 + additionalWeight * 2;
    const insureFee = Math.round((body.insuredAmount || 0) * 0.005 * 100) / 100;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        firstWeightPrice: 12,
        additionalPrice: 2,
        firstWeightKg: 1,
        additionalWeight,
        freightBeforeInsure,
        insureRate: 0.005,
        insureFee,
        freight: freightBeforeInsure + insureFee,
        effectiveMonth: '2026-07',
        usedDefaultRate: false,
      })),
    });
  });

  await page.route('**/api/shipping/create', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        ...SHIPPINGS[0],
        id: 'sp-new-' + Date.now(),
        shippingNo: 'JJ20260716999999',
        senderName: body.senderName,
        receiverName: body.receiverName,
        status: 'pending',
      })),
    });
  });

  await page.route('**/api/shipping/*/status', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').slice(-2)[0];
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.status) shippingStatusById.set(id, body.status);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ ...SHIPPINGS[0], id, status: body.status })),
    });
  });

  // ===== 地址簿（M25） =====
  await page.route('**/api/address-book**', (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const tail = url.pathname.split('/').pop();
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({
          id: 'ad-new-' + Date.now(),
          role: body.role,
          name: body.name,
          phone: body.phone,
          address: body.address,
          tag: body.tag || null,
          createdAt: '2026-07-16 15:00:00.000',
          updatedAt: '2026-07-16 15:00:00.000',
        })),
      });
      return;
    }
    if (method === 'PATCH') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ ...ADDRESSES[0], id: tail })),
      });
      return;
    }
    if (method === 'DELETE') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ id: tail })) });
      return;
    }
    // GET 列表
    let items = [...ADDRESSES];
    const role = url.searchParams.get('role');
    if (role) items = items.filter((i) => i.role === role);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ items, total: items.length, page: 1, pageSize: 50 })),
    });
  });

  // ===== Finance（财务，M25） =====
  await page.route('**/api/finance/rates**', (route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok({ ...RATES[0], ...body, id: 'rate-1' })),
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok(RATES)),
    });
  });

  await page.route('**/api/finance/cash-day**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        date: '2026-07-16',
        total: 128,
        freightTotal: 28,
        codTotal: 100,
        byMethod: { cash: 20, wechat: 88, alipay: 20, other: 0 },
        paidCount: 3,
        waivedCount: 0,
        waivedTotal: 0,
        unpaidInStock: 1,
        items: [],
      })),
    });
  });

  await page.route('**/api/finance/bills/generate', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ month: '2026-06', generated: 2, skipped: 0, couriers: 2 })),
    });
  });

  await page.route('**/api/finance/bills/*/reconcile', (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').slice(-2)[0];
    const body = JSON.parse(route.request().postData() || '{}');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ ...BILLS[0], id, status: body.status })),
    });
  });

  await page.route('**/api/finance/bills/*/items', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok([
        { id: 'fi-1', itemType: 'collect', quantity: 120, amount: 96, direction: 'receivable', parcelId: null, shippingId: null, createdAt: '2026-07-01 00:00:00.000' },
        { id: 'fi-2', itemType: 'deliver', quantity: 110, amount: 88, direction: 'receivable', parcelId: null, shippingId: null, createdAt: '2026-07-01 00:00:00.000' },
      ])),
    });
  });

  // ===== Stats 报表（M26） =====
  await page.route('**/api/stats/trend**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        granularity: 'day',
        span: 7,
        points: [
          { label: '2026-07-10', inbound: 12, outbound: 8 },
          { label: '2026-07-11', inbound: 15, outbound: 11 },
          { label: '2026-07-12', inbound: 9, outbound: 13 },
          { label: '2026-07-13', inbound: 20, outbound: 14 },
          { label: '2026-07-14', inbound: 18, outbound: 16 },
          { label: '2026-07-15', inbound: 22, outbound: 19 },
          { label: '2026-07-16', inbound: 17, outbound: 15 },
        ],
      })),
    });
  });

  await page.route('**/api/stats/funnel**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        days: 30,
        stages: [
          { key: 'inbound', label: '入库', count: 200, percent: 100 },
          { key: 'outbound', label: '出库', count: 160, percent: 80 },
          { key: 'overdue', label: '滞留', count: 24, percent: 12 },
          { key: 'returned', label: '退回', count: 6, percent: 3 },
        ],
      })),
    });
  });

  await page.route('**/api/stats/retention**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        days: 30,
        total: 200,
        overdue: 24,
        rate: 12,
        couriers: [
          { courierCompanyId: 'c-001', courierName: '顺丰速运', total: 100, overdue: 8, rate: 8 },
          { courierCompanyId: 'c-002', courierName: '中通快递', total: 80, overdue: 12, rate: 15 },
          { courierCompanyId: 'c-003', courierName: '圆通速递', total: 20, overdue: 4, rate: 20 },
        ],
      })),
    });
  });

  await page.route('**/api/stats/peak-hours**', (route) => {
    const hours = [];
    for (let h = 8; h <= 22; h++) hours.push({ hour: h, count: h === 18 ? 30 : Math.max(0, 20 - Math.abs(18 - h) * 2) });
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        days: 30,
        total: 160,
        peakHour: 18,
        hours,
        weekdays: [
          { weekday: 0, label: '周日', count: 30 },
          { weekday: 1, label: '周一', count: 20 },
          { weekday: 2, label: '周二', count: 18 },
          { weekday: 3, label: '周三', count: 22 },
          { weekday: 4, label: '周四', count: 25 },
          { weekday: 5, label: '周五', count: 28 },
          { weekday: 6, label: '周六', count: 17 },
        ],
      })),
    });
  });

  await page.route('**/api/finance/bills?**', (route) => {
    const url = new URL(route.request().url());
    let items = [...BILLS];
    const status = url.searchParams.get('status');
    if (status) items = items.filter((i) => i.status === status);
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
      })),
    });
  });
}

// 设置已登录态（绕过登录页直接进入后台）
export async function setLoggedIn(page: Page, role: 'admin' | 'clerk' | 'viewer' = 'admin') {
  const user = role === 'admin' ? ADMIN_USER : role === 'clerk' ? CLERK_USER : VIEWER_USER;
  await page.addInitScript(([user, stations]) => {
    localStorage.setItem('ss_token', 'mock-token-' + user.role);
    localStorage.setItem('ss_station_id', 'st-001');
    localStorage.setItem('ss_user_cache', JSON.stringify(user));
    localStorage.setItem('ss_stations_cache', JSON.stringify(stations));
  }, [user, STATIONS]);
}

// 清除登录态
export async function clearLoggedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
  });
}

// 拦截 401（未授权场景）
export async function mockUnauthorized(page: Page) {
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('/api/auth/login')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(fail('账号或密码错误')) });
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(fail('未授权')) });
  });
}

// 拦截服务器错误
export async function mockServerError(page: Page, pattern: string, message = '服务器内部错误') {
  await page.route(pattern, (route) => {
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(fail(message)) });
  });
}

// ===== 1.2.0 门店 3D 布局相关 mock =====

// 默认门店布局配置（含 1 个门口 + bounds + 服务台/待取件区/出库记录区/异常件区）
export const DEFAULT_LAYOUT_CONFIG = {
  bounds: { width: 12, depth: 8 },
  doors: [{ x: 0, y: 4, width: 1.2, label: '正门' }],
  areas: [
    {
      id: 'area-counter-1',
      x: -3.5,
      y: 2.8,
      width: 3.2,
      depth: 1.4,
      height: 1.4,
      type: 'counter',
      label: '服务台 1',
    },
    {
      id: 'area-pickup-1',
      x: 3.2,
      y: 2.4,
      width: 3.6,
      depth: 2,
      height: 1.8,
      type: 'pickup',
      label: '待取件区 1',
    },
    {
      id: 'area-outbound-record-1',
      x: 4.5,
      y: -1.4,
      width: 2.6,
      depth: 0.8,
      height: 2.2,
      type: 'outboundRecord',
      label: '出库记录区 1',
    },
    {
      id: 'area-exception-1',
      x: -4.4,
      y: -1.8,
      width: 2,
      depth: 1.2,
      height: 1.2,
      type: 'exception',
      label: '异常件区 1',
    },
  ],
  obstacles: [],
};

// 带真实坐标的货架（posX/posY 已设置）
export const SHELVES_WITH_POS = SHELVES.map((s, i) => ({
  ...s,
  pos_x: (i % 3) * 2 - 2,
  pos_y: Math.floor(i / 3) * 2 - 2,
  rotation: 0,
  zone: s.size_type === 'small' ? 'A' : s.size_type === 'medium' ? 'B' : 'C',
}));

// mock 1.2.0 门店布局相关接口（管理员端 + Kiosk 端）
export async function mockLayoutApis(page: Page) {
  // 管理员：获取驿站户型配置
  await page.route('**/api/admin/station/layout-config', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            stationId: 'station-1',
            stationName: '测试驿站一',
            layoutConfig: DEFAULT_LAYOUT_CONFIG,
          }),
        ),
      });
    } else {
      // PUT
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            stationId: 'station-1',
            stationName: '测试驿站一',
            layoutConfig: { ...DEFAULT_LAYOUT_CONFIG, updated: true },
          }),
        ),
      });
    }
  });

  // 管理员：货架位置单独更新
  await page.route('**/api/admin/shelves/*/position', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ ok: true })),
    });
  });

  // 管理员：门店 3D 布局统一保存（货架 + bounds + doors + areas）
  await page.route('**/api/admin/station/layout', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() || {};
      const shelvesUpdated = Array.isArray(body.shelves) ? body.shelves.length : 0;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok({
            shelvesUpdated,
            layoutConfig: {
              bounds: body.bounds || DEFAULT_LAYOUT_CONFIG.bounds,
              doors: body.doors || DEFAULT_LAYOUT_CONFIG.doors,
              areas: body.areas || DEFAULT_LAYOUT_CONFIG.areas,
            },
          }),
        ),
      });
    } else {
      route.continue();
    }
  });

  // 管理员：一键自动布局
  await page.route('**/api/admin/shelves/auto-init-positions', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({ shelvesUpdated: SHELVES.length })),
    });
  });

  // Kiosk：获取货架布局 + 户型配置（公开接口）
  await page.route('**/api/kiosk/station/layout**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        shelves: SHELVES_WITH_POS.map((s) => ({
          number: s.number,
          sizeType: s.size_type,
          layers: s.layers,
          description: s.description,
          posX: s.pos_x,
          posY: s.pos_y,
          rotation: s.rotation,
          zone: s.zone,
        })),
        station: {
          // 驿站公开基础信息（1.2.0+ 起 /query 门户顶部展示）
          name: '测试驿站一',
          address: '北京市朝阳区测试路 1 号',
          contactPhone: '010-12345678',
          businessHours: '08:00-22:00',
          layoutConfig: {
            bounds: DEFAULT_LAYOUT_CONFIG.bounds,
            doors: DEFAULT_LAYOUT_CONFIG.doors,
            areas: DEFAULT_LAYOUT_CONFIG.areas,
          },
        },
      })),
    });
  });
}
