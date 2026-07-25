# 智能快递驿站 CVM 生产部署完成

> 供作品集（`portfolio`）与其它同机项目读取的**部署完成摘要**。  
> 操作手册见 [deployment.md](./deployment.md)。  
> 机器可读状态见 [portfolio-status.json](./portfolio-status.json)。

## 概述

「智能快递驿站」已挂载到与静记相同的腾讯云 CVM（上海二区 `121.4.84.120`），使用 Nginx 子路径 + Node/PM2 + Let's Encrypt HTTPS。

| 项 | 值 |
|---|---|
| 状态 | **已上线** |
| 部署日期 | 2026-07-25 |
| 域名 | `zlspace.site` |
| 前端子路径 | `/smart-station/` |
| API 子路径 | `/smart-station/api/` |
| 后端端口 | `3030` |
| PM2 进程 | `smart-station-api` |

## 交付内容

| 项 | 状态 | 说明 |
|---|---|---|
| 后端 | ✅ | NestJS 生产包在 `/opt/smart-station/backend`，PM2 `smart-station-api` 监听 3030 |
| 前端 | ✅ | Vite 生产包在 `/var/www/smart-station`，`base=/smart-station/` |
| 反代 | ✅ | Nginx `/smart-station/api/` → `127.0.0.1:3030/api/` |
| HTTPS | ✅ | 共用 `zlspace.site` Let's Encrypt 证书（DNS-01） |
| 健康检查 | ✅ | `GET /smart-station/api/health` → `{ status: "ok" }` |
| 同机共存 | ✅ | 与 portfolio / bookkeeping / lifetracker 子路径并存 |

## 作品集可用入口（建议写入 portfolio `projects[].access`）

| 端 | 标签 | URL |
|---|---|---|
| PC 工作人员后台 | PC Web | https://zlspace.site/smart-station/ |
| 登录页 | PC Web | https://zlspace.site/smart-station/#/admin/login |
| 取件自助（PAD/现场） | 平板 PAD | https://zlspace.site/smart-station/#/query |
| 远端查件 H5 | H5 | https://zlspace.site/smart-station/#/query?device=h5 |
| 出库扫描机 | Web | https://zlspace.site/smart-station/#/scan |
| API Health | — | https://zlspace.site/smart-station/api/health |

> HashRouter：业务路由在 `#` 后；静态资源前缀为 `/smart-station/`。

## 架构摘要

```
浏览器 → https://zlspace.site/smart-station/
         ├─ 静态：/var/www/smart-station
         └─ API：/smart-station/api/* → NestJS :3030 → Supabase (ss_*)
```

- 前端：React 18 + Vite + TypeScript + Tailwind（单一响应式应用）
- 后端：NestJS 10 + Token Session + Supabase JS SDK
- 多端：`/admin/*` 管理后台 · `/query/*` 自助查件 · `/scan/*` 扫描出库 · H5 用 `?device=h5`

## 验证结果（2026-07-25）

| 检查 | 结果 |
|---|---|
| `https://zlspace.site/smart-station/` | 200，HTML base 为 `/smart-station/` |
| 静态 JS/CSS | 200 |
| `https://zlspace.site/smart-station/api/health` | 200，`success: true` |
| `POST /smart-station/api/auth/login` | 可达（错误账号返回业务错误） |
| `https://zlspace.site/bookkeeping/` | 200（同机未受影响） |
| `https://zlspace.site/portfolio/` | 200（同机未受影响） |

## 运维入口

```bash
# 重新部署
bash scripts/deploy-cvm.sh

# 进程 / 日志
ssh ubuntu@121.4.84.120 'pm2 list'
ssh ubuntu@121.4.84.120 'pm2 logs smart-station-api --lines 100'

# 健康检查
curl -sI https://zlspace.site/smart-station/ | head -5
curl -s https://zlspace.site/smart-station/api/health
```

## portfolio 回填清单

更新 `portfolio/src/data/projects.ts` 中 `id: 'smart-station'`：

- [x] `status: '已上线'`
- [x] `techStack` 增加「腾讯云 CVM」
- [x] `access` 补 PC Web / 平板 PAD / H5 链接（见上表）
- [x] features 增加生产部署说明（可选）
- [ ] 业务页截图（后续补 `public/screenshots/smart-station/`）

同步 `portfolio/README.md` 状态表与 `portfolio/docs/tasks.md` 访问入口待办。
