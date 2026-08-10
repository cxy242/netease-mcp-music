#!/bin/bash
# 月汐音乐花园 - 看门狗脚本
# 每5分钟检查一次，挂了就自动重启

SITE_DIR="/opt/music_site"
GUARDIAN_SCRIPT="$SITE_DIR/guardian.py"
PID_FILE="$SITE_DIR/guardian.pid"
LOG_FILE="$SITE_DIR/watchdog.log"
PORT=9999

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 日志轮转 (保留最近1000行)
if [ -f "$LOG_FILE" ] && [ $(wc -l < "$LOG_FILE") -gt 1000 ]; then
    tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp"
    mv "${LOG_FILE}.tmp" "$LOG_FILE"
fi

# 检查1: PID文件存在且进程存活
check_by_pid() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            return 0  # 运行中
        fi
    fi
    return 1  # 未运行
}

# 检查2: 端口是否在监听
check_by_port() {
    if ss -tlnp 2>/dev/null | grep -q ":${PORT} " || netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
        return 0
    fi
    # 也检查fuser
    if fuser ${PORT}/tcp 2>/dev/null | grep -q .; then
        return 0
    fi
    return 1
}

# 检查3: HTTP健康检查
check_by_http() {
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:${PORT}/health" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        return 0
    fi
    return 1
}

# 主检查逻辑
main() {
    # 三项检查：PID、端口、HTTP
    PID_OK=false
    PORT_OK=false
    HTTP_OK=false
    
    check_by_pid && PID_OK=true
    check_by_port && PORT_OK=true
    check_by_http && HTTP_OK=true
    
    # 一切正常，静默退出
    if $PID_OK && $PORT_OK && $HTTP_OK; then
        return 0
    fi
    
    # 有异常，开始修复
    log "⚠️ 检测到异常 - PID:$PID_OK 端口:$PORT_OK HTTP:$HTTP_OK"
    
    # 清理残留进程
    fuser -k $PORT/tcp 2>/dev/null
    sleep 1
    
    # 移除旧PID
    rm -f "$PID_FILE"
    
    # 重启
    cd "$SITE_DIR"
    setsid python3 "$GUARDIAN_SCRIPT" </dev/null >> "$SITE_DIR/guardian.log" 2>&1 &
    disown
    
    sleep 5
    
    # 验证重启成功
    if check_by_pid && check_by_http; then
        NEW_PID=$(cat "$PID_FILE" 2>/dev/null)
        log "✅ 重启成功 - 新PID: $NEW_PID"
    else
        log "❌ 重启失败！"
    fi
}

main
