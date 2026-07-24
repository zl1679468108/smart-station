# Smart Station Agent Guide

新对话开始时，先读取本文件。

## 1. 文档优先级

所有 AI 开发决策按以下优先级裁决：

| 优先级 | 文档 | 用途 |
|---|---|---|
| 1 | [docs/PRD.md](./docs/PRD.md) | 产品需求规范：功能定义、模块边界、交互/视觉规范 |
| 2 | [docs/TASKS.md](./docs/TASKS.md) | 当前任务状态：仅包含未完成的待办任务（后续创建） |
| 3 | [docs/database-init.sql](./docs/database-init.sql) | 数据库表结构：表名、字段、约束、索引（后续创建） |
| 4 | 当前代码 | 实现细节：以实际代码为准，先读代码再修改 |

不要把长篇部署步骤、产品说明或数据库 SQL 复制回 `AGENTS.md`。本文件只保留 agent 开发时必须遵守的规则和索引。

## 2. 项目概览

智能快递驿站（Smart Station），综合快递驿站存取件管理系统，两端独立架构，共享同一 Supabase (PostgreSQL) 数据库。

| 子项目 | 路径 | 技术栈 | 开发端口 |
|--------|------|--------|----------|
| **frontend** | `frontend/` | React 18 + Vite + TypeScript + Tailwind + SCSS | 3031 |
| **backend** | `backend/` | NestJS 10 + TypeScript + Supabase JS SDK | 3030 |

**不是 monorepo**：两个子项目各自独立，有各自的 `package.json`、`node_modules`，无共享包。包管理器为 npm。

**Node 要求**：>= 20.0.0

### 目标平台

| 端 | 断点 | 路由前缀 | 用途 |
|----|------|----------|------|
| PC | ≥1200px | `/admin/*` | 工作人员管理后台 |
| 平板 PAD | 768–1200px | `/admin/*` `/query/*` | 工作人员现场操作 + 取件自助 |
| Kiosk / 查询门户 | 768–1200px | `/query/*` | 取件自助查询（无登录，原 `/kiosk/*` 已合并） |
| 扫描机 | 全屏 | `/scan/*` | 出库扫描（独立设备） |
| H5 | <768px | `/m/*` | 远端查件（备用） |

单一响应式 React 应用通过路由前缀 + CSS 媒体查询适配以上全部场景。

### 数据流

```
[frontend] → HTTP REST → [backend NestJS] → Supabase JS SDK (PostgREST) → Supabase PostgreSQL
```

前端不直接访问 Supabase，所有数据操作通过后端 API。

### API 响应格式

所有响应被 `ResponseInterceptor` 统一包装：

```json
{ "success": true, "message": "...", "data": ... }
```

时间戳字段（`created_at`、`updated_at`、`inbound_at`、`outbound_at` 等）被自动转换为北京时间格式 `YYYY-MM-DD HH:mm:ss.SSS`。

前端的 `request<T>()` 函数会自动解包，直接返回 `data`。

### 认证机制

**工作人员**：自定义 Token Session（非 JWT）

- Token：`crypto.randomBytes(32).toString('hex')` 生成 64 字符 hex
- 存储：SHA-256 hash 存入 `ss_user_sessions` 表，原始 token 发给客户端
- TTL：3 天
- 客户端用 `Authorization: Bearer <token>` 传递
- 后端 `TokenAuthGuard` 校验，通过后 `@CurrentUser()` 装饰器取用户信息
- 连续失败 5 次锁定 15 分钟

**取件用户**：无登录

- Kiosk 端通过手机号尾号 + 验证码 / 运单号 / 扫描面单二维码 临时查询
- `/api/kiosk/*` 接口标记 `@Public()`，但需限流（同 IP 每分钟 ≤10 次，同手机号每小时 ≤5 次验证码）
- 查询结果脱敏：手机号仅显示尾号 4 位，姓名仅显示首字 + `**`

### 驿站（Station）多租户

- 一个工作人员可关联多个驿站（通过 `ss_staff` 表）
- `@StationId()` 装饰器从 `request.user.current_station_id` 取当前驿站 ID
- 所有包裹/库存/账单数据按 `station_id` 隔离
- 工作人员请求自动携带 `x-station-id` 头（前端自动附加）

### 数据库

**`docs/database-init.sql` 是数据库 schema 的唯一真相源**（预估 18 张表）。无 ORM、无 migration 框架。

表清单（预估）：`ss_users`、`ss_user_sessions`、`ss_stations`、`ss_staff`、`ss_roles`、`ss_permissions`、`ss_parcels`、`ss_parcel_events`、`ss_shelves`、`ss_pickup_codes`、`ss_overdue_rules`、`ss_exceptions`、`ss_shippings`、`ss_address_book`、`ss_courier_companies`、`ss_finance_bills`、`ss_finance_items`、`ss_sms_templates`、`ss_sms_logs`、`ss_devices`。

DDL 变更必须手动在 Supabase SQL Editor 执行。直连 DB 不可用，只能通过 REST API (PostgREST) 或 SQL Editor。

## 3. 常用命令

```bash
# 后端
cd backend && npm run start:dev      # 开发模式（watch）
cd backend && npm run build          # 生产构建

# 前端
cd frontend && npm run dev           # 开发模式，端口 3031
cd frontend && npm run build         # 生产构建
cd frontend && npm run preview       # 预览生产构建

# 类型检查
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

## 4. 目录索引

```text
frontend/
  src/
    pages/                页面（按路由前缀分子目录：admin/ query/ scan/ m/）
      admin/              工作人员后台页面
      query/              取件自助查询门户（原 kiosk 合并）
      scan/               出库扫描机页面
      m/                  移动 H5 页面
    components/           共享组件（ui/ 为原子组件）
    services/             API 服务层
    hooks/                共享 hooks
    utils/                工具函数 + Context Providers
    types/                TypeScript 类型定义
    styles/               全局样式、设计令牌、SCSS partials
    routes/               路由配置

backend/
  src/
    auth/                 认证模块
    inbound/              入库模块
    inventory/            库存模块
    outbound/             出库模块
    kiosk/                取件自助查询模块（公开 + 限流）
    stats/                统计模块（工作台 Dashboard）
    admin/                系统管理模块
    notify/               通知模块（免费通道 console/wecom/serverchan + 客户 WxPusher，不接商用短信）
    shipping/             寄件模块（寄件单 + 运费试算 + 地址簿）
    finance/              财务结算模块（费率 + 月结账单 + 对账 + CSV 导出）
    # 已实现 M24 overdue/exception、M25 shipping/finance、M26 stats 报表扩展（trend/funnel/retention/peak-hours）
    supabase/             Supabase 客户端
    common/               公共模块（interceptors / filters / pipes / guards / decorators）

docs/
  PRD.md                  产品需求文档
  TASKS.md                任务看板（后续创建）
  database-init.sql       数据库初始化脚本（后续创建）

scripts/                  部署脚本
```

## 5. AI 工作分工

### 5.1 跨文档协作规则

修改任何功能时，按以下顺序更新文档：

1. 先确认 `PRD.md` 中是否有该功能的定义
2. 查看 `database-init.sql` 确认表结构
3. 查看 `TASKS.md` 确认任务状态
4. 读当前代码确认实现细节
5. 修改代码后同步更新受影响的文档

### 5.2 代码修改分工

| 改动范围 | 需要修改的文件 |
|---|---|
| 新增/修改后端 API | controller + service + module + 注册到 app.module.ts |
| 新增/修改数据库字段 | database-init.sql + 前端 types/ + 后端 service/controller + 前端 API |
| 新增/修改前端页面 | 页面文件 + routes/ + services/ API 文件 |
| 新增/修改 UI 组件 | components/ui/ |
| 新增/修改业务逻辑 | 对应 service/controller + 前端 hooks/ 或 services/ |
| 新增/修改响应式适配 | 页面文件 + Tailwind 断点类 + 全局样式 |

### 5.3 验证分工

| 角色 | 负责验证 |
|---|---|
| TypeScript | `npx tsc --noEmit`（所有改动） |
| 前端构建 | `npm run build`（涉及前端） |
| 后端构建 | `npm run build`（涉及后端） |
| 关键接口 | 浏览器 Network 或 `curl` 验证响应结构 |
| 数据库改动 | 先在 Supabase SQL Editor 验证 SQL 语法，再本地测试 |
| 响应式 | 在 PC（≥1200px）/ 平板（768–1200px）/ H5（<768px）三档断点下视觉验证 |

### 5.4 文档维护分工

| 文档 | 维护时机 | 维护内容 |
|---|---|---|
| PRD.md | 新增/修改功能后 | 同步更新功能详述、模块矩阵 |
| TASKS.md | 任务开始/完成/阻塞时 | 更新任务状态 |
| database-init.sql | 表结构变化后 | 同步增删改字段、索引 |
| AGENTS.md | 项目规则/结构变化后 | 同步更新目录索引、规范、流程 |

## 6. Frontend 规则

- 路由使用 `react-router-dom` v6 HashRouter，全部 `React.lazy()` 懒加载。路由配置在 `src/routes/`。
- 路由分前缀适配多端：
  - `/admin/*` — 工作人员管理后台（PC 主用，平板可访问）
  - `/query/*` — 用户自助查询门户（取件用户，无登录；原 `/kiosk/*` 已合并）
  - `/scan/*` — 出库扫描机页面（独立设备，全屏扫描）
  - `/m/*` — 移动 H5 取件查询页（备用，远端查件状态）
- 状态管理：服务端用 `@tanstack/react-query` v5，客户端用 React Context。无 Redux / Zustand。
- API 层：`src/services/api.ts` 导出 `request<T>()` 函数（基于原生 fetch），无 Axios。自动附加 `Authorization` 与 `x-station-id` 头。
- 样式：SCSS + Tailwind CSS + CSS 设计令牌（`design-tokens.css`）。非 CSS Modules，所有样式为全局类名。主色调橙 `#FF6A00`。
- 组件：全自研 UI 库（无 antd/MUI），在 `src/components/ui/`。
- 响应式断点：`sm: 768px`（H5/平板分界）/ `lg: 1200px`（平板/PC 分界）。移动端优先样式，向上适配。
- 环境变量前缀：`VITE_`（Vite 约定）。
- 构建工具：Vite 5+。
- 页面布局留白：页面根节点只用 `w-full`（列表页配 `space-y-4`，表单页可加 `max-w-*` 限宽），四周留白统一由布局层 `page-layout-main` 提供（12/16/20px 三档断点）。**禁止**在页面根节点再叠 `p-*` / `mx-auto max-w-* 居中`，否则会造成双重内边距。
- 页面标题：所有 admin 页面标题一律用 `PageHeader`（`src/components/ui/PageHeader.tsx`），统一字号/颜色（`text-lg font-semibold text-gray-800`）与「标题 + 描述 + 右侧操作」布局。紧邻内容需要间距时传 `className="mb-4"`，根节点已用 `space-y-*` 则不用传。不要在页面里手写 `<h1>` 标题。

## 7. Backend（NestJS）规则

- 模块（已实现）：Auth、Inbound、Inventory、Outbound、Kiosk、Stats、Admin、Notify、Health、Overdue、Exception、Shipping、Finance。`SupabaseModule` 为 `@Global()`。Stats 模块含 Dashboard + 报表扩展（trend/funnel/retention/peak-hours，M26）。
- REST API 基础路径为 `/api`。
- 每个模块保持三件套：`controller`、`service`、`module`。
- 全局中间件：
  - `ValidationPipe`：whitelist + transform + forbidNonWhitelisted
  - `ResponseInterceptor`：统一响应包装 + 时间戳转北京时间
  - `HttpExceptionFilter`：统一错误处理
  - `ThrottlerModule`：Kiosk 接口限流
- DTO 验证：`class-validator` + `class-transformer`。Query 参数用 `@Type(() => Number)` 做字符串→数字转换。
- 认证装饰器：
  - `@UseGuards(TokenAuthGuard)` — 校验 token
  - `@UseGuards(TokenAuthGuard, AdminGuard)` — 管理员接口
  - `@Public()` — 取件自助查询接口（无需登录）
  - `@CurrentUser()` / `@CurrentUser('id')` — 取当前用户
  - `@StationId()` — 取当前驿站 ID
- 文件上传：`FileValidationPipe` 校验 MIME（jpeg/png/webp）和大小（≤5MB）。Supabase Storage 存储。
- TypeScript 配置：target ES2021, module CommonJS, `strictNullChecks: false`, `noImplicitAny: false`（较宽松）。
- Prettier：singleQuote, trailingComma all, printWidth 100, tabWidth 2, semi, arrowParens always。

## 8. 时间规则

项目所有时间字段遵循同一规则：

- 后端 `ResponseInterceptor` 自动将所有时间戳转为北京时间字符串：`YYYY-MM-DD HH:mm:ss.SSS`
- 前端如需 Date 对象做计算，注意解析北京时间字符串格式
- 数据库存储使用 UTC
- 调度任务（滞留件扫描、提醒推送）比较时间时使用 UTC

## 9. 数据库规则

- 开发和生产共用 Supabase 表，修改表结构必须谨慎。
- 初始化和迁移参考 [docs/database-init.sql](./docs/database-init.sql)。
- DDL 变更必须手动在 Supabase SQL Editor 执行。
- 修改表结构时，同步更新：
  - `docs/database-init.sql`
  - 前端 `src/types/`
  - 后端 service/controller
  - 前端 API 与 hooks

## 10. 常见开发流程

新增业务模块：

1. 更新 PRD 或确认已有需求。
2. 设计/更新数据库表（database-init.sql）。
3. 后端新增 module/controller/service。
4. 前端新增 types → services API → pages → routes。
5. 更新 `docs/TASKS.md`。

新增 UI 组件：

1. 放到 `src/components/ui/`。
2. 使用 SCSS + Tailwind 样式。
3. 检查 PC/平板/H5 三档断点下样式一致性。
4. Kiosk 端组件需保证触摸友好（最小点击区 48×48px）。

新增响应式页面：

1. 确认所属路由前缀（admin/query/scan/m）。
2. 移动端优先样式，向上适配平板、PC。
3. Query 与 Scan 端需考虑全屏沉浸式、无导航栏、超时返回。

## 11. 验证要求

改动完成后按风险选择验证：

- TypeScript：`cd frontend && npx tsc --noEmit` / `cd backend && npx tsc --noEmit`
- 前端构建：`cd frontend && npm run build`
- 后端构建：`cd backend && npm run build`
- 关键接口：用浏览器 Network 或 `curl` 验证请求次数和响应结构
- 响应式：Chrome DevTools 切换设备模拟器，验证 PC/平板/H5 三档断点

如果验证失败，说明是本次改动导致还是项目已有问题。

## 12. 注意事项

- 敏感信息只放环境变量，不要硬编码。
- 保持代码简洁，能用现有模式就不要造新抽象。
- 不要重构无关文件。
- 修改共享模块（store、API、主题、路由等）时要检查影响面。
- 文档职责分明：产品写 PRD，任务写 TASKS，数据库写 SQL，本文件只写 agent 必读规则。
- Kiosk 与 Scan 端是公开接口，注意限流与脱敏。
- 取件码生成需保证同驿站同日不重复。

## 13. 部署

**平台**（待定，候选）：
- 腾讯云开发 (CloudBase)：CloudRun + 静态网站托管
- Vercel（前端） + Railway（后端）

**部署脚本**（在 `scripts/` 目录，后续创建）：
- `deploy-backend.sh` — 构建 + 部署后端
- `deploy-frontend.sh` — 构建 + 部署前端
- `deploy-all.sh` — 全量部署

**无 CI/CD**：无 GitHub Actions 或其他自动化流水线（后续可加）。

## 14. 重要注意事项（Gotchas）

1. **数据库变更不能自动化**：无 migration 工具，DDL 必须手动在 Supabase SQL Editor 执行。修改 `docs/database-init.sql` 后提醒用户手动同步。

2. **Kiosk 接口公开但需限流**：`/api/kiosk/*` 标记 `@Public()`，但必须用 `ThrottlerModule` 限流，防止恶意遍历手机号。

3. **取件码生成需保证唯一性**：取件码格式为 `货架号-层号-件号`（如 `3-2-9903`），件号 = 随机生成 1-9999，同货架同层在库查表防重（冲突重试最多 100 次），同驿站同日不可重复。

4. **取件用户隐私脱敏**：Kiosk 端返回的收件人信息必须脱敏（手机号仅尾号 4 位，姓名首字 + `**`），不可返回完整信息。

5. **时间戳格式**：后端 `ResponseInterceptor` 会自动将所有时间戳转为北京时间字符串。前端需要 Date 对象做计算时注意解析格式。

6. **DNS 问题**：macOS 下 Node.js 默认 IPv6 DNS 解析有延迟，启动脚本建议加 `NODE_OPTIONS=--dns-result-order=ipv4first`。

7. **Supabase 冷启动**：Free Nano 实例有冷启动延迟，首次请求可能 pending 数秒。

8. **`.env` 文件**：各子项目的 `.env.development` / `.env.production` 包含实际密钥，已被 `.gitignore` 排除。修改配置时只改 `.env.example` 模板。

9. **响应式断点一致性**：所有页面需在 `sm: 768px` 和 `lg: 1200px` 两个断点下视觉验证，避免平板布局错乱。

10. **测试**：项目暂无自动化测试。后端配 Jest 但未写测试用例，后续可加关键路径测试。
