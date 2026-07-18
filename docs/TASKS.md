# Smart Station 任务看板

> 任务状态唯一来源。产品需求和路线见 [PRD.md](./PRD.md)。
> 数据库 schema 见 [database-init.sql](./database-init.sql)。

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
| M2.1 | P0 | 后端 Admin 模块（驿站/员工/货架/快递公司 CRUD） | backend/admin | done | `/api/admin/*` 接口全部 AdminGuard 保护；驿站 GET/PUT；员工列表/新增（复用或创建用户）/编辑/启停；货架 CRUD；快递公司 CRUD；后端 tsc+build 通过 |
| M2.2 | P0 | 前端系统管理页 | frontend/pages/admin/system | done | `/admin/system` Tab 页：驿站信息、员工管理、货架管理、快递公司四个子 Tab，全部接入 API；前端 tsc+build 通过 |
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

## v1.0+ 后续版本规划

> 5 个未实现模块的必要性判断（PRD §4.7-4.11 已有完整定义）：
> - **滞留件管理（4.7）**：强必要。货架有限，长期占用必须管理，否则周转不开。`ss_overdue_rules` 表已在 schema 预留。
> - **异常件管理（4.8）**：必要。破损/丢失/错投是末端常见问题，需登记定责。
> - **寄件管理（4.9）**：必要。寄件是驿站主要收入来源，不做少一半业务。
> - **财务结算（4.10）**：必要。代收代付必须算清账，但可简化（先月结，对账后期）。
> - **数据统计（4.11）**：锦上添花。dashboard 已有概览，独立报表优先级最低，可降级。

### 1.3.0 滞留件 + 异常件管理（强必要）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M24.1 | P0 | 滞留件后端模块（overdue） | backend/overdue | todo | 新增 overdue 模块；GET /api/overdue/list 按超期级别筛选；POST /api/overdue/scan 手动触发扫描；POST /api/overdue/:id/return 标记退回；每天 09:00 定时任务自动扫描（cron）；后端 tsc+build exit 0 |
| M24.2 | P0 | 滞留件前端页面 | frontend/pages/admin/overdue | todo | 新增 /admin/overdue 路由；列表按超期级别（预警黄/提醒橙/退回红）分色展示；支持标记退回流程（待退回→退回中→已退回）；路由守卫 admin+clerk；前端 tsc+build exit 0 |
| M24.3 | P0 | 异常件后端模块（exception） | backend/exception | todo | 新增 exception 模块；GET /api/exception/list；POST /api/exception 登记异常（类型/描述/责任人/附件）；PATCH /api/exception/:id 处理（赔偿/退回/销毁/重新投递）；附件上传到 Supabase Storage；后端 tsc+build exit 0 |
| M24.4 | P0 | 异常件前端页面 | frontend/pages/admin/exception | todo | 新增 /admin/exception 路由；列表 + 登记表单 + 处理操作；状态轨迹展示（登记→处理中→已解决/已赔偿）；路由守卫 admin+clerk；前端 tsc+build exit 0 |
| M24.5 | P1 | Dashboard 接入滞留/异常真实数据 | frontend+backend | todo | Dashboard 概览卡片「滞留件」「异常件未处理」点击跳转对应列表页（替代当前 mock 跳库存的逻辑） |
| M24.6 | P1 | 端到端验证 | qa | todo | Playwright 验证滞留件扫描+退回流程、异常件登记+处理流程；三端响应式 |

### 1.4.0 寄件管理 + 财务结算（必要）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M25.1 | P0 | 寄件后端模块（shipping） | backend/shipping | todo | 新增 shipping 模块；GET /api/shipping/list；POST /api/shipping/create（上门取件/寄件下单）；POST /api/shipping/estimate 运费试算；地址簿 CRUD（/api/address-book）；后端 tsc+build exit 0 |
| M25.2 | P0 | 寄件前端页面 | frontend/pages/admin/shipping | todo | 新增 /admin/shipping 路由；寄件下单表单（发件人/收件人/物品/保价）+ 运费试算；地址簿管理；路由守卫 admin+clerk；前端 tsc+build exit 0 |
| M25.3 | P0 | 财务后端模块（finance） | backend/finance | todo | 新增 finance 模块；GET /api/finance/bills 月结账单列表；POST /api/finance/bills/generate 月初自动生成；费率配置 CRUD；账单导出 Excel；后端 tsc+build exit 0 |
| M25.4 | P0 | 财务前端页面 | frontend/pages/admin/finance | todo | 新增 /admin/finance 路由；月结账单列表（按快递公司分组）+ 费率配置 Tab + 导出按钮；路由守卫 admin+clerk；前端 tsc+build exit 0 |
| M25.5 | P1 | 对账流程 | backend+frontend | todo | 对账单录入 + 自动比对差异 + 标记差异行；简化版：先支持手动标记「已对账」，自动比对后期做 |
| M25.6 | P1 | 端到端验证 | qa | todo | Playwright 验证寄件下单+运费试算、月结账单生成+导出；三端响应式 |

### 1.5.0 数据统计报表（锦上添花，可降级）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M26.1 | P2 | 统计后端模块（stats 扩展） | backend/stats | todo | 扩展 stats 模块；GET /api/stats/trend 业务量趋势（日/周/月）；GET /api/stats/funnel 转化漏斗；GET /api/stats/retention 滞留率；GET /api/stats/peak-hours 取件高峰；后端 tsc+build exit 0 |
| M26.2 | P2 | 统计前端页面 | frontend/pages/admin/stats | todo | 新增 /admin/stats 路由；ECharts 双折线趋势图 + 漏斗图 + 滞留率柱状图 + 高峰热力图；路由守卫 admin+clerk；前端 tsc+build exit 0 |
| M26.3 | P2 | 端到端验证 | qa | todo | Playwright 验证统计页面渲染 + 图表交互；三端响应式 |

> 注：1.2.0 版本号已用于「仓库 3D 布局 + 真实位置取件引导」（M15-M18），1.2.2/1.2.3 用于 3D 体验优化（M20-M23），原计划版本号顺延。2.0.0 连锁多站点管理暂不拆任务。

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
