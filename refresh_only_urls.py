#!/usr/bin/env python3
"""只刷新直链，不重新获取歌曲列表"""
import requests, json, binascii, base64, os, time
from Crypto.Cipher import AES

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

with open('/opt/music_site/netease_cookie.json') as f: cookie=json.load(f)['music_u']
with open('/opt/music_site/all_liked_songs.json') as f: songs=json.load(f)

s=requests.Session()
s.headers.update({'Referer':'https://music.163.com','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Content-Type':'application/x-www-form-urlencoded'})
s.cookies.set('MUSIC_U',cookie,domain='.music.163.com')

# Clear old URLs
for x in songs: x['url']=''

print(f"刷新 {len(songs)} 首歌的直链...")
cnt=0
for i in range(0,len(songs),20):
    batch=songs[i:i+20]; ids=[x['id'] for x in batch]
    r=s.post('https://music.163.com/weapi/song/enhance/player/url/v1',data=weapi({'ids':ids,'level':'standard','encodeType':'mp3'}),timeout=15).json()
    if r.get('code')==200:
        for it in r.get('data',[]):
            if it.get('url'):
                for x in songs:
                    if x['id']==it['id']: x['url']=it['url'].replace('http://', 'https://') if it['url'] else ''; cnt+=1; break
    if (i//20+1)%10==0: print(f"  {i+20}/{len(songs)}...")
    time.sleep(0.2)

print(f"✅ {cnt}/{len(songs)} 首有直链")

with open('/opt/music_site/all_liked_songs.json','w',encoding='utf-8') as f: json.dump(songs,f,ensure_ascii=False)
print("DONE")
