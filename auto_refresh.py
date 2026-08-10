#!/usr/bin/env python3
"""
月汐音乐花园 - 定时自动刷新直链
每4小时运行一次，刷新所有歌曲的直链并更新网站数据
"""
import requests, json, binascii, base64, os, sys, time, logging
from datetime import datetime
from Crypto.Cipher import AES

# 日志
LOG_FILE = '/opt/music_site/refresh.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger('refresh')

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

def generate_site(songs):
    """重新生成网站数据文件"""
    SITE_DIR = '/opt/music_site'
    
    # songs_data.js
    song_data = [{'n':s.get('name',''),'a':s.get('artist',''),'u':s.get('url',''),'i':s.get('id',''),'d':s.get('duration',0)} for s in songs]
    with open(os.path.join(SITE_DIR,'songs_data.js'),'w',encoding='utf-8') as f:
        f.write(f"const SONGS = {json.dumps(song_data, ensure_ascii=False)};")
    
    # TXT
    lines = ["# 月汐的喜欢的音乐 - VIP直链列表"]
    lines.append(f"# 更新时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"# 共{len(songs)}首，{sum(1 for s in songs if s.get('url'))}首有直链\n")
    for idx, s in enumerate(songs, 1):
        url = s.get('url', '')
        if url:
            lines.append(f"{idx}. {s.get('artist','')} - {s.get('name','')}")
            lines.append(f"   浏览器播放: {url}")
            lines.append(f"   网易云APP: orpheus://song/{s.get('id','')}/?autoplay=1\n")
    with open(os.path.join(SITE_DIR,'月汐喜欢的音乐-全部直链.txt'),'w',encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    # M3U
    m3u = ["#EXTM3U"]
    for s in songs:
        if s.get('url'):
            m3u.append(f"#EXTINF:{s.get('duration',-1)},{s.get('artist','')} - {s.get('name','')}")
            m3u.append(s['url'])
    with open(os.path.join(SITE_DIR,'月汐喜欢的音乐.m3u'),'w',encoding='utf-8') as f:
        f.write('\n'.join(m3u))
    
    has_url = sum(1 for s in songs if s.get('url'))
    log.info(f"✅ 网站数据已更新: {len(songs)}首歌, {has_url}首有直链")

def refresh_urls():
    """刷新所有歌曲直链"""
    cookie_file = '/opt/music_site/netease_cookie.json'
    songs_file = '/opt/music_site/all_liked_songs.json'
    
    if not os.path.exists(cookie_file):
        log.error("❌ Cookie文件不存在，无法刷新直链")
        return False
    
    with open(cookie_file) as f:
        cookie_data = json.load(f)
    
    # 检查cookie是否过期（超过30天）
    updated = cookie_data.get('updated', '')
    if updated:
        try:
            cookie_date = datetime.strptime(updated, '%Y-%m-%d %H:%M:%S')
            if (datetime.now() - cookie_date).days > 25:
                log.warning(f"⚠️ Cookie已{(datetime.now()-cookie_date).days}天未更新，可能即将过期")
        except:
            pass
    
    music_u = cookie_data['music_u']
    
    with open(songs_file, 'r', encoding='utf-8') as f:
        songs = json.load(f)
    
    # 先测试cookie是否有效
    s = requests.Session()
    s.headers.update({
        'Referer': 'https://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
    })
    s.cookies.set('MUSIC_U', music_u, domain='.music.163.com')
    
    # 测试请求
    test_ids = [songs[0]['id']]
    try:
        r = s.post('https://music.163.com/weapi/song/enhance/player/url/v1',
                   data=weapi({'ids':test_ids,'level':'standard','encodeType':'mp3'}),
                   timeout=15).json()
        if r.get('code') != 200:
            log.error(f"❌ Cookie已失效 (code={r.get('code')})，需要重新登录")
            return False
        if not r.get('data', [{}])[0].get('url'):
            log.warning("⚠️ 测试歌曲无URL，可能Cookie权限受限")
    except Exception as e:
        log.error(f"❌ API请求失败: {e}")
        return False
    
    # 清除旧URL
    for x in songs:
        x['url'] = ''
    
    log.info(f"开始刷新 {len(songs)} 首歌的直链...")
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
        if (i//20+1) % 10 == 0:
            log.info(f"  进度: {i+20}/{len(songs)}")
        time.sleep(0.3)
    
    log.info(f"✅ {cnt}/{len(songs)} 首有直链")
    
    # 保存
    with open(songs_file, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False)
    
    # 更新网站数据
    generate_site(songs)
    
    # 记录刷新时间
    cookie_data['last_refresh'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    cookie_data['refresh_count'] = cookie_data.get('refresh_count', 0) + 1
    with open(cookie_file, 'w', encoding='utf-8') as f:
        json.dump(cookie_data, f, ensure_ascii=False, indent=2)
    
    return True

if __name__ == '__main__':
    log.info("=" * 50)
    log.info("定时直链刷新开始")
    success = refresh_urls()
    if success:
        log.info("刷新完成 ✅")
    else:
        log.error("刷新失败 ❌")
    log.info("=" * 50)
