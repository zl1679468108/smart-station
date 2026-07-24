#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 部署前预检（密钥占位仅警告；缺关键文件会失败）
if [ -f "$ROOT/scripts/preflight.sh" ]; then
  bash "$ROOT/scripts/preflight.sh" || {
    echo "[deploy-all] preflight 未通过。若仅警告可：SKIP_PREFLIGHT=1 bash scripts/deploy-all.sh"
    if [ "${SKIP_PREFLIGHT:-}" != "1" ]; then exit 1; fi
  }
fi
"$ROOT/scripts/deploy-backend.sh"
"$ROOT/scripts/deploy-frontend.sh"
echo "[deploy-all] 前后端构建完成"
echo "[deploy-all] 试用步骤见 docs/TRIAL-CHECKLIST.md"
