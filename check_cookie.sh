#!/bin/bash
# Cookie过期检测脚本
# 检查网易云Cookie是否还有效，无效时输出提醒

COOKIE_FILE="/opt/music_site/netease_cookie.json"

if [ ! -f "$COOKIE_FILE" ]; then
    echo "❌ Cookie文件不存在！需要重新登录"
    exit 1
fi

# 检查cookie年龄
python3 -c "
import json
from datetime import datetime
with open('$COOKIE_FILE') as f:
    d = json.load(f)

updated = d.get('updated', '')
if not updated:
    print('⚠️ Cookie没有更新时间记录')
    exit(1)

dt = datetime.strptime(updated, '%Y-%m-%d %H:%M:%S')
days = (datetime.now() - dt).days

if days > 30:
    print(f'❌ Cookie已过期！({days}天前更新)')
    print('需要重新登录网易云获取新Cookie')
    exit(1)
elif days > 20:
    print(f'⚠️ Cookie即将过期 ({days}天前更新)')
    print('建议尽快重新登录')
    exit(0)
else:
    print(f'✅ Cookie有效 ({days}天前更新)')
    exit(0)
"
