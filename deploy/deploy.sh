#!/usr/bin/env bash
# ============================================================
# aigc-creator 一键部署脚本
# ============================================================
# 用法:
#   ./deploy/deploy.sh              # 完整部署（构建+同步+重启）
#   ./deploy/deploy.sh --skip-build # 仅同步构建产物+重启（跳过本地构建）
#   ./deploy/deploy.sh --dry-run    # 仅打印将要执行的操作
#
# 流程:
#   1. 本地构建 shared + web (Next.js standalone)
#   2. 将 static/public/fonts 复制到 standalone 产物中
#   3. rsync 精简产物到服务器（standalone + deploy + API 源码）
#   4. 服务器端: 同步 nginx 配置、重建 API Docker 镜像、启动 API、
#      迁移数据库、重启 web、验证
#
# 前提:
#   - 本机已安装 pnpm，SSH 能连上服务器
#   - 服务器 deploy/.env 已配置（首次需手动创建）
#   - 服务器已安装 nginx + docker + docker-compose
# ============================================================
set -euo pipefail

SERVER="root@150.5.131.18"
REMOTE_DIR="/root/aigc-creator/app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- CLI flags ----
SKIP_BUILD=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --dry-run)    DRY_RUN=true ;;
    *)            echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

# ---- Helper: run or dry-run ----
run() {
  if "$DRY_RUN"; then
    yellow "[dry-run] $*"
  else
    "$@"
  fi
}

# ============================================================
# Phase 1: Local build
# ============================================================
if ! "$SKIP_BUILD"; then
  echo "==> 1/4 Building shared package..."
  run cd "$PROJECT_ROOT" && pnpm --filter @aigc-creator/shared build

  echo "==> 2/4 Building web (Next.js standalone)..."
  run cd "$PROJECT_ROOT" && \
    NEXT_PUBLIC_API_BASE_URL=https://041105.best/api \
    pnpm --filter @aigc-creator/web build

  echo "==> 3/4 Assembling standalone output..."
  # Next.js standalone 不含 static/public，需手动复制进去
  STANDALONE_WEB="$PROJECT_ROOT/apps/web/.next/standalone/apps/web"
  run rm -rf "$STANDALONE_WEB/.next/static"
  run cp -r "$PROJECT_ROOT/apps/web/.next/static" "$STANDALONE_WEB/.next/static"
  run rm -rf "$STANDALONE_WEB/public"
  run cp -r "$PROJECT_ROOT/apps/web/public" "$STANDALONE_WEB/public"
  green "   Build & assembly done."
else
  echo "==> 1-3/4 Skipping build (--skip-build)"
fi

# ============================================================
# Phase 2: Sync to server — 只传必要文件
# ============================================================
echo "==> 4/4 Syncing to server..."

# --- 2a: deploy/ 目录 (docker-compose, Dockerfile, nginx.conf, .env) ---
run rsync -az \
  --exclude 'node_modules' \
  --exclude '.env' \
  "$PROJECT_ROOT/deploy/" "$SERVER:$REMOTE_DIR/deploy/"

# --- 2b: API 源码 (docker build context) ---
run rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'test' \
  --exclude '.env' \
  "$PROJECT_ROOT/apps/api/" "$SERVER:$REMOTE_DIR/apps/api/"

# --- 2c: shared + ui (API Docker build 可能需要) ---
run rsync -az \
  --exclude 'node_modules' \
  --exclude 'dist' \
  "$PROJECT_ROOT/packages/shared/" "$SERVER:$REMOTE_DIR/packages/shared/"
run rsync -az \
  --exclude 'node_modules' \
  "$PROJECT_ROOT/packages/ui/" "$SERVER:$REMOTE_DIR/packages/ui/"

# --- 2d: monorepo 根配置文件 ---
run rsync -az \
  --include 'package.json' \
  --include 'pnpm-workspace.yaml' \
  --include 'pnpm-lock.yaml' \
  --exclude '*' \
  "$PROJECT_ROOT/" "$SERVER:$REMOTE_DIR/"

# --- 2e: Web standalone 构建产物 ---
if [ -d "$PROJECT_ROOT/apps/web/.next/standalone" ]; then
  run rsync -az --delete \
    --exclude 'node_modules/.cache' \
    "$PROJECT_ROOT/apps/web/.next/standalone/" \
    "$SERVER:$REMOTE_DIR/apps/web/.next/standalone/"
  # standalone 里没有 static/public 的哈希目录，补一份原版
  run rsync -az \
    "$PROJECT_ROOT/apps/web/.next/static/" \
    "$SERVER:$REMOTE_DIR/apps/web/.next/static/"
  run rsync -az \
    "$PROJECT_ROOT/apps/web/public/" \
    "$SERVER:$REMOTE_DIR/apps/web/public/"
  green "   Web build synced."
else
  red "   WARNING: .next/standalone not found. Run without --skip-build first."
fi

green "   All syncs done."

# ============================================================
# Phase 3: Remote — restart services
# ============================================================
echo ""
echo "==> Restarting services on server..."

if ! "$DRY_RUN"; then
  ssh "$SERVER" bash -s <<'REMOTE_EOF'
set -euo pipefail
cd /root/aigc-creator/app/deploy

if [ ! -f .env ]; then
  echo "   FATAL: deploy/.env not found. Create it from .env.example first."
  exit 1
fi

# ---- 3a: Install systemd service (if not already) ----
echo "   Installing systemd service..."
if [ -f /root/aigc-creator/app/deploy/aigc-web.service ]; then
  cp /root/aigc-creator/app/deploy/aigc-web.service /etc/systemd/system/aigc-web.service
  systemctl daemon-reload
  echo "   aigc-web.service installed."
fi

# ---- 3b: Sync nginx config ----
echo "   Syncing nginx config..."
if [ -f /root/aigc-creator/app/deploy/nginx.conf ]; then
  cp /root/aigc-creator/app/deploy/nginx.conf /etc/nginx/sites-available/aigc-creator
  ln -sf /etc/nginx/sites-available/aigc-creator /etc/nginx/sites-enabled/aigc-creator
  if nginx -t 2>/dev/null; then
    nginx -s reload
    echo "   nginx reloaded."
  else
    echo "   WARNING: nginx -t failed, skipping reload."
  fi
fi

# ---- 3c: Ensure standalone has latest static/public ----
STANDALONE_WEB="/root/aigc-creator/app/apps/web/.next/standalone/apps/web"
if [ -d "$STANDALONE_WEB" ]; then
  rm -rf "$STANDALONE_WEB/.next/static"
  cp -r /root/aigc-creator/app/apps/web/.next/static "$STANDALONE_WEB/.next/static"
  rm -rf "$STANDALONE_WEB/public"
  cp -r /root/aigc-creator/app/apps/web/public "$STANDALONE_WEB/public"
  echo "   Static & public copied into standalone."
fi

# ---- 3d: Rebuild & start API ----
echo "   Rebuilding API Docker image..."
docker-compose build api 2>&1 | tail -3

echo "   Starting API..."
docker-compose up -d api

echo "   Waiting for API..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4000/ > /dev/null 2>&1; then
    echo "   API is ready."
    break
  fi
  sleep 2
done

# ---- 3e: Run migrations ----
echo "   Running migrations..."
docker-compose exec -T api sh -c "cd apps/api && npx prisma@5 migrate deploy" \
  || echo "   (migrations skipped — may be already applied)"

# ---- 3f: Restart web ----
echo "   Restarting web (aigc-web)..."
systemctl restart aigc-web
sleep 2
if systemctl is-active --quiet aigc-web; then
  echo "   Web restarted (PID $(systemctl show aigc-web --property=MainPID -r))."
else
  echo "   WARNING: web service failed to start, trying stop+start..."
  systemctl stop aigc-web
  sleep 1
  systemctl start aigc-web
  sleep 2
  if systemctl is-active --quiet aigc-web; then
    echo "   Web started (PID $(systemctl show aigc-web --property=MainPID -r))."
  else
    echo "   ERROR: web service failed to start!"
    systemctl status aigc-web --no-pager
  fi
fi

echo "   All services restarted."
REMOTE_EOF
fi

# ============================================================
# Phase 4: Verify
# ============================================================
echo ""
echo "=========================================="
echo "  Deploy complete. Verifying..."
echo "=========================================="

if ! "$DRY_RUN"; then
  ssh "$SERVER" bash -s <<'VERIFY_EOF'
# 基础可达性
WEB_CODE=$(curl -sk -o /dev/null -w "%{http_code}" https://041105.best/)
WEB_TTFB=$(curl -sk -o /dev/null -w "%{time_starttransfer}" https://041105.best/)

# API 健康
API_OK=false
API_BODY=$(curl -sk https://041105.best/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"handle":"demo-author","password":"demo1234"}' 2>/dev/null)
if echo "$API_BODY" | grep -q accessToken; then API_OK=true; fi

# gzip 是否生效
GZIP_OK=false
GZIP_HEADER=$(curl -skI -H "Accept-Encoding: gzip" https://041105.best/ 2>/dev/null | grep -i "content-encoding" || true)
if echo "$GZIP_HEADER" | grep -qi gzip; then GZIP_OK=true; fi

# 静态资源缓存头
STATIC_CACHE=$(curl -skI https://041105.best/_next/static/ 2>/dev/null | grep -i "cache-control" | head -1 || echo "missing")

# 服务状态
SERVICES=$(systemctl is-active aigc-web nginx docker 2>/dev/null | tr "\n" " ")

echo ""
echo "  Web:       HTTP $WEB_CODE  TTFB ${WEB_TTFB}s"
echo "  API:       $API_OK"
echo "  Gzip:      $GZIP_OK"
echo "  Cache:     $STATIC_CACHE"
echo "  Services:  $SERVICES"

# 性能提醒
if [ "$WEB_TTFB" != "0.000000" ]; then
  TTFB_MS=$(echo "$WEB_TTFB * 1000" | bc 2>/dev/null || echo "?")
  echo ""
  echo "  TTFB: ${TTFB_MS}ms (target: <200ms with ISR cache)"
fi
VERIFY_EOF
fi

echo "=========================================="
