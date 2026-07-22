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
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ok({
        total: 2,
        succeeded: 2,
        failed: 0,
        results: [],
        errors: [],
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
