# 智能快递驿站 · CVM 部署手册

> **部署状态**：已上线（2026-07-25）。完成摘要见 [cvm-deployment-overview.md](./cvm-deployment-overview.md)，作品集用状态见 [portfolio-status.json](./portfolio-status.json)。


与「静记」共用腾讯云 CVM（`zlspace.site` → `121.4.84.120`），按**项目名子路径**挂载。

## 访问地址

| 项 | URL |
|---|---|
| 前端 | https://zlspace.site/smart-station/ |
| API | https://zlspace.site/smart-station/api/ |
| 登录页示例 | https://zlspace.site/smart-station/#/admin/login |
| 查件门户 | https://zlspace.site/smart-station/#/query |

同机其它项目：

- https://zlspace.site/portfolio/
- https://zlspace.site/bookkeeping/ 与 `/bookkeeping/api/`
- https://zlspace.site/lifetracker/ 与 `/lifetracker/api/`
- 本项目：`/smart-station/` 与 `/smart-station/api/`

> Nginx 配置在 `config/nginx/zlspace.site.conf`，包含全部子路径。各项目 `deploy-cvm.sh` 上传 conf 时会整文件覆盖，**部署后请确认 conf 仍含全部项目**（或同步本文件到其它仓库）。

## 架构

```
浏览器
  │  https://zlspace.site/smart-station/
  ▼
Nginx (443)
  ├─ /smart-station/        → /var/www/smart-station/   (Vite 静态包)
  └─ /smart-station/api/    → 127.0.0.1:3030/api/       (NestJS + PM2)
         │
         ▼
   Supabase PostgreSQL（ss_* 表）
```

- 后端 PM2 进程名：`smart-station-api`，端口 **3030**（与静记 `family-bookkeeping-api:3000` 错开）
- 前端生产 `base=/smart-station/`，API 前缀 `VITE_API_BASE_URL=/smart-station`（服务层路径已含 `/api`）
- HashRouter，路由形如 `/#/admin/...`，子路径不影响路由

## 一键部署

本机需：Node ≥ 20、可 SSH 到 CVM、已填写 `backend/.env.production`。

```bash
# 默认 SERVER=121.4.84.120 REMOTE_USER=ubuntu DOMAIN=zlspace.site
bash scripts/deploy-cvm.sh
```

脚本步骤：

1. 本地 `backend` / `frontend` 生产构建
2. 打包 dist + 生成服务器 `.env`
3. scp 到服务器
4. 远程 `npm install --production`、PM2 重启、更新 Nginx 多项目 conf

## 环境变量

| 文件 | 说明 |
|---|---|
| `backend/.env.production` | 生产密钥真相源（gitignored）。部署时复制为服务器 `/opt/smart-station/backend/.env` |
| `frontend/.env.production` | 可选本地默认；`deploy-cvm.sh` 会用 `VITE_API_BASE_URL=/$SUBPATH` 覆盖 |

关键生产项：

```bash
PORT=3030
NODE_ENV=production
FRONTEND_URL=https://zlspace.site
FRONTEND_SUBPATH=smart-station
NOTIFY_EXPOSE_DEV_CODE=false
# + SUPABASE_* / 通知通道 / OCR 等
```

## 服务器目录

| 路径 | 用途 |
|---|---|
| `/opt/smart-station/backend` | NestJS 产物 + `.env` + node_modules |
| `/var/www/smart-station` | 前端静态文件 |
| `/etc/nginx/sites-available/zlspace.site.conf` | 多项目 Nginx（portfolio / bookkeeping / smart-station） |

## 运维常用

```bash
# 进程
ssh ubuntu@121.4.84.120 'pm2 list'
ssh ubuntu@121.4.84.120 'pm2 logs smart-station-api --lines 100'

# 健康检查
curl -sI https://zlspace.site/smart-station/ | head -5
curl -s https://zlspace.site/smart-station/api/health

# Nginx
ssh ubuntu@121.4.84.120 'sudo nginx -t && sudo systemctl reload nginx'
```

## 证书

与静记共用 Let's Encrypt 证书（DNS-01，绕过未备案 HTTP-01）。续期：

```bash
# 在 family-bookkeeping 仓库
./scripts/renew-cert.sh
```

## 仅构建（不上传）

```bash
bash scripts/deploy-backend.sh
bash scripts/deploy-frontend.sh
# 或
bash scripts/deploy-all.sh
```

生产上线请用 `scripts/deploy-cvm.sh`。

## 回滚思路

1. 保留上一版 tar 包，scp 回服务器解压覆盖
2. `pm2 restart smart-station-api`
3. 前端直接覆盖 `/var/www/smart-station`

## 部署成功后回填 portfolio（必做）

详见仓库根 [AGENTS.md §13.1](../AGENTS.md)。摘要：

1. 更新 `docs/portfolio-status.json`：`status`、**`deployedAt`**、`urls`、`access`、`verification`
2. 更新 `docs/cvm-deployment-overview.md`：部署日期、入口表、验证结果
3. 同步 `/Users/zhaolong/前端/vibe-coding-project/portfolio`：
   - `src/data/projects.ts`（`smart-station` → 已上线 + access）
   - `README.md` 状态表
   - `docs/tasks.md` 勾选并注明部署日期

时间使用 Asia/Shanghai，`deployedAt` 格式 `YYYY-MM-DD`（可带时分）。

