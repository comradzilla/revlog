#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CEO Dashboard — Deploy update
# Run on the server to pull latest changes and restart
# ============================================================

APP_DIR="/opt/ceo-dashboard/ceo-dashboard"

cd "$APP_DIR"

echo "Pulling latest changes..."
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

echo "Installing dependencies..."
npm install --production=false

echo "Building..."
npm run build

echo "Restarting application..."
pm2 restart ceo-dashboard

echo ""
echo "Deploy complete at $(date '+%Y-%m-%d %H:%M:%S')"
echo "Status:"
pm2 show ceo-dashboard | head -20
