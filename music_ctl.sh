#!/bin/bash
# 月汐音乐花园 - 管理工具 v2
# 用法: music_ctl.sh [命令]

SITE_DIR="/opt/music_site"
PID_FILE="$SITE_DIR/guardian.pid"
LOG_FILE="$SITE_DIR/guardian.log"
HEALTH_URL="http://127.0.0.1:9999/health"

start() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        local health=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null)
        if [ "$health" = "200" ]; then
            echo "✅ 守护进程已在运行 (PID: $(cat $PID_FILE))"
            return 0
        fi
    fi
    
    fuser -k 9999/tcp 2>/dev/null
    rm -f "$PID_FILE"
    sleep 2
    
    echo "🌸 启动月汐音乐花园..."
    cd "$SITE_DIR"
    setsid python3 guardian.py </dev/null >> "$LOG_FILE" 2>&1 &
    disown
    
    for i in $(seq 1 10); do
        sleep 1
        if curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null | grep -q "200"; then
            echo "✅ 启动成功！(等待${i}秒)"
            echo "   🌐 网站: http://192.168.1.13:9999"
            echo "   🏥 健康: http://192.168.1.13:9999/health"
            echo "   📊 状态: http://192.168.1.13:9999/status"
            return 0
        fi
    done
    echo "❌ 启动超时，查看日志: $LOG_FILE"
    return 1
}

stop() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "⏹️ 停止守护进程 (PID: $PID)..."
            kill "$PID"
            sleep 3
            kill -0 "$PID" 2>/dev/null && kill -9 "$PID"
        fi
        rm -f "$PID_FILE"
    fi
    fuser -k 9999/tcp 2>/dev/null
    echo "✅ 已停止"
}

restart() {
    stop
    sleep 2
    start
}

status() {
    echo "╔══════════════════════════════════════╗"
    echo "║   🌸 月汐音乐花园 - 系统状态        ║"
    echo "╚══════════════════════════════════════╝"
    echo ""
    
    # 守护进程状态
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        local health_json=$(curl -s "$HEALTH_URL" 2>/dev/null)
        if [ -n "$health_json" ]; then
            echo "🏥 守护进程: ✅ 运行中"
            echo "$health_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   PID: {$(cat $PID_FILE)}')
print(f'   运行时间: {d[\"uptime_hours\"]}小时')
print(f'   HTTP服务: {\"✅\" if d[\"http_ok\"] else \"❌\"}')
print(f'   内存使用: {d[\"memory_mb\"]}MB')
print(f'   上次刷新: {d[\"last_refresh\"]}')
print(f'   刷新状态: {\"✅\" if d[\"refresh_ok\"] else \"❌\"}')
print(f'   刷新次数: {d[\"refresh_count\"]}')
print(f'   上次备份: {d[\"last_backup\"]}')
print(f'   错误计数: {d[\"errors\"]}')
" 2>/dev/null
        else
            echo "🏥 守护进程: ⚠️ 进程在但HTTP无响应"
        fi
    else
        echo "🏥 守护进程: ❌ 未运行"
    fi
    
    echo ""
    
    # 歌曲数据
    echo "🎵 歌曲数据:"
    python3 -c "
import json
with open('$SITE_DIR/all_liked_songs.json') as f:
    songs = json.load(f)
has = sum(1 for s in songs if s.get('url'))
print(f'   总歌曲: {len(songs)}')
print(f'   有直链: {has}')
print(f'   无直链: {len(songs)-has}')
" 2>/dev/null || echo "   ❌ 数据文件不存在"
    
    echo ""
    
    # Cookie状态
    echo "🔑 Cookie状态:"
    python3 -c "
import json
from datetime import datetime
with open('$SITE_DIR/netease_cookie.json') as f:
    d = json.load(f)
updated = d.get('updated','未知')
print(f'   更新时间: {updated}')
print(f'   上次刷新: {d.get(\"last_refresh\",\"从未\")}')
print(f'   刷新次数: {d.get(\"refresh_count\",0)}')
if updated != '未知':
    try:
        dt = datetime.strptime(updated, '%Y-%m-%d %H:%M:%S')
        days = (datetime.now() - dt).days
        if days > 25:
            print(f'   ⚠️ Cookie已{days}天未更新，建议重新登录')
        else:
            print(f'   ✅ Cookie有效 ({days}天前更新)')
    except: pass
" 2>/dev/null || echo "   ❌ Cookie文件不存在"
    
    echo ""
    
    # 备份状态
    echo "📦 备份:"
    local backup_count=$(ls "$BACKUP_DIR"/songs_*.json.gz 2>/dev/null | wc -l)
    if [ "$backup_count" -gt 0 ]; then
        local latest=$(ls -t "$BACKUP_DIR"/songs_*.json.gz 2>/dev/null | head -1)
        echo "   备份数量: $backup_count"
        echo "   最新备份: $(basename $latest) ($(du -h "$latest" | cut -f1))"
    else
        echo "   暂无备份"
    fi
}

refresh() {
    echo "🔄 手动刷新直链..."
    python3 "$SITE_DIR/auto_refresh.py"
}

logs() {
    echo "📋 最近日志:"
    tail -${1:-20} "$LOG_FILE"
}

health() {
    echo "🏥 健康检查:"
    curl -s "$HEALTH_URL" | python3 -m json.tool
}

restore() {
    bash "$SITE_DIR/emergency_restore.sh"
}

case "$1" in
    start)    start ;;
    stop)     stop ;;
    restart)  restart ;;
    status)   status ;;
    refresh)  refresh ;;
    logs)     logs "$2" ;;
    health)   health ;;
    restore)  restore ;;
    *)
        echo "🌸 月汐音乐花园管理工具 v2"
        echo ""
        echo "用法: $0 <命令>"
        echo ""
        echo "命令:"
        echo "  start    启动守护进程"
        echo "  stop     停止守护进程"
        echo "  restart  重启守护进程"
        echo "  status   查看系统状态"
        echo "  refresh  手动刷新直链"
        echo "  logs [N] 查看最近N条日志 (默认20)"
        echo "  health   健康检查JSON"
        echo "  restore  紧急恢复数据"
        echo ""
        echo "地址:"
        echo "  🌐 网站: http://192.168.1.13:9999"
        echo "  🏥 健康: http://192.168.1.13:9999/health"
        echo "  📊 状态: http://192.168.1.13:9999/status"
        ;;
esac
