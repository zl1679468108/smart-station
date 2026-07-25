# Smart Station Agent Guide

新对话开始时先读本文件。本文件只保留 **agent 必守规则与索引**；产品细节见 PRD，任务见 TASKS，表结构见 SQL，部署细节见 deployment 文档。

## 1. 文档优先级

| 优先级 | 文档 | 用途 |
|---|---|---|
| 1 | [docs/PRD.md](./docs/PRD.md) | 功能定义、模块边界、交互/视觉 |
| 2 | [docs/TASKS.md](./docs/TASKS.md) | 任务状态 |
| 3 | [docs/database-init.sql](./docs/database-init.sql) | 表结构唯一真相源 |
| 4 | 当前代码 | 实现细节：先读代码再改 |

相关手册（按需读，勿回写成长文到本文件）：

- 部署操作：[docs/deployment.md](./docs/deployment.md)
- 部署完成摘要：[docs/cvm-deployment-overview.md](./docs/cvm-deployment-overview.md)
- 作品集状态（机器可读）：[docs/portfolio-status.json](./docs/portfolio-status.json)
- 试用清单：[docs/TRIAL-CHECKLIST.md](./docs/TRIAL-CHECKLIST.md)

## 2. 项目一页纸

智能快递驿站：工作人员后台 + 取件自助 + 扫描出库。**前后端独立工程**（非 monorepo），共享 Supabase PostgreSQL。包管理 npm，Node ≥ 20。

| 子项目 | 路径 | 栈 | 端口 |
|---|---|---|---|
| frontend | `frontend/` | React 18 + Vite + TS + Tailwind + SCSS | 3031 |
| backend | `backend/` | NestJS 10 + TS + Supabase JS SDK | 3030 |

### 数据流

```text
frontend → HTTP REST /api → NestJS → Supabase JS (PostgREST) → PostgreSQL
```

前端**不**直连 Supabase。响应统一为 `{ success, message, data }`；时间戳由后端转为北京时间 `YYYY-MM-DD HH:mm:ss.SSS`；前端 `request<T>()` 解包返回 `data`。

### 多端路由（单一 SPA）

| 端 | 断点 | 路由 | 说明 |
|---|---|---|---|
| PC 后台 | ≥1200px | `/admin/*` | 工作人员 |
| 平板 | 768–1200px | `/admin/*` `/query/*` | 现场操作 + 自助 |
| 查询门户 | 768–1200px | `/query/*` | 无登录取件查询（原 kiosk 已合并） |
| 扫描机 | 全屏 | `/scan/*` | 出库扫描 |
| H5 | <768px | `/query?device=h5` | 远端轻量查件 |

### 认证与多租户（摘要）

- **工作人员**：自定义 Token Session（非 JWT），`Authorization: Bearer <token>`；`TokenAuthGuard` + `@CurrentUser()`。
- **取件用户**：无登录；`/api/kiosk/*` 用 `@Public()`，**必须限流 + 脱敏**（手机尾号 4 位、姓名首字 + `**`）。
- **驿站隔离**：数据按 `station_id`；`@StationId()`；前端自动带 `x-station-id`。

细节以代码与 PRD 为准，勿在本文件展开实现算法。

## 3. 常用命令

```bash
# 开发
cd backend && npm run start:dev
cd frontend && npm run start          # :3031，/api 代理到 :3030

# 类型 / 构建
cd frontend && npx tsc --noEmit && npm run build
cd backend  && npx tsc --noEmit && npm run build

# 预检 / 冒烟 / 生产部署
bash scripts/preflight.sh
bash scripts/smoke-trial.sh          # 可选
bash scripts/deploy-cvm.sh           # CVM 生产主入口
```

## 4. 目录索引（精简）

```text
frontend/src/
  pages/{admin,query,scan}/   按路由前缀分页面
  components/ui/              自研 UI（无 antd/MUI）
  services/                   API（request 基于 fetch）
  hooks/ utils/ types/ styles/ routes/

backend/src/
  auth/ inbound/ inventory/ outbound/ kiosk/ stats/
  admin/ notify/ overdue/ exception/ shipping/ finance/
  appointments/ shifts/ ocr/ health/ supabase/ common/

docs/                         PRD TASKS SQL 部署与试用文档
scripts/                      deploy-cvm / preflight / smoke
config/nginx/                 多项目子路径 conf
```

## 5. 改动与文档同步

改功能时：确认 PRD → 看 SQL → 看 TASKS → 读代码 → 改代码 → 同步受影响文档。

| 改动 | 同步范围 |
|---|---|
| 后端 API | controller + service + module（注册 `app.module`） |
| 表字段 | `database-init.sql` + 前后端 types/service + 前端 API |
| 前端页面 | page + routes + services |
| 生产部署成功 | 见 §8（必做 portfolio 回填） |

## 6. Frontend 规则

- 路由：`react-router-dom` v6 **HashRouter**，`React.lazy()`，配置在 `src/routes/`。
- 状态：服务端 `@tanstack/react-query` v5；客户端 Context。无 Redux/Zustand。
- API：`src/services/api.ts` 的 `request<T>()`（原生 fetch），自动附 `Authorization` 与 `x-station-id`。
- 样式：SCSS + Tailwind + `design-tokens.css`；主色 `#FF6A00`；断点 `sm:768` / `lg:1200`，移动优先。
- UI：自研组件在 `src/components/ui/`。
- 页面根节点：只用 `w-full`（列表可 `space-y-4`，表单可 `max-w-*`）；**禁止**再叠 `p-*` / `mx-auto` 居中造成双重留白（留白由 `page-layout-main` 提供）。
- 页面标题：一律 `PageHeader`（`text-lg font-semibold text-gray-800`）；不要手写 `<h1>`。
- 环境变量前缀：`VITE_`。生产子路径：`base=/smart-station/`，`VITE_API_BASE_URL=/smart-station`（服务路径已含 `/api`）。
- Kiosk/触摸：最小点击区约 48×48px。

## 7. Backend 规则

- 全局前缀 `/api`。模块三件套：controller + service + module。
- 全局：`ValidationPipe`（whitelist/transform/forbidNonWhitelisted）、`ResponseInterceptor`、`HttpExceptionFilter`、`ThrottlerModule`（kiosk）。
- DTO：`class-validator` + `class-transformer`；Query 数字用 `@Type(() => Number)`。
- 装饰器：`TokenAuthGuard` / `AdminGuard` / `@Public()` / `@CurrentUser()` / `@StationId()`。
- 上传：`FileValidationPipe`（jpeg/png/webp，≤5MB）→ Supabase Storage。
- 已实现模块含：Auth、Inbound、Inventory、Outbound、Kiosk、Stats（含报表扩展）、Admin、Notify、Overdue、Exception、Shipping、Finance、Appointments、Shifts、OCR、Health。`SupabaseModule` 为 `@Global()`。
- TS 较宽松（`strictNullChecks: false` 等）。Prettier：singleQuote、trailingComma all、printWidth 100。
- 生产启动建议：`NODE_OPTIONS=--dns-result-order=ipv4first`。

## 8. 部署与 portfolio 回填

**生产**：腾讯云 CVM + Nginx + PM2，与静记等同机子路径。

| 项 | 值 |
|---|---|
| 前端 | https://zlspace.site/smart-station/ |
| API | https://zlspace.site/smart-station/api/ |
| PM2 / 端口 | `smart-station-api` / 3030 |
| 静态 / 后端目录 | `/var/www/smart-station` / `/opt/smart-station/backend` |

操作步骤与排障 → [docs/deployment.md](./docs/deployment.md)。

### 8.1 部署成功后必须回填（强制）

每次 `bash scripts/deploy-cvm.sh`（或等价生产上线）**验证通过后**必须回填，**禁止只部署不回填**；**必须含部署时间**。

1. 本仓库  
   - `docs/portfolio-status.json`：`status`、`deployedAt`（Asia/Shanghai，`YYYY-MM-DD` 或带时分）、`urls`、`access`、`verification`  
   - `docs/cvm-deployment-overview.md`：部署日期、入口、验证结果  
2. 作品集 `/Users/zhaolong/前端/vibe-coding-project/portfolio`  
   - `src/data/projects.ts`（`id: 'smart-station'` → 已上线 + access）  
   - `README.md` 状态表  
   - `docs/tasks.md` 勾选并注明部署日期  
3. 汇报用户时给出公网 URL + 部署时间  

标准入口：`/`、`#/admin/login`、`#/query`、`#/query?device=h5`、`/api/health`（均挂在 `/smart-station` 下）。  
可选：用户要求时再 `portfolio` 执行 `npm run deploy`。

## 9. 数据库与时间

- Schema 真相源：`docs/database-init.sql`。无 ORM / 无 migration 框架。
- DDL 必须在 Supabase SQL Editor **手动**执行；改表后同步 SQL + 前后端 types/API。
- DB 存 UTC；API 输出北京时间字符串；调度比较用 UTC。

## 10. 验证

按改动风险选择：

- `npx tsc --noEmit`（前后端）
- `npm run build`（涉及端）
- Network / `curl` 看响应结构
- PC / 平板 / H5 三档视觉（`sm` / `lg`）

失败时说明是本次改动还是既有问题。项目暂无完整自动化测试。

## 11. Gotchas

1. **DDL 不能自动化**——改 `database-init.sql` 后提醒用户手跑 SQL。  
2. **Kiosk 公开接口**——`@Public()` 必须限流，防遍历手机号。  
3. **取件码唯一**——格式 `货架-层-件号`，同架同层在库防重（冲突重试）。  
4. **隐私脱敏**——kiosk 不可返回完整手机号/姓名。  
5. **时间字符串**——前端做 Date 计算时注意北京时间格式。  
6. **DNS**——macOS 建议 `NODE_OPTIONS=--dns-result-order=ipv4first`。  
7. **Supabase 冷启动**——Free 实例首请求可能慢数秒。  
8. **密钥**——只放 env；改配置只动 `.env.example`，真实 `.env*` 已 gitignore。  
9. **Nginx 多项目 conf**——`deploy-cvm` 会整文件覆盖，部署后确认仍含 portfolio/bookkeeping/lifetracker/smart-station。  
10. **部署后回填 portfolio**——见 §8.1，含 `deployedAt`。

## 12. 注意

- 敏感信息不硬编码。  
- 能用现有模式就不要造新抽象；不重构无关文件。  
- 改共享模块（API/主题/路由/store）先评估影响面。  
- 取件码同驿站同日不重复；公开端注意限流与脱敏。
