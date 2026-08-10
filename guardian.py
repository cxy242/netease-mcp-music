#!/usr/bin/env python3
"""
月汐音乐花园 - 超级守护进程 v2
功能: HTTP服务器 + 直链自动刷新 + 健康检查 + 数据备份 + 日志轮转 + 内存监控
"""
import http.server
import socketserver
import os
import sys
import signal
import time
import json
import logging
import threading
import requests
import binascii
import base64
import shutil
import gzip
from datetime import datetime
from pathlib import Path
from Crypto.Cipher import AES

# ========== 配置 ==========
PORT = 9999
SITE_DIR = '/opt/music_site'
LOG_FILE = '/opt/music_site/guardian.log'
PID_FILE = '/opt/music_site/guardian.pid'
BACKUP_DIR = '/opt/music_site/backups'
REFRESH_INTERVAL = 4 * 3600      # 4小时刷新直链
HEALTH_CHECK_INTERVAL = 30       # 30秒健康检查
BACKUP_INTERVAL = 6 * 3600       # 6小时备份一次
LOG_MAX_SIZE = 5 * 1024 * 1024   # 5MB日志轮转
MEMORY_CHECK_INTERVAL = 300      # 5分钟检查内存

# ========== 日志 ==========
class RotatingFileHandler(logging.Handler):
    """简易日志轮转"""
    def __init__(self, filename, max_bytes=LOG_MAX_SIZE, backup_count=3):
        super().__init__()
        self.filename = filename
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        self._stream = None
    
    def emit(self, record):
        try:
            msg = self.format(record) + '\n'
            if self._stream is None:
                self._stream = open(self.filename, 'a', encoding='utf-8')
            self._stream.write(msg)
            self._stream.flush()
            
            # 检查大小
            if self._stream.tell() > self.max_bytes:
                self._rotate()
        except Exception:
            pass
    
    def _rotate(self):
        if self._stream:
            self._stream.close()
            self._stream = None
        for i in range(self.backup_count - 1, 0, -1):
            src = f"{self.filename}.{i}.gz"
            dst = f"{self.filename}.{i+1}.gz"
            if os.path.exists(src):
                os.rename(src, dst)
        # 压缩当前日志
        with open(self.filename, 'rb') as f_in:
            with gzip.open(f"{self.filename}.1.gz", 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        open(self.filename, 'w').close()

log = logging.getLogger('guardian')
log.setLevel(logging.INFO)
fmt = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')

# Prevent duplicate log messages
fh = RotatingFileHandler(LOG_FILE)
fh.setFormatter(fmt)
log.addHandler(fh)
log.propagate = False

sh = logging.StreamHandler(sys.stdout)
sh.setFormatter(fmt)
log.addHandler(sh)

# ========== 网易云加密 ==========
def csk(size): return binascii.hexlify(os.urandom(size))[:16].decode()
def ae(text, key):
    iv='0102030405060708'; p=16-len(text)%16; text=text+chr(p)*p
    return base64.b64encode(AES.new(key.encode(),AES.MODE_CBC,iv.encode()).encrypt(text.encode())).decode()
def rsa_enc(text, pk, mod):
    text=text[::-1]; rs=int(binascii.hexlify(text.encode()),16)
    rs=pow(rs,int(pk,16),int(mod,16)); return format(rs,'x').zfill(256)

MOD='00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
NC='0CoJUm6Qyw8W8jud'; PK='010001'

def weapi(data_dict):
    j=json.dumps(data_dict); sk=csk(16)
    return {'params':ae(ae(j,NC),sk),'encSecKey':rsa_enc(sk,PK,MOD)}

# ========== 健康状态 ==========
class HealthStatus:
    def __init__(self):
        self.start_time = time.time()
        self.http_ok = False
        self.last_refresh = 0
        self.refresh_count = 0
        self.refresh_ok = False
        self.last_backup = 0
        self.errors = []
        self.lock = threading.Lock()
    
    def record_refresh(self, success, count=0):
        with self.lock:
            self.last_refresh = time.time()
            self.refresh_count += 1
            self.refresh_ok = success
    
    def record_error(self, msg):
        with self.lock:
            self.errors.append({'time': datetime.now().strftime('%H:%M:%S'), 'msg': msg})
            if len(self.errors) > 50:
                self.errors = self.errors[-30:]
    
    def get_status(self):
        with self.lock:
            uptime = int(time.time() - self.start_time)
            return {
                'uptime_hours': round(uptime/3600, 1),
                'http_ok': self.http_ok,
                'last_refresh': datetime.fromtimestamp(self.last_refresh).strftime('%H:%M') if self.last_refresh else '从未',
                'refresh_ok': self.refresh_ok,
                'refresh_count': self.refresh_count,
                'last_backup': datetime.fromtimestamp(self.last_backup).strftime('%H:%M') if self.last_backup else '从未',
                'errors': len(self.errors),
                'memory_mb': round(self._get_memory() / 1024 / 1024, 1)
            }
    
    def _get_memory(self):
        try:
            import resource
            return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
        except:
            return 0

health = HealthStatus()

# ========== HTTP服务器(带健康检查) ==========
class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True
    allow_reuse_port = True

class HealthHandler(http.server.SimpleHTTPRequestHandler):
    """支持健康检查端点的HTTP处理器"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_DIR, **kwargs)
    
    def do_GET(self):
        if self.path == '/health':
            self._health_response()
        elif self.path == '/status':
            self._status_response()
        elif self.path.startswith('/api/lyric'):
            self._lyric_proxy()
        else:
            super().do_GET()
    
    def _lyric_proxy(self):
        """歌词代理 - 解决CORS问题"""
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            song_id = qs.get('id', [''])[0]
            if not song_id or not song_id.isdigit():
                self._json_response({'error': 'missing id'}, 400)
                return
            
            r = requests.get(
                f'https://music.163.com/api/song/lyric?id={song_id}&lv=1&tv=1',
                headers={'User-Agent':'Mozilla/5.0','Referer':'https://music.163.com'},
                timeout=10
            )
            data = r.json()
            lyric = data.get('lrc', {}).get('lyric', '')
            self._json_response({'lyric': lyric})
        except Exception as e:
            log.warning(f"歌词代理错误: {e}")
            self._json_response({'error': str(e)}, 500)
    
    def _json_response(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
    
    def _health_response(self):
        status = health.get_status()
        code = 200 if status['http_ok'] else 503
        body = json.dumps({'status': 'ok' if status['http_ok'] else 'error', **status}, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
    
    def _status_response(self):
        try:
            with open(os.path.join(SITE_DIR, 'all_liked_songs.json'), 'r') as f:
                songs = json.load(f)
            has_url = sum(1 for s in songs if s.get('url'))
            status_html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>月汐音乐花园 - 状态</title>
            <style>body{{font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;background:#fce4ec;color:#5a4a6a}}
            h1{{text-align:center}}.card{{background:rgba(255,255,255,0.7);border-radius:16px;padding:20px;margin:12px 0}}
            .ok{{color:#4caf50}}.warn{{color:#ff9800}}</style></head><body>
            <h1>🌸 月汐音乐花园</h1>
            <div class="card"><h3>🎵 歌曲数据</h3>
            <p>总歌曲: <b>{len(songs)}</b></p>
            <p>有直链: <b class="ok">{has_url}</b></p>
            <p>无直链: <b class="warn">{len(songs)-has_url}</b></p></div>
            <div class="card"><h3>🔧 服务状态</h3>
            <p>运行时间: <b>{health.get_status()['uptime_hours']}小时</b></p>
            <p>上次刷新: <b>{health.get_status()['last_refresh']}</b></p>
            <p>刷新次数: <b>{health.get_status()['refresh_count']}</b></p>
            <p>内存使用: <b>{health.get_status()['memory_mb']}MB</b></p></div>
            </body></html>"""
            body = status_html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_error(500, str(e))
    
    def log_message(self, format, *args):
        if '/health' not in str(args) and '/favicon' not in str(args):
            pass  # 静默常规访问日志

class HTTPServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.httpd = None
        self.running = True
    
    def run(self):
        while self.running:
            try:
                self.httpd = ReusableServer(('0.0.0.0', PORT), HealthHandler)
                health.http_ok = True
                log.info(f"🌐 HTTP服务器启动 - 端口 {PORT}")
                self.httpd.serve_forever()
            except OSError as e:
                health.http_ok = False
                if 'Address already in use' in str(e):
                    log.warning(f"端口 {PORT} 被占用，等待释放...")
                    time.sleep(5)
                else:
                    log.error(f"HTTP服务器错误: {e}")
                    health.record_error(f"HTTP: {e}")
                    time.sleep(10)
            except Exception as e:
                health.http_ok = False
                log.error(f"HTTP服务器异常: {e}")
                health.record_error(f"HTTP异常: {e}")
                time.sleep(10)
    
    def stop(self):
        self.running = False
        health.http_ok = False
        if self.httpd:
            self.httpd.shutdown()

# ========== 数据备份 ==========
class BackupThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.running = True
    
    def run(self):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        time.sleep(60)  # 启动后1分钟再备份
        
        while self.running:
            try:
                self._do_backup()
                health.last_backup = time.time()
            except Exception as e:
                log.error(f"备份失败: {e}")
                health.record_error(f"备份: {e}")
            
            # 等待下次备份
            for _ in range(BACKUP_INTERVAL):
                if not self.running:
                    return
                time.sleep(1)
    
    def _do_backup(self):
        ts = datetime.now().strftime('%Y%m%d_%H%M')
        backup_file = os.path.join(BACKUP_DIR, f'songs_{ts}.json.gz')
        
        src = os.path.join(SITE_DIR, 'all_liked_songs.json')
        if not os.path.exists(src):
            return
        
        with open(src, 'rb') as f_in:
            with gzip.open(backup_file, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        size_kb = os.path.getsize(backup_file) // 1024
        log.info(f"📦 数据备份完成: {backup_file} ({size_kb}KB)")
        
        # 清理旧备份，只保留最近10个
        backups = sorted(Path(BACKUP_DIR).glob('songs_*.json.gz'))
        while len(backups) > 10:
            oldest = backups.pop(0)
            oldest.unlink()
            log.info(f"🗑️ 清理旧备份: {oldest.name}")

# ========== 直链刷新 ==========
def refresh_urls():
    cookie_file = os.path.join(SITE_DIR, 'netease_cookie.json')
    songs_file = os.path.join(SITE_DIR, 'all_liked_songs.json')
    
    if not os.path.exists(cookie_file):
        log.error("Cookie文件不存在，跳过刷新")
        return False
    
    try:
        with open(cookie_file) as f:
            cookie_data = json.load(f)
        music_u = cookie_data['music_u']
        with open(songs_file, 'r', encoding='utf-8') as f:
            songs = json.load(f)
    except Exception as e:
        log.error(f"读取文件失败: {e}")
        return False
    
    s = requests.Session()
    s.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    })
    s.cookies.set('MUSIC_U', music_u, domain='.music.163.com')
    
    # 测试cookie
    try:
        r = s.post('https://music.163.com/weapi/song/enhance/player/url/v1',
                   data=weapi({'ids':[songs[0]['id']],'level':'standard','encodeType':'mp3'}),
                   timeout=15).json()
        if r.get('code') != 200:
            log.error(f"Cookie失效 (code={r.get('code')})")
            return False
    except Exception as e:
        log.error(f"API测试失败: {e}")
        return False
    
    for x in songs: x['url'] = ''
    
    cnt = 0
    for i in range(0, len(songs), 20):
        batch = songs[i:i+20]
        ids = [x['id'] for x in batch]
        try:
            r = s.post('https://music.163.com/weapi/song/enhance/player/url/v1',
                       data=weapi({'ids':ids,'level':'standard','encodeType':'mp3'}),
                       timeout=15).json()
            if r.get('code') == 200:
                for it in r.get('data', []):
                    if it.get('url'):
                        for x in songs:
                            if x['id'] == it['id']:
                                x['url'] = it['url'].replace('http://', 'https://') if it['url'] else ''
                                cnt += 1
                                break
        except Exception as e:
            log.warning(f"批次 {i//20+1} 失败: {e}")
        time.sleep(0.3)
    
    log.info(f"🎵 直链刷新完成: {cnt}/{len(songs)}")
    
    with open(songs_file, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False)
    
    # 更新网站数据
    song_data = [{'n':s.get('name',''),'a':s.get('artist',''),'u':s.get('url',''),'i':s.get('id',''),'d':s.get('duration',0)} for s in songs]
    with open(os.path.join(SITE_DIR,'songs_data.js'),'w',encoding='utf-8') as f:
        f.write(f"const SONGS = {json.dumps(song_data, ensure_ascii=False)};")
    
    cookie_data['last_refresh'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cookie_data['refresh_count'] = cookie_data.get('refresh_count', 0) + 1
    with open(cookie_file, 'w', encoding='utf-8') as f:
        json.dump(cookie_data, f, ensure_ascii=False, indent=2)
    
    return True

class RefreshThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.running = True
        self.last_refresh = 0
    
    def run(self):
        time.sleep(30)
        while self.running:
            now = time.time()
            if now - self.last_refresh >= REFRESH_INTERVAL:
                log.info("⏰ 开始定时刷新直链...")
                try:
                    success = refresh_urls()
                    health.record_refresh(success, 379 if success else 0)
                    if success:
                        self.last_refresh = time.time()
                    else:
                        log.error("刷新失败，10分钟后重试")
                        self._sleep(600)
                        continue
                except Exception as e:
                    log.error(f"刷新异常: {e}")
                    health.record_error(f"刷新: {e}")
                    self._sleep(600)
                    continue
            self._sleep(60)
    
    def _sleep(self, seconds):
        for _ in range(seconds):
            if not self.running:
                return
            time.sleep(1)

# ========== 内存监控 ==========
class MemoryMonitor(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.running = True
    
    def run(self):
        while self.running:
            try:
                mem_mb = health._get_memory() / 1024 / 1024
                if mem_mb > 500:  # 超过500MB告警
                    log.warning(f"⚠️ 内存使用过高: {mem_mb:.1f}MB")
                    health.record_error(f"内存: {mem_mb:.1f}MB")
            except:
                pass
            self._sleep(MEMORY_CHECK_INTERVAL)
    
    def _sleep(self, seconds):
        for _ in range(seconds):
            if not self.running:
                return
            time.sleep(1)

# ========== 主程序 ==========
def main():
    os.chdir(SITE_DIR)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))
    
    log.info("=" * 60)
    log.info("🌸 月汐音乐花园守护进程 v2 启动")
    log.info(f"   PID: {os.getpid()}")
    log.info(f"   端口: {PORT}")
    log.info(f"   刷新间隔: {REFRESH_INTERVAL//3600}小时")
    log.info(f"   备份间隔: {BACKUP_INTERVAL//3600}小时")
    log.info(f"   健康检查: http://192.168.1.13:{PORT}/health")
    log.info(f"   状态页面: http://192.168.1.13:{PORT}/status")
    log.info("=" * 60)
    
    # 启动所有线程
    http_thread = HTTPServerThread()
    http_thread.start()
    
    refresh_thread = RefreshThread()
    refresh_thread.start()
    
    backup_thread = BackupThread()
    backup_thread.start()
    
    monitor_thread = MemoryMonitor()
    monitor_thread.start()
    
    def shutdown(signum, frame):
        log.info("收到关闭信号，正在停止...")
        http_thread.stop()
        refresh_thread.running = False
        backup_thread.running = False
        monitor_thread.running = False
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGPIPE, signal.SIG_IGN)  # Ignore broken pipe
    
    # 主循环 - 健康检查
    fail_count = 0
    max_consecutive_errors = 0
    try:
        while True:
            try:
                time.sleep(HEALTH_CHECK_INTERVAL)
                
                # 检查HTTP服务器
                if not http_thread.is_alive():
                    fail_count += 1
                    log.warning(f"HTTP服务器线程已退出 (第{fail_count}次)，重新启动...")
                    health.record_error(f"HTTP线程退出 #{fail_count}")
                    # 旧线程已经死了，创建新的
                    http_thread = HTTPServerThread()
                    http_thread.start()
                
                # 检查刷新线程
                if not refresh_thread.is_alive():
                    log.warning("刷新线程已退出，重新启动...")
                    health.record_error("刷新线程退出")
                    refresh_thread = RefreshThread()
                    refresh_thread.last_refresh = time.time()
                    refresh_thread.start()
                
                # 检查备份线程
                if not backup_thread.is_alive():
                    log.warning("备份线程已退出，重新启动...")
                    backup_thread = BackupThread()
                    backup_thread.start()
                
                # 连续失败过多则告警
                if fail_count > 10:
                    log.error(f"⚠️ HTTP服务器已失败{fail_count}次！")
                
                max_consecutive_errors = 0  # 重置错误计数
            except Exception as e:
                max_consecutive_errors += 1
                log.error(f"健康检查循环异常: {e}")
                health.record_error(f"主循环异常: {e}")
                if max_consecutive_errors > 20:
                    log.critical(f"连续{max_consecutive_errors}次异常，守护进程退出")
                    break
                time.sleep(5)  # 异常后短暂等待
    
    except KeyboardInterrupt:
        log.info("用户中断")
    finally:
        log.info("正在清理资源...")
        try: http_thread.stop()
        except: pass
        refresh_thread.running = False
        backup_thread.running = False
        monitor_thread.running = False
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        log.info("🌸 月汐音乐花园已关闭")

if __name__ == '__main__':
    main()
