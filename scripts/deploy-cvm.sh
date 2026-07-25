#!/bin/bash
# ============================================
# 智能快递驿站 - 腾讯云 CVM 一键部署
#   后端 (Node + PM2 :3030) + 前端 (Nginx 静态托管)
#
# 适用：已有腾讯云 CVM（Ubuntu 20.04/22.04/24.04），公网可访问。
# 前置：
#   1. 目标服务器已装 nginx / node / pm2（可参考 family-bookkeeping/scripts/cvm-setup.sh）
#   2. 本机安装 node/npm，且可 SSH 到服务器
#   3. backend/.env.production 已填好 Supabase 等密钥
#
# 用法：
#   SERVER=121.4.84.120 REMOTE_USER=ubuntu ./scripts/deploy-cvm.sh
#
# 说明：
#   - 后端密钥真相源是 backend/.env.production，部署时复制为服务器
#     /opt/smart-station/backend/.env，并把 FRONTEND_URL 改成本域名。
#   - 前端用 VITE_API_BASE_URL=/$SUBPATH 覆盖后本地构建（服务层路径已含 /api）。
#     子路径由 vite.config base=/smart-station/ 控制静态资源前缀。
#   - 访问：https://$DOMAIN/$SUBPATH/  与  https://$DOMAIN/$SUBPATH/api/
#   - Nginx 配置会覆盖 sites-available 中的 zlspace.site.conf（含 portfolio/bookkeeping/smart-station）。
# ============================================
set -euo pipefail

SERVER="${SERVER:-121.4.84.120}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
DOMAIN="${DOMAIN:-zlspace.site}"
SSH_OPTS="${SSH_OPTS:- -o StrictHostKeyChecking=no}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_BACKEND="/opt/smart-station/backend"
REMOTE_FRONTEND="/var/www/smart-station"
# 子路径（不带首尾斜杠），可用 SUBPATH=xxx 覆盖
SUBPATH="${SUBPATH:-smart-station}"
BACKEND_PORT="${BACKEND_PORT:-3030}"
PM2_NAME="${PM2_NAME:-smart-station-api}"
NGINX_LOCAL="$ROOT_DIR/config/nginx/zlspace.site.conf"
ENV_SRC="$ROOT_DIR/backend/.env.production"

if [ ! -f "$ENV_SRC" ]; then
  echo "缺少 $ENV_SRC"
  echo "请先从 backend/.env.example 复制并填写生产密钥，或从 .env.development 生成。"
  exit 1
fi

if [ ! -f "$NGINX_LOCAL" ]; then
  echo "缺少 $NGINX_LOCAL"
  exit 1
fi

echo "=== [1/4] 本地构建 ==="
( cd "$ROOT_DIR/backend" && npm run build:prod )
# 服务路径已含 /api，因此 VITE_API_BASE_URL 只写子路径前缀
( cd "$ROOT_DIR/frontend" && VITE_API_BASE_URL="/$SUBPATH" VITE_BASE="/$SUBPATH/" npm run build:prod )

echo "=== [2/4] 打包 ==="
rm -f /tmp/ss-backend.tar.gz /tmp/ss-frontend.tar.gz /tmp/ss-backend.env
# 禁用 macOS 扩展属性/AppleDouble(._) 归档
( cd "$ROOT_DIR/backend" && COPYFILE_DISABLE=1 tar --format=ustar --no-mac-metadata -czf /tmp/ss-backend.tar.gz dist package.json package-lock.json nest-cli.json )
( cd "$ROOT_DIR/frontend" && COPYFILE_DISABLE=1 tar --format=ustar --no-mac-metadata -czf /tmp/ss-frontend.tar.gz -C dist . )

# 生成服务器用 .env（覆盖 FRONTEND_URL / PORT / NODE_ENV）
grep -vE '^(FRONTEND_URL|PORT|NODE_ENV|FRONTEND_SUBPATH)=' "$ENV_SRC" > /tmp/ss-backend.env
{
  echo "PORT=$BACKEND_PORT"
  echo "NODE_ENV=production"
  echo "FRONTEND_URL=https://$DOMAIN"
  echo "FRONTEND_SUBPATH=$SUBPATH"
} >> /tmp/ss-backend.env

echo "=== [3/4] 上传 ==="
scp $SSH_OPTS /tmp/ss-backend.tar.gz /tmp/ss-frontend.tar.gz /tmp/ss-backend.env "$NGINX_LOCAL" \
  "$REMOTE_USER@$SERVER:/tmp/"

echo "=== [4/4] 远程部署 ==="
ssh $SSH_OPTS "$REMOTE_USER@$SERVER" bash -s <<REMOTE
  set -e
  sudo mkdir -p $REMOTE_BACKEND $REMOTE_FRONTEND
  sudo chown -R $REMOTE_USER:$REMOTE_USER /opt/smart-station $REMOTE_FRONTEND

  sudo rm -rf $REMOTE_BACKEND/*
  tar -xzf /tmp/ss-backend.tar.gz -C $REMOTE_BACKEND
  mv /tmp/ss-backend.env $REMOTE_BACKEND/.env
  cd $REMOTE_BACKEND && npm install --production --no-audit --no-fund 2>&1 | tail -5
  pm2 delete $PM2_NAME 2>/dev/null || true
  # 用 node 直接起，避免 npm 包脚本在生产机缺 nest 时出问题
  cd $REMOTE_BACKEND
  PORT=$BACKEND_PORT NODE_ENV=production NODE_OPTIONS=--dns-result-order=ipv4first \
    pm2 start dist/main.js --name $PM2_NAME
  pm2 save

  sudo rm -rf $REMOTE_FRONTEND/*
  sudo tar -xzf /tmp/ss-frontend.tar.gz -C $REMOTE_FRONTEND
  sudo chown -R www-data:www-data $REMOTE_FRONTEND 2>/dev/null || sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_FRONTEND

  # 安装多项目 nginx 配置（覆盖旧 conf；sites-enabled 软链自动生效）
  sudo cp /tmp/zlspace.site.conf /etc/nginx/sites-available/zlspace.site.conf
  if [ ! -e /etc/nginx/sites-enabled/zlspace.site.conf ]; then
    sudo ln -sf /etc/nginx/sites-available/zlspace.site.conf /etc/nginx/sites-enabled/zlspace.site.conf
  fi
  sudo nginx -t
  sudo systemctl reload nginx

  rm -f /tmp/ss-backend.tar.gz /tmp/ss-frontend.tar.gz /tmp/zlspace.site.conf
REMOTE

echo "=== 完成 ==="
echo "后端:  http://$SERVER:$BACKEND_PORT (PM2: $PM2_NAME)"
echo "前端:  http://$SERVER/$SUBPATH/"
echo "域名:  https://$DOMAIN/$SUBPATH/"
echo "API:   https://$DOMAIN/$SUBPATH/api/"
echo ""
echo "验证示例："
echo "  curl -sI https://$DOMAIN/$SUBPATH/ | head -5"
echo "  curl -s https://$DOMAIN/$SUBPATH/api/health || curl -s https://$DOMAIN/$SUBPATH/api/ | head -c 200"
echo ""
echo "注意：CVM 在上海（大陆机房），证书续期请用 family-bookkeeping 的 DNS-01 脚本："
echo "  ../family-bookkeeping/scripts/renew-cert.sh"

echo ">>> 部署成功后必做（见 AGENTS.md §13.1）："
echo "  1. 更新 docs/portfolio-status.json 的 deployedAt 与 verification"
echo "  2. 更新 docs/cvm-deployment-overview.md 部署日期与验证结果"
echo "  3. 同步 portfolio: projects.ts / README.md / docs/tasks.md"
