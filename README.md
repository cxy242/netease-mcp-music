# 月汐音乐花园 - 运维指南

## 🌸 快速启动

```bash
# 启动网站 (推荐)
/opt/music_site/start_ultimate.sh

# 查看状态
/opt/music_site/status.sh

# 使用 init.d 服务管理
/etc/init.d/yuexi-music start
/etc/init.d/yuexi-music stop
/etc/init.d/yuexi-music restart
/etc/init.d/yuexi-music status

# Cloudflare 公网隧道
/opt/music_site/tunnel.sh start
/opt/music_site/tunnel.sh stop
/opt/music_site/tunnel.sh status
/opt/music_site/tunnel.sh url      # 查看当前公网地址
```

## 🌍 公网访问 (Cloudflare Tunnel)

网站通过 Cloudflare Tunnel 暴露到公网，**任何有网络的地方都能访问**。

- 隧道会随网站自动启动
- 每次重启会分配新的 URL
- 查看当前地址: `cat /opt/music_site/tunnel_url.txt`
- 或运行: `bash /opt/music_site/tunnel.sh url`

> ⚠️ 免费隧道的 URL 每次重启会变化。如需固定域名，可注册 Cloudflare 账号配置 Named Tunnel。

## 🔄 开机自启 (已配置)

网站已配置为**开机自动启动**，三层保障：

1. **init.d 服务** (`/etc/init.d/yuexi-music`)
   - 已注册到 rc2.d/rc3.d/rc5.d
   - 命令: `service yuexi-music start|stop|restart|status`
   - 自动启动网站 + 公网隧道

2. **.profile 自动检测** (`/root/.profile`)
   - 每次登录时检测，未运行则自动启动
   - 分别检测网站和隧道，独立修复
   - proot 环境下的保底方案

无需手动干预，开机/登录即自动运行。

## 🛡️ 保护机制 (5层保险)

```
┌─────────────────────────────────────────────────────────┐
│                    5层保护架构                           │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Guardian HTTP服务器                           │
│           - 自带HTTP服务器 (端口9999)                    │
│           - /health 健康检查端点                         │
│           - /status 状态页面                            │
│           - 歌词代理API                                 │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Guardian 自动维护                             │
│           - 每4小时自动刷新直链                          │
│           - 每6小时自动备份数据                          │
│           - 日志自动轮转                                │
│           - 内存监控 (超500MB告警)                       │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Supervisor 监控                               │
│           - 每30秒检查 Guardian 状态                    │
│           - 进程存活检查                                │
│           - HTTP健康检查                                │
│           - 端口监听检查                                │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Supervisor 自动重启                           │
│           - Guardian 崩溃自动重启                       │
│           - 重启冷却机制 (防频繁重启)                    │
│           - 端口冲突自动解决                            │
│           - 最大重试次数限制                            │
├─────────────────────────────────────────────────────────┤
│  Layer 5: 手动恢复                                      │
│           - start_ultimate.sh 一键启动                  │
│           - status.sh 查看状态                          │
│           - supervisor.log 查看日志                     │
└─────────────────────────────────────────────────────────┘
```

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `guardian.py` | 核心守护进程 (HTTP + 刷新 + 备份) |
| `supervisor.py` | 监控守护进程 (监控 Guardian) |
| `start_ultimate.sh` | 终极启动脚本 |
| `status.sh` | 状态查看脚本 |
| `startup.sh` | 开机启动脚本 |
| `watchdog.sh` | 看门狗脚本 (备用) |

## 🔧 常用命令

```bash
# 启动
/opt/music_site/start_ultimate.sh

# 查看状态
/opt/music_site/status.sh

# 查看日志
tail -f /opt/music_site/supervisor.log
tail -f /opt/music_site/guardian.log

# 停止所有
pkill -f "python.*supervisor"
pkill -f "python.*guardian"

# 重启
pkill -9 -f "python.*supervisor"
pkill -9 -f "python.*guardian"
sleep 2
/opt/music_site/start_ultimate.sh
```

## 🚨 故障排除

### 问题1: 网站无法访问
```bash
# 检查状态
/opt/music_site/status.sh

# 查看日志
tail -50 /opt/music_site/supervisor.log
tail -50 /opt/music_site/guardian.log

# 强制重启
pkill -9 -f "python.*guardian"
pkill -9 -f "python.*supervisor"
sleep 2
/opt/music_site/start_ultimate.sh
```

### 问题2: 歌曲无法播放
```bash
# 检查直链状态
python3 -c "
import json
with open('/opt/music_site/all_liked_songs.json') as f:
    songs = json.load(f)
print(f'总歌曲: {len(songs)}')
print(f'有直链: {sum(1 for s in songs if s.get(\"url\"))}')
"

# 手动刷新直链
cd /opt/music_site && python3 refresh_only_urls.py
```

### 问题3: Supervisor 进程消失
```bash
# 直接启动 Supervisor
cd /opt/music_site
setsid python3 supervisor.py </dev/null >> /dev/null 2>&1 &
disown
```

## 📊 监控端点

- **健康检查**: http://192.168.1.13:9999/health
- **状态页面**: http://192.168.1.13:9999/status
- **歌词代理**: http://192.168.1.13:9999/api/lyric?id=歌曲ID

## 🔐 安全说明

- 所有歌曲链接使用 HTTPS (防止浏览器拦截)
- Cookie 存储在 `/opt/music_site/netease_cookie.json`
- 数据备份在 `/opt/music_site/backups/`
- 日志自动轮转 (防止磁盘占满)

## 📝 更新日志

### 2026-07-13
- ✅ 升级到 Supervisor v3 架构
- ✅ 所有直链改为 HTTPS
- ✅ 添加5层保护机制
- ✅ 自动重启测试通过

---

**网站地址**: http://192.168.1.13:9999

**维护者**: 小艾 (Hermes Agent)
