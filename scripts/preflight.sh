#!/usr/bin/env bash
# 试用/部署前预检：检查环境文件关键项（不打印密钥值）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

ok() { echo "  ✓ $1"; }
warn() { echo "  ! $1"; }
bad() { echo "  ✗ $1"; FAIL=1; }

need_key() {
  local file="$1" key="$2"
  if [ ! -f "$file" ]; then
    bad "缺少文件 $file"
    return
  fi
  if grep -E "^${key}=" "$file" >/dev/null 2>&1; then
    local val
    val="$(grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
    if [ -z "$val" ] || [[ "$val" == your-* ]] || [[ "$val" == *xxxxxxxx* ]]; then
      warn "$file 中 ${key} 仍是占位/空（试用可先跳过非必填）"
    else
      ok "$file 含 ${key}"
    fi
  else
    bad "$file 缺少 ${key}"
  fi
}

echo "[preflight] 后端环境"
BE_ENV=""
for f in "$ROOT/backend/.env.development" "$ROOT/backend/.env.production" "$ROOT/backend/.env"; do
  if [ -f "$f" ]; then BE_ENV="$f"; break; fi
done
if [ -z "$BE_ENV" ]; then
  bad "未找到 backend/.env.development 或 .env.production（可从 .env.example 复制）"
else
  ok "使用 $BE_ENV"
  need_key "$BE_ENV" "SUPABASE_URL"
  need_key "$BE_ENV" "SUPABASE_SERVICE_ROLE_KEY"
  need_key "$BE_ENV" "PORT"
  # 通知：至少应知道通道配置
  if grep -E "^NOTIFY_CHANNELS=" "$BE_ENV" >/dev/null 2>&1; then
    ok "已配置 NOTIFY_CHANNELS"
  else
    warn "未配置 NOTIFY_CHANNELS（默认 console）"
  fi
fi

echo "[preflight] 前端环境"
FE_ENV=""
for f in "$ROOT/frontend/.env.development" "$ROOT/frontend/.env.production" "$ROOT/frontend/.env"; do
  if [ -f "$f" ]; then FE_ENV="$f"; break; fi
done
if [ -z "$FE_ENV" ]; then
  bad "未找到 frontend/.env.development 或 .env.production"
else
  ok "使用 $FE_ENV"
  need_key "$FE_ENV" "VITE_API_BASE_URL"
  if grep -E "^VITE_KIOSK_STATION_ID=." "$FE_ENV" >/dev/null 2>&1; then
    ok "已配置 VITE_KIOSK_STATION_ID"
  else
    warn "VITE_KIOSK_STATION_ID 为空（单租户可接受；多站必填）"
  fi
fi

echo "[preflight] 数据库迁移文件（需在 Supabase 手跑）"
for m in \
  migration-notify-bind-m34.sql \
  migration-wxpusher-m35.sql \
  migration-pushplus-m36.sql \
  migration-collect-m46.sql \
  migration-shifts-m48.sql \
  migration-appointments-m50.sql
do
  if [ -f "$ROOT/docs/$m" ]; then ok "docs/$m"; else bad "缺少 docs/$m"; fi
done

echo "[preflight] 部署脚本"
for s in deploy-backend.sh deploy-frontend.sh deploy-all.sh deploy-cvm.sh; do
  if [ -x "$ROOT/scripts/$s" ] || [ -f "$ROOT/scripts/$s" ]; then ok "scripts/$s"; else bad "缺少 scripts/$s"; fi
done

echo "[preflight] 试用清单"
if [ -f "$ROOT/docs/TRIAL-CHECKLIST.md" ]; then
  ok "docs/TRIAL-CHECKLIST.md"
else
  warn "缺少试用清单"
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "[preflight] 未通过：请按上方 ✗ 项修复后再部署/试用"
  exit 1
fi
echo "[preflight] 通过（密钥占位仅为警告）。完整步骤见 docs/TRIAL-CHECKLIST.md"
