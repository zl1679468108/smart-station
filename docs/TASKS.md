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
| M0.7 | P0 | 数据库 schema 执行 | database | todo | 在 Supabase SQL Editor 执行 database-init.sql；DDL 已就绪（13 张表），待用户手动执行 |

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
| M9.1 | P0 | 端到端流程联调 | qa | todo | 登录→入库→Kiosk 查件→扫描出库→库存状态更新；全流程无报错（需用户在运行环境中验证：先执行 M0.7 DDL + M2.3 seed，再起 backend:3030 / frontend:3031） |
| M9.2 | P0 | 三端响应式验证 | qa | todo | PC（≥1200px）/ 平板（768–1200px）/ H5（<768px）三档断点视觉无错乱（需用户用 Chrome DevTools 设备模拟器验证） |
| M9.3 | P0 | tsc + build 全通过 | qa | done | `cd frontend && npx tsc --noEmit` + `npm run build`；`cd backend && npx tsc --noEmit` + `npm run build` 全部 exit 0 通过 |
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
| M14.1 | P0 | tsc + build 全通过 | qa | done | 前后端 `npx tsc --noEmit` + `npm run build` 全部 exit 0 通过 |
| M14.2 | P0 | /query 三端响应式验证 | qa | todo | PC（≥1200px 左右双栏）/ 平板（768–1200px 上下）/ H5（<768px 单列）三档断点视觉无错乱（需用户验证） |
| M14.3 | P1 | 取件码查询限流与锁定验证 | qa | todo | 同 IP 60s ≤10 次；同取件码错误 5 次锁 10 分钟（需用户验证） |

---

## 1.2.0 仓库 3D 布局 + 真实位置取件引导

> 范围：管理员配置仓库户型（门口 + 内部尺寸）+ 货架真实物理位置（拖拽摆放）；查询页 3D 视图升级为按真实位置渲染，门口到包裹货架画寻路路径
> 详见 PRD §4.6.3（取件引导）+ §4.12.3（驿站信息）
> 前置：1.1.0 已完成；M6.5 的自动布局 3D 视图已上线（fallback 基线）
> 设计原则：管理员配置一次，用户每次查询都看到真实位置 + 寻路；货架未配置坐标时自动 fallback 到 size_type 网格布局，向后兼容

### M15 数据库与后端接口

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M15.1 | P0 | DDL：ss_stations 加 layout_config 字段 | database | todo | `ALTER TABLE ss_stations ADD COLUMN layout_config JSONB DEFAULT '{}'`；COMMENT 完整；database-init.sql 同步；提示用户手动在 Supabase SQL Editor 执行 |
| M15.2 | P0 | DDL：ss_shelves 加 pos_x/pos_y/rotation/zone 字段 | database | todo | 4 个字段；rotation CHECK (0/90/180/270)；pos_x/pos_y 可空（NULL 时走自动布局）；COMMENT；database-init.sql 同步 |
| M15.3 | P0 | 后端 DTO 扩展支持位置字段 | backend/admin | todo | CreateShelfDto/UpdateShelfDto 加 posX?/posY?/rotation?/zone? 可选字段；class-validator 校验（rotation ∈ [0,90,180,270]，posX/posY ≥ 0） |
| M15.4 | P0 | 后端驿站户型配置接口 | backend/admin | todo | `GET /api/admin/station/layout-config` 返回当前驿站 layout_config；`PUT /api/admin/station/layout-config` 保存（含 bounds/doors 校验：door 必有 x/y/width/label） |
| M15.5 | P0 | 后端货架位置单独更新接口 | backend/admin | todo | `PUT /api/admin/shelves/:id/position` 仅接收 posX/posY/rotation/zone；高频拖拽调用，独立接口避免全量 update；station_id 隔离校验 |
| M15.6 | P0 | Kiosk layout 接口扩展返回位置+户型 | backend/kiosk | todo | `GET /api/kiosk/station/layout` 返回项加 posX/posY/rotation/zone；附加 `station.layoutConfig`（公开只读，含 bounds + doors，不含 walls/obstacles 内部细节） |

### M16 ShelfMap3D 升级（真实坐标 + 门口 + 寻路）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M16.1 | P0 | ShelfMap3D 支持真实坐标摆放 | frontend/components/ShelfMap | todo | 货架有 posX/posY 时按真实坐标摆放 + 朝向 rotation；无坐标时自动 fallback 到 size_type 网格；zone 字段优先于 size_type 分区 |
| M16.2 | P0 | ShelfMap3D 渲染仓库地面 + 门口 | frontend/components/ShelfMap | todo | 按 layoutConfig.bounds 画矩形地面；每个 door 渲染为发光框 + 「入口」标签（drei Text/Html）；门口默认位置 (width/2, 0) 兜底 |
| M16.3 | P0 | ShelfMap3D 寻路路径动画 | frontend/components/ShelfMap | todo | 门口 → 每个高亮货架画 L 形路径（先 X 后 Y，曼哈顿）；drei `<Line>` 虚线 + 终点箭头 mesh；路径上标「≈ N 米」文字（欧氏距离） |
| M16.4 | P0 | ShelfMap3D 高亮货架增强 | frontend/components/ShelfMap | todo | 高亮货架旁标「距门口约 N 米」；高亮货架底面画圆形光圈脉冲；多包裹多货架时全部画路径 |
| M16.5 | P1 | ShelfMap3D 相机自动框选适配真实布局 | frontend/components/ShelfMap | todo | bounds 含货架 + 门口 + 户型范围；初始视角覆盖全部门口到最远货架；OrbitControls 限制不可翻到地下 |

### M17 管理员配置后台（拖拽编辑器）

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M17.1 | P0 | 新建 ShelfMap3DEditor 交互层 | frontend/components/ShelfMap | todo | 基于 ShelfMap3D 复用渲染；drei `<TransformControls>` 包裹货架支持拖拽 + 旋转把手；拖拽时其他货架半透明；0.5m 网格吸附防重叠 |
| M17.2 | P0 | 新建 StationLayout 配置页 | frontend/pages/admin/system | todo | 嵌入 System.tsx 加第 6 个 Tab「仓库布局」；左侧 3D 编辑器 + 右侧面板（仓库尺寸 width/depth 数字输入 + 门口列表 + 货架坐标表） |
| M17.3 | P0 | 拖拽 → 接口保存 | frontend/pages/admin/system | todo | 拖拽结束触发 onShelfPositionChange → 调 PUT /api/admin/shelves/:id/position；门口修改调 PUT /api/admin/station/layout-config；防抖 500ms |
| M17.4 | P0 | 一键自动布局初始化 | frontend/pages/admin/system | todo | 当货架全部 pos_x IS NULL 时提供「按 size_type 自动初始化坐标」按钮，调批量 PUT；方便管理员首次配置起手 |
| M17.5 | P1 | 户型尺寸面板 + 门口列表管理 | frontend/pages/admin/system | todo | 仓库 width/depth 输入实时影响 3D 地面尺寸；门口列表可增删 + 设置位置/标签；保存到 layout_config |

### M18 查询页集成 + 收尾验证

| ID | 优先级 | 任务 | 模块 | 状态 | 验收 |
|---|---|---|---|---|---|
| M18.1 | P0 | /query ResultView 升级使用真实布局 | frontend/pages/query | todo | getLayout() 返回的位置字段 + layoutConfig 传入 ShelfMap3D；自动检测有 doors 时渲染门口 + 寻路；无配置时仍走原自动布局 |
| M18.2 | P0 | 前后端 tsc + build | qa | todo | `cd frontend && npx tsc --noEmit && npm run build`；`cd backend && npx tsc --noEmit && npm run build` 全 exit 0 |
| M18.3 | P1 | 端到端验证：配置 → 查询 → 看到寻路 | qa | todo | 管理员在 /admin/system/station-layout 拖拽摆放 3 个货架 + 设置门口 → 查询页用取件码查包裹 → 结果页 3D 视图显示真实位置 + 门口到货架虚线路径 |
| M18.4 | P1 | 三端响应式验证 | qa | todo | PC/平板/H5 三档下 3D 视图正常渲染 + 拖拽编辑器可用；PAD 触摸拖拽友好 |

---

## v1.0+ 后续版本（暂不拆任务，见 PRD §5.1）

- 1.3.0：滞留件自动化（超期任务/退回流程）+ 异常件完整流程
- 1.4.0：寄件管理 + 财务结算
- 1.5.0：数据统计报表
- 2.0.0：连锁多站点管理

> 注：1.2.0 版本号已用于「仓库 3D 布局 + 真实位置取件引导」（见上方 M15-M18），原计划版本号顺延。

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

### 1.2.0 仓库 3D 布局 + 真实位置取件引导（进行中）
1. **M15 数据库 + 后端接口** → DDL + DTO + 户型配置/位置更新接口（先做，前端依赖）
2. **M16 ShelfMap3D 升级** → 真实坐标 + 门口 + 寻路路径（核心视觉价值）
3. **M17 管理员配置后台** → 拖拽编辑器 + System Tab（配置入口）
4. **M18 查询页集成 + 收尾** → 接通真实数据 + tsc/build + 端到端验证

> P1 核心闭环最小可用版本：M15.1-6 + M16.1-4 + M17.1-4 + M18.1-2
> 增强项（M16.5 / M17.5 / M18.3-4）可后置迭代
