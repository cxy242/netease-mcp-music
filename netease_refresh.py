#!/usr/bin/env python3
"""
网易云VIP歌曲直链自动刷新脚本
使用保存的MUSIC_U cookie登录，获取喜欢的音乐列表和直链，生成网页
"""
import requests
import json
import binascii
import base64
import os
import sys
import time
from Crypto.Cipher import AES

SITE_DIR = '/opt/music_site'
COOKIE_FILE = '/opt/music_site/netease_cookie.json'
SONGS_FILE = '/opt/music_site/all_liked_songs.json'

# 网易云加密参数
MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
NONCE = '0CoJUm6Qyw8W8jud'
PUB_KEY = '010001'

def create_secret_key(size):
    return binascii.hexlify(os.urandom(size))[:16].decode()

def aes_encrypt(text, key):
    iv = '0102030405060708'
    pad = 16 - len(text) % 16
    text = text + chr(pad) * pad
    cipher = AES.new(key.encode(), AES.MODE_CBC, iv.encode())
    return base64.b64encode(cipher.encrypt(text.encode())).decode()

def rsa_encrypt(text, pub_key, modulus):
    text = text[::-1]
    rs = int(binascii.hexlify(text.encode()), 16)
    rs = pow(rs, int(pub_key, 16), int(modulus, 16))
    return format(rs, 'x').zfill(256)

def weapi_encrypt(data_dict):
    data_json = json.dumps(data_dict)
    sec_key = create_secret_key(16)
    enc_text = aes_encrypt(aes_encrypt(data_json, NONCE), sec_key)
    enc_sec_key = rsa_encrypt(sec_key, PUB_KEY, MODULUS)
    return {'params': enc_text, 'encSecKey': enc_sec_key}

def load_cookie():
    if not os.path.exists(COOKIE_FILE):
        return None
    with open(COOKIE_FILE, 'r') as f:
        data = json.load(f)
    return data.get('music_u') or data.get('cookie') or None

def save_cookie(music_u, user_id, nickname):
    with open(COOKIE_FILE, 'w') as f:
        json.dump({
            'music_u': music_u,
            'userId': user_id,
            'nickname': nickname,
            'updated': time.strftime('%Y-%m-%d %H:%M:%S')
        }, f, ensure_ascii=False, indent=2)

def make_session(cookie):
    session = requests.Session()
    session.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    if cookie:
        session.cookies.set('MUSIC_U', cookie, domain='.music.163.com')
        session.cookies.set('__remember_me', 'true', domain='.music.163.com')
    return session

def get_liked_songs(session, user_id):
    """获取用户喜欢的音乐列表"""
    all_songs = []
    offset = 0
    limit = 100
    
    while True:
        # /api/ 路径用普通JSON参数，不用weapi加密
        resp = session.post('https://music.163.com/api/song/like/list', 
                          json={'uid': user_id, 'limit': limit, 'offset': offset}, 
                          timeout=15)
        result = resp.json()
        
        if result.get('code') != 200:
            print(f"  获取喜欢列表失败: {result.get('msg', result.get('message', 'unknown'))}")
            break
        
        ids = result.get('ids', [])
        if not ids:
            break
        
        all_songs.extend(ids)
        if len(ids) < limit:
            break
        offset += limit
        time.sleep(0.3)
    
    return all_songs

def get_song_details(session, song_ids):
    """批量获取歌曲详情"""
    songs = []
    batch_size = 100
    
    for i in range(0, len(song_ids), batch_size):
        batch = song_ids[i:i+batch_size]
        c = json.dumps([{'id': sid} for sid in batch])
        data = weapi_encrypt({'c': c})
        resp = session.post('https://music.163.com/weapi/v3/song/detail', data=data, timeout=15)
        result = resp.json()
        
        if result.get('code') == 200:
            for s in result.get('songs', []):
                artists = '/'.join([a.get('name', '') for a in s.get('ar', [])])
                songs.append({
                    'id': s['id'],
                    'name': s.get('name', ''),
                    'artist': artists,
                    'duration': round(s.get('dt', 0) / 1000),
                    'fee': s.get('fee', 0),
                    'url': ''
                })
        
        time.sleep(0.3)
    
    return songs

def get_song_urls(session, song_ids):
    """批量获取歌曲直链"""
    url_map = {}
    batch_size = 20  # API限制每次最多20首
    
    for i in range(0, len(song_ids), batch_size):
        batch = song_ids[i:i+batch_size]
        data = weapi_encrypt({
            'ids': batch,
            'level': 'standard',
            'encodeType': 'mp3'
        })
        resp = session.post('https://music.163.com/weapi/song/enhance/player/url/v1', data=data, timeout=15)
        result = resp.json()
        
        if result.get('code') == 200:
            for item in result.get('data', []):
                if item.get('url'):
                    url_map[item['id']] = item['url'].replace('http://', 'https://') if item['url'] else ''
        
        time.sleep(0.5)
    
    return url_map

def refresh():
    print("=== 网易云VIP歌曲直链刷新 ===")
    print(f"时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    cookie = load_cookie()
    if not cookie:
        print("ERROR: 没有找到MUSIC_U cookie，需要先登录")
        return False
    
    session = make_session(cookie)
    
    # 验证cookie是否有效
    print("\n[1/4] 验证登录状态...")
    data = weapi_encrypt({})
    try:
        resp = session.post('https://music.163.com/weapi/subcount', data=data, timeout=15)
        result = resp.json()
        if result.get('code') != 200:
            print(f"ERROR: Cookie已过期，需要重新登录")
            return False
        print("  ✅ 登录状态有效")
    except Exception as e:
        print(f"  ❌ 连接失败: {e}")
        return False
    
    # 获取喜欢的音乐ID列表
    print("\n[2/4] 获取喜欢的音乐列表...")
    liked_ids = get_liked_songs(session, 9895699865)
    print(f"  共 {len(liked_ids)} 首喜欢的音乐")
    
    if not liked_ids:
        print("ERROR: 获取喜欢列表失败")
        return False
    
    # 获取歌曲详情
    print("\n[3/4] 获取歌曲详情...")
    songs = get_song_details(session, liked_ids)
    print(f"  获取到 {len(songs)} 首歌曲详情")
    
    # 获取直链
    print("\n[4/4] 获取VIP直链...")
    all_ids = [s['id'] for s in songs]
    url_map = get_song_urls(session, all_ids)
    
    has_url = 0
    for s in songs:
        if s['id'] in url_map:
            s['url'] = url_map[s['id']]
            has_url += 1
    
    print(f"  ✅ 成功获取 {has_url}/{len(songs)} 首直链")
    
    # 保存歌曲数据
    with open(SONGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False)
    
    # 更新cookie（session可能有新的cookie）
    for c in session.cookies:
        if c.name == 'MUSIC_U':
            save_cookie(c.value, 9895699865, '月汐-Ayn')
            break
    
    print(f"\n✅ 数据已保存到 {SONGS_FILE}")
    print(f"   共 {len(songs)} 首歌，{has_url} 首有直链")
    return True

if __name__ == '__main__':
    success = refresh()
    sys.exit(0 if success else 1)
