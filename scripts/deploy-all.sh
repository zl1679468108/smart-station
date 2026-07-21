#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/deploy-backend.sh"
"$ROOT/scripts/deploy-frontend.sh"
echo "[deploy-all] 前后端构建完成"
