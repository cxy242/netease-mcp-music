#!/usr/bin/env python3
"""
生成音乐花园网站HTML
读取songs数据，生成带播放器、小游戏的网页
"""
import json
import os

SITE_DIR = '/opt/music_site'
SONGS_FILE = '/opt/music_site/all_liked_songs.json'

def generate():
    if not os.path.exists(SONGS_FILE):
        print("ERROR: 找不到歌曲数据文件")
        return False
    
    with open(SONGS_FILE, 'r', encoding='utf-8') as f:
        songs = json.load(f)
    
    # Generate songs_data.js
    song_data = []
    for s in songs:
        song_data.append({
            'n': s.get('name', ''),
            'a': s.get('artist', ''),
            'u': s.get('url', ''),
            'i': s.get('id', ''),
            'd': s.get('duration', 0)
        })
    
    songs_json = json.dumps(song_data, ensure_ascii=False)
    with open(os.path.join(SITE_DIR, 'songs_data.js'), 'w', encoding='utf-8') as f:
        f.write(f"const SONGS = {songs_json};")
    
    # Generate TXT
    lines = ["# 月汐的喜欢的音乐 - VIP直链列表"]
    lines.append(f"# 更新时间: {__import__('time').strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"# 共{len(songs)}首，{sum(1 for s in songs if s.get('url'))}首有直链\n")
    for idx, s in enumerate(songs, 1):
        url = s.get('url', '')
        if url:
            lines.append(f"{idx}. {s.get('artist','')} - {s.get('name','')}")
            lines.append(f"   浏览器播放: {url}")
            lines.append(f"   网易云APP: orpheus://song/{s.get('id','')}/?autoplay=1\n")
    
    with open(os.path.join(SITE_DIR, '月汐喜欢的音乐-全部直链.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    # Generate M3U
    m3u = ["#EXTM3U"]
    for s in songs:
        if s.get('url'):
            m3u.append(f"#EXTINF:{s.get('duration',-1)},{s.get('artist','')} - {s.get('name','')}")
            m3u.append(s['url'])
    with open(os.path.join(SITE_DIR, '月汐喜欢的音乐.m3u'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(m3u))
    
    has_url = sum(1 for s in songs if s.get('url'))
    print(f"✅ 网站文件已生成: {len(songs)}首歌, {has_url}首有直链")
    return True

if __name__ == '__main__':
    generate()
