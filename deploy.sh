#!/bin/bash
# FlowCraft Auto-Deploy Script
# 觸發：GitHub Webhook push to main
set -e

export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")"

LOG="/tmp/flowcraft-deploy.log"
echo "=== Deploy started at $(date) ===" | tee -a "$LOG"

# 1. Git pull
echo "[1/6] git pull..." | tee -a "$LOG"
git pull origin main 2>&1 | tee -a "$LOG"

# 2. Backup current dist
echo "[2/6] Backing up dist..." | tee -a "$LOG"
if [ -d "dist" ]; then
    rm -rf dist-backup
    cp -r dist dist-backup
    echo "  dist → dist-backup OK" | tee -a "$LOG"
else
    echo "  no dist to backup, skip" | tee -a "$LOG"
fi

# 3. Frontend: npm install + build
echo "[3/6] Frontend npm install..." | tee -a "$LOG"
npm install --prefer-offline 2>&1 | tail -3 | tee -a "$LOG"

echo "[4/6] Vite build..." | tee -a "$LOG"
npx vite build 2>&1 | tail -5 | tee -a "$LOG"

# 4. Server: npm install
echo "[5/6] Server npm install..." | tee -a "$LOG"
cd server
npm install --prefer-offline 2>&1 | tail -3 | tee -a "$LOG"
cd ..

# 5. PM2 restart
echo "[6/6] PM2 restart..." | tee -a "$LOG"
pm2 restart flowcraft 2>&1 | tee -a "$LOG"

# 6. Health check (wait up to 10s)
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Deploy success! Health: $HTTP_CODE" | tee -a "$LOG"
else
    echo "❌ Health check failed ($HTTP_CODE), rolling back..." | tee -a "$LOG"
    if [ -d "dist-backup" ]; then
        rm -rf dist
        mv dist-backup dist
        pm2 restart flowcraft
        sleep 2
        echo "🔄 Rolled back to previous version" | tee -a "$LOG"
    fi
fi

echo "=== Deploy finished at $(date) ===" | tee -a "$LOG"
