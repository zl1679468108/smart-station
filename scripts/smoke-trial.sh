#!/usr/bin/env bash
# 试用冒烟：环境预检 + 后端健康 + 公开查件引导接口
# 用法：
#   bash scripts/smoke-trial.sh
#   API_BASE=http://127.0.0.1:3030 STATION_ID=xxx bash scripts/smoke-trial.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

ok() { echo "  ✓ $1"; }
warn() { echo "  ! $1"; }
bad() { echo "  ✗ $1"; FAIL=1; }

echo "[smoke] 1/3 环境预检（preflight）"
if bash "$ROOT/scripts/preflight.sh"; then
  ok "preflight 通过"
else
  bad "preflight 未通过（仍继续探测服务，便于本地半配置调试）"
fi

API_BASE="${API_BASE:-}"
if [ -z "$API_BASE" ]; then
  for f in "$ROOT/frontend/.env.development" "$ROOT/frontend/.env.production" "$ROOT/frontend/.env"; do
    if [ -f "$f" ] && grep -E '^VITE_API_BASE_URL=' "$f" >/dev/null 2>&1; then
      API_BASE="$(grep -E '^VITE_API_BASE_URL=' "$f" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
      break
    fi
  done
fi
API_BASE="${API_BASE:-http://127.0.0.1:3030}"
API_BASE="${API_BASE%/}"

STATION_ID="${STATION_ID:-}"
if [ -z "$STATION_ID" ]; then
  for f in "$ROOT/frontend/.env.development" "$ROOT/frontend/.env.production" "$ROOT/frontend/.env"; do
    if [ -f "$f" ] && grep -E '^VITE_KIOSK_STATION_ID=' "$f" >/dev/null 2>&1; then
      STATION_ID="$(grep -E '^VITE_KIOSK_STATION_ID=' "$f" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
      break
    fi
  done
fi

echo
echo "[smoke] 2/3 后端健康检查  $API_BASE/api/health"
if ! command -v curl >/dev/null 2>&1; then
  bad "未安装 curl，无法探测 HTTP"
else
  set +e
  BODY="$(curl -sS -m 8 "$API_BASE/api/health" 2>&1)"
  CODE=$?
  set -e
  if [ "$CODE" -ne 0 ]; then
    bad "无法访问 $API_BASE/api/health（请先启动后端 npm run start:dev）"
    echo "    $BODY"
  elif echo "$BODY" | grep -E '"status"[[:space:]]*:[[:space:]]*"ok"|status.:.ok' >/dev/null 2>&1; then
    ok "health = ok"
  elif echo "$BODY" | grep -E 'success|:true|"ok"' >/dev/null 2>&1; then
    ok "health 响应可读：$BODY"
  else
    bad "health 响应异常：$BODY"
  fi
fi

echo
echo "[smoke] 3/3 查件公开引导  /api/kiosk/notify-guide"
QS=""
if [ -n "$STATION_ID" ]; then
  QS="?stationId=$(python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["S"]))' S="$STATION_ID" 2>/dev/null || echo "$STATION_ID")"
  ok "使用 stationId=${STATION_ID:0:8}…"
else
  warn "未配置 STATION_ID / VITE_KIOSK_STATION_ID，将按默认驿站探测"
fi

if command -v curl >/dev/null 2>&1; then
  set +e
  BODY="$(curl -sS -m 12 "$API_BASE/api/kiosk/notify-guide${QS}" 2>&1)"
  CODE=$?
  set -e
  if [ "$CODE" -ne 0 ]; then
    bad "notify-guide 请求失败（后端未起或网络不通）"
    echo "    $BODY"
  elif echo "$BODY" | grep -E 'bindEnabled|title|content|wxpusher|success' >/dev/null 2>&1; then
    ok "notify-guide 可访问（绑定公示接口正常）"
  else
    bad "notify-guide 响应异常：$BODY"
  fi
fi

echo
if [ "$FAIL" -ne 0 ]; then
  echo "[smoke] 未通过。请对照 docs/TRIAL-CHECKLIST.md 检查环境与服务。"
  exit 1
fi
echo "[smoke] 通过。建议继续人工点验：入库 → 查件绑定 → 出库 → 交班。"
echo "        清单：docs/TRIAL-CHECKLIST.md"
