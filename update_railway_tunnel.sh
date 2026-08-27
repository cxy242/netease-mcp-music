#!/bin/bash
# 更新 Railway 的 REMOTE_AUDIO_BASE 环境变量
# 用法: ./update_railway_tunnel.sh <新隧道URL>

TUNNEL_URL="$1"
RAILWAY_TOKEN="f9c14383-4148-4f1b-ab68-7bc55cc7c60e"
PROJECT_ID="bdbadb48-f01f-4c6f-a600-3ccccd8a39de"
ENV_ID="713502e6-0818-4415-a9a4-30efa7427c0a"
SERVICE_ID="03aa28ce-a947-4609-b086-15a808eab12b"

if [ -z "$TUNNEL_URL" ]; then
    echo "Usage: $0 <tunnel_url>"
    exit 1
fi

RESULT=$(curl --noproxy '*' -sf -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $RAILWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { variableUpsert(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$SERVICE_ID\\\", name: \\\"REMOTE_AUDIO_BASE\\\", value: \\\"$TUNNEL_URL\\\" }) }\"}" \
    --connect-timeout 10)

if echo "$RESULT" | grep -q '"data":{"variableUpsert":true}'; then
    echo "[$(date)] ✅ Railway REMOTE_AUDIO_BASE updated: $TUNNEL_URL"
else
    echo "[$(date)] ❌ Railway update failed: $RESULT"
fi
