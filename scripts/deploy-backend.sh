#!/usr/bin/env bash
# 后端生产构建脚本
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo "[deploy-backend] npm ci / install..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[deploy-backend] build:prod..."
npm run build:prod

echo "[deploy-backend] 产物目录: $ROOT/backend/dist"
echo "[deploy-backend] 生产上线请用: bash scripts/deploy-cvm.sh"
echo "[deploy-backend] 本地启动示例: NODE_ENV=production NODE_OPTIONS=--dns-result-order=ipv4first node dist/main.js"
