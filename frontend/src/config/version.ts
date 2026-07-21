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
  currentVersion: '1.2.8',
  description:
    '综合快递驿站存取件管理系统，覆盖包裹入库、自助查询、自助取件、自助出库全闭环',
  // 仅列已实现模块，避免误导用户；未实现的（滞留件/异常件/寄件/财务/数据统计报表）随版本迭代追加
  modules: [
    '工作台',
    '入库管理',
    '库存查询',
    '出库管理',
    '系统管理',
    '用户自助查询门户',
    '门店 3D 数字孪生',
  ],
  techStack: 'React 18 + Vite + NestJS 10 + Supabase (PostgreSQL)',
  platforms: 'PC Web + 平板 PAD + H5',
};

// 版本更新日志（倒序，最新版本在数组头部；仅保留近 3 个版本，更早的见 git 历史）
export const changelog: ChangelogVersion[] = [
  {
    version: '1.2.8',
    date: '2026-07-22',
    entries: [
      {
        type: 'fixed',
        description: '库存列表接通 URL 查询参数，工作台滞留/异常待办深链筛选生效',
      },
      {
        type: 'fixed',
        description: '自助出库公开接口增加 IP 限流，支持绑定驿站 stationId 防跨站误出库',
      },
      {
        type: 'optimized',
        description: 'Kiosk 查件强制按驿站隔离；取件码错误锁定持久化到 ss_pickup_code_attempts',
      },
      {
        type: 'optimized',
        description: '手机号直查接口更严格限流；短信通道支持 SMS_PROVIDER 开关',
      },
      {
        type: 'optimized',
        description: '3D 依赖拆包 + 部署脚本/环境模板补齐；文档与版本说明对齐 1.2.8',
      },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-07-17',
    entries: [
      {
        type: 'added',
        description:
          '/query 门户顶部展示当前驿站信息（名称/营业时间/地址/电话），方便取件用户确认到达正确驿站',
      },
      {
        type: 'added',
        description: '管理端侧边栏底部新增「自助查询」入口，新窗口打开 /query（仅 admin + clerk 可见）',
      },
      {
        type: 'added',
        description:
          'Kiosk layout 接口扩展返回驿站公开基础信息（name/address/contactPhone/businessHours）',
      },
      { type: 'added', description: '新增 externalLink 图标，UI 图标库补全' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-16',
    entries: [
      {
        type: 'added',
        description: '仓库 3D 布局配置：管理员可拖拽摆放货架 + 设置门口，坐标自动对齐 0.5m 网格',
      },
      {
        type: 'added',
        description: '/query 查询结果页 3D 货架视图，高亮包裹所在货架 + 门口到货架 L 形寻路路径',
      },
      {
        type: 'added',
        description: '货架物理位置字段（pos_x/pos_y/rotation/zone）+ 驿站户型配置（layout_config JSONB）',
      },
      {
        type: 'added',
        description: '管理员「仓库布局」Tab（系统管理内，支持拖拽编辑 + 一键自动布局）',
      },
      {
        type: 'optimized',
        description: 'ShelfMap3D 组件支持真实坐标与自动布局 fallback 混合模式',
      },
    ],
  },
];
