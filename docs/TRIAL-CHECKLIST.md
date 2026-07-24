# 智能驿站 · 试用联调清单（运营打磨）

面向开发试验 / 门店试用。按顺序勾选即可，文案尽量白话。

## 0. 先跑数据库补丁（Supabase SQL Editor）

按需执行（已执行过可跳过）：

| 文件 | 用途 |
|------|------|
| `docs/migration-notify-bind-m34.sql` | 客户通知绑定 |
| `docs/migration-wxpusher-m35.sql` | WxPusher 扫码会话 |
| `docs/migration-pushplus-m36.sql` | PushPlus 绑定字段 |
| `docs/migration-collect-m46.sql` | 到付/代收货款 |
| `docs/migration-shifts-m48.sql` | 交接班 |
| `docs/migration-appointments-m50.sql` | 预约取件 |

Storage 桶（拍照/签名留证）：创建 `ss-evidence`（建议 public 读）。

全量初始化也可参考 `docs/database-init.sql`（新库）。

## 1. 环境变量

### 后端 `backend/.env.development`（或 production）

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFY_CHANNELS=console,wecom,serverchan`（按需）
- `WECOM_WEBHOOK_URL`（企微群，只发脱敏公告）
- `SERVERCHAN_SENDKEY`（管理员个人完整旁路）
- `WXPUSHER_APP_TOKEN`（客户扫码绑定主通道）
- 可选 PushPlus 相关配置（若已接入）
- OCR：`TENCENT_SECRET_ID/KEY` + 月额度

### 前端 `frontend/.env.development`

- `VITE_API_BASE_URL`（生产填 API 域名）
- `VITE_KIOSK_STATION_ID`（多租户查件/扫描机必填）

本地预检：

```bash
bash scripts/preflight.sh
```

## 2. 本地启动

```bash
# 终端 1
cd backend && npm run start:dev

# 终端 2
cd frontend && npm run dev
```

- 管理端：`http://localhost:3031/#/admin/login`
- 查件：`http://localhost:3031/#/query`
- 扫描机：`http://localhost:3031/#/scan`

## 3. 入库 + 通知（必测）

1. 系统管理 → 驿站：打开「到件通知」、填地址/电话/营业时间  
2. 系统管理 → 通知公示：确认客户绑定引导文案是白话  
3. 入库（扫码/手动）：
   - 手机号填齐后显示是否已绑定通知（绑定预检）
   - 连续同收件人默认开
   - 成功后能复制取件码、光标回到运单号
   - 通知状态：已私信 / 未绑定 / 失败 可读
4. 未绑定客户：查件页绑定 WxPusher 后，入库页点「补发通知」；批量导入成功列表可「一键补发未私信」  
5. 工作台「今日到件触达」→ 点整卡看今日；点「未绑定/已私信/私信失败」进对应筛选  
6. 通知记录：筛选 今日 / 发送失败 / 到件 / 滞留 / 未私信 / 已私信 / 私信失败；本页可一键补发未私信  
7. 未绑定：入库成功可复制「当面话术/绑定引导」；工作台可复制绑定话术  
8. 滞留：单件「发提醒」+ 本页批量发提醒  
9. 通知记录：分页 + 导出 CSV；「按手机号」聚合未私信客户  
10. 交班：有待收款时弹窗提醒，可跳转库存筛选；可导出本班快照  
11. 入库：扫已在库运单会醒目提示取件码，禁止重复提交  
12. 批量入库：预检重复运单，可跳过仅导入可用行  
13. 出库待收款：须选收款方式并勾选「已当面收妥」  

**隐私**：企微群不得出现完整取件码、完整手机号、验证码。

## 4. 业务闭环速测

| 模块 | 动作 |
|------|------|
| 出库 | 手机后 4 位核验；可选拍照/签名；待收款须先收 |
| 滞留 | 立即扫描；单件「发提醒」 |
| 预约 | 查件页预约；后台代客预约；工作台今日预约 |
| 交接班 | 开班 → 入出库 → 交班快照 |
| 财务 | 收款日结与快递公司月结分开 |
| OCR | 面单识别回填，确认后再入库 |

## 5. 生产构建

```bash
bash scripts/preflight.sh
bash scripts/deploy-all.sh
```

- 后端：`backend/dist` → Node 进程（建议 `NODE_OPTIONS=--dns-result-order=ipv4first`）
- 前端：`frontend/dist` → 静态托管，`/api` 反代到后端

## 6. 常见问题

| 现象 | 处理 |
|------|------|
| 入库成功但客户没收到 | 看是否绑定；未绑定引导查件绑定后补发 |
| 企微看到取件码 | 异常，检查是否误用完整 content 进 wecom |
| 查件不是本站数据 | 配 `VITE_KIOSK_STATION_ID` |
| 预约表不存在 | 执行 `migration-appointments-m50.sql` |
| OCR 突然全失败 | 看月额度是否触顶 |
