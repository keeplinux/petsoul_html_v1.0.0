#!/usr/bin/env bash
# ============================================================
# Petsoul / Silifield 官网一键部署脚本
# 功能：本机 cargo build --release -> 上传二进制 -> rsync static
#       -> 服务器重载 systemd(petsoul) 与 nginx
# 用法：
#   bash deployment/deploy.sh                    # 完整部署（compile+upload+reload）
#   bash deployment/deploy.sh --static-only      # 仅同步 static/
#   bash deployment/deploy.sh --binary-only      # 仅编译+上传二进制
#   bash deployment/deploy.sh --no-build         # 跳过本机编译（直接上传已有产物）
# 前置：本机已装 rsync/cargo；可免密 SSH 到服务器
# ============================================================
set -euo pipefail

# ---------------- 配置区（按需修改） ----------------
SERVER_IP="${SERVER_IP:-47.103.81.161}"
SERVER_USER="${SERVER_USER:-root}"
APP_HOME="/opt/petsoul"
BIN_NAME="petsoul-website"
PORT="${PORT:-3000}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_SRC="$PROJECT_DIR/static"
BIN_SRC="$PROJECT_DIR/target/release/$BIN_NAME"
# ----------------------------------------------------

MODE="all"
for arg in "$@"; do
  case "$arg" in
    --static-only) MODE="static" ;;
    --binary-only) MODE="binary" ;;
    --no-build)    NO_BUILD=1 ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

info()  { echo -e "\033[36m[INFO]\033[0m $*"; }
warn()  { echo -e "\033[33m[WARN]\033[0m $*"; }
die()   { echo -e "\033[31m[ERROR]\033[0m $*" >&2; exit 1; }

[ -n "${SERVER_IP:-}" ] || die "SERVER_IP 未配置"
command -v rsync >/dev/null || die "缺少 rsync"

DEST="$SERVER_USER@$SERVER_IP"

# ---------- 本机编译 ----------
if [[ "$MODE" == "all" || "$MODE" == "binary" ]] && [[ "${NO_BUILD:-0}" != "1" ]]; then
  info "cargo build --release ..."
  (cd "$PROJECT_DIR" && cargo build --release)
  [ -f "$BIN_SRC" ] || die "未找到二进制: $BIN_SRC"
fi

# ---------- 上传二进制 ----------
if [[ "$MODE" == "all" || "$MODE" == "binary" ]]; then
  info "上传二进制 -> $DEST:${APP_HOME}/bin/"
  ssh "$DEST" "mkdir -p $APP_HOME/bin $APP_HOME/static $APP_HOME/logs"
  scp "$BIN_SRC" "$DEST:${APP_HOME}/bin/$BIN_NAME"
  ssh "$DEST" "chmod +x $APP_HOME/bin/$BIN_NAME"
fi

# ---------- 同步 static ----------
if [[ "$MODE" == "all" || "$MODE" == "static" ]]; then
  info "rsync static/ -> $DEST:${APP_HOME}/static/（--delete）"
  [ -d "$STATIC_SRC" ] || die "static 目录不存在: $STATIC_SRC"
  rsync -avz --delete "$STATIC_SRC/" "$DEST:${APP_HOME}/static/"
fi

# ---------- 服务器端重载 ----------
info "服务器端重载服务 ..."
ssh "$DEST" bash -s <<EOF
  set -e
  APP_HOME="$APP_HOME"
  # 归属调整（存在则改）
  if id -u petsoul >/dev/null 2>&1; then chown -R petsoul:petsoul "$APP_HOME"; fi
  # 方案 A：重载 systemd + nginx（若 unit 文件已就位）
  if [ -f /etc/systemd/system/petsoul.service ]; then
    systemctl daemon-reload
    systemctl restart petsoul || systemctl start petsoul
    systemctl enable petsoul >/dev/null 2>&1 || true
    echo "petsoul status: \$(systemctl is-active petsoul)"
    echo "health check: \$(curl -fsS http://127.0.0.1:$PORT/health || echo 'FAIL')"
  else
    echo "未找到 /etc/systemd/system/petsoul.service —— 请参考 deployment/petsoul.service"
  fi
  # nginx 校验并重载（若存在配置）
  if command -v nginx >/dev/null && nginx -t >/dev/null 2>&1; then
    systemctl reload nginx || nginx -s reload
    echo "nginx reloaded"
  fi
EOF

info "部署完成。"
info "快速验证：curl -kI https://silifield.com/  (本机)"
