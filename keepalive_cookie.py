#!/usr/bin/env python3
"""
网易云MUSIC_U Cookie保活脚本
每天运行一次，用cookie访问网易云API保持活跃
如果cookie即将过期或已失效，输出告警信息
"""
import requests, json, binascii, base64, os, sys, time, logging
from datetime import datetime
from Crypto.Cipher import AES

LOG_FILE = '/opt/music_site/keepalive.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger('keepalive')

COOKIE_FILE = '/opt/music_site/netease_cookie.json'

# 网易云加密
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

def make_session(music_u):
    s = requests.Session()
    s.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    })
    s.cookies.set('MUSIC_U', music_u, domain='.music.163.com')
    s.cookies.set('__remember_me', 'true', domain='.music.163.com')
    return s

def keepalive():
    if not os.path.exists(COOKIE_FILE):
        log.error("❌ Cookie文件不存在")
        return "NEED_LOGIN"
    
    with open(COOKIE_FILE) as f:
        data = json.load(f)
    music_u = data.get('music_u', '')
    if not music_u:
        log.error("❌ Cookie中没有music_u")
        return "NEED_LOGIN"
    
    s = make_session(music_u)
    
    # 方法1: subcount 检查登录
    try:
        r = s.post('https://music.163.com/weapi/subcount', data=weapi({}), timeout=15).json()
        if r.get('code') == 200:
            log.info(f"✅ Cookie有效 (subcount=200)")
        else:
            log.warning(f"⚠️ Cookie失效 (code={r.get('code')})")
            return "EXPIRED"
    except Exception as e:
        log.error(f"❌ 请求失败: {e}")
        return "ERROR"
    
    # 方法2: 访问个人主页保持活跃
    try:
        r2 = s.get('https://music.163.com/api/user/detail/9895699865', timeout=15)
        if r2.status_code == 200:
            d = r2.json()
            if d.get('code') == 200:
                vip_type = d.get('profile', {}).get('vipType', 0)
                log.info(f"✅ 用户活跃, VIP类型={vip_type}")
            else:
                log.warning(f"⚠️ 用户接口返回: {d.get('code')}")
    except Exception as e:
        log.warning(f"⚠️ 访问用户主页失败: {e}")
    
    # 方法3: 刷新一下cookie的有效期（访问登录状态接口会刷新cookie）
    try:
        r3 = s.post('https://music.163.com/weapi/login/status', data=weapi({}), timeout=15)
        # 检查响应set-cookie是否有新的MUSIC_U
        for cookie in s.cookies:
            if cookie.name == 'MUSIC_U' and cookie.value != music_u:
                log.info("🔄 Cookie已自动续期")
                data['music_u'] = cookie.value
                data['last_keepalive'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                with open(COOKIE_FILE, 'w') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                break
    except:
        pass
    
    # 更新保活记录
    data['last_keepalive'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    data['keepalive_count'] = data.get('keepalive_count', 0) + 1
    with open(COOKIE_FILE, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return "OK"

if __name__ == '__main__':
    result = keepalive()
    if result == "OK":
        log.info("保活完成 ✅")
    elif result == "EXPIRED":
        log.error("Cookie已过期，需要重新登录 ❌")
        print("NEED_RELOGIN")
    elif result == "NEED_LOGIN":
        log.error("没有Cookie，需要登录 ❌")
        print("NEED_RELOGIN")
    else:
        log.error(f"保活异常: {result}")
