#!/usr/bin/env bash
# ============================================================
# bytedance-aigc 一键部署脚本
# 用法: ./deploy.sh
# 前提: SSH 已配好免密登录 (公钥已推到服务器)
# ============================================================
set -euo pipefail

SERVER="root@150.5.131.18"
REMOTE_DIR="/root/bytedance-aigc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 1/6 Building shared package..."
cd "$PROJECT_ROOT" && pnpm --filter @bytedance-aigc/shared build

echo "==> 2/6 Building API..."
pnpm --filter @bytedance-aigc/api build

echo "==> 3/6 Building web (前端单 app)..."
NEXT_PUBLIC_API_BASE_URL=https://041105.best/api \
pnpm --filter @bytedance-aigc/web build

echo "==> 4/6 Syncing project to server..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude 'coverage' \
  --exclude 'test-results' \
  --exclude 'e2e' \
  --exclude 'apps/api/test' \
  --exclude '.claude' \
  "$PROJECT_ROOT/" "$SERVER:$REMOTE_DIR/"

echo "==> 5/6 Running remote setup..."
ssh "$SERVER" bash -s <<'REMOTE'
set -euo pipefail
cd /root/bytedance-aigc

# Install pnpm if missing
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@10.33.4
fi

# Install deps (production)
pnpm install --prod --ignore-scripts

# Build shared on server (needed for api)
pnpm --filter @bytedance-aigc/shared build

# Generate Prisma client
cd apps/api && npx prisma generate && cd ../..

# Run migrations
cd apps/api && npx prisma migrate deploy && cd ../..

# Seed data
cd apps/api && npx prisma db seed && cd ../..

echo "Remote setup done."
REMOTE

echo "==> 6/6 Starting services with Docker Compose..."
ssh "$SERVER" bash -s <<'REMOTE2'
set -euo pipefail
cd /root/bytedance-aigc/deploy

# Create .env from example if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "WARNING: deploy/.env created from template — edit it before next deploy!"
fi

docker-compose up -d --build
echo "Docker services started."
REMOTE2

echo ""
echo "=========================================="
echo "  Deploy complete!"
echo "  API:  https://041105.best/api/"
echo "  Web:  https://041105.best/"
echo "=========================================="
