#!/usr/bin/env python3
"""
月汐音乐花园 - 守护进程服务器
自动重启、信号处理、健康检查、歌词代理
"""
import http.server
import socketserver
import os
import sys
import signal
import time
import logging
import json
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# 配置
PORT = 9999
SITE_DIR = '/opt/music_site'
LOG_FILE = '/opt/music_site/server.log'
PID_FILE = '/opt/music_site/server.pid'

# 日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger('music-server')

class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True
    allow_reuse_port = True

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SITE_DIR, **kwargs)
    
    def log_message(self, format, *args):
        pass  # 静默访问日志

    def do_GET(self):
        parsed = urlparse(self.path)
        
        # Handle lyrics API proxy
        if parsed.path == '/api/lyric':
            params = parse_qs(parsed.query)
            song_id = params.get('id', [None])[0]
            
            if not song_id:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'missing id'}).encode())
                return
            
            try:
                # Fetch from NetEase API
                api_url = f'https://music.163.com/api/song/lyric?id={song_id}&lv=1&tv=1'
                req = urllib.request.Request(api_url, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://music.163.com/',
                    'Accept': 'application/json',
                })
                
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                
                # Extract lyrics
                result = {}
                if 'lrc' in data and data['lrc'] and 'lyric' in data['lrc']:
                    result['lyric'] = data['lrc']['lyric']
                if 'tlyric' in data and data['tlyric'] and 'lyric' in data['tlyric']:
                    result['tlyric'] = data['tlyric']['lyric']
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                log.error(f"Lyrics proxy error for id={song_id}: {e}")
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
            return
        
        # Default: serve static files
        super().do_GET()

class GracefulServer:
    def __init__(self):
        self.running = True
        self.httpd = None
        signal.signal(signal.SIGTERM, self._shutdown)
        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGHUP, self._reload)
    
    def _shutdown(self, signum, frame):
        log.info(f"收到信号 {signum}，优雅关闭...")
        self.running = False
        if self.httpd:
            self.httpd.shutdown()
    
    def _reload(self, signum, frame):
        log.info("收到SIGHUP，重新加载数据...")
        try:
            import importlib
            log.info("数据文件已更新，下次页面加载会自动获取新数据")
        except Exception as e:
            log.error(f"重载失败: {e}")
    
    def run(self):
        with open(PID_FILE, 'w') as f:
            f.write(str(os.getpid()))
        
        log.info(f"🎵 月汐音乐花园启动 - 端口 {PORT}")
        log.info(f"   目录: {SITE_DIR}")
        log.info(f"   PID: {os.getpid()}")
        
        try:
            self.httpd = ReusableServer(('0.0.0.0', PORT), Handler)
            self.httpd.serve_forever()
        except OSError as e:
            log.error(f"端口错误: {e}")
            if 'Address already in use' in str(e):
                log.info("等待端口释放...")
                time.sleep(3)
                try:
                    self.httpd = ReusableServer(('0.0.0.0', PORT), Handler)
                    self.httpd.serve_forever()
                except Exception as e2:
                    log.error(f"重试失败: {e2}")
                    return False
        finally:
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
            log.info("服务器已关闭")
        return True

def main():
    os.chdir(SITE_DIR)
    
    server = GracefulServer()
    
    restart_count = 0
    max_restarts = 50
    
    while restart_count < max_restarts:
        try:
            success = server.run()
            if success:
                break
        except KeyboardInterrupt:
            log.info("用户中断")
            break
        except Exception as e:
            restart_count += 1
            log.error(f"服务器异常 (第{restart_count}次): {e}")
            wait = min(restart_count * 2, 30)
            log.info(f"等待 {wait} 秒后重启...")
            time.sleep(wait)
            server = GracefulServer()
    
    log.info(f"月汐音乐花园退出 (重启次数: {restart_count})")

if __name__ == '__main__':
    main()
