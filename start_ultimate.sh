#!/bin/bash
# 月汐音乐花园 - 终极启动脚本 v2
# 启动 Supervisor -> Supervisor 启动 Guardian

SITE_DIR="/opt/music_site"
SUPERVISOR_SCRIPT="$SITE_DIR/supervisor.py"
SUPERVISOR_PID_FILE="$SITE_DIR/supervisor.pid"
GUARDIAN_PID_FILE="$SITE_DIR/guardian.pid"
PORT=9999

echo "🌸 月汐音乐花园 - 启动中..."

# 函数: 杀掉所有相关进程
kill_all() {
    # 杀掉 supervisor
    pkill -f "python.*supervisor" 2>/dev/null
    
    # 杀掉 guardian
    pkill -f "python.*guardian" 2>/dev/null
    
    sleep 2
    
    # 强制杀
    pkill -9 -f "python.*supervisor" 2>/dev/null
    pkill -9 -f "python.*guardian" 2>/dev/null
    
    # 清理PID文件
    rm -f "$SUPERVISOR_PID_FILE" "$GUARDIAN_PID_FILE"
    sleep 1
}

# 函数: 检查是否已在运行
check_running() {
    if [ -f "$SUPERVISOR_PID_FILE" ]; then
        PID=$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            # 检查HTTP
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$PORT/health" 2>/dev/null)
            if [ "$HTTP_CODE" = "200" ]; then
                return 0
            fi
        fi
    fi
    return 1
}

# 主逻辑
main() {
    cd "$SITE_DIR"
    
    # 检查是否已在运行
    if check_running; then
        SUPERVISOR_PID=$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null)
        GUARDIAN_PID=$(cat "$GUARDIAN_PID_FILE" 2>/dev/null)
        echo "✅ 已在运行中"
        echo ""
        echo "   🛡️ Supervisor PID: $SUPERVISOR_PID"
        echo "   🌐 Guardian  PID: $GUARDIAN_PID"
        echo "   🔗 网站地址: http://192.168.1.13:$PORT"
        exit 0
    fi
    
    # 清理旧进程
    echo "  清理旧进程..."
    kill_all
    
    # 启动 Supervisor (后台运行，独立会话)
    echo "  启动 Supervisor..."
    setsid python3 "$SUPERVISOR_SCRIPT" </dev/null >> /dev/null 2>&1 &
    disown
    
    # 等待启动 (给更多时间)
    echo "  等待服务就绪 (15秒)..."
    sleep 15
    
    # 验证
    if [ -f "$SUPERVISOR_PID_FILE" ]; then
        SUPERVISOR_PID=$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null)
        if [ -n "$SUPERVISOR_PID" ] && kill -0 "$SUPERVISOR_PID" 2>/dev/null; then
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:$PORT/health" 2>/dev/null)
            if [ "$HTTP_CODE" = "200" ]; then
                GUARDIAN_PID=$(cat "$GUARDIAN_PID_FILE" 2>/dev/null)
                echo ""
                echo "✅ 月汐音乐花园启动成功！"
                echo ""
                echo "   🛡️ Supervisor PID: $SUPERVISOR_PID"
                echo "   🌐 Guardian  PID: $GUARDIAN_PID"
                echo "   🔗 网站地址: http://192.168.1.13:$PORT"
                echo ""
                echo "   ════════════════════════════════════════"
                echo "   保护机制 (5层保险):"
                echo "   ════════════════════════════════════════"
                echo "   1️⃣  Guardian 自带HTTP服务器 + 健康检查"
                echo "   2️⃣  Guardian 自动刷新直链 + 数据备份"
                echo "   3️⃣  Supervisor 监控 Guardian (30秒检查)"
                echo "   4️⃣  Guardian 崩溃 Supervisor 自动重启"
                echo "   5️⃣  Supervisor 崩溃可手动运行此脚本"
                echo "   ════════════════════════════════════════"
                echo ""
                exit 0
            fi
        fi
    fi
    
    echo "❌ 启动可能需要更多时间，正在检查..."
    
    # 再等一下
    sleep 10
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://127.0.0.1:$PORT/health" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
        GUARDIAN_PID=$(cat "$GUARDIAN_PID_FILE" 2>/dev/null)
        SUPERVISOR_PID=$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null)
        echo "✅ 延迟启动成功！"
        echo ""
        echo "   🛡️ Supervisor PID: $SUPERVISOR_PID"
        echo "   🌐 Guardian  PID: $GUARDIAN_PID"
        echo "   🔗 网站地址: http://192.168.1.13:$PORT"
        exit 0
    fi
    
    echo "❌ 启动失败，请检查日志:"
    echo "   tail -50 $SITE_DIR/supervisor.log"
    echo "   tail -50 $SITE_DIR/guardian.log"
    exit 1
}

main
