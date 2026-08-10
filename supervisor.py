#!/usr/bin/env python3
"""
月汐音乐花园 - 超级守护进程 v3
功能: 
  1. 启动并监控 guardian.py (自动重启)
  2. 定期HTTP健康检查
  3. 自动清理僵尸进程
  4. 端口冲突自动解决
  5. 守护进程自身也自动重启
"""
import os
import sys
import time
import signal
import subprocess
import json
import logging
from datetime import datetime
from pathlib import Path

# ========== 配置 ==========
SITE_DIR = '/opt/music_site'
GUARDIAN_SCRIPT = os.path.join(SITE_DIR, 'guardian.py')
SUPERVISOR_PID_FILE = os.path.join(SITE_DIR, 'supervisor.pid')
SUPERVISOR_LOG = os.path.join(SITE_DIR, 'supervisor.log')
PORT = 9999
HEALTH_CHECK_INTERVAL = 30  # 30秒检查一次
RESTART_DELAY = 5  # 重启等待秒数
MAX_RESTART_ATTEMPTS = 10  # 最大连续重启次数
RESTART_COOLDOWN = 60  # 冷却时间

# ========== 日志 ==========
log = logging.getLogger('supervisor')
log.setLevel(logging.INFO)
fmt = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')

# 文件日志 (轮转)
fh = logging.FileHandler(SUPERVISOR_LOG, encoding='utf-8')
fh.setFormatter(fmt)
log.addHandler(fh)

# 控制台日志
sh = logging.StreamHandler(sys.stdout)
sh.setFormatter(fmt)
log.addHandler(sh)

# 防止重复日志
log.propagate = False

# ========== 全局状态 ==========
guardian_process = None
restart_count = 0
last_restart_time = 0
running = True

def signal_handler(signum, frame):
    global running
    log.info(f"收到信号 {signum}，正在关闭...")
    running = False
    cleanup()

def cleanup():
    global guardian_process
    if guardian_process and guardian_process.poll() is None:
        log.info("正在停止 Guardian...")
        guardian_process.terminate()
        try:
            guardian_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            guardian_process.kill()
    if os.path.exists(SUPERVISOR_PID_FILE):
        os.remove(SUPERVISOR_PID_FILE)

def write_pid():
    with open(SUPERVISOR_PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

def kill_port():
    """杀掉占用端口的进程"""
    try:
        # 使用 pkill 杀掉 guardian 进程
        subprocess.run(
            ['pkill', '-f', 'python.*guardian'],
            capture_output=True, text=True, timeout=10
        )
        time.sleep(1)
        log.info(f"清理端口 {PORT} 完成")
    except Exception as e:
        log.warning(f"清理端口失败: {e}")

def check_http_health():
    """HTTP健康检查"""
    try:
        import urllib.request
        req = urllib.request.Request(
            f'http://127.0.0.1:{PORT}/health',
            method='GET'
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read())
                return data.get('status') == 'ok'
    except Exception:
        pass
    return False

def start_guardian():
    """启动 Guardian 进程"""
    global guardian_process, restart_count, last_restart_time
    
    # 冷却检查
    now = time.time()
    if now - last_restart_time < RESTART_COOLDOWN:
        restart_count += 1
        if restart_count >= MAX_RESTART_ATTEMPTS:
            log.error(f"连续重启 {restart_count} 次，进入长冷却 ({RESTART_COOLDOWN * 2}秒)")
            time.sleep(RESTART_COOLDOWN * 2)
            restart_count = 0
    else:
        restart_count = 0
    
    # 清理端口
    kill_port()
    
    # 删除旧PID文件
    pid_file = os.path.join(SITE_DIR, 'guardian.pid')
    if os.path.exists(pid_file):
        os.remove(pid_file)
    
    # 启动 Guardian
    log.info(f"🚀 启动 Guardian... (尝试 #{restart_count + 1})")
    try:
        guardian_process = subprocess.Popen(
            [sys.executable, GUARDIAN_SCRIPT],
            cwd=SITE_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True  # 独立会话
        )
        last_restart_time = time.time()
        
        # 等待启动
        time.sleep(3)
        
        if guardian_process.poll() is None and check_http_health():
            log.info(f"✅ Guardian 启动成功 (PID: {guardian_process.pid})")
            return True
        else:
            log.warning("Guardian 启动后健康检查失败")
            return False
    except Exception as e:
        log.error(f"启动 Guardian 失败: {e}")
        return False

def rotate_log():
    """日志轮转"""
    try:
        if os.path.exists(SUPERVISOR_LOG):
            size = os.path.getsize(SUPERVISOR_LOG)
            if size > 2 * 1024 * 1024:  # 2MB
                # 保留最后1000行
                with open(SUPERVISOR_LOG, 'r') as f:
                    lines = f.readlines()
                with open(SUPERVISOR_LOG, 'w') as f:
                    f.writelines(lines[-500:])
                log.info("日志已轮转")
    except Exception:
        pass

def main():
    global running, guardian_process
    
    # 注册信号处理
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # 写入PID
    write_pid()
    
    log.info("=" * 50)
    log.info("🛡️ 月汐音乐花园 - 超级守护进程 v3")
    log.info(f"   PID: {os.getpid()}")
    log.info(f"   监控端口: {PORT}")
    log.info(f"   检查间隔: {HEALTH_CHECK_INTERVAL}秒")
    log.info("=" * 50)
    
    # 首次启动
    start_guardian()
    
    # 主监控循环
    check_count = 0
    while running:
        try:
            time.sleep(HEALTH_CHECK_INTERVAL)
            
            if not running:
                break
            
            check_count += 1
            
            # 检查进程状态
            process_alive = guardian_process and guardian_process.poll() is None
            http_ok = check_http_health()
            
            if process_alive and http_ok:
                # 一切正常
                if check_count % 100 == 0:  # 每50分钟记录一次
                    log.info(f"💚 运行正常 (PID: {guardian_process.pid})")
            else:
                # 异常！
                reason = []
                if not process_alive:
                    reason.append("进程已退出")
                if not http_ok:
                    reason.append("HTTP检查失败")
                
                log.warning(f"⚠️ 检测到异常: {', '.join(reason)}")
                
                # 清理旧进程
                if guardian_process:
                    try:
                        guardian_process.kill()
                    except Exception:
                        pass
                
                # 重新启动
                start_guardian()
            
            # 定期日志轮转
            if check_count % 100 == 0:
                rotate_log()
                
        except Exception as e:
            log.error(f"监控循环异常: {e}")
            time.sleep(10)
    
    # 清理退出
    cleanup()
    log.info("守护进程已退出")

if __name__ == '__main__':
    main()
