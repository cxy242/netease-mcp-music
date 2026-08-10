#!/bin/bash
# 月汐音乐花园 - Cloudflare Tunnel 管理

TUNNEL_PID_FILE="/opt/music_site/cloudflared.pid"
TUNNEL_URL_FILE="/opt/music_site/tunnel_url.txt"
TUNNEL_LOG="/opt/music_site/cloudflared.log"
LOCAL_URL="http://localhost:9999"

do_start() {
    # 检查是否已在运行
    if [ -f "$TUNNEL_PID_FILE" ]; then
        PID=$(cat "$TUNNEL_PID_FILE" 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "隧道已在运行 (PID: $PID)"
            if [ -f "$TUNNEL_URL_FILE" ]; then
                echo "公网地址: $(cat "$TUNNEL_URL_FILE")"
            fi
            return 0
        fi
    fi
    
    # 清理旧进程
    pkill -f "cloudflared tunnel" 2>/dev/null
    sleep 1
    pkill -9 -f "cloudflared tunnel" 2>/dev/null
    
    echo "正在启动 Cloudflare Tunnel..."
    
    # 启动隧道，日志输出到文件
    cloudflared tunnel --url "$LOCAL_URL" > "$TUNNEL_LOG" 2>&1 &
    CF_PID=$!
    echo "$CF_PID" > "$TUNNEL_PID_FILE"
    
    # 等待获取URL (最多30秒)
    for i in $(seq 1 30); do
        URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
        if [ -n "$URL" ]; then
            echo "$URL" > "$TUNNEL_URL_FILE"
            echo "✅ 隧道启动成功！"
            echo "🌐 公网地址: $URL"
            return 0
        fi
        # 检查进程是否还活着
        if ! kill -0 "$CF_PID" 2>/dev/null; then
            echo "❌ 隧道启动失败"
            cat "$TUNNEL_LOG" | tail -5
            return 1
        fi
        sleep 1
    done
    
    echo "⚠️ 启动超时，可能仍在初始化中"
    echo "日志: tail -20 $TUNNEL_LOG"
    return 1
}

do_stop() {
    pkill -f "cloudflared tunnel" 2>/dev/null
    sleep 1
    pkill -9 -f "cloudflared tunnel" 2>/dev/null
    rm -f "$TUNNEL_PID_FILE"
    echo "隧道已停止"
}

do_status() {
    if [ -f "$TUNNEL_PID_FILE" ]; then
        PID=$(cat "$TUNNEL_PID_FILE" 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            echo "✅ 隧道运行中 (PID: $PID)"
            if [ -f "$TUNNEL_URL_FILE" ]; then
                echo "🌐 公网地址: $(cat "$TUNNEL_URL_FILE")"
            fi
            return 0
        fi
    fi
    echo "❌ 隧道未运行"
    return 1
}

do_url() {
    if [ -f "$TUNNEL_URL_FILE" ]; then
        cat "$TUNNEL_URL_FILE"
    else
        echo "隧道未运行或URL未获取"
        return 1
    fi
}

case "$1" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; sleep 2; do_start ;;
    status)  do_status ;;
    url)     do_url ;;
    *)       echo "用法: $0 {start|stop|restart|status|url}" ;;
esac
