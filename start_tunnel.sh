#!/bin/bash
# Cloudflare Tunnel 自启脚本 v2
# 每次启动时获取新的tunnel URL并自动通知服务器

TUNNEL_URL_FILE="/opt/netease-mcp/tunnel_url.txt"
LOCAL_API="http://localhost:3000/api/update_tunnel"

echo "[$(date)] Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:3000 --no-autoupdate 2>&1 | while read line; do
    echo "$line"
    # 提取tunnel URL
    if echo "$line" | grep -q "trycloudflare.com"; then
        URL=$(echo "$line" | grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com')
        if [ -n "$URL" ]; then
            echo "$URL" > "$TUNNEL_URL_FILE"
            echo "[$(date)] Tunnel URL saved: $URL"
            # 自动通知服务器更新 URL
            curl -sf -X POST "$LOCAL_API" \
                -H "Content-Type: application/json" \
                -d "{\"url\":\"$URL\"}" \
                --connect-timeout 5 \
                && echo "[$(date)] Server notified OK" \
                || echo "[$(date)] Server notify failed (will retry on next health check)"
        fi
    fi
done
