// 系统版本信息配置（PRD §4.12.6）
// 每次发版由开发人员更新此文件，追加新版本日志到 changelog 数组头部

export interface ChangelogEntry {
  type: 'added' | 'optimized' | 'fixed';
  description: string;
}

export interface ChangelogVersion {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

export const systemInfo = {
  name: '智能快递驿站',
  nameEn: 'Smart Station',
  currentVersion: '1.1.0',
  description: '综合快递驿站存取件管理系统，覆盖包裹入库、自助查询、自助取件、自助出库全闭环',
  modules: [
    '工作台',
    '入库管理',
    '库存查询',
    '出库管理',
    '滞留件管理',
    '异常件管理',
    '寄件管理',
    '财务结算',
    '数据统计',
    '系统管理',
    '用户自助查询门户',
  ],
  techStack: 'React 18 + Vite + NestJS 10 + Supabase (PostgreSQL)',
  platforms: 'PC Web + 平板 PAD + H5',
};

// 版本更新日志（倒序，最新版本在数组头部）
export const changelog: ChangelogVersion[] = [
  {
    version: '1.1.0',
    date: '2026-07-15',
    entries: [
      { type: 'added', description: '用户自助查询门户（/query），支持手机号/运单号/取件码三种方式，常驻虚拟键盘，三端响应式' },
      { type: 'added', description: '人工辅助出库改为查询+确认两步流程，新增手机号查询方式' },
      { type: 'added', description: '系统管理新增「版本说明」子模块' },
      { type: 'added', description: '取件码查询接口 POST /api/kiosk/query-by-code' },
      { type: 'added', description: '出库前查询接口 POST /api/outbound/search' },
      { type: 'added', description: '手机号直接查询接口 POST /api/kiosk/query-by-phone-direct（无需验证码）' },
      { type: 'optimized', description: '取件码格式改为 货架号-层号-随机4位（如 21-5-1234），含位置信息' },
      { type: 'optimized', description: '出库管理取件码锁定逻辑，查询与出库共用锁定计数' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-14',
    entries: [
      { type: 'added', description: '核心存取件闭环：认证 + 入库 + 库存 + 出库 + Kiosk 自助查询 + 扫描出库' },
      { type: 'added', description: '工作台 Dashboard：今日概览 + 趋势图 + 待办提醒' },
      { type: 'added', description: '系统管理：驿站信息、员工管理、货架管理、快递公司配置' },
      { type: 'added', description: 'H5 远端查件页面（/m）' },
      { type: 'added', description: '取件码生成器：6 位数字，同驿站同日唯一' },
      { type: 'added', description: '取件码错误 3 次锁定 10 分钟（出库场景）' },
    ],
  },
];
