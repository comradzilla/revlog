#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CEO Dashboard — First-time server setup
# Run as root on a fresh Ubuntu 24.04 Droplet
# ============================================================

APP_DIR="/opt/ceo-dashboard"
REPO="https://github.com/comradzilla/revlog.git"

echo "========================================="
echo " CEO Dashboard — Server Setup"
echo "========================================="

# --- 1. System updates ---
echo "[1/9] Updating system packages..."
apt-get update && apt-get upgrade -y

# --- 2. Install Docker & Docker Compose ---
echo "[2/9] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
fi
# Docker Compose plugin comes with the Docker install on Ubuntu 24.04
docker --version
docker compose version

# --- 3. Install Node 22 LTS ---
echo "[3/9] Installing Node.js 22 LTS..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
node --version
npm --version

# --- 4. Install pm2 ---
echo "[4/9] Installing pm2..."
npm install -g pm2

# --- 5. Install Nginx & Certbot ---
echo "[5/9] Installing Nginx and Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

# --- 6. Clone repo & configure ---
echo "[6/9] Cloning repository..."
if [ ! -d "$APP_DIR" ]; then
    git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR/ceo-dashboard"

if [ ! -f .env ]; then
    cp .env.example .env
    echo "  -> Created .env from template — edit it before going live."
fi

# --- 7. Start TimescaleDB ---
echo "[7/9] Starting TimescaleDB..."
docker compose -f docker-compose.prod.yml up -d

echo "  Waiting for database to be ready..."
until docker compose -f docker-compose.prod.yml exec -T timescaledb pg_isready -U ceo -d ceo_dashboard &>/dev/null; do
    sleep 2
done
echo "  Database is ready."

# --- 8. Build & start the app ---
echo "[8/9] Installing dependencies and building..."
npm install
npm run build

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

# --- 9. Configure Nginx ---
echo "[9/9] Configuring Nginx..."
cp nginx/ceo-dashboard.conf /etc/nginx/sites-available/ceo-dashboard
ln -sf /etc/nginx/sites-available/ceo-dashboard /etc/nginx/sites-enabled/ceo-dashboard
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "========================================="
echo " Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Edit the env file:        nano $APP_DIR/ceo-dashboard/.env"
echo "  2. Update the Nginx domain:  nano /etc/nginx/sites-available/ceo-dashboard"
echo "     Replace 'dashboard.yourdomain.com' with your actual domain."
echo "  3. Point your DNS A record to this server's IP."
echo "  4. Set up SSL with Certbot:"
echo "       certbot --nginx -d dashboard.yourdomain.com"
echo "  5. Restart the app after env changes:"
echo "       cd $APP_DIR/ceo-dashboard && pm2 restart ceo-dashboard"
echo ""
