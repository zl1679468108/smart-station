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
| 取件自助（PAD / H5 自适应） | 平板 PAD / H5 | https://zlspace.site/smart-station/#/query |
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
- 多端：`/admin/*` 管理后台 · `/query/*` 自助查件（视口自适应 PAD/H5，无需 `?device=`） · `/scan/*` 扫描出库

## 验证结果（2026-07-25 13:42）

同步 `portfolio/README.md` 状态表与 `portfolio/docs/tasks.md` 访问入口待办。


## 最近部署

- 时间：2026-07-25 13:42（Asia/Shanghai）
- 变更：`/query` 视口自适应，取消 `?device=`；作品集入口收敛为 PC Web + 取件自助
- 验证：前端 200 · `/api/health` ok · siblings portfolio/bookkeeping 200
