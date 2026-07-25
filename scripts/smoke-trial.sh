#!/usr/bin/env bash
# 试用冒烟：环境预检 + 后端健康 + 公开查件/通知引导 + 前端可达性
# 用法：
#   bash scripts/smoke-trial.sh
#   API_BASE=http://127.0.0.1:3030 STATION_ID=xxx bash scripts/smoke-trial.sh
#   SMOKE_TOKEN=... STATION_ID=... bash scripts/smoke-trial.sh   # 可选：带鉴权探测批量补发
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

ok() { echo "  ✓ $1"; }
warn() { echo "  ! $1"; }
bad() { echo "  ✗ $1"; FAIL=1; }

echo "[smoke] 1/5 环境预检（preflight）"
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

FE_BASE="${FE_BASE:-}"
if [ -z "$FE_BASE" ]; then
  for f in "$ROOT/frontend/.env.development" "$ROOT/frontend/.env.production" "$ROOT/frontend/.env"; do
    if [ -f "$f" ] && grep -E '^VITE_DEV_SERVER_URL=' "$f" >/dev/null 2>&1; then
      FE_BASE="$(grep -E '^VITE_DEV_SERVER_URL=' "$f" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
      break
    fi
  done
fi
FE_BASE="${FE_BASE:-http://127.0.0.1:3031}"
FE_BASE="${FE_BASE%/}"

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
echo "[smoke] 2/5 后端健康检查  $API_BASE/api/health"
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
echo "[smoke] 3/5 查件公开引导  /api/kiosk/notify-guide"
QS=""
if [ -n "$STATION_ID" ]; then
  QS="?stationId=$(S="$STATION_ID" python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["S"]))' 2>/dev/null || echo "$STATION_ID")"
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
    # 字段级抽检（不强制全有，缺字段 warn）
    for key in bindEnabled title content; do
      if echo "$BODY" | grep -E "\"$key\"" >/dev/null 2>&1; then
        ok "notify-guide 含字段 $key"
      else
        warn "notify-guide 未直接看到字段 $key（可能被包装层改名，人工再看一次）"
      fi
    done
    if echo "$BODY" | grep -E 'wxpusher|pushplus|扫' >/dev/null 2>&1; then
      ok "notify-guide 含客户绑定通道信息"
    else
      warn "notify-guide 未见通道关键字（确认驿站已打开到件通知/绑定）"
    fi
  else
    bad "notify-guide 响应异常：$BODY"
  fi

  # 公开限流接口是否挂载（不提交验证码，只看 4xx/包装错误是否可达）
  echo
  echo "  · 附加：查件验证码入口可达性 /api/kiosk/send-code"
  set +e
  CODE_BODY="$(curl -sS -m 8 -X POST "$API_BASE/api/kiosk/send-code" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>&1)"
  CODE_RC=$?
  set -e
  if [ "$CODE_RC" -ne 0 ]; then
    warn "send-code 不可达（可忽略若后端未起）"
  elif echo "$CODE_BODY" | grep -E 'success|message|phone|手机|校验|Bad|400|401|429' >/dev/null 2>&1; then
    ok "send-code 路由可达（空 body 被校验拦截属正常）"
  else
    warn "send-code 响应未识别：$CODE_BODY"
  fi
fi

echo
echo "[smoke] 4/5 前端可达性  $FE_BASE"
if command -v curl >/dev/null 2>&1; then
  set +e
  FE_BODY="$(curl -sS -m 8 -o /tmp/ss-smoke-fe.html -w '%{http_code}' "$FE_BASE/" 2>&1)"
  FE_RC=$?
  set -e
  if [ "$FE_RC" -ne 0 ]; then
    warn "前端 $FE_BASE 未访问到（本地可先 cd frontend && npm run start；不阻断后端冒烟）"
  elif echo "$FE_BODY" | grep -E '200|304' >/dev/null 2>&1; then
    ok "前端 HTTP $FE_BODY"
    if grep -E 'smart|root|vite|快递|驿站' /tmp/ss-smoke-fe.html >/dev/null 2>&1; then
      ok "前端 HTML 内容可读"
    else
      warn "前端返回了页面，但未匹配到预期关键字"
    fi
  else
    warn "前端 HTTP 状态异常：$FE_BODY"
  fi
fi

echo

echo
echo "[smoke] 5/5 批量补发路由挂载（无 token 应 401/403）"
if command -v curl >/dev/null 2>&1; then
  probe_auth_route() {
    local name="$1" method="$2" path="$3" body="${4:-}"
    local url="$API_BASE$path"
    local tmp_hdr tmp_body code
    tmp_hdr="$(mktemp 2>/dev/null || echo /tmp/ss-smoke-hdr.$$)"
    tmp_body="$(mktemp 2>/dev/null || echo /tmp/ss-smoke-body.$$)"
    set +e
    if [ -n "$body" ]; then
      code="$(curl -sS -m 8 -X "$method" "$url" \
        -H 'Content-Type: application/json' \
        -d "$body" \
        -D "$tmp_hdr" -o "$tmp_body" -w '%{http_code}' 2>/tmp/ss-smoke-curl.err)"
    else
      code="$(curl -sS -m 8 -X "$method" "$url" \
        -D "$tmp_hdr" -o "$tmp_body" -w '%{http_code}' 2>/tmp/ss-smoke-curl.err)"
    fi
    local rc=$?
    set -e
    if [ "$rc" -ne 0 ]; then
      warn "$name 不可达（后端未起可忽略）"
      return
    fi
    # 401/403 = 路由在且鉴权生效；400 = 已过鉴权但参数校验（有 token 时也可能）
    if echo "$code" | grep -E '^(401|403)$' >/dev/null 2>&1; then
      ok "$name 已挂载（HTTP $code 鉴权拦截正常）"
    elif echo "$code" | grep -E '^(400|422)$' >/dev/null 2>&1; then
      ok "$name 已挂载（HTTP $code 参数校验）"
    elif echo "$code" | grep -E '^(404)$' >/dev/null 2>&1; then
      bad "$name 404 未挂载：$path"
    elif echo "$code" | grep -E '^(200|201)$' >/dev/null 2>&1; then
      # 无 token 却 200 不正常，但若环境开了 Public 也不强失败
      warn "$name 返回 $code（预期无 token 时 401/403，请确认鉴权）"
    else
      warn "$name HTTP $code（body: $(head -c 120 "$tmp_body" 2>/dev/null | tr '\n' ' ')）"
    fi
  }

  probe_auth_route "通知批量补发" POST "/api/admin/notify/logs/resend-batch" '{"ids":[]}'
  probe_auth_route "到件批量补发" POST "/api/inbound/resend-notice-batch" '{"ids":[]}'
  probe_auth_route "滞留批量提醒" POST "/api/overdue/remind-batch" '{"ids":[]}'

  # 可选：带 token 做空 ids 业务校验（不真正发送）
  if [ -n "${SMOKE_TOKEN:-}" ] && [ -n "${STATION_ID:-}" ]; then
    echo "  · 附加：带 token 校验批量补发空 ids（应 400）"
    probe_auth_empty_ids() {
      local name="$1" path="$2"
      local body rc
      set +e
      body="$(curl -sS -m 10 -X POST "$API_BASE$path" \
        -H "Authorization: Bearer $SMOKE_TOKEN" \
        -H "x-station-id: $STATION_ID" \
        -H 'Content-Type: application/json' \
        -d '{"ids":[]}' 2>&1)"
      rc=$?
      set -e
      if [ "$rc" -ne 0 ]; then
        warn "$name 带 token 探测失败：$body"
      elif echo "$body" | grep -E '请选择|至少|ids|400|Bad|message' >/dev/null 2>&1; then
        ok "$name 空 ids 被业务/校验拦截（未真实发送）"
      else
        warn "$name 带 token 响应未识别：$body"
      fi
    }

    probe_auth_empty_ids "通知批量补发" "/api/admin/notify/logs/resend-batch"
    probe_auth_empty_ids "到件批量补发" "/api/inbound/resend-notice-batch"
    probe_auth_empty_ids "滞留批量提醒" "/api/overdue/remind-batch"
  else
    warn "未设 SMOKE_TOKEN+STATION_ID，跳过带鉴权空 ids 探测（可选）"
  fi
else
  warn "无 curl，跳过批量补发路由探测"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "[smoke] 未通过。请对照 docs/TRIAL-CHECKLIST.md 检查环境与服务。"
  exit 1
fi
echo "[smoke] 通过。建议继续人工点验：入库 → 私信失败一键补发（通知页/库存批量） → 查件绑定 → 出库 → 交班。"
echo "        清单：docs/TRIAL-CHECKLIST.md"
