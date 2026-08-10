#!/bin/bash
# 月汐音乐花园 - 状态查看脚本

SITE_DIR="/opt/music_site"
PORT=9999

echo ""
echo "🌸 ════════════════════════════════════════"
echo "   月汐音乐花园 - 系统状态"
echo "   ════════════════════════════════════════"
echo ""

# Supervisor 状态
SUPERVISOR_PID=$(cat "$SITE_DIR/supervisor.pid" 2>/dev/null)
if [ -n "$SUPERVISOR_PID" ] && kill -0 "$SUPERVISOR_PID" 2>/dev/null; then
    echo "🛡️  Supervisor: ✅ 运行中 (PID: $SUPERVISOR_PID)"
else
    echo "🛡️  Supervisor: ❌ 未运行"
fi

# Guardian 状态
GUARDIAN_PID=$(cat "$SITE_DIR/guardian.pid" 2>/dev/null)
if [ -n "$GUARDIAN_PID" ] && kill -0 "$GUARDIAN_PID" 2>/dev/null; then
    echo "🌐 Guardian:   ✅ 运行中 (PID: $GUARDIAN_PID)"
else
    echo "🌐 Guardian:   ❌ 未运行"
fi

# HTTP 健康检查
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$PORT/health" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo "🔗 HTTP:       ✅ 正常 (端口 $PORT)"
    
    # 获取详细状态
    HEALTH=$(curl -s "http://127.0.0.1:$PORT/health" 2>/dev/null)
    echo ""
    echo "   详细信息:"
    echo "   ─────────────────────────────────────"
    echo "$HEALTH" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'   运行时间: {d.get(\"uptime_hours\", 0)} 小时')
    print(f'   上次刷新: {d.get(\"last_refresh\", \"未知\")}')
    print(f'   刷新成功: {\"是\" if d.get(\"refresh_ok\") else \"否\"}')
    print(f'   刷新次数: {d.get(\"refresh_count\", 0)}')
    print(f'   上次备份: {d.get(\"last_backup\", \"从未\")}')
    print(f'   错误数量: {d.get(\"errors\", 0)}')
    print(f'   内存占用: {d.get(\"memory_mb\", 0)} MB')
except:
    print('   (无法解析详细信息)')
" 2>/dev/null
else
    echo "🔗 HTTP:       ❌ 异常 (HTTP $HTTP_CODE)"
fi

# 歌曲数据
if [ -f "$SITE_DIR/all_liked_songs.json" ]; then
    SONGS_INFO=$(python3 -c "
import json
with open('$SITE_DIR/all_liked_songs.json') as f:
    songs = json.load(f)
has_url = sum(1 for s in songs if s.get('url'))
print(f'{len(songs)}/{has_url}')
" 2>/dev/null)
    TOTAL=$(echo "$SONGS_INFO" | cut -d'/' -f1)
    HAS_URL=$(echo "$SONGS_INFO" | cut -d'/' -f2)
    echo ""
    echo "🎵 歌曲数据:"
    echo "   ─────────────────────────────────────"
    echo "   总歌曲: $TOTAL"
    echo "   有直链: $HAS_URL"
    echo "   无直链: $((TOTAL - HAS_URL))"
fi

# 日志最后几行
echo ""
echo "📋 最近日志:"
echo "   ─────────────────────────────────────"
tail -3 "$SITE_DIR/supervisor.log" 2>/dev/null | sed 's/^/   /'

echo ""
echo "🔗 网站地址: http://192.168.1.13:$PORT"

# Cloudflare 隧道状态
TUNNEL_PID=$(cat "$SITE_DIR/cloudflared.pid" 2>/dev/null)
if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    TUNNEL_URL=$(cat "$SITE_DIR/tunnel_url.txt" 2>/dev/null)
    echo "🌍 公网隧道: ✅ 运行中 (PID: $TUNNEL_PID)"
    echo "🌐 公网地址: ${TUNNEL_URL:-获取中...}"
else
    echo "🌍 公网隧道: ❌ 未运行"
    echo "   启动: bash $SITE_DIR/tunnel.sh start"
fi

echo ""
