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
   - 手机号填齐后显示是否已绑定通知（未绑定会高亮，可复制绑定话术）
   - 连续同收件人默认开；扫完运单回车可直接入库
   - 成功后能复制取件码、光标回到运单号
   - 通知状态：已私信 / 未绑定 / 失败 可读
   - 有到付/货款时成功区醒目待收款，可去出库收款
   - 填金额时实时显示待收合计
   - 本会话显示成功件数 / 未绑定 / 待收款，可清零（扫码/手动）
   - 成功区/最近列表可「看包裹」进库存详情
4. 未绑定客户：查件有在库件时自动展开绑定区；也可点「现在绑定/扫一扫收码」；绑定后入库页可「补发通知」；批量可「一键补发未私信」  
5. 工作台「今日到件触达」→ 点整卡看今日；点「未绑定/已私信/私信失败」进对应筛选；未绑定可「按手机号跟进」  
6. 通知记录：顶部今日触达漏斗可点选；筛选 今日 / 发送失败 / 到件 / 滞留 / 未私信 / 已私信 / 私信失败；本页可一键补发未私信；有关联包裹时点「看包裹」进库存详情；库存详情可按手机号跳回通知记录  
7. 未绑定：入库成功可复制「当面话术/绑定引导」；工作台可复制绑定话术  
8. 滞留：单件/批量「发提醒」后可见触达回执（已私信/未绑定）；可进通知记录  
9. 通知记录：分页 + 导出 CSV；「按手机号」聚合未私信客户  
10. 工作台：滞留待办进滞留页提示扫描提醒；预约待办直达今日/待确认  
11. 交班：有待收款时弹窗提醒，可跳转库存筛选；可导出本班快照  
12. 入库：扫已在库运单会醒目提示取件码，禁止重复提交  
13. 批量入库：支持 Excel 粘贴/表头/+86；可「仅预检」或「预检并导入」；预检含手机绑定率；成功清单可筛选未私信/已私信，点取件码或「看包裹」进详情，可跳通知记录  
14. 出库待收款：工作台/交班/库存详情均可直达出库收款；须选方式并勾选「已当面收妥」；成功后可复制收款话术  
15. 工作台「今日收款日结」显示已收金额与笔数，可进明细  

**隐私**：企微群不得出现完整取件码、完整手机号、验证码。

## 4. 业务闭环速测

| 模块 | 动作 |
|------|------|
| 出库 | 手机后 4 位核验；可选拍照/签名；待收款须先收；成功后可看包裹/通知并复制话术 |
| 滞留 | 立即扫描；滞留页/库存列表/详情可发提醒；库存可勾选批量提醒/批量补发到件；页顶可按手机号跟进未绑定 |
| 预约 | 查件页预约成功可绑定/复制预约信息；后台代客/确认回执可跟进通知；列表可复制话术 |
| 交接班 | 开班 → 入出库 → 交班快照；交班可见今日未绑定/私信失败并跟进 |
| 财务 | 收款日结与快递公司月结分开 |
| OCR | 面单识别回填；失败可重新识别/换一张；确认后再入库 |

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
