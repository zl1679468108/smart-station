# Smart Station 任务看板

> 任务状态唯一来源。产品需求和路线见 [PRD.md](./PRD.md)。
> 数据库 schema 见 [database-init.sql](./database-init.sql)。

### 2026-07-24 /m 收敛到 /query?device=h5

| ID | 优先级 | 任务 | 范围 | 状态 | 说明 |
|----|--------|------|------|------|------|
| M-QUERY-DEVICE | P1 | 统一用户查件入口 | frontend/query + routes | done | 新增 `useQueryDevice`（portal/h5/kiosk）；`device=h5`：顶部返回、原生输入、隐藏虚拟键盘、关闭 90s 空闲清空与硬件键盘接管；删除 `pages/m` 与 `MLayout` 及 `/m` 路由；query.spec 覆盖 h5 模式；同步 PRD/AGENTS/TASKS |


## 状态规则

| 状态 | 含义 |
|---|---|
| `todo` | 尚未开始 |
| `in_progress` | 正在处理 |
| `done` | 已完成并验证 |
| `blocked` | 被外部条件阻塞 |

维护规则：

- 新需求先更新 `PRD.md`，再拆任务到本文件。
- 完成任务时记录完成日期和关键验证。
- 之前版本已完成的里程碑不再保留在本看板中，可查看 PRD 附录路线或 git 历史。

---

## v1.0 核心存取件闭环

> 范围：认证 + 入库 + 库存 + 出库 + Kiosk 自助查询 + 扫描出库
> 目标：跑通「快递员送件 → 店员入库 → 收件人 PAD 查件 → 扫描机自助出库」全闭环
> 不含：滞留件自动化、异常件、寄件、财务、统计（v1.1+）

### M0 基础设施

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M0.1 | P0 | 后端 NestJS 脚手架初始化 | backend | done | package.json + tsconfig + main.ts + app.module.ts；`npx tsc --noEmit` 通过；监听 3030 |
| M0.2 | P0 | 前端 Vite + React 脚手架初始化 | frontend | done | package.json + vite.config + tsconfig + App.tsx；`npx tsc --noEmit` 通过；监听 3031 |
| M0.3 | P0 | Supabase 客户端封装 | backend/supabase | done | `supabase.module.ts` 全局模块；`.env.example` 模板；SupabaseClient 单例 |
| M0.4 | P0 | common 模块（拦截器/过滤器/管道/守卫/装饰器） | backend/common | done | ResponseInterceptor、HttpExceptionFilter、ValidationPipe、TokenAuthGuard、AdminGuard、@Public、@CurrentUser、@StationId |
| M0.5 | P0 | 前端 API 层与路由骨架 | frontend | done | `services/api.ts` 导出 request<T>()（fetch 封装 + Authorization/x-station-id 头）；`routes/` HashRouter 配置 admin/kiosk/scan/m 四组路由前缀 |
| M0.6 | P0 | 前端设计令牌与全局样式 | frontend/styles | done | `design-tokens.css`（主色 #FF6A00 等）；`globals.scss`；Tailwind 配置 + 断点 sm:768/lg:1200 |
| M0.7 | P0 | 数据库 schema 执行 | database | done | 在 Supabase SQL Editor 执行 database-init.sql；DDL 已就绪（13 张表），用户已于 2026-07-17 手动执行 |

### M1 认证模块

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M1.1 | P0 | 后端 Auth 模块（登录/登出/profile/password） | backend/auth | done | TokenService 生成 64 字符 hex；SHA-256 hash 存 ss_user_sessions；TTL 3 天；登录返回 {user, token, stations}；`/api/auth/*` 路由；连续失败 5 次锁 15 分钟；全局 TokenAuthGuard 已启用 |
| M1.2 | P0 | 前端登录页 + 路由守卫 | frontend/pages/admin | done | `/admin/login` 页面（账号支持手机号/邮箱）；登录接入 /api/auth/login；AdminLayout 内置初始化/未登录守卫；已登录访问登录页跳工作台 |
| M1.3 | P1 | 前端 AuthContext + 切换驿站 | frontend/utils | done | AuthContext 接入真实 API（login/logout/profile/switchStation/refreshProfile）；切换驿站更新 x-station-id 头；AdminLayout 顶部驿站下拉切换 |
| M1.4 | P1 | 前端个人资料 + 密码修改页 | frontend/pages/admin | done | `/admin/profile`（账号只读 + 用户名/头像可编辑）、`/admin/password`（旧+新+确认，前端+后端双重校验，成功后销毁全部会话强制重登） |

### M2 驿站与员工基础数据

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M2.1 | P0 | 后端 Admin 模块（驿站/员工/货架/快递公司 CRUD） | backend/admin | done | `/api/admin/*` 接口全部 AdminGuard 保护；驿站 GET/PUT；员工列表/新增（复用或创建用户）/编辑/启停；货架 CRUD；货架号支持编辑，同驿站唯一且有在库/滞留包裹时拒绝改号；快递公司 CRUD；后端 tsc+build 通过 |
| M2.2 | P0 | 前端系统管理页 | frontend/pages/admin/system | done | `/admin/system` Tab 页：驿站信息、员工管理、货架管理、快递公司四个子 Tab，全部接入 API；货架管理编辑态支持修改货架号；前端 tsc+build 通过 |
| M2.3 | P1 | 数据库种子脚本 | scripts/seed | done | `docs/database-seed.sql`：1 驿站 + 管理员（13800000001 / station123）+ 3 货架 + 5 快递公司；ON CONFLICT 可重跑；bcrypt hash 已验证 |

### M3 入库管理

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M3.1 | P0 | 后端 Inbound 模块（扫码入库/手动录入/批量导入） | backend/inbound | done | POST /api/inbound 单件入库；POST /api/inbound/batch 批量；自动识别快递公司（前缀）；自动分配货架（均衡）；容量校验；重复入库拦截；写事件轨迹；触发通知 |
| M3.2 | P0 | 取件码生成器 | backend/inbound | done | 取件码 = 货架号-层号-件号（如 3-2-9903），件号随机生成 1-9999，同货架同层在库查表防重，冲突重试 100 次；唯一索引兜底 |
| M3.3 | P0 | 前端入库页（扫码 + 手动录入） | frontend/pages/admin/inbound | done | `/admin/inbound` 三 Tab：扫码（自动聚焦连续扫码）、手动录入（可选快递公司/货架）、批量；入库成功显示取件码大字号 |
| M3.4 | P1 | 前端批量导入页 | frontend/pages/admin/inbound | done | CSV 粘贴方式实现（格式：运单号,姓名,手机号,备注）；前端解析+校验；后端逐条入库；错误行表展示（行号+原因） |
| M3.5 | P1 | 后端 Notify 模块（短信通知 stub） | backend/notify | done | NotifyService.sendInboundNotice 渲染模板写 ss_sms_logs（status=sent）；格式化取件码 X X X X X X；日志失败不阻断主流程 |

### M4 库存查询

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M4.1 | P0 | 后端 Inventory 模块（列表/详情/筛选/批量） | backend/inventory | done | GET /api/inventory 多维度筛选+分页+count；GET /api/inventory/:id 详情含关联（快递公司/货架/操作人）+ 状态轨迹事件；POST /api/inventory/batch-exception |
| M4.2 | P0 | 前端库存列表页 | frontend/pages/admin/inventory | done | `/admin/inventory`：7 维筛选栏 + 表格 + 分页；状态色块（在库蓝/出库绿/滞留橙/异常红/退回灰）；行选择 |
| M4.3 | P0 | 前端库存详情页 | frontend/pages/admin/inventory | done | `/admin/inventory/:id`：基础信息卡（含退回/操作人）+ 状态轨迹时间线（事件类型/时间/描述/操作人） |
| M4.4 | P1 | 前端批量操作 | frontend/pages/admin/inventory | done | 批量标记异常（弹窗输入原因，仅在库/滞留可操作，返回更新/跳过计数）；批量出库在 M5 出库页实现 |

### M5 出库管理

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M5.1 | P0 | 后端 Outbound 模块（人工辅助 + 自助扫描） | backend/outbound | done | POST /api/outbound/manual（TokenAuthGuard，操作员）；POST /api/outbound/self-service（@Public，扫描机）；校验运单号+状态；写 ss_parcel_events；GET /api/outbound/records 出库记录列表 |
| M5.2 | P0 | 前端出库管理页（人工辅助） | frontend/pages/admin/outbound | done | `/admin/outbound` 两 Tab：人工辅助出库（运单号/取件码，自动聚焦连续扫码）+ 出库记录列表（时间范围/方式筛选+分页）；后端 tsc+前端 tsc+build 通过 |
| M5.3 | P0 | 前端扫描出库页（/scan/*） | frontend/pages/scan | done | 全屏摄像头预览（getUserMedia）+ BarcodeDetector 可选；扫码枪键盘输入兜底；手动输入；出库成功页停留 3 秒自动返回扫描页；失败页可重试 |
| M5.4 | P1 | 取件码错误锁定 | backend/outbound | done | ss_pickup_code_attempts 表实现：同一取件码错误 3 次锁定 10 分钟；成功后清零；锁定期间人工出库返回 Forbidden |

### M6 Kiosk 自助查询

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M6.1 | P0 | 后端 Kiosk 模块（查询 + 限流 + 脱敏） | backend/kiosk | done | POST /api/kiosk/query-by-phone（手机号尾号 4 位+验证码）；POST /api/kiosk/query-by-tracking（运单号）；ThrottlerGuard 控制器级限流（同 IP 60s ≤10 次）；返回数据脱敏（手机号尾号4位、姓名首字+**） |
| M6.2 | P0 | 后端验证码发送（Kiosk 用） | backend/kiosk | done | POST /api/kiosk/send-code；6 位验证码写 ss_kiosk_codes；5 分钟有效；同手机号每小时 ≤5 次；v1.0 console.log 输出验证码不真实发短信 |
| M6.3 | P0 | 前端 Kiosk 首页 + 查询页 | frontend/pages/kiosk | done | 全屏沉浸式单页视图切换；两种查询入口（手机号+验证码/运单号）；KioskLayout 60s 无操作返回首页；触摸友好大字号按钮（注：1.2.0 起 /kiosk 路由下线，查询统一走 /query 门户） |
| M6.4 | P0 | 前端 Kiosk 包裹列表 + 取件引导 | frontend/pages/kiosk | done | 脱敏信息展示；取件码大字号 + tracking；货架引导卡片（货架号+区域）；空状态引导 |
| M6.5 | P1 | 前端 Kiosk 货架平面图 | frontend/pages/kiosk | done | 1.2.0 重构：/kiosk 下线合并到 /query；货架平面图改为 3D 视图（react-three-fiber + drei），按 size_type 自动分 A/B/C 区摆放立体货架，高亮包裹所在货架+层，OrbitControls 可旋转缩放。详见 M15

### M7 工作台 Dashboard

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M7.1 | P0 | 后端 Stats 模块（Dashboard 概览） | backend/stats | done | GET /api/stats/dashboard 返回今日入库/出库/在库/滞留/异常计数 + 昨日入库/出库（环比）+ 8:00-22:00 小时趋势 + 待办计数 |
| M7.2 | P0 | 前端工作台 Dashboard | frontend/pages/admin/dashboard | done | `/admin/dashboard`：5 张概览卡片 + 环比；纯 SVG 双折线趋势图（不引入 ECharts 依赖）；待办提醒卡片（点击跳库存筛选）；4 个快捷操作；后端 tsc+前端 tsc+build 通过 |

### M8 H5 远端查件（备用）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M8.1 | P1 | 前端 H5 查件页（/m/*） | frontend/pages/m | done | `/m` 手机号 + 验证码查件（复用 Kiosk 接口）；脱敏包裹列表（取件码/运单号/驿站/货架/入库时间）；仅查看不可出库；MLayout 顶部返回栏；前端 tsc+build 通过 |

### M9 收尾验证

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M9.1 | P0 | 端到端流程联调 | qa | done | Playwright e2e-flow.spec.ts 验证：登录→入库→库存→出库→出库记录全流程 + Kiosk 手机号查询 + Kiosk 取件码查询；157 测试全过（2026-07-17） |
| M9.2 | P0 | 三端响应式验证 | qa | done | Playwright responsive.spec.ts 验证 PC(1440x900)/平板(1024x768)/H5(375x667) 三档视口下 admin 后台登录页/工作台/库存/出库页正常渲染；157 测试全过（2026-07-17） |
| M9.3 | P0 | tsc + build 全通过 | qa | done | `cd frontend && npx tsc --noEmit` + `npm run build`；`cd backend && npx tsc --noEmit` + `npm run build` 全部 exit 0 通过（2026-07-17 复验通过） |
| M9.4 | P1 | Kiosk 限流与脱敏验证 | qa | done | 限流：KioskController `@UseGuards(ThrottlerGuard)` + ThrottlerModule 默认 60s/10 次；同手机号每小时 ≤5 次验证码在 KioskService 业务层实现；脱敏：KioskService.maskName（首字+**）+ maskPhone（仅尾号 4 位）已实现 |
| M9.5 | P1 | 取件码唯一性验证 | qa | done | 取件码 = 货架号-层号-件号，件号随机生成 1-9999 + 同货架同层查表防重 + 冲突重试 100 次；数据库唯一索引 `idx_ss_parcels_station_code_date`（station_id, pickup_code, (inbound_at AT TIME ZONE 'Asia/Shanghai')::date）兜底 |

---

## v1.1+ 后续版本（暂不拆任务，见 PRD §5.1）

- v1.1：滞留件自动化（超期任务/退回流程）+ 异常件完整流程
- v1.2：寄件管理 + 财务结算
- v1.3：数据统计报表
- v2.0：连锁多站点管理

---

## 1.1.0 用户自助查询门户 + 人工出库改造 + 版本说明

> 范围：① 新增 `/query` 三端统一查询门户（常驻虚拟键盘 + 手机号/运单号/取件码三种方式）；② 人工辅助出库改造为「查询+确认」两步流程；③ 系统管理新增「版本说明」Tab
> 详见 PRD §4.5、§4.14、§4.12.6
> 前置：1.0.0 核心闭环已完成

### M10 后端接口扩展

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M10.1 | P0 | Kiosk 新增取件码查询接口 | backend/kiosk | done | `POST /api/kiosk/query-by-code`；取件码格式 `^\d{1,3}-\d{1,2}-\d{1,6}$` 校验；复用 queryInStockParcels 脱敏返回；取件码错误 5 次锁 10 分钟（进程内 Map，单实例） |
| M10.2 | P0 | Outbound 新增查询接口 | backend/outbound | done | `POST /api/outbound/search`（TokenAuthGuard + station_id）；支持手机号/运单号/取件码三种查询；不脱敏返回完整信息；仅返回 in_stock；取件码查询复用锁定计数（与 manual 共用 ss_pickup_code_attempts） |

### M11 用户自助查询门户（/query）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M11.1 | P0 | 前端 Keypad 虚拟键盘组件 | frontend/components/ui | done | 数字键盘（3×4）+ 字母键盘（QWERTY）两种模式；按键 ≥48px；按下主色反馈；支持清空/退格 |
| M11.2 | P0 | 前端 /query 页面 + QueryLayout + 路由 | frontend/pages/query | done | 三种查询方式 Tab；常驻虚拟键盘（事件驱动）；PC 左右双栏/平板上下/H5 单列；90s 超时清空；路由已注册 |
| M11.3 | P0 | 前端 /query 结果展示 | frontend/pages/query | done | 卡片列表（取件码大号、运单号、快递公司、入库时间）；脱敏展示；空状态 EmptyState；Toast 错误提示 |

### M12 人工辅助出库改造

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M12.1 | P0 | 前端 Outbound.tsx 改造为查询+确认两步流程 | frontend/pages/admin/outbound | done | 三种查询方式 Tab（手机号/运单号/取件码）；查询结果列表不脱敏；每条「确认出库」按钮 + 二次确认弹窗；接入 search + manual；出库成功从列表移除 |

### M13 系统管理 - 版本说明

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M13.1 | P1 | 前端 version.ts 配置文件 | frontend/config | done | systemInfo（系统介绍）+ changelog（版本日志数组倒序，含 1.0.0 和 1.1.0） |
| M13.2 | P1 | 前端 VersionTab 组件 + 接入 System.tsx | frontend/pages/admin/system | done | 系统介绍卡片 + 版本日志卡片（新增绿/优化蓝/修复橙 Tag）；System.tsx 新增第 5 个 Tab，emoji 替换为 Icon 组件 |

### M14 收尾验证

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M14.1 | P0 | tsc + build 全通过 | qa | done | 前后端 `npx tsc --noEmit` + `npm run build` 全部 exit 0 通过（2026-07-17 复验通过） |
| M14.2 | P0 | /query 三端响应式验证 | qa | done | Playwright responsive.spec.ts 验证 PC/平板/H5 三档视口下 /query 页面结构完整、虚拟键盘按钮 ≥40px 触摸友好、查询成功显示结果；157 测试全过（2026-07-17） |
| M14.3 | P1 | 取件码查询限流与锁定验证 | qa | done | Playwright rate-limit.spec.ts 验证：admin 出库页锁定文案、Kiosk 取件码 5 次错误锁定、Outbound 3 次错误锁定、成功查询后计数清零；157 测试全过（2026-07-17） |

---

## 1.2.0 仓库 3D 布局 + 真实位置取件引导

> 范围：管理员配置仓库户型（门口 + 内部尺寸）+ 货架真实物理位置（拖拽摆放）；查询页 3D 视图升级为按真实位置渲染，门口到包裹货架画寻路路径
> 详见 PRD §4.6.3（取件引导）+ §4.12.3（驿站信息）
> 前置：1.1.0 已完成；M6.5 的自动布局 3D 视图已上线（fallback 基线）
> 设计原则：管理员配置一次，用户每次查询都看到真实位置 + 寻路；货架未配置坐标时自动 fallback 到 size_type 网格布局，向后兼容

### M15 数据库与后端接口

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M15.1 | P0 | DDL：ss_stations 加 layout_config 字段 | database | done | database-init.sql 已含 `ADD COLUMN IF NOT EXISTS layout_config JSONB NOT NULL DEFAULT '{}'` + COMMENT；v1.2.0 迁移段已就绪，待用户在 Supabase SQL Editor 执行 |
| M15.2 | P0 | DDL：ss_shelves 加 pos_x/pos_y/rotation/zone 字段 | database | done | database-init.sql 已含 4 个字段 + rotation CHECK (0/90/180/270) + COMMENT；v1.2.0 迁移段已就绪，待用户在 Supabase SQL Editor 执行 |
| M15.3 | P0 | 后端 DTO 扩展支持位置字段 | backend/admin | done | CreateShelfDto/UpdateShelfDto 已加 posX?/posY?/rotation?/zone?；UpdateShelfPositionDto 独立 DTO；class-validator 校验通过；后端 tsc+build exit 0 |
| M15.4 | P0 | 后端驿站户型配置接口 | backend/admin | done | `GET/PUT /api/admin/station/layout-config` 已实现于 admin.controller.ts；layout-config.dto.ts 含 bounds/doors 校验；后端 tsc+build exit 0 |
| M15.5 | P0 | 后端货架位置单独更新接口 | backend/admin | done | `PUT /api/admin/shelves/:id/position` 已实现；独立 DTO；station_id 隔离校验；admin.service.ts 含 autoInitShelfPositions；后端 tsc+build exit 0 |
| M15.6 | P0 | Kiosk layout 接口扩展返回位置+户型 | backend/kiosk | done | `GET /api/kiosk/station/layout` 返回 shelves（含 posX/posY/rotation/zone）+ station.layoutConfig；obstacles 仅管理员接口返回；后端 tsc+build exit 0 |

### M16 ShelfMap3D 升级（真实坐标 + 门口 + 寻路）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M16.1 | P0 | ShelfMap3D 支持真实坐标摆放 | frontend/components/ShelfMap | done | ShelfMap.tsx 支持真实坐标 + rotation 朝向 + zone 分区；无坐标时自动 fallback 到 size_type 网格；前端 tsc+build exit 0 |
| M16.2 | P0 | ShelfMap3D 渲染仓库地面 + 门口 | frontend/components/ShelfMap | done | 按 layoutConfig.bounds 绘制矩形地面 + 0.5m 网格；门口渲染为绿色发光框 + 门柱 + drei Html「入口」标签；(width/2, 0) 兜底；前端 tsc+build exit 0 |
| M16.3 | P0 | ShelfMap3D 寻路路径动画 | frontend/components/ShelfMap | done | 门口→高亮货架画 L 形曼哈顿路径（先 X 后 Y）；drei `<Line>` dashed 虚线 + 箭头 mesh + 「≈ N 米」距离标签（欧氏距离）；前端 tsc+build exit 0 |
| M16.4 | P0 | ShelfMap3D 高亮货架增强 | frontend/components/ShelfMap | done | 高亮货架橙色材质 + 底面脉冲光圈 + drei Html「您在这里」悬浮标注；非高亮货架半透明；多包裹多货架全部画路径；前端 tsc+build exit 0 |
| M16.5 | P1 | ShelfMap3D 相机自动框选适配真实布局 | frontend/components/ShelfMap | done | 相机初始视角自动框选全部货架；OrbitControls 限制垂直旋转角度不可翻到地下；窗口大小变化自动调整；前端 tsc+build exit 0 |

### M17 管理员配置后台（拖拽编辑器）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M17.1 | P0 | 新建 ShelfMap3DEditor 交互层 | frontend/components/ShelfMap | done | ShelfMapEditor.tsx 已实现；因 TransformControls 稳定性问题改用 group ref 直接操作实现 60fps 拖拽；0.5m 网格吸附；前端 tsc+build exit 0 |
| M17.2 | P0 | 新建 StationLayout 配置页 | frontend/pages/admin/system | done | StationLayoutTab.tsx 集成在 System.tsx 第 6 个 Tab「仓库布局」；仅 admin/clerk 可见；左侧 3D + 右侧面板（仓库尺寸/门口列表/货架坐标表/位置编辑）；前端 tsc+build exit 0 |
| M17.3 | P0 | 拖拽 → 接口保存 | frontend/pages/admin/system | done | 拖拽结束调 PUT /api/admin/shelves/:id/position；防抖 500ms 避免高频调用；门口修改调 PUT /api/admin/station/layout-config；前端 tsc+build exit 0 |
| M17.4 | P0 | 一键自动布局初始化 | frontend/pages/admin/system | done | 「一键自动布局」按钮调 POST /api/admin/shelves/auto-init-positions；后端 admin.service.ts autoInitShelfPositions 与前端 fallback 算法一致；坐标对齐 0.5m 网格；前端 tsc+build exit 0 |
| M17.5 | P1 | 户型尺寸面板 + 门口列表管理 | frontend/pages/admin/system | done | 右侧面板含仓库 width/depth 输入实时影响 3D 地面；门口列表支持增删 + 位置/标签；位置编辑表单（X/Y 0.5 步进 + 朝向下拉 + 区域）+ 保存/清空按钮；前端 tsc+build exit 0 |

### M18 查询页集成 + 收尾验证

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M18.1 | P0 | /query ResultView 升级使用真实布局 | frontend/pages/query | done | pages/query/Home.tsx 接入 layoutConfig + ShelfMap3D；自动检测 doors 渲染门口 + 寻路；无配置走自动布局；前端 tsc+build exit 0 |
| M18.2 | P0 | 前后端 tsc + build | qa | done | 本次验证：`cd frontend && npx tsc --noEmit && npm run build` exit 0（kiosk chunk 945KB / gzip 268KB）；`cd backend && npx tsc --noEmit && npm run build` exit 0 |
| M18.3 | P1 | 端到端验证：配置 → 查询 → 看到寻路 | qa | done | Playwright e2e-flow.spec.ts 验证：管理员访问仓库布局 Tab + 加载配置数据 + /query 3D 视图含门口「🚪」标注和「您在这里」高亮货架；157 测试全过（2026-07-17） |
| M18.4 | P1 | 三端响应式验证 | qa | done | Playwright responsive.spec.ts 验证 PC/平板/H5 三档视口下 3D canvas 正常渲染（尺寸>0）+ 门口标注可见 + 管理员配置页可访问；157 测试全过（2026-07-17） |

---

## 1.2.1 /query 驿站信息展示 + 管理端入口

> 范围：① /query 门户顶部展示当前驿站基础信息（名称/营业时间/地址/电话），让取件用户确认到达正确驿站；② 管理端侧边栏底部增加「自助查询」入口，方便工作人员一键打开 /query 验证
> 前置：1.2.0 已完成；kiosk layout 接口已能返回 station 数据

### M19 后端接口扩展 + 前端展示

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M19.1 | P0 | Kiosk layout 接口扩展返回驿站公开信息 | backend/kiosk | done | kiosk.service.ts getStationLayout 在 station 中新增 name/address/contactPhone/businessHours 字段（仅公开字段，过滤 overdue 规则、sms 开关等内部配置）；后端 tsc+build exit 0 |
| M19.2 | P0 | /query 顶部 header 展示驿站信息 | frontend/pages/query | done | Home.tsx header 左侧改为「图标 + 驿站名（主）+ 智能快递驿站 · 营业时间（副）」；header 下方加一行详细信息条展示地址 + 电话（H5 隐藏避免拥挤）；参考 admin/dashboard 左上角简洁样式；前端 tsc+build exit 0 |
| M19.3 | P0 | 管理端侧边栏增加「自助查询」入口 | frontend/layouts | done | AdminLayout.tsx 侧边栏底部新增「自助查询」链接（externalLink 图标），target=_blank 新窗口打开 /#/query；仅 admin + clerk 可见，viewer 不可见；前端 tsc+build exit 0 |
| M19.4 | P1 | 新增 externalLink 图标 | frontend/components/ui | done | Icon.tsx 新增 externalLink 图标（右上角箭头 + 框，stroke-based，与现有图标风格一致） |
| M19.5 | P0 | 端到端 + 角色权限验证 | qa | done | Playwright e2e-flow.spec.ts 新增 6 个测试：header 显示驿站名/营业时间、详细信息条显示地址+电话、admin/clerk 可见入口、viewer 不可见入口；163 测试全过（2026-07-17） |

---

## 1.2.2 3D 视图体验优化（后处理 + 相机动画 + 数据洞察）

> 范围：① Kiosk 取件端 3D 导览体验飞跃（Bloom 后处理 + 相机自动飞行到目标货架 + 流动光路径）；② 管理员端 3D 数据洞察（货架空满可视化 + 滞留件热力图）
> 前置：1.2.0 已完成（真实坐标 + 门口 + L 形寻路）；1.2.1 已完成
> 设计原则：Kiosk 端重导览（让取件用户一眼找到包裹），管理员端重数据洞察（让运营人员发现满载/滞留风险）；不在 Kiosk 端暴露内部数据
> 依赖增量：`@react-three/postprocessing`（Bloom）、`gsap`（相机动画），均懒加载在 /query 和 /admin/system 路由

### M20 Kiosk 端 3D 导览体验飞跃

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M20.1 | P0 | 安装后处理依赖 + Bloom 集成 | frontend/components/ShelfMap | done | package.json 新增 `@react-three/postprocessing@^2.19.1` + `postprocessing@^6.34.2`；ShelfMap.tsx Canvas 内挂 `<EffectComposer>` + `<Bloom>`（luminanceThreshold=0.2, intensity=0.6, mipmapBlur）；门口绿光 + 包裹橙色高亮出现真实发光感；无明显卡顿；前端 tsc + build exit 0（kiosk chunk 945KB / gzip 268KB，几乎无增量） |
| M20.2 | P0 | 相机自动飞行到目标货架 | frontend/components/ShelfMap | done | package.json 新增 `gsap`；ShelfMap.tsx CameraRig 重写：highlights 出现后用 gsap.to 平滑过渡相机 position + OrbitControls.target（45° 俯视 + 抬高 3.5m + 水平偏移 3.5m），1.2s power2.inOut；多包裹时取包围盒中心；OrbitControls makeDefault + 监听 'start' 事件 kill tween；前端 tsc + build exit 0 |
| M20.3 | P0 | 流动光路径 + 距离/步数/时间标签 | frontend/components/ShelfMap | done | PathLine 重写：useFrame 持续递减 `material.dashOffset`（1.0 m/s）让虚线流向终点；首次 0.5s opacity 0→1 出现动画；箭头/标签延后 0.3s 显示；标签扩展为「≈ 5 米 · 12 步 · 30 秒」（步数=ceil(距离/0.6m)，时间=距离/1.2 m/s）；前端 tsc + build exit 0 |
| M20.4 | P1 | Kiosk 端 e2e 验证 | qa | done | e2e-flow.spec.ts 新增 v1.2.2 describe：2 个测试通过 — ① Bloom 集成后 canvas 可见 + 尺寸>0 + 「您在这里」可见；② 等待 1.8s（gsap 飞行 1.2s + 路径流动 0.5s）后 canvas 仍正常渲染不崩 |

### M21 管理员端 3D 数据洞察

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M21.1 | P0 | 后端接口：货架占用率 | backend/admin | done | `GET /api/admin/shelves/occupancy` 已实现：返回 `{ shelfId, shelfNo, sizeType, layers, capacityPerLayer, capacity, currentCount, occupancyRate, layerBreakdown:[{layer,count,capacity}], posX/posY/rotation/zone/status }`；从 ss_parcels 在库+滞留 group by shelf_id+shelf_layer 内存聚合；AdminGuard + StationId 隔离；后端 tsc+build exit 0 |
| M21.2 | P0 | 后端接口：滞留件热力 | backend/admin | done | `GET /api/admin/parcels/overdue-heatmap` 已实现：返回 `{ shelfId, shelfNo, overdueCount, maxOverdueDays, buckets:{d1_3,d3_7,d7plus}, posX/posY/rotation/zone/status }`；从 ss_parcels status=overdue 内存聚合按入库天数分桶；AdminGuard + StationId 隔离；后端 tsc+build exit 0 |
| M21.3 | P0 | 前端 ShelfMapEditor 占用率可视化 | frontend/components/ShelfMap | done | ShelfMapEditor.tsx DraggableShelf 加 viewMode/occupancy props + getBoardColor 函数（layerBreakdown[i-1] 着色）+ 占用率百分比 Html；StationLayoutTab.tsx 加视图模式切换器（布局编辑/占用率）、懒加载 occupancy 数据、图例、右侧「占用详情」卡片（每层进度条 + 颜色块 + L 标签）；颜色阈值 < 60% 绿 / 60-85% 黄 / > 85% 红，与编辑器一致 |
| M21.4 | P0 | 前端 ShelfMapEditor 滞留热力图 | frontend/components/ShelfMap | done | ShelfMapEditor.tsx DraggableShelf 加 heatmap props + 滞留热力光圈 mesh（d7plus 红色脉冲动画）+ 滞留件数 Html；StationLayoutTab.tsx 扩展 viewMode 切换器加 heatmap 选项、懒加载 heatmap 数据、热力图例（1-3 天黄/3-7 天橙/7+ 天红脉冲）、滞留概览卡片（总数/涉及货架数/分桶统计/超 7 天警告）、滞留件 Top 10 清单（按 overdueCount 降序，可点击跳转选中）、选中货架滞留分桶明细卡片；非 default 模式禁用拖拽；前端 tsc + build exit 0 |
| M21.5 | P1 | 管理员端 e2e 验证 | qa | done | mock.ts 新增 mockOccupancyHeatmapApis + SHELVES_OCCUPANCY（空/半满/满三档）+ OVERDUE_HEATMAP（1-3天/3-7天/7+天三档）mock 数据；修复 /api/inventory/shelves mock 返回 SHELVES_WITH_POS（含 pos_x/pos_y/rotation/zone，否则 StationLayoutTab undefined.toFixed 崩溃）；e2e-flow.spec.ts 新增 4 个测试：视图模式切换器+占用率图例、占用详情卡片（每层进度条）、热力图例+滞留概览+Top10+7+天警告、Top10点击→分桶明细；全套 169 测试通过（含原 165 + 新 4） |

---

## 1.2.3 仓库布局建模式重构

> 用户反馈：占用率/滞留热力在 3D 视图上用途不大，移除；改为"建模工具"式交互——模型库拖拽建模；3D 网格铺满父容器宽度且水平居中。
>
> 决策：
> - 办公区/揽收区/门口从模型库拖入，数据存 `layout_config.areas`（JSONB）
> - 货架仍由「货架管理」Tab 维护，布局页只拖动已有货架到位置
> - 模型尺寸代码预设固定值，管理员不编辑尺寸
> - 占用率/滞留热力接口前后端一并删除

### M22 移除数据洞察功能

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M22.1 | P0 | 删除占用率/滞留热力全链路 | 全栈 | done | 前端：ShelfMapEditor 移除 ViewMode/occupancy/heatmap 逻辑（热力光圈/占用率层板着色/百分比Html/脉冲动画），StationLayoutTab 重写移除切换器/数据加载/详情卡片/图例，types/admin.ts 删 ShelfOccupancy/ShelfOverdueHeat/ShelfLayerOccupancy，services/admin.ts 删 fetchShelvesOccupancy/fetchOverdueHeatmap，mock.ts 删 SHELVES_OCCUPANCY/OVERDUE_HEATMAP/mockOccupancyHeatmapApis，e2e-flow.spec.ts 删 v1.2.2 管理员端 4 个测试；后端：admin.controller.ts 删 2 个路由，admin.service.ts 删 getShelvesOccupancy/getOverdueHeatmap 方法；前端 tsc + build exit 0；后端 tsc + build exit 0；e2e 全套 165 测试通过 |
| M22.2 | P0 | 3D 网格铺满父容器宽度 + 水平居中 | frontend/components/ShelfMapEditor | done | ShelfMap3DEditor 加 containerRef + ResizeObserver 监听容器尺寸（width/height state）；EditorScene 加 containerWidth/Height props，相机距离自适应公式：dist = max(groundW/(2*tan(22.5°)*aspect), groundD/(2*tan(22.5°)), 5) * 1.2，让地面网格铺满视口宽度；CameraRig 改用 resetKey（containerWidth x containerHeight）控制重置时机，避免货架拖拽时误重置；移除未使用的 useFrame import；网格中心保持原点（水平居中）；前端 tsc + build exit 0 |

### M23 模型库拖拽建模

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M23.1 | P0 | 扩展 layout_config 数据结构 + 后端 DTO | 全栈 | done | 后端 layout-config.dto.ts 新增 LayoutAreaDto（id/x/y/width/depth/height/type/label，type 限定 office\|pickup），UpdateLayoutConfigDto 和 SaveStationLayoutDto 都加 areas?: LayoutAreaDto[] 字段；admin.service.ts updateLayoutConfig 和 saveStationLayout 都支持 areas 合并写入 + 区域坐标必须在 bounds 内的业务校验；kiosk.service.ts 公开 layoutConfig 也输出 areas（只读）；前端 types/admin.ts 加 LayoutArea/LayoutAreaType + StationLayoutConfig.areas，types/kiosk.ts 同步加只读 areas；后端 tsc + build exit 0；前端 tsc exit 0 |
| M23.2 | P0 | ShelfMapEditor 模型库 + 拖拽入场景 | frontend/components/ShelfMapEditor | done | 导出 MODEL_LIBRARY 常量（办公区 3×3×2.5m 蓝、揽收区 4×2×2.5m 紫、门口 1.2×0.3×2m 绿）+ ModelLibraryItem 类型 + findModelByType；新增 DraggableArea 组件（半透明彩色底面 + 4 立柱 + 顶框 + 标签 + 选中光圈 + 拖拽手柄）；新增 DropZone 组件（useThree 拿 camera/gl/raycaster，监听 gl.domElement 的 dragover+drop，HTML5 dataTransfer 传 text/model-type，raycaster 投影 y=0 平面得落点）；SelectedTarget 扩展 'area'；EditorScene 渲染 areas + 接 onAreaDragEnd/onDropFromLibrary；ShelfMap3DEditorProps 加 onAreaDragEnd/onDropFromLibrary 回调 + selectedType 支持 'area'；StationLayoutTab selectedType state 同步加 'area'；前端 tsc + build exit 0 |
| M23.3 | P0 | StationLayoutTab 重构：模型库面板 + 区域管理 | frontend/pages/admin/system | done | 新增 areas/serverAreas state + selectedArea memo + handleAreaDragEnd/handleDropFromLibrary/handleRemoveArea/updateSelectedAreaField 回调；模型库拖入自动对齐 0.5m + 自动选中新加区域 + nextAreaLabel 自动编号 + genAreaId（crypto.randomUUID 优先）；左侧 3D 编辑器下方加「模型库」面板（3 张可拖拽卡片，HTML5 draggable + setData text/model-type）；移除原门口新增表单（改为模型库拖入）；右侧加「选中区域详情」（X/Y/标签可编辑 + 尺寸只读 + 删除）+ 「区域列表」+ 门口列表加删除按钮 + 门口列表加拖入提示；isDirty/reset/saveAll 全部纳入 areas；services/admin.ts saveStationLayout payload 加 areas 字段；前端 tsc + build exit 0 |
| M23.4 | P1 | e2e 测试更新 | qa | done | mock.ts DEFAULT_LAYOUT_CONFIG 加 areas mock（办公区 1 + 揽收区 1）+ 修复 layout-config GET/PUT mock 返回正确 { stationId, stationName, layoutConfig } 结构（之前返回 DEFAULT_LAYOUT_CONFIG 顶层导致 res.layoutConfig undefined）+ 新增 /api/admin/station/layout PUT mock（回显 body.bounds/doors/areas）+ kiosk layout mock 加 areas；e2e-flow.spec.ts 新增 v1.2.3 describe 块 4 个测试（模型库面板可见、区域列表显示 mock 区域、3D canvas 渲染、保存按钮禁用+卡片 draggable 属性）；全套 169 个 e2e 测试通过 |

---

## 1.2.4 3D 仓库质感与容量提示（已完成）

> 范围：在不新增数据库字段的前提下，增强用户端/管理端 3D 仓库的数字孪生质感，并在管理端恢复轻量级货架容量提示（仅使用已有 shelves 列表中的在库/余量字段，不引入滞留热力与独立占用率接口）。

### M27 3D 质感增强 + 轻量容量提示

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M27.1 | P1 | 用户端 3D 仓库视觉增强 | frontend/components/ShelfMap | done | ShelfMap.tsx 增强仓库外壳、低墙、灯带、地面层次、货架背板/侧边条、高亮包裹堆叠与补光；保持真实坐标、门口与路径逻辑不变；前端 tsc + build exit 0（2026-07-19） |
| M27.2 | P1 | 管理端 3D 轻量容量提示 | frontend/components/ShelfMapEditor | done | ShelfMapEditor.tsx 基于已有 inStockCount/remainingCapacity 渲染占用率侧边条、层内灯带与在库/余量 Html；StationLayoutTab.tsx 增加整体在库/余量/容量/占用率概览与选中货架容量信息；不恢复 M21/M22 中已删除的独立占用率/滞留热力接口；前端 tsc + build exit 0（2026-07-19） |

---

## 1.2.5 3D 工作区收敛（已完成）

> 范围：统一只读与编辑的仓库 3D 入口，消除重复相机/外壳策略；将布局编辑集中到工作台，系统设置只保留配置概览入口。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M28.1 | P0 | 统一仓库 3D 公共入口与相机策略 | frontend/components/warehouse3d | done | 新增 Warehouse3D `mode=view/edit` 公共入口；查询页和工作台走只读模式，编辑模式复用同一入口；WarehouseShell 默认关闭顶部黄灯带，CameraRig 默认总览、有焦点才飞、编辑模式不因容器变化重置；前端 tsc + build exit 0（2026-07-19） |
| M28.2 | P0 | 工作台仓库全屏 3D 与布局编辑入口 | frontend/pages/admin/Dashboard | done | Dashboard 接入库存占用只读 3D 总览（最大视口高度）；「调整布局」在工作台切换到完整编辑工作区并保留统一保存流程；前端 tsc + build exit 0（2026-07-19） |
| M28.3 | P1 | 仓库布局 Tab 降级 | frontend/pages/admin/system | done | 系统管理「仓库布局」仅显示尺寸和对象数量配置概览，并提供「在工作台调整布局」入口；前端 tsc + build exit 0（2026-07-19） |

---

## 1.2.6 社区驿站微型数字孪生（已完成）

> 范围：把 3D 场景从“大型仓库”语义收敛为“社区快递驿站门店”，用可配置模块表达不同门店真实布局；不新增数据库字段，继续复用 `layout_config.areas` JSON。
> 设计原则：小空间、真实经营感、可拖拽定制；先用 Three.js 程序化模型搭建组件库，后续可替换为 GLB 真实资产。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M29.1 | P0 | 扩展门店布局区域类型 | frontend+backend | done | `LayoutAreaType` 支持服务台、自提柜、异常件区、大件区等社区驿站模块；后端 DTO 校验同步放行；旧 office/pickup 配置兼容；前后端 tsc + build exit 0（2026-07-20） |
| M29.2 | P0 | 新增驿站 3D 模型组件库 | frontend/components/warehouse3d | done | 新增 StationModels 程序化模型：服务台、待取件区、自提柜、异常件区、大件区、办公区；支持按区域尺寸生成并可被编辑器拖拽摆放；前端 tsc + build exit 0（2026-07-20） |
| M29.3 | P0 | 只读/编辑 3D 场景接入真实门店模型 | frontend/components/ShelfMap* | done | 查询端和管理端共用真实门店模型；货架保留真实坐标与库存高亮；服务台/办公区作为寻路起点；前端 tsc + build exit 0（2026-07-20） |
| M29.4 | P1 | 管理后台文案从仓库改为驿站门店布局 | frontend/pages/admin | done | 工作台、系统设置、布局面板文案改为门店/驿站语义；相关 Playwright 文案断言同步更新；前端 tsc + build exit 0（2026-07-20） |
| M29.5 | P0 | 类型检查与构建验证 | qa | done | 前端 `npx tsc --noEmit` + `npm run build` 通过；后端 `npx tsc --noEmit` + `npm run build` 通过（2026-07-20） |

---

## 1.2.7 社区驿站 3D 首屏质感与加载稳定性（已完成）

> 范围：修复布局接口加载期间 3D 半数据渲染导致的变形/跳变，并补足社区驿站门店环境细节，减少默认视图空旷和单调感。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M30.1 | P0 | 布局接口加载期间禁止半数据渲染 3D 场景 | frontend/components/warehouse3d | done | `layoutLoading` 为 true 时只展示门店布局加载态，不挂载 ShelfMap/ShelfMapEditor Scene，避免 `/api/admin/station/layout-config` 未返回前按不完整数据计算 bounds/相机导致变形 |
| M30.2 | P1 | 社区驿站默认布局收敛 | frontend/components/warehouse3d | done | 默认门店尺寸由大仓库尺度收敛为 14m × 9m；空 `layout_config` 自动提供服务台、待取件区、自提柜、大件区、异常件区默认模型；已保存的空区域数组仍保持为空 |
| M30.3 | P1 | 门店环境细节增强 | frontend/components/warehouse3d | done | 公共 3D 外壳增加墙边储物柜、包裹陈列、门店灯箱、地面动线、排队栏杆与灯带；工作台/编辑器开启顶部灯带，减少大面积空白和单调感 |

---

## 1.2.8 已有功能健康度审计与优化计划（2026-07-22）

> 审计范围：对照 PRD / TASKS / 当前代码，验证「核心存取件闭环 + 查询门户 + 门店 3D」是否可运行，并记录缺陷与可优化项。
> 审计方式：文档交叉比对 + 全量源码结构盘点 + 前后端 `npx tsc --noEmit`（均 exit 0）+ 关键路径静态走查。**未在本轮重新跑全量 Playwright / 真机联调。**
> 结论摘要：**1.0–1.2.7 已宣称完成的核心闭环在类型与模块层面可用；未发现阻断编译的硬伤。但有若干交互缺陷、公开接口防护缺口、文档漂移，以及 1.3+ 业务模块未开工。** 另：工作区存在大量未提交改动（约 65 项，含 `warehouse3d` 重构），需先固化再扩功能。

### 审计结论总览

| 模块 | 状态 | 说明 |
|---|---|---|
| 认证（登录/登出/资料/改密/切站） | 基本正常 | Token Session + RolesGuard 已落地；连续失败锁定已实现 |
| 系统管理（驿站/员工/货架/快递公司） | 基本正常 | Admin CRUD + 角色显隐齐全 |
| 入库（扫码/手动/批量 + 取件码） | 基本正常 | 防重 + 均衡分货架 + 通知 stub 写日志 |
| 库存列表/详情 | 基本正常 | 多维筛选/分页/批量异常标记可用；**URL 状态深链未接通**（见 O1） |
| 出库（人工两步 + 记录） | 基本正常 | search + manual 有角色守卫 |
| 扫描机自助出库 `/scan` | 可用但偏弱 | `@Public` 自助出库**无限流**；运单跨站查询（单租户可接受） |
| 查询门户 `/query`（含 `?device=h5`） | 基本正常 | 脱敏/IP 限流已有；远端模式无虚拟键盘 |
| 工作台 Dashboard + 门店 3D | 基本可用 | 真实 stats + 3D 只读/编辑入口；WarehouseScreen 待办标题残留 `TODO` 文案；滞留/异常卡片跳库存深链失效 |
| 滞留件 / 异常件完整流程 | **未实现** | 仅有 status 枚举与库存批量标异常；无 cron/退回/定责工作流（见 M24） |
| 寄件 / 财务 / 独立统计报表 | **未实现** | 见 M25 / M26 |
| 文档一致性 | 漂移 | `version.ts=1.2.1`、PRD 版本/路线落后、AGENTS 仍写 `/kiosk/*` |

### 类型检查快照（2026-07-22）

- `cd frontend && npx tsc --noEmit` → exit 0
- `cd backend && npx tsc --noEmit` → exit 0
- 后端已注册模块：Auth / Admin / Inbound / Inventory / Outbound / Kiosk / Stats / Notify / Health
- 后端**未**注册：Overdue / Exception / Shipping / Finance（与 TASKS M24–M25 一致）
- 前端路由实际前缀：`/admin/*` `/scan/*` `/query/*`（**无** `/m/*`、**无**独立 `/kiosk/*`）

### 已确认缺陷 / 风险（写入优化任务）

| 编号 | 严重度 | 现象 | 根因线索 |
|---|---|---|---|
| B1 | P0 | 工作台「滞留件 / 异常件」点击跳 `/admin/inventory?status=...` 后筛选不生效 | `Inventory.tsx` 未读取 `useSearchParams` 初始化 `status` |
| B2 | P0 | 工作区大量未提交变更 + `test-results` 残留失败痕迹 | 1.2.5–1.2.7 与 hooks/3D 重构未固化；需回归 e2e 后提交 |
| B3 | P0 | `POST /api/outbound/self-service` 公开且无限流 | 控制器 `@Public()`，未挂 `ThrottlerGuard` |
| B4 | P1 | `/query` 查件结果可能跨驿站混入 | `kiosk.service.queryInStockParcels` 未按 `station_id` 过滤；layout 却按站取 |
| B5 | P1 | 版本说明仍显示 1.2.1 | `frontend/src/config/version.ts` 未跟到 1.2.5–1.2.7 |
| B6 | P1 | 工作台全屏门店屏「待办速览」标题带 `TODO` | `WarehouseScreen.tsx` 文案占位未去掉（数据本身已接 liveData） |
| B7 | P1 | AGENTS / PRD 与实现不一致 | 路由写 `/kiosk/*`；PRD 版本与路线仍像旧规划 |
| B8 | P2 | 取件码错误锁定仅进程内 Map | 多实例部署不共享；重启失效 |
| B9 | P2 | 短信通知 / 验证码未真发 | Notify stub + kiosk `console.log` 验证码 |
| B10 | P2 | 3D 查询端 chunk 体积大 | R3F + postprocessing + gsap，历史构建约 ~945KB gzip~268KB |
| B11 | P2 | 手机号直查（无验证码）易被撞库窥探（虽脱敏） | `query-by-phone-direct` 仅 IP 分钟级限流 |
| B12 | 信息 | 滞留 count 恒为 0（无自动扫描写 status=overdue） | 待 M24 overdue 模块，非当前闭环 bug |

### 优化任务清单（本轮新增，优先于扩功能）

> 编号 `O*` = Optimization / hardening。完成一项后把状态改为 `done` 并补验收日期。
> **建议执行顺序**：O1 → O2 → O3 → O5/O6 → O4/O7 → O8/O9 → O10+；完成 O1–O7 后再启动 M24。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| O1 | P0 | 库存列表接通 URL 查询参数（至少 `status`，建议兼容 phone/trackingNumber/pickupCode） | frontend/pages/admin/inventory | done | 从 Dashboard 点「滞留/异常」进入后筛选自动选中且列表请求带对应 status；手动改 URL 刷新仍生效；重置清空 query string；前端 tsc exit 0 |
| O2 | P0 | 固化未提交重构并全量回归 | qa + git | done | 梳理 65 项改动（warehouse3d/hooks/notification 等）；`frontend&backend tsc + build`；Playwright 全套绿；必要时更新 mock；再提交（本任务不强制发版） |
| O3 | P0 | 自助出库公开接口加限流 + 可选驿站绑定 | backend/outbound + scan | done | `self-service` 挂 Throttler（建议同 IP ≤30/min 或更严）；支持 `VITE_KIOSK_STATION_ID` / body.stationId 限定 station；无匹配时明确错误；后端 tsc+build exit 0 |
| O4 | P1 | 同步版本说明到当前能力水位 | frontend/config/version.ts | done | `currentVersion` ≥ 1.2.7；changelog 补 1.2.2–1.2.7 要点（3D 体验、门店孪生、工作台编辑入口、加载稳定性等）；VersionTab 可见 |
| O5 | P1 | 去掉 WarehouseScreen「待办速览 TODO」占位，并支持点击跳转 | frontend/components/warehouse3d | done | 标题无 TODO；超期/异常条目可跳库存或未来 overdue/exception 页；与 Dashboard 待办语义一致 |
| O6 | P1 | 修正 AGENTS.md 路由与模块描述 | AGENTS.md | done | 写明取件门户为 `/query`（原 kiosk 合并）；扫描 `/scan`；H5 `/m`；backend 实际模块列表与「无 overdue/exception/shipping/finance」现状一致 |
| O7 | P1 | 同步 PRD 版本号与已交付路线 | docs/PRD.md | done | 版本字段对齐；附录路线区分「已交付 1.0–1.2.7」与「规划 1.3+」；删除/改写过时「1.2.0=滞留件」表述 |
| O8 | P1 | Kiosk 查件按驿站隔离 | backend/kiosk + frontend | done | `query-by-*` / layout 统一使用 stationId（env 或 query）；包裹查询强制 `eq('station_id', ...)`；多站场景结果不串站；补充限流单测或 e2e mock 断言 |
| O9 | P1 | Dashboard 待办与库存深链联调 + 空状态文案 | frontend | done | 在 O1 基础上：当前无 overdue 数据时展示「暂无滞留（自动扫描将在 1.3 提供）」类提示，避免「坏链」体验；异常批量入口可从库存到达 |
| O10 | P2 | 取件码错误锁定持久化 | backend/kiosk + outbound | done | 与出库侧 `ss_pickup_code_attempts` 对齐或复用；多实例一致；进程重启不丢失 |
| O11 | P2 | 短信通道可切换（stub / 真实供应商） | backend/notify | done | 环境变量开关；stub 保持写 `ss_sms_logs`；真实模式接口抽象预留；失败不阻断入库 |
| O12 | P2 | 查询端 3D 体积与首屏性能 | frontend/warehouse3d | done | 路由级拆包 / 动态 import 已有则审计重复依赖；目标 query 首屏可交互时间与 chunk 体积可接受（记录前后对比） |
| O13 | P2 | 部署脚本与环境模板补齐 | scripts + .env.example | done | `deploy-frontend.sh` / `deploy-backend.sh` 或文档化步骤；`.env.example` 标明 `VITE_KIOSK_STATION_ID`、限流相关说明 |
| O14 | P2 | 手机号直查防刷增强 | backend/kiosk | done | 提高直查接口独立限流；或要求完整 11 位 + 图形/滑块验证码（产品确认后实施）；保留脱敏 |
| O15 | P2 | 补充关键路径自动化测试缺口 | frontend/tests | done | 覆盖：库存 URL status 深链、self-service 限流（可用 mock 429）、query station 隔离、WarehouseScreen 无 TODO 文案 |


### 1.2.8 完成记录（2026-07-22）

- O1–O15 已全部落地：库存深链、自助出库限流/绑站、查件驿站隔离、取件码锁定持久化、短信 SMS_PROVIDER、3D 拆包、部署脚本、文档/版本对齐、e2e 补充。
- 验证：前后端 `npx tsc --noEmit`；建议本地再跑 `cd frontend && npm test` 全量 Playwright。
- 未做强制 git commit（按用户未要求提交）。

### 与后续版本规划的关系

- **不要**用新模块开发掩盖 O1–O3：深链失效与公开出库无限流属于线上风险。
- M24（滞留/异常）启动后，O9 的跳转目标应从库存筛选项升级为 `/admin/overdue`、`/admin/exception`（对应原 M24.5）。
- M25/M26 优先级保持 TASKS 原判断：寄件/财务 > 独立统计报表。

---

## 1.2.9 只读 3D 点击漫游（已完成）

> 范围：在现有只读 3D 视图上增加看房式点击移动能力，不引入寻路库，不修改数据库。编辑器仍保留拖拽建模优先。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M31.1 | P1 | 只读 3D 支持点击地面平滑漫游 | frontend/components/warehouse3d + frontend/pages/query + frontend/pages/admin | done | 新增 `WalkthroughControls`；`Warehouse3D` 只读模式支持 `enableWalkthrough`；`/query` 与数字孪生大屏开启点击漫游；短点击地面后相机移动到目标点，拖拽旋转不误触；大屏巡航在漫游时暂停并延迟恢复；前端 tsc/build 验证 |
| M31.2 | P1 | 工作台 3D 总览收敛到数字孪生大屏 | frontend/pages/admin/Dashboard | done | 移除 Dashboard 内嵌 `Warehouse3D` 总览，顶部保留「数字孪生大屏」入口直达 `?view=screen`，并保留「调整布局」入口；避免工作台与大屏两套 3D 视觉重复 |
| M31.3 | P1 | 统一 3D 页面入口为 variant 预设 | frontend/components/warehouse3d | done | `Warehouse3D` 新增 `variant="guide" | "screen" | "editor"`；页面调用统一改为 variant 写法；guide/screen 的视觉主题、Bloom、点击漫游、巡航等默认值集中在入口预设中管理；内部仍保留 ShelfMap3D/ShelfMap3DEditor 分工 |
| M31.4 | P1 | 3D variant 精确回归测试 | frontend/tests | done | 新增 `warehouse3d-variant.spec.ts` 覆盖 guide/screen/editor 三种预设；同步历史 e2e 中门口标签与工作台 3D 收敛断言；专项 Playwright 回归通过 |
| M31.5 | P1 | 3D 货架包裹按真实库存渲染 | frontend/components/warehouse3d | done | 移除货架“最少 4 个”占位包裹逻辑；货架包裹数量严格取 `inStockCount`（最多截断展示）；`ParcelBox` 改为程序化纯色盒，避免占位 GLB 的 `A-12` 示意贴牌误导真实数据 |
| M31.6 | P1 | 3D 门店真实层高与模型库一致性 | frontend/components/warehouse3d + frontend/pages/admin + backend/admin | done | `layout_config.bounds` 支持可选 `height`；编辑页门店尺寸可设置宽/深/层高；3D 外壳墙体、灯光与大屏巡航高度跟随层高；模型库卡片改为与拖入模型一致的实体预览，拖拽预览不再只是抽象色块 |

---

## 1.6.0 面单 OCR 智能入库（已完成，2026-07-23）

> 范围：拍照/上传快递面单 → 腾讯云 OCR 识别 → 解析运单号/收件人/手机号 → 回填入库表单，人工确认后再走既有 `POST /api/inbound`。仅识别回填，不落库。为防止腾讯云免费额度用完后自动转按量付费，新增按月全局额度硬限（`ss_ocr_usage` 表 + 原子占用函数）。对应 PRD §4.3.8、§5.2 AI 识别、候选池 P1 / B1。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M32.1 | P1 | 后端 OCR 模块（腾讯云面单识别） | backend/ocr | done | 新增 `ocr.module/controller/service` + DTO；`POST /api/ocr/waybill`（TokenAuthGuard + Roles admin/clerk）；集成 `tencentcloud-sdk-nodejs-ocr` GeneralBasicOCR；启发式解析运单号/手机号/姓名；密钥仅存 `.env`，`.env.example` 加占位；注册到 app.module；后端 tsc+build 通过 |
| M32.2 | P1 | 前端面单识别上传组件 + 入库回填 | frontend/components/ui + frontend/pages/admin/inbound | done | 新增 `WaybillOcrUploader`（拍照/上传、≤5MB、JPG/PNG/WebP、预览、命中提示、触摸友好 ≥44px）；`services/ocr.ts` + `WaybillOcrResult` 类型；扫码/手动录入两种模式均接入识别回填（仅覆盖识别到的字段）；新增 camera 图标；前端 tsc+build 通过 |
| M32.3 | P1 | 端到端识别验证 | backend/ocr | done | 用 mock 面单图跑通腾讯云调用：鉴权成功，成功解析出运单号 `SF...`、手机号 `138...`、姓名「张伟」；密钥失败/图片解码失败均有友好降级提示 |
| M32.4 | P1 | OCR 月度额度硬限（防按量付费） | backend/ocr + database | done | 新增 `ss_ocr_usage` 表 + 原子函数 `ss_ocr_try_consume`（写入 database-init.sql，需手动在 SQL Editor 执行）；调腾讯云前先按月全局原子占用额度，达上限直接拒绝、不发起计费请求；表/函数未迁移时降级为进程内内存计数同样硬顶；响应带 `quota{used,limit,remaining,warning}`；env 加 `TENCENT_OCR_MONTHLY_LIMIT`(默认1000)/`TENCENT_OCR_WARN_THRESHOLD`(默认50)；后端 tsc+build 通过 |
| M32.5 | P2 | 面单预览点击放大 + 额度提醒 UI | frontend/components/ui | done | `WaybillOcrUploader` 缩略图可点击弹出大图（遮罩/右上角/Esc 关闭）；剩余额度低于阈值时展示 warning 提示条；前端 tsc+build 通过 |

## 1.6.1 小程序端上线前检查（已完成，2026-07-23）

> 范围：用户侧 `/query` 查询门户与 `/m` H5 查件页的功能、UI、交互和响应式上线检查。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| QA-MINI-1 | P0 | 查询门户输入与取件码兼容性修复 | frontend/query | done | 虚拟键盘切 Tab 后模式正确重置；实体键盘/扫码枪可输入当前查询框；取件码校验与后端 `^\d{1,3}-\d{1,2}-\d{1,6}$` 对齐；`tests/query.spec.ts` 23 项通过 |
| QA-MINI-2 | P1 | 移动端时间与触摸体验修复 | frontend/query + frontend/m | done | 北京时间字符串不再依赖浏览器 `Date` 解析；`/query` Tab/模式切换/键盘按钮与 `/m` 返回/验证码/提交按钮触摸热区 ≥44px；375px 视口无横向滚动 |
| QA-MINI-3 | P1 | 上线前验证 | qa | done | `cd frontend && npx tsc --noEmit`、`npm run build`、`npx playwright test tests/query.spec.ts`、`npx playwright test tests/responsive.spec.ts --grep "/query"` 全部通过；浏览器复测 `/query` 与 `/m` 移动视口无明显遮挡/溢出 |

---

## 1.6.2 免费通知通道（已完成，2026-07-23）

> 路线：不接商用短信；PC/PAD/H5 试验阶段用 console + 企业微信 Webhook + Server酱。对应 PRD §4.13 重写、候选池 B2 partial。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M33.1 | P1 | NotifyService 多通道扇出 | backend/notify | done | `NOTIFY_CHANNELS=console,wecom,serverchan`；`WECOM_WEBHOOK_URL` / `SERVERCHAN_SENDKEY`；入库/滞留/验证码共用 dispatch；失败不阻断；写 `ss_sms_logs.params` 含 channelResults；`SMS_PROVIDER=real` 降级 console 警告 |
| M33.2 | P1 | Kiosk 验证码走 Notify + devCode | backend/kiosk | done | sendCode 调 `sendVerificationCode`；非 production 或 `NOTIFY_EXPOSE_DEV_CODE` 返回 `devCode`；KioskModule 引入 NotifyModule |
| M33.3 | P1 | 文档与 env 模板 | docs + .env.example | done | PRD §4.13 免费路线；TASKS B2 partial；`.env.example` 去掉商用短信引导 |

---

## 1.6.3 通知隐私边界 + 客户绑定公示（已完成，2026-07-24）

> 修复：企微群广播取件码的隐私问题；补客户一对一绑定与系统公示。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M34.1 | P0 | 企微群仅脱敏公告 | backend/notify | done | wecom 通道只发尾号摘要，不发取件码/验证码；完整内容仅 console、管理员 Server酱、客户绑定 |
| M34.2 | P0 | 客户绑定表 + 公示配置 | database + backend | done | `ss_notify_bindings` + `ss_stations.notify_config`；bind/unbind/guide API；需 SQL Editor 执行 DDL |
| M34.3 | P0 | 查询端公示与绑定 UI | frontend/query + m + admin | done | NotifyBindCard；系统管理驿站信息可编辑公示；/query 与 /m 展示 |

---

## 1.6.4 WxPusher 扫码客户绑定（进行中/完成，2026-07-24）

> 客户主通道从 Server酱 SendKey 手填改为 **WxPusher 扫码关注**；企微群仍只发脱敏公告；管理员 Server酱 env 旁路保留。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M35.1 | P0 | NotifyService WxPusher 发送 | backend/notify | done | `sendWxPusher`；绑定 channel=`wxpusher` 走 UID；`WXPUSHER_APP_TOKEN` |
| M35.2 | P0 | 扫码 start/poll API + pending 表 | backend/kiosk + SQL | done | `notify-bind/wxpusher/start|poll`；`ss_notify_bind_pending`；需执行 `migration-wxpusher-m35.sql` |
| M35.3 | P0 | 查询端扫码绑定 UI | frontend NotifyBindCard | done | 验证码 → 展示二维码 → ≥12s 轮询；绑定成功提示 |
| M35.4 | P1 | 文档与 env | docs + .env.example | done | PRD §4.13；TASKS；`WXPUSHER_APP_TOKEN` 模板 |

---

## 1.6.5 PushPlus 备选 + 查件绑定转化（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M36.1 | P1 | PushPlus 发送与绑定 | backend/notify + kiosk | done | channel=`pushplus`；`POST notify-bind/pushplus`；需执行 migration-pushplus-m36.sql |
| M36.2 | P1 | 绑定状态查询 | backend/kiosk | done | `POST notify-bind-status` 仅返回 bound/channels |
| M36.3 | P1 | 查件成功转化引导 | frontend/query | done | 结果区强 CTA；未绑定兜底到店查；顶部 NotifyBindCard 支持双通道 |
| M36.4 | P2 | 客户文案去技术词 | frontend notify | done | 对外只说微信扫一扫/专属绑定码；其他方式折叠 |
| M36.5 | P2 | 管理端通知可观测 | admin system | done | 系统管理「通知记录」：绑定列表 + 发送日志 |

---

## 1.6.6 运营打磨：入库通知反馈 + 开关（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M37.1 | P1 | 入库成功返回通知回执 | inbound + notify | done | `notify.staffMessage`；未绑定/已私信/关闭开关可区分 |
| M37.2 | P1 | 入库成功页展示通知状态 | frontend inbound | done | 店员可见中文提示与绑定引导 |
| M37.3 | P2 | 驿站到件通知总开关 | admin station | done | `smsEnabled` 可配置，对应 `sms_enabled` |

---

## 1.6.7 运营打磨：批量通知汇总 + 失败重发（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M38.1 | P1 | 批量入库通知触达汇总 | inbound | done | `batch` 返回 `notifySummary`（已私信/未绑定/失败/已关）；前端导入结果展示 |
| M38.2 | P1 | 管理端通知重发 | admin + notify | done | `POST /api/admin/notify/logs/:id/resend`；到件/滞留可重发；记录页按钮+中文回执 |
| M38.3 | P2 | 文档 | docs | done | TASKS + PRD 通知运营说明同步 |

---

## 1.6.8 运营打磨：出库防连点 + 入库回看 + 工作台触达（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M39.1 | P1 | 扫描机出库防连点/友好错误 | frontend/scan | done | inFlight + 同码 2.5s 去重；常见失败中文提示 |
| M39.2 | P1 | 人工出库确认防重 | frontend/outbound | done | 确认中 loading；失败可重试不关弹窗 |
| M39.3 | P1 | 扫码入库会话最近 5 条 | frontend/inbound | done | 展示取件码 + 通知状态，便于连续作业回看 |
| M39.4 | P1 | 工作台今日到件触达 | stats + dashboard | done | 已私信/未绑定/失败 + 绑定人数；跳转通知记录 `?tab=notify` |
| M39.5 | P2 | 系统管理 Tab 深链 | frontend/system | done | `?tab=notify` 直达通知记录 |

---

## 1.7.0 业务功能：取件人身份核验（B3 第一刀）（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M40.1 | P0 | 人工出库强制手机后4位 | backend/outbound | done | `phoneTail` 必填且与收件人手机后4位一致，错误拒绝出库 |
| M40.2 | P0 | 出库确认弹窗核验 UI | frontend/outbound | done | 当面询问提示；确认弹窗不展示后4位；可选核验备注 |
| M40.3 | P1 | 轨迹留证 | outbound events + inventory detail | done | 事件描述「已核验手机后4位」；metadata.verify；详情页徽标 |
| M40.4 | P2 | 文档 | docs | done | PRD/TASKS B3 partial；拍照留证后续 |

---

## 1.7.1 业务修复：滞留件可查询可出库（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M41.1 | P0 | 出库查询/人工/扫描支持 overdue | backend/outbound | done | `in_stock`+`overdue` 可查可出；异常/已出/退回拒绝 |
| M41.2 | P0 | 查件门户支持滞留包裹 | backend/kiosk + query UI | done | 返回 status；结果卡「即将超期」提示 |
| M41.3 | P1 | 出库列表滞留徽标 | frontend/outbound | done | 橙边框 +「滞留·仍可出库」 |
| M41.4 | P2 | 文档 | docs | done | PRD 出库状态说明同步 |

---

## 1.7.2 业务功能：寄件待办 + 状态推进打磨（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M42.1 | P1 | 工作台寄件待办 | stats + dashboard | done | `shippingPending`/`shippingPicked`；跳转 `?status=` |
| M42.2 | P1 | 寄件状态机校验 | shipping | done | pending→picked/shipped/cancelled；picked→shipped/cancelled |
| M42.3 | P1 | 寄件列表运营动作 | frontend/shipping | done | 深链筛选；防连点；取消确认；待处理「直接发出」 |
| M42.4 | P2 | 文档 | docs | done | TASKS 同步 |

---

## 1.7.3 业务功能：财务待办 + 批量入库取件码回看（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M43.1 | P1 | 工作台财务未对账 | stats + dashboard | done | 上月 unreconciled+discrepancy 计数；跳转财务账期 |
| M43.2 | P1 | 财务页 month/status 深链 | frontend/finance | done | `?month=&status=` 与筛选同步 |
| M43.3 | P1 | 批量入库成功列表 | frontend/inbound | done | 展示运单号/取件码/通知摘要 |
| M43.4 | P2 | 文档 | docs | done | TASKS 同步 |

---

## 1.7.4 业务功能：在库天数 + 出库拍照留证（2026-07-24）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M44.1 | P1 | 库存在库天数 + 手机尾号查询 | inventory | done | list/detail `daysInStock`；phone 支持 4 位尾号 |
| M44.2 | P1 | 出库可选拍照留证 | outbound | done | base64 压缩上传 Storage；失败不阻断；轨迹 evidenceUrl |
| M44.3 | P2 | 库存详情展示留证链接 | inventory detail | done | 有 evidenceUrl 时「查看拍照留证」 |
| M44.4 | P2 | 文档/env | docs | done | `SUPABASE_STORAGE_BUCKET`；TASKS/PRD |


## 1.7.x 大件取件签名（B3 收尾）（2026-07-24）

| 编号 | 优先级 | 任务 | 模块 | 状态 | 说明 |
|---|---|---|---|---|---|
| M45.1 | P1 | 出库可选取件签名 | outbound | done | 核验弹窗手写板；base64 上传 Storage（kind=signature）；失败不阻断 |
| M45.2 | P2 | 库存详情展示签名 | inventory detail | done | 有 signatureUrl 时「查看取件签名」 |
| M45.3 | P2 | 文档 | docs | done | PRD/TASKS B3 done |


## 1.8.0 到付/代收货款（B4 第一刀）（2026-07-24）

| 编号 | 优先级 | 任务 | 模块 | 状态 | 说明 |
|---|---|---|---|---|---|
| M46.1 | P0 | 包裹收款字段 + 迁移 SQL | docs/sql | done | freight/cod/collect_status 等；migration-collect-m46.sql |
| M46.2 | P0 | 入库可录到付/代收货款 | inbound | done | 可选金额；>0 则 collect_status=unpaid |
| M46.3 | P0 | 出库收款确认 + 自助拦截 | outbound | done | 待收款必选方式；自助出库禁止待收款件 |
| M46.4 | P1 | 库存筛选/详情 + 工作台待办 | inventory/stats | done | collectStatus 筛选；待收款待办 |
| M46.5 | P1 | 收款日结 | finance | done | GET /api/finance/cash-day + 财务「收款日结」Tab |
| M46.6 | P2 | 文档 | docs | done | PRD/TASKS/SQL |


## 1.8.1 到付/代收货款补强（B4 第二刀）（2026-07-24）

| 编号 | 优先级 | 任务 | 模块 | 状态 | 说明 |
|---|---|---|---|---|---|
| M47.1 | P1 | 出库免收 | outbound | done | collectAction=waive，必填原因，轨迹留证 |
| M47.2 | P1 | 在库改价 | inventory | done | PATCH /api/inventory/:id/collect |
| M47.3 | P1 | 收款日结导出 + 免收汇总 | finance | done | cash-day/export CSV；日结含免收笔数/金额 |
| M47.4 | P2 | 文档 | docs | done | TASKS/PRD |


## 1.9.0 交接班 + 员工绩效（B5）（2026-07-24）

| 编号 | 优先级 | 任务 | 模块 | 状态 | 说明 |
|---|---|---|---|---|---|
| M48.1 | P0 | ss_shifts 表 + 迁移 | docs/sql | done | migration-shifts-m48.sql |
| M48.2 | P0 | 开班/交班/列表 API | backend/shifts | done | current/open/close/list |
| M48.3 | P0 | 员工绩效 API | backend/shifts | done | GET /api/shifts/performance |
| M48.4 | P0 | 交接班前端页 | frontend/shifts | done | 我的班次/记录/绩效 |
| M48.5 | P2 | 文档与导航 | docs+layout | done | 侧栏「交接班」；PRD/TASKS |


## 1.9.1 入库运营打磨：连续同收件人（2026-07-24）

| 编号 | 优先级 | 任务 | 模块 | 状态 | 说明 |
|---|---|---|---|---|---|
| M49.1 | P1 | 扫码/手动连续同收件人 | inbound | done | 成功后可保留姓名手机只换运单；换收件人一键清空 |
| M49.2 | P2 | 文档 | docs | done | TASKS |






---

## v1.0+ 后续版本规划

> 5 个未实现模块的必要性判断（PRD §4.7-4.11 已有完整定义）：
> - **滞留件管理（4.7）**：强必要。货架有限，长期占用必须管理，否则周转不开。`ss_overdue_rules` 表已在 schema 预留。
> - **异常件管理（4.8）**：必要。破损/丢失/错投是末端常见问题，需登记定责。
> - **寄件管理（4.9）**：必要。寄件是驿站主要收入来源，不做少一半业务。
> - **财务结算（4.10）**：必要。代收代付必须算清账，但可简化（先月结，对账后期）。
> - **数据统计（4.11）**：锦上添花。dashboard 已有概览，独立报表优先级最低，可降级。

### 1.3.0 滞留件 + 异常件管理（强必要）

> 规格见 PRD §4.7 / §4.8（1.3.0 已细化 API、级别算法、`ss_exceptions` 表与页面交互）。  
> 阈值复用 `ss_stations.overdue_*_days`；滞留列表基于 `ss_parcels` 计算级别。

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M24.0 | P0 | DDL：`ss_exceptions` + 事件类型确认 | docs/database-init.sql | done | 新增异常件表与索引；注释说明；提醒用户在 Supabase SQL Editor 手动执行 |
| M24.1 | P0 | 滞留件后端模块（overdue） | backend/overdue | done | 模块三件套；GET /api/overdue；POST /api/overdue/scan；POST /api/overdue/:id/return；@nestjs/schedule 每天 09:00 Asia/Shanghai 扫描全站；后端 tsc+build exit 0 |
| M24.2 | P0 | 滞留件前端页面 | frontend/pages/admin/overdue | done | /admin/overdue；级别 Tab+搜索+扫描；分色列表；退回 start/complete；侧栏入口；admin+clerk 写 / viewer 读；前端 tsc+build exit 0 |
| M24.3 | P0 | 异常件后端模块（exception） | backend/exception | done | GET/POST/PATCH /api/exception；登记写 ss_exceptions + parcel=exception + 事件；处理更新状态/resolution；attachments 为 URL 数组≤5；后端 tsc+build exit 0 |
| M24.4 | P0 | 异常件前端页面 | frontend/pages/admin/exception | done | /admin/exception；列表筛选+登记表单+处理弹窗；侧栏入口；前端 tsc+build exit 0 |
| M24.5 | P1 | Dashboard / 大屏跳转真实列表 | frontend | done | 工作台与大屏待办点击跳转 `/admin/overdue`、`/admin/exception`（不再仅跳 inventory status） |
| M24.6 | P1 | 端到端验证 | qa | done | Playwright `overdue.spec.ts`(5)+`exception.spec.ts`(5)：级别徽标/Tab 过滤/立即扫描提示/标记退回/viewer 只读；异常列表标签/状态筛选/登记弹窗/处理保存/viewer 只读；同步修正 `dashboard.spec.ts`+`optimization.spec.ts` 跳转断言为 `/admin/overdue`、`/admin/exception`；前后端 tsc+build exit 0（2026-07-23） |

### 1.4.0 寄件管理 + 财务结算（必要）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M25.1 | P0 | 寄件后端模块（shipping） | backend/shipping | done | ShippingModule 已注册；GET /api/shipping/list、POST /api/shipping/estimate、POST /api/shipping/create、GET /api/shipping/:id、PATCH /api/shipping/:id/status；寄件单号 JJ+日期+随机防重；运费 = 首重 + 续重(向上取整) + 保价费(保价额×费率)，无费率兜底默认值；地址簿 GET/POST/PATCH/DELETE /api/address-book；station_id 隔离；后端 tsc+build exit 0 |
| M25.2 | P0 | 寄件前端页面 | frontend/pages/admin/shipping | done | /admin/shipping 双 Tab（寄件单/地址簿）；下单弹窗含快递公司/取件方式/发收件人/物品/保价 + 运费试算；状态流转（待处理→已取件→已发出/取消）；地址簿 CRUD；侧栏 send 图标；RequireRole admin+clerk；前端 tsc+build exit 0 |
| M25.3 | P0 | 财务后端模块（finance） | backend/finance | done | FinanceModule 已注册；费率 GET/PUT /api/finance/rates（按月 upsert）；账单 GET /api/finance/bills、POST /api/finance/bills/generate（按快递公司内存聚合入库=代收/出库=代派/寄件运费，保留已对账账单）；每月 1 日 03:00 北京时间 cron 全站生成上月账单；GET /api/finance/bills/export 导出 UTF-8 BOM CSV（Excel 可打开，免新依赖）；后端 tsc+build exit 0 |
| M25.4 | P0 | 财务前端页面 | frontend/pages/admin/finance | done | /admin/finance 双 Tab（月结账单/费率配置）；账单表格（件数/应收/应付/净额/状态）+ 月份/状态筛选 + 生成账单(admin) + 导出 CSV + 明细弹窗 + 对账弹窗；费率配置弹窗(admin)；侧栏 wallet 图标；RequireRole admin+clerk，写操作页内 isAdmin 控制；前端 tsc+build exit 0 |
| M25.5 | P1 | 对账流程 | backend+frontend | done | POST /api/finance/bills/:id/reconcile 录入对账金额；金额与系统净额不一致自动置 discrepancy(有差异)，一致标记 reconciled(已对账)；前端对账弹窗展示系统净额 + 录入金额 + 备注 |
| M25.6 | P1 | 端到端验证 | qa | done | Playwright shipping.spec.ts(6) + finance.spec.ts(7)：列表/状态过滤/下单试算/地址簿/账单明细/对账/费率/角色守卫全过；前后端 tsc+build exit 0（2026-07-23） |

### 1.5.0 数据统计报表（锦上添花，可降级）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M26.1 | P2 | 统计后端模块（stats 扩展） | backend/stats | done | StatsReportService 提供 GET /api/stats/trend（日/周/月分桶）、/funnel（入库→出库→滞留→退回）、/retention（总体+按快递公司）、/peak-hours（8-22 小时+星期分布）；均 StationId 隔离；后端 tsc+build exit 0（2026-07-23） |
| M26.2 | P2 | 统计前端页面 | frontend/pages/admin/stats | done | 新增 /admin/stats 路由 + 侧栏入口；纯 SVG 图表（双折线趋势 + 粒度切换、水平漏斗、按快递公司滞留率柱状、按小时高峰柱状），与 Dashboard 一致不引入 ECharts；统计窗口 7/30/90 天切换；路由守卫 admin+clerk；前端 tsc+build exit 0（2026-07-23） |
| M26.3 | P2 | 端到端验证 | qa | done | Playwright stats.spec.ts 7 项：四类图表渲染、SVG、粒度切换、漏斗/滞留率/高峰数据、viewer 路由守卫拦截；全过（2026-07-23） |

> 注：1.2.0 版本号已用于「仓库 3D 布局 + 真实位置取件引导」（M15-M18），1.2.2/1.2.3/1.2.4 用于 3D 体验优化（M20-M23、M27），原计划版本号顺延。2.0.0 连锁多站点管理暂不拆任务。

---

## 执行顺序建议

### 1.0.0 核心闭环（已完成）
1. **M0 基础设施** → 跑通两端 dev server + Supabase 连接
2. **M1 认证 + M2 基础数据** → 登录可用 + 驿站/员工/货架/快递公司可配置
3. **M3 入库 + M4 库存** → 工作人员端核心闭环
4. **M5 出库** → 人工 + 自助扫描
5. **M6 Kiosk** → 取件用户端
6. **M7 Dashboard + M8 H5** → 体验补全
7. **M9 收尾验证** → 端到端 + 响应式 + tsc/build

### 1.1.0 查询门户 + 出库改造（已完成）
1. **M10 后端接口扩展** → Kiosk 取件码查询 + Outbound search 接口
2. **M11 /query 门户** → Keypad 组件 + 查询页面 + 结果展示
3. **M12 出库改造** → Outbound.tsx 两步流程
4. **M13 版本说明** → version.ts 配置 + VersionTab 组件
5. **M14 收尾验证** → tsc/build + 响应式 + 限流

### 1.2.0 仓库 3D 布局 + 真实位置取件引导（已完成）
1. **M15 数据库 + 后端接口** → DDL + DTO + 户型配置/位置更新接口 ✅ done
2. **M16 ShelfMap3D 升级** → 真实坐标 + 门口 + 寻路路径（核心视觉价值）✅ done
3. **M17 管理员配置后台** → 拖拽编辑器 + System Tab（配置入口）✅ done
4. **M18 查询页集成 + 收尾** → 接通真实数据 + tsc/build + 端到端 + 响应式 ✅ done

> 1.2.0 全部任务已完成，Playwright 自动化测试 157 用例全部通过（2026-07-17）

### 1.2.1 /query 驿站信息展示 + 管理端入口（已完成）
1. **M19.1 后端接口扩展** → kiosk layout 返回 station 公开信息（name/address/contactPhone/businessHours）✅ done
2. **M19.2 /query header 展示** → 驿站名 + 营业时间 + 地址 + 电话 ✅ done
3. **M19.3 管理端入口** → 侧边栏底部「自助查询」链接，新窗口打开 ✅ done
4. **M19.4 新增图标** → externalLink 图标 ✅ done
5. **M19.5 验证** → Playwright 新增 6 测试，163 用例全过 ✅ done

### 1.2.8 稳定性与优化（当前优先）
1. **O1 库存 URL 深链** → 修 Dashboard 待办跳转
2. **O2 固化重构 + 全量 e2e** → 清未提交风险
3. **O3 自助出库限流/绑站** → 堵住公开接口
4. **O4–O7 版本与文档对齐** → version / AGENTS / PRD
5. **O8–O9 查件隔离与待办体验** → 多租户正确性
6. **O10+ 硬化项** 与 **M24 滞留/异常** 并行评估（建议先 O 后 M）

---

## 候选池 Backlog（新功能挖掘，2026-07-23，未拆解）

> 从行业痛点与真实用户需求出发梳理，尚未拆解为可执行任务，仅登记方向与价值判断。
> 选定某方向开工时，先在 PRD 补功能详述与数据模型，再拆 `M**` 任务到本文件。
> 优先级判据：痛点真实度 × 价值 × 与现有架构契合度。

| 编号 | 方向 | 核心痛点 | 关联现有模块 | 价值判断 | 状态 |
|---|---|---|---|---|---|
| B1 | 面单 OCR 自动识别入库 | 晚高峰逐件扫码 + 手录手机号，排队到门口；入库耗时是运营第一瓶颈 | inbound / notify（PRD §5.2 已列 AI 识别） | 强必要：直接砍半入库耗时，提效命门 | ✅ done（1.6.0，见 M32） |
| B2 | 多通道通知触达 + 滞留转化 | 试验期不走商用短信；需真实触达演示 | notify / overdue | 强必要：串起 notify+overdue | 🟡 partial（免费通道+绑定+重发+M100 绑定后补发；商用短信不做） |
| B3 | 取件人身份核验 + 冒领留证 | 取件码可转发/偷看，晚高峰拿错件、冒领是真实纠纷源 | outbound / scan（PRD §4.5 出库两步流程） | 必要：降低纠纷与责任风险 | ✅ done（后4位核验 + 可选拍照 + 可选取件签名/大件推荐） |
| B4 | 到付件 + 代收货款（对用户收款线） | 到付、代收货款是真实现金业务，当前 finance 只做「与快递公司月结」，对用户收款缺失，钱账对不上 | finance / inbound / outbound | 必要：补齐现金流闭环 | ✅ done（录金额/改价/收款/免收/日结导出；与快递公司月结独立） |
| B5 | 交接班 + 员工绩效 | 多店员轮班，谁入谁出、交接盘点、日结现金无汇总，只有事件轨迹 | admin / stats / parcel_events | 有价值：多店运营管理需求 | ✅ done（开班/交班快照 + 班次记录 + 员工绩效） |
| B6 | 取件用户主动侧（订阅提醒 + 预约取件 + 到店导航） | 「有没有我的件」靠用户自查；跑空与滞留高 | query 门户 / notify | 有价值：提升留存、降跑空 | 🟡 partial（M50–M52+M100：导航/预约/绑定后补发在库码；订阅仍靠绑定通道） |

> **首推顺序建议**：B1–B5、B6 与通知/入库运营（M50–M57）已落地。按 `docs/TRIAL-CHECKLIST.md` 做真实试用。

---

## M50 轻量预约取件 + 到店导航（B6 第一刀）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M50.1 | P1 | 表 `ss_pickup_appointments` | SQL | done | `migration-appointments-m50.sql` 需手跑 |
| M50.2 | P1 | 公开接口 slots/create/my/cancel | kiosk | done | 限流沿用 kiosk |
| M50.3 | P1 | 店员列表 + 状态流转 | appointments | done | 确认/到店/未到/取消 |
| M50.4 | P1 | 查件门户到店导航 + 营业状态 | query | done | 高德/腾讯/复制地址 |
| M50.5 | P1 | 查件门户预约卡片 | query | done | 白话文案 |
| M50.6 | P2 | 管理端预约页 + 侧栏 | admin | done | `/admin/appointments` |

---

## M51 预约触达 + 工作台今日预约（B6 运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M51.1 | P1 | 预约创建/确认走免费通知 | notify + appointments | done | 客户绑定一对一；企微仅脱敏 |
| M51.2 | P1 | 创建回执白话提示 | query 预约卡片 | done | notifyHint |
| M51.3 | P1 | 工作台今日预约待办 | stats + Dashboard | done | 跳转 `/admin/appointments` |

---

## M52 预约营业时段 + 代客预约 + 入库聚焦（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M52.1 | P1 | 可约时段按营业时间过滤 | appointments | done | 解析 `business_hours`；整段在营业内才展示 |
| M52.2 | P1 | 店员代客预约 | admin appointments | done | POST `/api/appointments`；默认已确认 |
| M52.3 | P1 | 手动/扫码入库成功后聚焦运单号 | inbound | done | focus+select 便于连续扫 |

---

## M53 滞留补发 + 通知记录筛选（通知运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M53.1 | P1 | 滞留单件「发提醒」 | overdue | done | POST `/api/overdue/:id/remind`；可随时补发 |
| M53.2 | P1 | 通知记录今日/失败/类型筛选 | admin notify | done | query: todayOnly/status/templateCode |
| M53.3 | P2 | 工作台深链今日通知 | Dashboard | done | `?tab=notify&filter=today` |

---

## M54 入库补发通知 + 取件码复制（入库/通知运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M54.1 | P1 | 补发到件通知 API | inbound | done | POST `/api/inbound/:id/resend-notice` |
| M54.2 | P1 | 入库成功区/最近列表补发+复制 | inbound UI | done | 未绑定后绑定可再推 |
| M54.3 | P2 | 库存详情补发/复制 | inventory detail | done | 在库/滞留可操作 |

---

## M55 试用联调清单 + 入库手感（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M55.1 | P1 | 试用清单 TRIAL-CHECKLIST | docs | done | 迁移/环境/入库通知/业务速测 |
| M55.2 | P1 | 部署预检 preflight.sh | scripts | done | 检查 env 与迁移文件 |
| M55.3 | P2 | 入库尺寸记忆 + 成功提示音 | inbound | done | localStorage；可关提示音 |

---

## M56 入库绑定预检（通知/入库运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M56.1 | P1 | 手机号填齐后查询绑定状态 | inbound UI | done | 已绑定/未绑定白话提示 |
| M56.2 | P2 | 文档 | docs | done | TASKS |

---

## M57 批量入库通知补发闭环（入库/通知运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M57.1 | P1 | 批量成功列表复制码/单条补发 | inbound batch | done | 与单件能力对齐 |
| M57.2 | P1 | 一键补发未私信 | inbound batch | done | 未绑定/失败可重试 |
| M57.3 | P2 | 批量默认尺寸记忆 + 成功提示音 | inbound batch | done | 与扫码一致 |

---

## M58 通知触达筛选 + 工作台深链（通知运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M58.1 | P1 | 通知记录 reach 筛选 | admin notify API | done | unbound/pushed/push_failed + customerReach 中文 |
| M58.2 | P1 | NotifyTab 触达 chips + 本页一键补发 | NotifyTab | done | 默认今日到件；未私信/私信失败可补发 |
| M58.3 | P1 | 工作台「今日到件触达」标签深链 | Dashboard | done | stopPropagation 到对应 filter |

---

## M59 未绑定话术 + 滞留批量提醒（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M59.1 | P1 | 店员白话话术工具 | staffScripts | done | 当面含码 / 绑定引导不含码 |
| M59.2 | P1 | 入库成功未绑定强提示 + 复制话术 | inbound | done | 当面报码 / 引导绑定 |
| M59.3 | P1 | 工作台/通知记录复制绑定话术 | Dashboard + NotifyTab | done | 一键复制 |
| M59.4 | P1 | 滞留本页批量发提醒 | overdue | done | POST /api/overdue/remind-batch 最多30 |
| M59.5 | P2 | 库存详情/滞留/批量入库话术入口 | inventory+overdue+batch | done | 当面话术+绑定话术 |


---

## M60 交接班/待收款提示 + 通知记录分页导出（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M60.1 | P1 | 工作台班次状态条 + 待办动态 | Dashboard | done | 未开班/已开班本班汇总 |
| M60.2 | P1 | 入库/出库未开班软提示 | inbound+outbound | done | 引导去开班，不阻断 |
| M60.3 | P1 | 通知记录分页 | admin notify API | done | page + pageSize |
| M60.4 | P2 | 通知记录导出本页 CSV | NotifyTab | done | 含触达/状态中文 |


---

## M61 交班待收款提醒 + 通知按手机号聚合（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M61.1 | P1 | 交班前/班次页待收款提醒 | shifts | done | getCurrent 带 collectUnpaid；软提示+深链 |
| M61.2 | P1 | 通知按手机号聚合 API | admin notify | done | GET /api/admin/notify/logs/by-phone |
| M61.3 | P1 | NotifyTab 按手机号视图 | NotifyTab | done | 看明细/复制绑定话术/导出聚合 |


---

## M62 入库重复运单防呆 + 交班快照导出（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M62.1 | P1 | 运单预检 API + 冲突详情 | inbound | done | POST /api/inbound/check-tracking；Conflict 带取件码 |
| M62.2 | P1 | 扫码/手动入库重复醒目提示 | inbound UI | done | 防提交；跳转库存详情 |
| M62.3 | P2 | 交班快照/班次记录导出 CSV | shifts | done | 本班快照 + 历史本页 |


---

## M63 批量入库重复预检 + 出库待收款确认（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M63.1 | P1 | 批量运单预检 API | inbound | done | POST /api/inbound/check-tracking-batch |
| M63.2 | P1 | 批量导入跳过重复 + 预检面板 | inbound batch | done | 库内/CSV 内重复 |
| M63.3 | P1 | 出库待收款勾选「已当面收妥」 | outbound | done | 金额醒目；按钮收款出库 |


---

## M64 批量仅预检 + 出库待收款筛选（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M64.1 | P1 | 批量入库「仅预检」按钮 | inbound batch | done | 不导入，先看重复 |
| M64.2 | P1 | 出库加载在库待收款 | outbound | done | 库存 unpaid 映射出库列表 |
| M64.3 | P2 | 出库结果 全部/待收款筛选 | outbound | done | 客户端筛选 chips |


---

## M65 待收款深链出库 + 批量预检导出（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M65.1 | P1 | 工作台待收款深链出库页 | dashboard | done | /admin/outbound?unpaid=1 |
| M65.2 | P1 | 出库页 URL 自动加载待收款 | outbound | done | unpaid=1 触发 loadUnpaidParcels |
| M65.3 | P2 | 批量预检结果导出 CSV | inbound batch | done | 运单/拦截/取件码/说明 |

---

## M66 待收款深链闭环（交班/库存 → 出库）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M66.1 | P1 | 交班待收款跳转出库 | shifts | done | unpaid=1 与工作台一致 |
| M66.2 | P1 | 库存详情/列表去出库收款 | inventory | done | tracking 深链 |
| M66.3 | P1 | 出库页运单号 URL 自动查询 | outbound | done | ?tracking= 优先于 unpaid |

---

## M67 收款话术 + 工作台今日收款金额（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M67.1 | P1 | 收款/免收白话话术 | staffScripts | done | buildCollectReceipt/WaiveScript |
| M67.2 | P1 | 出库成功展示并可复制话术 | outbound | done | 确认前预览 + 成功横幅 |
| M67.3 | P2 | 工作台今日收款金额 | dashboard | done | cash-day 汇总进待办卡 |

---

## M68 批量入库结果清单导出（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M68.1 | P1 | 导出失败清单 CSV | inbound batch | done | 行号/运单/原因，便于改 CSV |
| M68.2 | P2 | 导出成功清单 CSV | inbound batch | done | 运单/取件码/通知状态 |
| M68.3 | P2 | 失败表展示运单号 | inbound batch | done | 错误列表可读性 |

---

## M69 查件绑定降门槛 + 入库待收款醒目（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M69.1 | P1 | 查件成功/空结果绑定 CTA 白话 | query | done | 扫一扫收码 / 约1分钟 |
| M69.2 | P1 | 绑定卡片按钮与步骤去技术词 | NotifyBindCard | done | 扫一扫收码 |
| M69.3 | P1 | 入库成功待收款醒目 + 出库深链 | inbound | done | 金额条 + 去出库收款 |
| M69.4 | P2 | 当面话术可带待收金额 | staffScripts | done | face script collectDue |

---

## M70 入库待收款金额预览与校验（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M70.1 | P1 | 到付/货款实时合计预览 | inbound form | done | CollectDueHint |
| M70.2 | P2 | 金额非法拦截 | inbound form | done | ≥0 数字校验 |

---

## M71 面单识别重试 + 工作台私信率（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M71.1 | P1 | OCR 失败保留预览可重试 | WaybillOcrUploader | done | 重新识别/换一张/白话错误 |
| M71.2 | P1 | 识别结果缺字段提示补全 | WaybillOcrUploader | done | 已回填/还缺字段 |
| M71.3 | P2 | 后端 OCR 错误白话 | backend/ocr | done | 超时/鉴权/图片 |
| M71.4 | P2 | 工作台今日私信率 | dashboard | done | pushed/inboundNotices |

---

## M72 通知触达漏斗 + 扫码连续入库回车（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M72.1 | P1 | 通知记录页今日触达漏斗 | NotifyTab | done | 与工作台同源，可点选筛选 |
| M72.2 | P1 | 扫码入库回车连续作业 | inbound scan | done | 同收件人扫完回车即入库 |
| M72.3 | P2 | OCR 后光标落到缺项 | inbound scan | done | 补全姓名/手机 |
| M72.4 | P2 | 本会话未私信计数 | inbound recent | done | 最近入库提示 |

---

## M73 滞留提醒触达面板 + 批量粘贴增强（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M73.1 | P1 | 滞留扫描/提醒触达回执面板 | overdue | done | 已私信/未绑定/失败 + 深链通知 |
| M73.2 | P1 | 批量粘贴支持 Tab/中文逗号/表头 | inbound batch | done | Excel 友好 |
| M73.3 | P2 | 手机号 +86 规范化 | inbound batch | done | normalizePhone |
| M73.4 | P2 | 粘贴实时行数预览 + 示例 | inbound batch | done | pastePreview |

---

## M74 工作台滞留/预约深链 + 预约通知回执（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M74.1 | P1 | 工作台滞留/预约待办深链 | dashboard | done | overdue?from=dashboard；预约 status/date |
| M74.2 | P1 | 预约页 URL 筛选同步 | appointments | done | status + date=today |
| M74.3 | P1 | 确认预约返回通知回执 | backend+frontend | done | notifyHint on confirm |
| M74.4 | P2 | 代客预约/确认触达面板 | appointments UI | done | lastNotify 白话 |

---

## M75 查件预约触达强化 + 库存快捷滞留提醒（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M75.1 | P1 | 查件预约成功触达面板 | query appointment | done | 未绑定引导绑定 |
| M75.2 | P1 | 库存列表快捷发提醒 | inventory list | done | overdue/在库≥3天 |
| M75.3 | P1 | 库存详情发滞留提醒+回执 | inventory detail | done | remindOverdue |

---

## M76 库存批量滞留提醒 + 查件我的预约（运营打磨）

| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|---|---|---|---|---|---|
| M76.1 | P1 | 库存勾选批量发滞留提醒 | inventory | done | remind-batch 最多30 |
| M76.2 | P2 | 批量/单件提醒回执条 | inventory | done | lastBatchRemind |
| M76.3 | P1 | 查件「我的预约」状态白话 | query appointment | done | 色标+说明+空态 |
| M76.4 | P2 | 展开自动查预约 | query appointment | done | 有手机号时 |

## M77 通知记录跳包裹 + 入库会话计数（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M77.1 | P1 | 通知记录有包裹时可「看包裹」 | NotifyTab | done | 深链 `/admin/inventory/:id` |
| M77.2 | P1 | 扫码入库本会话成功/未绑定/待收款计数 | inbound scan | done | 累计不限 5 条，可清零 |
| M77.3 | P2 | 清零本会话列表与计数 | inbound scan | done | 不清服务端数据 |

## M78 入库看包裹深链 + 手动会话计数（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M78.1 | P1 | 入库成功区「看包裹」 | InboundSuccess | done | 深链库存详情 |
| M78.2 | P1 | 扫码最近列表取件码/按钮跳详情 | inbound scan | done | |
| M78.3 | P2 | 手动入库本会话计数 | inbound manual | done | 与扫码一致 |

## M79 批量入库结果深链与筛选（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M79.1 | P1 | 成功清单「看包裹」/点取件码 | inbound batch | done | 深链库存详情 |
| M79.2 | P1 | 成功清单全部/未私信/已私信筛选 | inbound batch | done | 空态提示 |
| M79.3 | P2 | 通知摘要跳转通知记录 | inbound batch | done | unbound/inbound 筛选 |

## M80 库存/预检通知深链（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M80.1 | P1 | 通知记录支持 ?phone= 深链 | NotifyTab | done | 库存详情跳转 |
| M80.2 | P1 | 库存详情「看通知记录」+ 到件回执 | inventory detail | done | |
| M80.3 | P2 | 批量预检已在库可「看包裹」 | inbound batch | done | |

## M81 绑定预检醒目 + 库存补发到件（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M81.1 | P1 | 入库绑定预检未绑定高亮+复制话术 | NotifyBindHint | done | |
| M81.2 | P1 | 会话未绑定时快捷复制绑定话术 | inbound scan/manual | done | |
| M81.3 | P1 | 库存列表快捷「补发到件」 | inventory list | done | 在库/滞留 |

## M82 批量绑定率预检 + 查件自动引导绑定（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M82.1 | P1 | 批量入库手机绑定率预检 | inbound batch | done | 抽检最多30号 |
| M82.2 | P1 | 预检摘要+复制绑定话术 | inbound batch | done | |
| M82.3 | P1 | 查件有件且未绑定自动展开绑定区 | query Home | done | 转化 |

## M83 出库回执深链 + 未绑定按手机跟进（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M83.1 | P1 | 出库成功回执（含普通出库） | outbound | done | 看包裹/看通知 |
| M83.2 | P1 | 通知记录 view=byPhone 深链 | NotifyTab | done | |
| M83.3 | P1 | 工作台未绑定「按手机号跟进」 | dashboard | done | |

## M84 交班通知触达摘要（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M84.1 | P1 | 当班页展示今日到件触达 | shifts | done | 未绑定跟进 |
| M84.2 | P1 | 交班确认弹窗未绑定提醒 | shifts | done | 深链+话术 |
| M84.3 | P2 | 班次快照 CSV 含通知触达 | shifts | done | |

## M85 库存批量补发到件 + 通知跟进条（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M85.1 | P1 | 库存勾选批量补发到件 | inventory | done | 最多30 |
| M85.2 | P1 | 库存页通知跟进快捷入口 | inventory | done | 未绑定/到件记录 |
| M85.3 | P2 | 通知回执条可跳转跟进 | inventory | done | |

## M86 预约通知回执跟进（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M86.1 | P1 | 后台预约回执可复制绑定/看通知 | appointments | done | |
| M86.2 | P1 | 预约列表复制话术+看通知 | appointments | done | |
| M86.3 | P2 | 查件预约成功常驻绑定与复制 | PickupAppointmentCard | done | |

## M87 异常件通知/包裹跟进（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M87.1 | P1 | 异常卡片看包裹/看通知/复制话术 | exception | done | |
| M87.2 | P1 | 在库/滞留异常可补发到件 | exception | done | |
| M87.3 | P2 | 页顶通知跟进快捷入口 | exception | done | |

## M88 寄件/财务运营深链（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M88.1 | P1 | 寄件单复制进度话术+看通知 | shipping | done | |
| M88.2 | P1 | 寄件状态更新回执条 | shipping | done | |
| M88.3 | P2 | 收款日结直达出库/今日通知 | finance cash-day | done | |
| M88.4 | P2 | 寄件页 PageHeader 统一 | shipping | done | |

## M89 统计页触达漏斗白话与深链（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M89.1 | P1 | 统计页今日到件触达卡 | stats | done | 与工作台同源 |
| M89.2 | P1 | 未绑定/失败可跳转通知跟进 | stats | done | |
| M89.3 | P2 | 转化漏斗/滞留/高峰白话说明 | stats | done | 深链库存滞留 |

## M90 大屏/工作台动态触达提示与深链（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M90.1 | P1 | 大屏到件触达速览 | warehouse screen | done | 已私信/未绑定/失败可点 |
| M90.2 | P1 | 大屏动态/跑马灯触达提示 | warehouse screen | done | 未绑定/失败前置提示 |
| M90.3 | P1 | 工作台最近业务动态 | Dashboard | done | 事件深链库存/滞留/异常 |
| M90.4 | P2 | 大屏待办扩展未绑定跟进 | Dashboard screen | done | 退出大屏后跳通知记录 |

## M91 入库页今日触达常驻条（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M91.1 | P1 | 入库页今日到件触达条 | inbound | done | 与工作台同源，入库后刷新 |
| M91.2 | P1 | 未绑定/失败深链 + 绑定话术 | inbound | done | 按手机号跟进/通知记录 |
| M91.3 | P2 | 私信率与跟进白话提示 | inbound | done | 高峰不用回工作台 |

## M92 库存页触达条共用组件（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M92.1 | P1 | NotifyReachBar 共用组件 | components | done | 入库/库存同源 |
| M92.2 | P1 | 库存页替换为计数触达条 | inventory | done | 私信/未绑定/失败可点 |
| M92.3 | P2 | 入库改用共用组件 | inbound | done | 去掉页内重复实现 |

## M93 滞留/异常页触达条（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M93.1 | P1 | 滞留页今日触达条 | overdue | done | 发提醒前看未绑定 |
| M93.2 | P1 | 异常页今日触达条 | exception | done | 补发/联系前跟进 |
| M93.3 | P2 | NotifyReachBar 场景文案 | components | done | overdue/exception 上下文 |

## M94 查件页绑定转化强化（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M94.1 | P1 | 查到件结果两步文案 | query Home | done | 先记码再绑定 |
| M94.2 | P1 | 手机端底部固定「去绑定」 | query Home | done | 下滑不丢入口 |
| M94.3 | P2 | 未查到也引导绑定 | query Home | done | 有件微信提醒 |

## M95 出库/预约/寄件触达条 + 出库绑引导（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M95.1 | P1 | 出库页今日触达条 | outbound | done | 取件高峰顺带引导 |
| M95.2 | P1 | 出库成功复制绑定话术 | outbound | done | 下次自动收码 |
| M95.3 | P2 | 预约/寄件页触达条 | appointments/shipping | done | 场景文案 |

## M96 业务动态入库触达 enrichment（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M96.1 | P1 | 事件 API 附带 customerReach | stats events | done | pushed/unbound/push_failed |
| M96.2 | P1 | 入库动态文案 · 已私信/未绑定 | stats normalize | done | 未绑定 tone=warn |
| M96.3 | P2 | 工作台动态徽章与深链 | Dashboard | done | 未绑定跳按手机跟进 |

## M97 交班触达条 + 未绑定跟进清单（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M97.1 | P1 | 交班页 NotifyReachBar | shifts | done | 交班交接未绑定 |
| M97.2 | P1 | 未绑定跟进清单话术 | staffScripts | done | 含手机号仅店内 |
| M97.3 | P1 | 通知记录一键复制清单 | NotifyTab | done | 按手机号/发送记录 |

## M98 财务日结触达 + 批量未私信清单（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M98.1 | P1 | 收款日结今日触达条 | finance cash | done | 未绑定/绑定话术入口 |
| M98.2 | P1 | 批量入库导出/复制未私信 | inbound batch | done | CSV+跟进清单 |
| M98.3 | P2 | 成功清单 CSV 含手机号 | inbound batch | done | 便于店内跟进 |

## M99 扫描机触达提示 + 统计未绑定导出（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M99.1 | P1 | 扫描机成功页绑定引导 | scan | done | 复制绑定话术 |
| M99.2 | P2 | 扫描页今日触达摘要 | scan | done | 未绑定提示 |
| M99.3 | P1 | 统计页导出/复制今日未绑定 | stats | done | by-phone API |

## M100 绑定成功后补发在库取件码（业务功能）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M100.1 | P0 | 绑定成功补发在库/滞留到件私信 | kiosk bind | done | 最多 10 件，失败不阻断 |
| M100.2 | P1 | 客户白话回执含补发结果 | kiosk message | done | 有件已私信 N 件 |
| M100.3 | P2 | 前端类型补 catchup 字段 | types/kiosk | done | |

## M101 绑定补发防重 + 未绑定文案同步（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M101.1 | P1 | 绑定补发跳过近 6h 已私信 | kiosk catchup | done | 防重复刷屏 |
| M101.2 | P1 | 店员/客户文案强调绑定即补发 | notify+scripts+query | done | |
| M101.3 | P2 | 绑定成功醒目补发提示 | NotifyBindCard | done | |

## M102 触达人数覆盖与今日新绑可观测（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M102.1 | P1 | getNotifyReach 扩展人数/新绑 | stats | done | uniqueRecipients/uniquePushed/todayNewBindings |
| M102.2 | P1 | 工作台/触达条展示 | dashboard | done | 件次私信率 + 人数覆盖 + 今日新绑 |
| M102.3 | P2 | 统计页今日触达同源 | stats UI | done | |

## M103 大屏/交班同步人数覆盖与今日新绑（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M103.1 | P2 | 大屏 ticker 人数覆盖/新绑 | warehouse screen | done | 与工作台同源字段 |
| M103.2 | P2 | 交班摘要与 CSV 扩展 | shifts | done | 今日新绑/人数覆盖 |

## M104 近3日未绑定跟进清单（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M104.1 | P0 | 通知聚合支持 days/excludeBound | admin notify | done | 1/3/7 日窗 + 过滤已绑定 |
| M104.2 | P1 | 通知页时间窗与只看未绑定 | NotifyTab | done | URL deep link |
| M104.3 | P1 | 工作台/统计近3日跟进入口 | dashboard/stats | done | 复制/导出/深链 |

## M105 绑定转化轻报表（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M105.1 | P0 | GET /api/stats/bind-conversion | stats-report | done | 到件人数/新绑/覆盖 按日 |
| M105.2 | P1 | 统计页绑定转化卡 | stats UI | done | 随统计窗口 7/30/90 |
| M105.3 | P2 | 工作台近7日转化速览 | dashboard | done | 深链统计/未绑定跟进 |

## M106 入库成功未绑定强引导（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M106.1 | P0 | 入库成功未绑定三步+强 CTA | inbound success | done | 当面/绑定/组合话术 |
| M106.2 | P1 | 扫码会话未绑定清单/深链 | scan inbound | done | 复制清单+近3日 |
| M106.3 | P1 | 手机号预检与批量结果强化 | NotifyBindHint/batch | done | |
| M106.4 | P2 | 成功 toast 区分私信/未绑定 | scan+manual | done | |

## M107 查件结果页绑定后自动收码转化（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M107.1 | P0 | 结果页两步取件 + 强 CTA | query ResultView | done | 绑定后马上收码 |
| M107.2 | P1 | 全端底部绑定条 | query Home | done | 含有件/无件文案 |
| M107.3 | P1 | 绑定成功回执含补发件数 | NotifyBindCard | done | toast + 绿条 |
| M107.4 | P2 | 包裹卡「绑定后可微信收此码」 | query parcels | done | |

## M108 出库成功绑定引导（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M108.1 | P0 | OutboundBindNudge 组件 | components | done | 查绑定状态 + 三步引导 |
| M108.2 | P1 | 出库成功回执接入 | outbound | done | 未绑定强引导 / 已绑定轻提示 |
| M108.3 | P1 | 扫描机成功页接入 | scan | done | 未绑定停留 7s |

## M109 滞留提醒后绑定引导（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M109.1 | P0 | 滞留页触达回执强引导 | overdue | done | 未绑定三步+话术+近3日 |
| M109.2 | P1 | 单件回执带手机号绑定组件 | overdue single | done | OutboundBindNudge |
| M109.3 | P1 | 库存批量/详情提醒回执 | inventory | done | |

## M110 预约成功绑定引导（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M110.1 | P0 | 查件页预约成功强引导绑定 | PickupAppointmentCard | done | 到店前先绑定 |
| M110.2 | P1 | 后台预约回执分未绑定/已绑定 | appointments | done | OutboundBindNudge |
| M110.3 | P2 | 未绑定近3日深链 | appointments | done | |

## M111 入库取件码小票打印（业务功能）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M111.1 | P0 | 浏览器取件码小票打印工具 | printPickupSlip | done | 单张/批量，手机号脱敏 |
| M111.2 | P0 | 扫码/手动入库成功打印 | inbound | done | 成功区 + 本会话 |
| M111.3 | P1 | 批量入库成功打印 | inbound batch | done | 行内 + 成功清单 |
| M111.4 | P1 | 库存详情补打小票 | inventory detail | done | 在库/滞留 |

## M112 工作台今日跟进一页纸（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M112.1 | P0 | DailyFollowupCard 优先清单 | components | done | 未绑定/待收/预约/滞留等 |
| M112.2 | P1 | 复制今日跟进摘要 | dashboard | done | 交班白话摘要 |
| M112.3 | P1 | 工作台接入置顶 | Dashboard | done | 概览卡上方 |

## M113 库存列表取件码批量打印（业务功能）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M113.1 | P0 | 列表行内打印小票 | inventory | done | 有取件码可打 |
| M113.2 | P0 | 勾选批量打印小票 | inventory bulk | done | 复用 printPickupSlips |

## M114 入库成功自动打印小票（运营打磨）
| 编号 | 优先级 | 任务 | 范围 | 状态 | 备注 |
|------|--------|------|------|------|------|
| M114.1 | P0 | localStorage 自动打印开关 | inboundOps | done | 默认关 |
| M114.2 | P0 | 扫码/手动/批量成功自动打印 | inbound | done | 可勾选 |

