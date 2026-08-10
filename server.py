#!/usr/bin/env python3
"""永久HTTP服务器 - 带自动重启"""
import http.server
import socketserver
import os
import signal
import sys

os.chdir('/opt/music_site')

class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True
    allow_reuse_port = True

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 静默日志

def run():
    try:
        with ReusableServer(('0.0.0.0', 9999), Handler) as httpd:
            print("Serving on port 9999", flush=True)
            httpd.serve_forever()
    except OSError as e:
        print(f"Port error: {e}", flush=True)
        sys.exit(1)

if __name__ == '__main__':
    run()
