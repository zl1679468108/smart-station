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

# 默认按 CVM 子路径构建；本地纯构建可用 SUBPATH= 覆盖
SUBPATH="${SUBPATH:-smart-station}"
if [ -n "$SUBPATH" ]; then
  echo "[deploy-frontend] 子路径构建: base=/$SUBPATH/  API_PREFIX=/$SUBPATH"
  VITE_API_BASE_URL="/$SUBPATH" VITE_BASE="/$SUBPATH/" npm run build:prod
else
  echo "[deploy-frontend] 根路径构建"
  npm run build
fi

echo "[deploy-frontend] 产物目录: $ROOT/frontend/dist"
echo "[deploy-frontend] 生产上线请用: bash scripts/deploy-cvm.sh"
echo "[deploy-frontend] 访问预期: https://zlspace.site/${SUBPATH:-}/  API: /${SUBPATH:-}/api/"
