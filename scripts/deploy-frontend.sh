#!/usr/bin/env bash
# 前端生产构建脚本（部署到静态托管前执行）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

echo "[deploy-frontend] npm ci / install..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[deploy-frontend] build..."
npm run build

echo "[deploy-frontend] 产物目录: $ROOT/frontend/dist"
echo "[deploy-frontend] 请将 dist/ 上传到静态网站托管，并配置 API 反向代理 /api -> 后端"
