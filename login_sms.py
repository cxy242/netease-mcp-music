#!/usr/bin/env python3
"""
网易云音乐 短信验证码登录
用法: python3 login_sms.py
1. 发送验证码
2. 输入验证码
3. 保存MUSIC_U cookie
"""
import requests, json, binascii, base64, os, sys, time
from Crypto.Cipher import AES

COOKIE_FILE = '/opt/music_site/netease_cookie.json'
PHONE = '18058959727'

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

def send_code(phone):
    """发送短信验证码"""
    s = requests.Session()
    s.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    })
    
    # 发送验证码
    data = weapi({'ctcode': '86', 'cellphone': phone})
    r = s.post('https://music.163.com/weapi/sms/captcha/sent', data=data, timeout=15).json()
    print(f"发送验证码响应: {r}")
    return r.get('code') == 200

def login_with_code(phone, code):
    """用验证码登录"""
    s = requests.Session()
    s.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    })
    
    # 验证码登录
    data = weapi({'phone': phone, 'captcha': code, 'countrycode': '86', 'remember': 'true'})
    r = s.post('https://music.163.com/weapi/login/cellphone', data=data, timeout=15).json()
    print(f"登录响应: code={r.get('code')}")
    
    if r.get('code') == 200:
        # 获取MUSIC_U
        music_u = None
        for cookie in s.cookies:
            if cookie.name == 'MUSIC_U':
                music_u = cookie.value
                break
        
        if music_u:
            user_id = r.get('account', {}).get('id', 0)
            nickname = r.get('profile', {}).get('nickname', '')
            vip_type = r.get('profile', {}).get('vipType', 0)
            
            # 保存cookie
            cookie_data = {
                'music_u': music_u,
                'userId': user_id,
                'nickname': nickname,
                'vipType': vip_type,
                'updated': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # 保留旧数据中的keepalive信息
            if os.path.exists(COOKIE_FILE):
                with open(COOKIE_FILE) as f:
                    old = json.load(f)
                cookie_data['keepalive_count'] = old.get('keepalive_count', 0)
            
            with open(COOKIE_FILE, 'w') as f:
                json.dump(cookie_data, f, ensure_ascii=False, indent=2)
            
            print(f"\n✅ 登录成功!")
            print(f"   用户: {nickname} (ID: {user_id})")
            print(f"   VIP类型: {vip_type}")
            print(f"   Cookie已保存到 {COOKIE_FILE}")
            return True
        else:
            print("❌ 登录成功但没有获取到MUSIC_U cookie")
            return False
    else:
        print(f"❌ 登录失败: {r.get('msg', r.get('message', 'unknown'))}")
        return False

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'send':
        # 发送验证码模式
        if send_code(PHONE):
            print(f"✅ 验证码已发送到 {PHONE}")
        else:
            print("❌ 发送验证码失败")
    elif len(sys.argv) > 2 and sys.argv[1] == 'login':
        # 登录模式: python3 login_sms.py login 123456
        code = sys.argv[2]
        if login_with_code(PHONE, code):
            print("\n现在可以刷新歌曲直链了！")
        else:
            print("\n登录失败，请重试")
    else:
        print("用法:")
        print(f"  发送验证码: python3 {sys.argv[0]} send")
        print(f"  验证码登录: python3 {sys.argv[0]} login <验证码>")
