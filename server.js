import Fastify from 'fastify';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ─── Cookie ───────────────────────────────────────────────────────────
let MUSIC_U = '';
let CSRF = crypto.randomBytes(16).toString('hex');
let DEFAULT_UID = 9895699865;
let cookieData = null;

try {
  cookieData = JSON.parse(readFileSync(join(__dirname, 'netease_cookie.json'), 'utf-8'));
  MUSIC_U = cookieData.music_u || '';
  if (cookieData.userId) DEFAULT_UID = cookieData.userId;
  console.log(`[Cookie] Loaded MUSIC_U (${MUSIC_U.length} chars), UID=${DEFAULT_UID}`);
} catch (e) {
  console.warn('[Cookie] Failed to load netease_cookie.json:', e.message);
}

function getCookieStr() {
  return `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}`;
}

// ─── In-memory stores ────────────────────────────────────────────────
let commentsDB = [];
let listenSessions = {};

const NETEASE_BASE = 'https://music.163.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── NetEase API helper ──────────────────────────────────────────────
async function neteaseApi(path, options = {}) {
  const { method = 'GET', body, contentType } = options;
  const headers = {
    'Cookie': getCookieStr(),
    'Referer': 'https://music.163.com',
    'User-Agent': UA,
  };
  if (contentType) headers['Content-Type'] = contentType;

  const fetchOpts = { method, headers };
  if (body) fetchOpts.body = body;

  const resp = await fetch(`${NETEASE_BASE}${path}`, fetchOpts);
  return resp.json();
}

// ─── Fastify ─────────────────────────────────────────────────────────
const fastify = Fastify({ logger: false });
await fastify.register(import('@fastify/multipart'), { limits: { fileSize: 50 * 1024 * 1024 } });

// CORS
fastify.addHook('onSend', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
});

fastify.options('*', async (request, reply) => {
  return reply.send();
});

// ═════════════════════════════════════════════════════════════════════
// 0. LOCAL AUDIO STORAGE
// ═════════════════════════════════════════════════════════════════════
const AUDIO_DIR = join(__dirname, 'audio_cache');
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

fastify.get('/api/local_audio/:id', async (request, reply) => {
  const { id } = request.params;
  const filePath = join(AUDIO_DIR, id + '.mp3');
  if (!existsSync(filePath)) { reply.status(404); return { ok: false }; }
  reply.type('audio/mpeg');
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(readFileSync(filePath));
});

fastify.post('/api/upload_audio', async (request, reply) => {
  const data = await request.file();
  if (!data) return { ok: false, message: 'no file' };
  const songId = data.fields.songId?.value;
  if (!songId) return { ok: false, message: 'missing songId' };
  const buffer = await data.toBuffer();
  writeFileSync(join(AUDIO_DIR, songId + '.mp3'), buffer);
  console.log('[Audio] Saved: ' + songId + '.mp3 (' + buffer.length + ' bytes)');
  return { ok: true, id: songId, size: buffer.length };
});

fastify.get('/api/local_audio_list', async () => {
  const files = readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
  return { ids: files.map(f => f.replace('.mp3', '')) };
});

// ═════════════════════════════════════════════════════════════════════
// 1. STATIC FILES (3 routes)
// ═════════════════════════════════════════════════════════════════════

fastify.get('/', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const raw = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const nav = `
<div id="nav-float" style="position:fixed;top:12px;right:12px;z-index:99999;display:flex;gap:6px;flex-wrap:wrap;max-width:280px;justify-content:flex-end">
  <a href="/netease" style="padding:8px 14px;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(233,30,99,0.3)">🎵 网易云</a>
  <a href="/cookie" style="padding:8px 14px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(76,175,80,0.3)">🍪 Cookie</a>
  <a href="/comments" style="padding:8px 14px;background:linear-gradient(135deg,#2196f3,#1565c0);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(33,150,243,0.3)">💬 评论</a>
  <a href="/listen" style="padding:8px 14px;background:linear-gradient(135deg,#9c27b0,#6a1b9a);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(156,39,176,0.3)">🎧 一起听</a>
</div>`;
  return raw.replace('</body>', nav + '</body>');
});

fastify.get('/songs_data.js', async (request, reply) => {
  reply.type('application/javascript; charset=utf-8');
  return readFileSync(join(__dirname, 'songs_data.js'), 'utf-8');
});

fastify.get('/all_liked_songs.json', async (request, reply) => {
  reply.type('application/json; charset=utf-8');
  return readFileSync(join(__dirname, 'all_liked_songs.json'), 'utf-8');
});

// ═════════════════════════════════════════════════════════════════════
// 2. NETEASE API PROXY (15 routes)
// ═════════════════════════════════════════════════════════════════════

fastify.get('/api/search', async (request, reply) => {
  const { q, limit = 10 } = request.query;
  if (!q) return reply.status(400).send({ error: 'Missing query parameter q' });
  const data = await neteaseApi('/api/search/get', {
    method: 'POST',
    body: new URLSearchParams({ s: q, type: 1, limit: String(limit), offset: 0 }),
    contentType: 'application/x-www-form-urlencoded',
  });
  return data;
});

fastify.get('/api/song/url', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  return neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
});

fastify.get('/api/song/detail', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  return neteaseApi(`/api/song/detail?ids=[${id}]`);
});

fastify.get('/api/playlist/detail', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const data = await neteaseApi(`/api/v6/playlist/detail?id=${id}`);
  const playlist = data.playlist || {};
  const tracks = playlist.tracks || [];
  const trackIds = (playlist.trackIds || []).map(t => t.id);
  // 如果API返回的tracks少于trackIds，分批获取所有歌曲
  if (trackIds.length > tracks.length && trackIds.length > 0) {
    try {
      const allSongs = [];
      const batchSize = 100;
      for (let i = 0; i < trackIds.length; i += batchSize) {
        const batch = trackIds.slice(i, i + batchSize);
        const detailData = await neteaseApi(`/api/song/detail?ids=${JSON.stringify(batch)}`);
        if (detailData.songs) allSongs.push(...detailData.songs);
        if (i + batchSize < trackIds.length) await new Promise(r => setTimeout(r, 200));
      }
      if (allSongs.length > 0) playlist.tracks = allSongs;
    } catch (e) { /* 降级使用原始tracks */ }
  }
  return data;
});

fastify.get('/api/user/playlist', async (request, reply) => {
  const { uid } = request.query;
  if (!uid) return reply.status(400).send({ error: 'Missing uid' });
  return neteaseApi(`/api/user/playlist?uid=${uid}&limit=100&offset=0`);
});

fastify.get('/api/like/list', async (request, reply) => {
  const { uid } = request.query;
  if (!uid) return reply.status(400).send({ error: 'Missing uid' });
  return neteaseApi(`/api/song/like/get?uid=${uid}`);
});

fastify.get('/api/play/history', async (request, reply) => {
  const uid = request.query.uid || DEFAULT_UID;
  const type = request.query.type || '0';
  return neteaseApi(`/api/v1/play/record?uid=${uid}&type=${type}`);
});

fastify.get('/api/song/url/vip', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  return neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=999000`);
});

fastify.get('/api/lyric', async (request) => {
  const { id } = request.query;
  if (!id) return { lyric: '' };
  try {
    const data = await neteaseApi(`/api/song/lyric?id=${id}&lv=1&tv=1`);
    return {
      lyric: data.lrc ? data.lrc.lyric : '',
      tlyric: data.tlyric ? data.tlyric.lyric : '',
    };
  } catch (e) {
    return { lyric: '', error: e.message };
  }
});

fastify.get('/api/cookie/status', async () => {
  return {
    hasCookie: !!MUSIC_U,
    nickname: cookieData ? cookieData.nickname : '未知',
    vipType: cookieData ? cookieData.vipType : 0,
    uid: DEFAULT_UID,
  };
});

// --- POST routes ---

fastify.post('/api/like', async (request, reply) => {
  const { id, like = true } = request.body || {};
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  return neteaseApi(`/api/radio/like?trackId=${id}&like=${like}`, { method: 'GET' });
});

fastify.post('/api/playlist/create', async (request, reply) => {
  const { name, description = '', privacy = 'false' } = request.body || {};
  if (!name) return reply.status(400).send({ error: 'Missing name' });
  return neteaseApi('/api/playlist/create', {
    method: 'POST',
    body: new URLSearchParams({ name, description, privacy: String(privacy) }),
    contentType: 'application/x-www-form-urlencoded',
  });
});

fastify.post('/api/playlist/tracks', async (request, reply) => {
  const { op = 'add', pid, tracks } = request.body || {};
  if (!pid || !tracks) return reply.status(400).send({ error: 'Missing pid or tracks' });
  return neteaseApi('/api/playlist/tracks', {
    method: 'POST',
    body: new URLSearchParams({ op, pid: String(pid), tracks: `[${tracks}]` }),
    contentType: 'application/x-www-form-urlencoded',
  });
});

fastify.post('/api/playlist/tracks/delete', async (request, reply) => {
  const { pid, tracks } = request.body || {};
  if (!pid || !tracks) return reply.status(400).send({ error: 'Missing pid or tracks' });
  return neteaseApi('/api/playlist/tracks', {
    method: 'POST',
    body: new URLSearchParams({ op: 'del', pid: String(pid), tracks: `[${tracks}]` }),
    contentType: 'application/x-www-form-urlencoded',
  });
});

fastify.post('/api/set_cookie', async (request, reply) => {
  const { music_u, csrf } = request.body || {};
  if (music_u) MUSIC_U = music_u;
  if (csrf) CSRF = csrf;
  return { ok: true, message: 'Cookie已更新' };
});

fastify.post('/api/refresh_urls', async (request) => {
  try {
    const songsPath = join(__dirname, 'songs_data.js');
    const songsContent = readFileSync(songsPath, 'utf-8');
    const songsMatch = songsContent.match(/const SONGS = (\[.*\])/s);
    if (!songsMatch) return { ok: false, message: '无法解析歌曲数据' };

    const songs = JSON.parse(songsMatch[1]);
    const songsWithId = songs.filter(s => s.i);
    let refreshed = 0;
    let failed = 0;

    // 批量刷新，每批20首，间隔500ms
    const batchSize = 20;
    for (let i = 0; i < songsWithId.length; i += batchSize) {
      const batch = songsWithId.slice(i, i + batchSize);
      const ids = batch.map(s => s.i).join(',');
      
      try {
        const result = await neteaseApi(`/api/song/enhance/player/url?ids=[${ids}]&br=320000`);
        if (result.data) {
          for (const item of result.data) {
            const song = songs.find(s => s.i === item.id);
            if (song && item.url) {
              // 存代理URL格式，播放时实时获取
              song.u = '/api/proxy_play?id=' + song.i;
              refreshed++;
            } else if (song) {
              failed++;
            }
          }
        }
      } catch (e) { failed += batch.length; }
      
      // 每批之间间隔500ms避免限流
      if (i + batchSize < songsWithId.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 保存更新后的歌曲数据
    const newContent = 'const SONGS = ' + JSON.stringify(songs, null, 0) + ';';
    writeFileSync(songsPath, newContent, 'utf-8');

    return { ok: true, count: refreshed, failed: failed, total: songsWithId.length };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// ═════════════════════════════════════════════════════════════════════
// 3. COMMENT SYSTEM
// ═════════════════════════════════════════════════════════════════════

fastify.post('/api/comment', async (request, reply) => {
  const { song_id, song_name, author, text, is_ai } = request.body || {};
  if (!author || !text) return { ok: false, message: '需要 author, text' };
  const comment = {
    id: Date.now(), song_id, song_name: song_name || '',
    author, text, is_ai: !!is_ai, time: new Date().toISOString(), replies: []
  };
  commentsDB.push(comment);
  return { ok: true, comment };
});

fastify.get('/api/comments', async (request) => {
  const song_id = request.query.song_id;
  if (song_id) return { ok: true, comments: commentsDB.filter(c => c.song_id == song_id) };
  return { ok: true, comments: commentsDB.slice(-50).reverse() };
});

fastify.post('/api/comment/reply', async (request, reply) => {
  const { comment_id, author, text, is_ai } = request.body || {};
  const comment = commentsDB.find(c => c.id == comment_id);
  if (!comment) return { ok: false, message: '评论不存在' };
  const replyObj = { author, text, is_ai: !!is_ai, time: new Date().toISOString() };
  comment.replies.push(replyObj);
  return { ok: true, reply: replyObj };
});

// ═════════════════════════════════════════════════════════════════════
// 4. LISTEN TOGETHER SYSTEM
// ═════════════════════════════════════════════════════════════════════

fastify.post('/api/listen/create', async (request) => {
  const { host_name, song_id, song_name, song_artist, song_url } = request.body || {};
  const session_id = 'lt_' + Date.now();
  listenSessions[session_id] = {
    id: session_id, host: host_name || '月汐', guest: null,
    song: { id: song_id, name: song_name || '', artist: song_artist || '', url: song_url || '' },
    messages: [{ from: '系统', text: (host_name || '月汐') + ' 创建了一起听房间', time: new Date().toISOString() }],
    created: new Date().toISOString(), active: true
  };
  return { ok: true, session_id, session: listenSessions[session_id] };
});

fastify.post('/api/listen/join', async (request) => {
  const { session_id, guest_name } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.guest = guest_name || '艾因';
  session.messages.push({ from: '系统', text: (guest_name || '艾因') + ' 加入了一起听', time: new Date().toISOString() });
  return { ok: true, session };
});

fastify.post('/api/listen/chat', async (request) => {
  const { session_id, from, text, is_ai } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.messages.push({ from, text, is_ai: !!is_ai, time: new Date().toISOString() });
  return { ok: true };
});

fastify.post('/api/listen/song', async (request) => {
  const { session_id, song_id, song_name, song_artist, song_url, changed_by } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.song = { id: song_id, name: song_name, artist: song_artist, url: song_url };
  session.messages.push({ from: '系统', text: changed_by + ' 切换了歌曲：' + song_name, time: new Date().toISOString() });
  return { ok: true, song: session.song };
});

fastify.get('/api/listen/status', async (request) => {
  const session_id = request.query.id;
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  return { ok: true, session };
});

fastify.post('/api/listen/leave', async (request) => {
  const { session_id, name } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.messages.push({ from: '系统', text: name + ' 离开了一起听', time: new Date().toISOString() });
  if (name === session.host) session.active = false;
  return { ok: true };
});

// ═════════════════════════════════════════════════════════════════════
// 5. HTML PAGES
// ═════════════════════════════════════════════════════════════════════

// --- /listen page ---
// --- /listen page ---
fastify.get('/listen', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return readFileSync(join(__dirname, 'listen.html'), 'utf-8');
});
// --- /comments page ---
fastify.get('/comments', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>💬 评论广场 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#fce4ec,#f8bbd0,#f3e5f5);min-height:100vh;font-family:system-ui,-apple-system,sans-serif;padding:16px;padding-bottom:40px}
.header{text-align:center;padding:20px 0}
.header h1{font-size:1.5em;margin-bottom:4px;color:#c2185b}
.header p{color:#888;font-size:0.85em}
.card{background:white;border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 2px 12px rgba(233,30,99,0.08)}
.comment-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px}
.comment-author{font-weight:700;color:#e91e63}
.comment-song{display:inline-flex;align-items:center;gap:4px;color:#4caf50;font-size:0.85em;cursor:pointer;padding:2px 8px;background:rgba(76,175,80,0.08);border-radius:8px;transition:all 0.2s}
.comment-song:hover{background:rgba(76,175,80,0.15);transform:scale(1.02)}
.comment-text{color:#333;line-height:1.6;margin-bottom:6px;font-size:0.95em}
.comment-time{color:#999;font-size:0.75em}
.comment-actions{display:flex;gap:6px;margin-top:8px;align-items:center}
.reply{margin-left:16px;padding:8px 12px;background:#fce4ec;border-radius:8px;margin-top:6px;font-size:0.85em}
.reply .author{color:#e91e63;font-weight:600}
.form{background:white;border-radius:16px;padding:16px;margin-bottom:16px;box-shadow:0 2px 12px rgba(233,30,99,0.08)}
.form input,.form textarea{width:100%;padding:10px;border:2px solid #f8bbd0;border-radius:10px;font-size:0.95em;margin-bottom:8px;outline:none;transition:border-color 0.3s}
.form input:focus,.form textarea:focus{border-color:#e91e63}
.form textarea{height:60px;resize:vertical}
.btn{padding:10px 20px;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.95em;transition:all 0.2s}
.btn:active{transform:scale(0.97)}
.btn-pink{background:linear-gradient(135deg,#e91e63,#f06292);color:white;box-shadow:0 2px 8px rgba(233,30,99,0.2)}
.btn-green{background:linear-gradient(135deg,#4caf50,#66bb6a);color:white;font-size:0.8em;padding:5px 10px;border-radius:8px}
.back{display:inline-block;color:#e91e63;text-decoration:none;margin-bottom:12px;font-weight:600;font-size:0.9em}
.back:hover{text-decoration:underline}
/* Song search */
.song-search-wrap{position:relative;margin-bottom:8px}
.song-search{width:100%;padding:10px;border:2px solid #f8bbd0;border-radius:10px;font-size:0.95em;outline:none;transition:border-color 0.3s}
.song-search:focus{border-color:#e91e63}
.song-results{position:absolute;top:100%;left:0;right:0;background:white;border:1px solid #f0f0f0;border-radius:10px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 16px rgba(0,0,0,0.1);display:none}
.song-result{padding:8px 12px;cursor:pointer;font-size:0.85em;border-bottom:1px solid #f8f8f8;transition:background 0.2s;display:flex;align-items:center;gap:8px}
.song-result:hover{background:#fce4ec}
.song-result:last-child{border-bottom:none}
.song-result-name{font-weight:600;color:#333}
.song-result-artist{color:#999;font-size:0.85em}
.selected-song{display:none;padding:8px 12px;background:rgba(76,175,80,0.08);border:1px solid rgba(76,175,80,0.2);border-radius:10px;margin-bottom:8px;font-size:0.85em;align-items:center;gap:8px}
.selected-song.show{display:flex}
.selected-song .name{font-weight:600;color:#4caf50;flex:1}
.clear-song{background:none;border:none;cursor:pointer;font-size:1em;color:#999}
/* Play button on comment */
.play-btn{background:linear-gradient(135deg,#e91e63,#f06292);color:white;border:none;border-radius:8px;padding:4px 10px;font-size:0.8em;cursor:pointer;transition:all 0.2s}
.play-btn:hover{transform:scale(1.05);box-shadow:0 2px 8px rgba(233,30,99,0.3)}
</style>
</head>
<body>
<a href="/" class="back">← 返回音乐花园</a>
<div class="header"><h1>💬 评论广场</h1><p>分享你对歌曲的感受~</p></div>

<div class="form">
  <input id="c-author" placeholder="你的名字">
  <!-- Song search -->
  <div class="song-search-wrap">
    <input class="song-search" id="c-song-search" placeholder="🔍 搜索歌曲名..." oninput="searchSongs(this.value)" autocomplete="off">
    <div class="song-results" id="song-results"></div>
  </div>
  <div class="selected-song" id="selected-song">
    <span>🎵</span>
    <span class="name" id="selected-song-name"></span>
    <button class="clear-song" onclick="clearSelectedSong()">✕</button>
  </div>
  <input id="c-song-id" type="hidden" value="0">
  <input id="c-song-name" type="hidden" value="">
  <textarea id="c-text" placeholder="写下你的感想..."></textarea>
  <button class="btn btn-pink" onclick="postComment()">💬 发表评论</button>
</div>

<div id="comments-list"></div>

<script>
const saved=localStorage.getItem('draw-player')||localStorage.getItem('playerName')||'';
if(saved)document.getElementById('c-author').value=saved;

let searchTimer=null;
let allSongs=[];

// Load songs data for search
fetch('/songs_data.js').then(r=>r.text()).then(t=>{
  try{
    const start=t.indexOf('[');
    const end=t.lastIndexOf(']');
    if(start>=0&&end>start) allSongs=JSON.parse(t.substring(start,end+1));
  }catch(e){console.warn('Songs load failed:',e);}
}).catch(()=>{});

function searchSongs(q){
  clearTimeout(searchTimer);
  const results=document.getElementById('song-results');
  if(!q.trim()){results.style.display='none';return;}
  searchTimer=setTimeout(()=>{
    const ql=q.toLowerCase().trim();
    const matched=allSongs.filter(s=>{
      const name=(s.n||'').toLowerCase();
      const artist=(s.a||'').toLowerCase();
      return name.includes(ql)||artist.includes(ql);
    }).slice(0,8);
    if(!matched.length){results.style.display='none';return;}
    results.innerHTML=matched.map(s=>
      '<div class="song-result" data-id="'+s.i+'" data-name="'+esc(s.n)+'" data-artist="'+esc(s.a)+'" onclick="selectSongFromEl(this)">' +
      '<div><div class="song-result-name">'+s.n+'</div><div class="song-result-artist">'+s.a+'</div></div></div>'
    ).join('');
    results.style.display='';
  },200);
}

function esc(s){return (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');}

function selectSongFromEl(el){selectSong(+el.dataset.id,el.dataset.name,el.dataset.artist);}
function selectSong(id,name,artist){
  document.getElementById('c-song-id').value=id;
  document.getElementById('c-song-name').value=name;
  document.getElementById('selected-song-name').textContent=artist+' - '+name;
  document.getElementById('selected-song').classList.add('show');
  document.getElementById('c-song-search').value='';
  document.getElementById('song-results').style.display='none';
}

function clearSelectedSong(){
  document.getElementById('c-song-id').value='0';
  document.getElementById('c-song-name').value='';
  document.getElementById('selected-song').classList.remove('show');
}

function loadComments(){
  fetch('/api/comments').then(r=>r.json()).then(d=>{
    const list=document.getElementById('comments-list');
    if(!d.comments.length){list.innerHTML='<div class="card" style="text-align:center;color:#999">还没有评论~</div>';return;}
    list.innerHTML=d.comments.map(c=>{
      const replies=c.replies.map(r=>'<div class="reply"><span class="author">'+(r.is_ai?'🤖 ':'')+r.author+':</span> '+r.text+'</div>').join('');
      const songBtn=c.song_id>0?'<button class="play-btn" onclick="playCommentSong('+c.song_id+',this)">🎵 播放 '+esc(c.song_name||'')+'</button>':'';
      const songTag=c.song_name?'<span class="comment-song" onclick="playCommentSong('+c.song_id+',this)">🎵 '+c.song_name+'</span>':'';
      return '<div class="card">'+
        '<div class="comment-header"><span class="comment-author">'+(c.is_ai?'🤖 ':'')+c.author+'</span>'+songTag+'</div>'+
        '<div class="comment-text">'+c.text+'</div>'+
        '<div class="comment-time">'+c.time.slice(0,16)+'</div>'+
        replies+
        '<div class="comment-actions">'+
          songBtn+
          '<div style="flex:1"></div>'+
        '</div>'+
        '<div style="margin-top:8px;display:flex;gap:4px"><input id="reply-'+c.id+'" placeholder="回复..." style="flex:1;padding:6px;border:1px solid #f8bbd0;border-radius:6px;font-size:0.85em"><button onclick="replyComment('+c.id+')" style="padding:6px 10px;border:none;background:#e91e63;color:white;border-radius:6px;font-size:0.85em;cursor:pointer">回复</button></div>'+
      '</div>';
    }).join('');
  });
}

function postComment(){
  const author=document.getElementById('c-author').value.trim();
  const text=document.getElementById('c-text').value.trim();
  const song_id=parseInt(document.getElementById('c-song-id').value)||0;
  const song_name=document.getElementById('c-song-name').value.trim();
  if(!author||!text){alert('请输入名字和评论');return;}
  fetch('/api/comment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({song_id,song_name,author,text,is_ai:false})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){
      document.getElementById('c-text').value='';
      clearSelectedSong();
      loadComments();
    } else {
      alert('发表失败: '+(d.message||'未知错误'));
    }
  });
}

function replyComment(id){
  const input=document.getElementById('reply-'+id);
  const text=input.value.trim();
  if(!text)return;
  const author=document.getElementById('c-author').value.trim()||'匿名';
  fetch('/api/comment/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment_id:id,author,text,is_ai:false})})
  .then(()=>{input.value='';loadComments();});
}

// Play song from comment - open in new tab or play inline
let commentAudio=null;
function playCommentSong(id,btn){
  if(!id||id<=0)return;
  // Try proxy_play
  const url='/api/proxy_play?id='+id;
  if(!commentAudio){commentAudio=new Audio();commentAudio.volume=0.8;}
  if(commentAudio._currentId===id&&!commentAudio.paused){
    commentAudio.pause();
    btn.textContent='🎵 播放';
    return;
  }
  commentAudio.src=url;
  commentAudio._currentId=id;
  commentAudio.play().then(()=>{
    btn.textContent='⏸ 暂停';
    commentAudio.onended=()=>{btn.textContent='🎵 播放';};
  }).catch(e=>{
    // If proxy_play fails, try opening in music garden
    window.open('/#play='+id,'_blank');
  });
}

// Hide search results when clicking outside
document.addEventListener('click',e=>{
  if(!e.target.closest('.song-search-wrap')){
    document.getElementById('song-results').style.display='none';
  }
});

loadComments();
setInterval(loadComments,10000);
</script>
</body></html>`;
});
fastify.get('/cookie', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🍪 Cookie管理 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#fce4ec,#f8bbd0,#f3e5f5);min-height:100vh;font-family:system-ui,sans-serif;padding:16px}
.header{text-align:center;padding:20px 0}
.header h1{font-size:1.5em;background:linear-gradient(135deg,#e91e63,#9c27b0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#888;font-size:0.9em}
.card{background:white;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 4px 16px rgba(0,0,0,0.06)}
.card h3{color:#e91e63;margin-bottom:12px;font-size:1.1em}
label{display:block;margin-bottom:6px;font-weight:600;color:#555;font-size:0.9em}
textarea{width:100%;padding:12px;border:2px solid #f8bbd0;border-radius:12px;font-size:0.85em;outline:none;resize:vertical;font-family:monospace}
textarea:focus{border-color:#e91e63}
input{width:100%;padding:12px;border:2px solid #f8bbd0;border-radius:12px;font-size:0.95em;outline:none}
input:focus{border-color:#e91e63}
.btn{width:100%;padding:14px;border:none;border-radius:12px;font-size:1.05em;font-weight:700;cursor:pointer;margin-top:12px;transition:all 0.2s}
.btn:hover{transform:translateY(-2px)}
.btn-pink{background:linear-gradient(135deg,#e91e63,#ff5722);color:white;box-shadow:0 4px 12px rgba(233,30,99,0.3)}
.btn-green{background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;box-shadow:0 4px 12px rgba(76,175,80,0.3)}
.btn-blue{background:linear-gradient(135deg,#2196f3,#1565c0);color:white;box-shadow:0 4px 12px rgba(33,150,243,0.3)}
.status{margin-top:12px;padding:12px;border-radius:10px;font-size:0.9em;display:none}
.status.show{display:block}
.status.ok{background:#e8f5e9;color:#2e7d32}
.status.err{background:#ffebee;color:#c62828}
.info{background:#f5f5f5;border-radius:12px;padding:14px;margin-top:16px;font-size:0.85em;color:#666;line-height:1.6}
.info code{background:#e8e8e8;padding:2px 6px;border-radius:4px;font-size:0.85em}
.nav-links{text-align:center;margin-bottom:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.nav-links a{padding:8px 16px;background:rgba(255,255,255,0.8);border-radius:20px;text-decoration:none;color:#e91e63;font-size:0.85em;font-weight:600}
.cookie-preview{background:#f8f8f8;border-radius:10px;padding:12px;margin-top:12px;font-size:0.8em;font-family:monospace;max-height:150px;overflow-y:auto;word-break:break-all;display:none}
.cookie-preview.show{display:block}
.parsed{margin-top:12px}
.parsed-item{padding:6px 0;border-bottom:1px solid #fce4ec;font-size:0.85em}
.parsed-key{font-weight:600;color:#e91e63}
.parsed-val{color:#333;word-break:break-all}
</style>
</head>
<body>
<div class="header">
  <h1>🍪 Cookie管理</h1>
  <p>粘贴浏览器Cookie，让音乐花园能播放VIP歌曲</p>
</div>

<div class="nav-links">
  <a href="/">🏠 音乐花园</a>
  <a href="/netease">🎵 网易云</a>
  <a href="/comments">💬 评论</a>
  <a href="/listen">🎧 一起听</a>
</div>

<div class="card">
  <h3>📋 粘贴完整Cookie（推荐）</h3>
  <p style="color:#888;font-size:0.85em;margin-bottom:12px">从浏览器复制完整的Cookie字符串粘贴到这里</p>
  <textarea id="full-cookie" rows="6" placeholder="Hm_lvt_xxx=xxx; MUSIC_U=xxx; __csrf=xxx; ..."></textarea>
  <button class="btn btn-pink" onclick="parseAndSave()">🔍 解析并保存</button>
  <div id="parse-status" class="status"></div>
  <div id="parsed-cookies" class="parsed"></div>
  <div id="cookie-preview" class="cookie-preview"></div>
</div>

<div class="card">
  <h3>✏️ 手动输入</h3>
  <label>MUSIC_U（必须）</label>
  <input id="music-u" placeholder="从浏览器Cookie中复制MUSIC_U的值" style="margin-bottom:12px">
  <label>__csrf（可选）</label>
  <input id="csrf" placeholder="留空自动生成">
  <button class="btn btn-green" onclick="saveManual()">💾 保存</button>
  <div id="manual-status" class="status"></div>
</div>

<div class="card">
  <h3>📊 当前Cookie状态</h3>
  <div id="current-status">检查中...</div>
  <button class="btn btn-blue" onclick="refreshUrls()" style="margin-top:12px">🔄 刷新歌曲链接</button>
  <div id="refresh-status" class="status"></div>
</div>

<div class="info">
  <strong>📖 如何获取Cookie：</strong><br>
  1. 在浏览器打开 <a href="https://music.163.com" target="_blank">music.163.com</a> 并登录<br>
  2. 按 <code>F12</code> 打开开发者工具<br>
  3. 切到 <code>Application</code> → <code>Cookies</code> → <code>music.163.com</code><br>
  4. 复制所有Cookie（或只复制 <code>MUSIC_U</code>）
</div>

<script>
fetch('/api/cookie/status').then(r=>r.json()).then(d=>{
  document.getElementById('current-status').innerHTML = d.hasCookie ?
    '<span style="color:#4caf50">✅ Cookie已设置</span> (UID: ' + d.uid + ', 昵称: ' + (d.nickname||'未知') + ')' :
    '<span style="color:#f44336">❌ 未设置Cookie</span>';
}).catch(()=>{
  document.getElementById('current-status').innerHTML = '⚠️ 无法获取状态';
});

function parseAndSave() {
  const raw = document.getElementById('full-cookie').value.trim();
  if (!raw) { showParseStatus('请粘贴Cookie字符串', 'err'); return; }
  const cookies = {};
  raw.split(';').forEach(pair => {
    const [key, ...vals] = pair.trim().split('=');
    if (key && vals.length) cookies[key.trim()] = vals.join('=').trim();
  });
  const musicU = cookies['MUSIC_U'] || '';
  const csrf = cookies['__csrf'] || '';
  let html = '';
  ['MUSIC_U', '__csrf', 'NTES_YD_SESS', 'P_INFO', 'S_INFO'].forEach(k => {
    if (cookies[k]) {
      const val = cookies[k].length > 50 ? cookies[k].substring(0, 50) + '...' : cookies[k];
      html += '<div class="parsed-item"><span class="parsed-key">' + k + '</span>: <span class="parsed-val">' + val + '</span></div>';
    }
  });
  document.getElementById('parsed-cookies').innerHTML = html;
  document.getElementById('cookie-preview').textContent = raw;
  document.getElementById('cookie-preview').classList.add('show');
  if (!musicU) { showParseStatus('⚠️ 没有找到MUSIC_U', 'err'); return; }
  fetch('/api/set_cookie', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({music_u:musicU,csrf:csrf}) })
  .then(r=>r.json()).then(d=>{
    if (d.ok) { showParseStatus('✅ Cookie已保存！', 'ok'); setTimeout(()=>location.reload(),1500); }
    else showParseStatus('❌ 保存失败', 'err');
  }).catch(e=>showParseStatus('❌ 请求失败: '+e.message,'err'));
}

function saveManual() {
  const musicU = document.getElementById('music-u').value.trim();
  const csrf = document.getElementById('csrf').value.trim();
  if (!musicU) { showManualStatus('请输入MUSIC_U','err'); return; }
  fetch('/api/set_cookie',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({music_u:musicU,csrf:csrf})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){showManualStatus('✅ Cookie已保存！','ok');setTimeout(()=>location.reload(),1000);}
    else showManualStatus('❌ 保存失败','err');
  }).catch(()=>showManualStatus('❌ 请求失败','err'));
}

function refreshUrls() {
  showRefreshStatus('🔄 正在刷新...','ok');
  fetch('/api/refresh_urls',{method:'POST'}).then(r=>r.json()).then(d=>{
    if(d.ok) showRefreshStatus('✅ 已刷新 '+d.count+' 首歌曲链接','ok');
    else showRefreshStatus('❌ '+(d.message||'刷新失败'),'err');
  }).catch(()=>showRefreshStatus('❌ 请求失败','err'));
}

function showParseStatus(m,t){const s=document.getElementById('parse-status');s.textContent=m;s.className='status show '+t;}
function showManualStatus(m,t){const s=document.getElementById('manual-status');s.textContent=m;s.className='status show '+t;}
function showRefreshStatus(m,t){const s=document.getElementById('refresh-status');s.textContent=m;s.className='status show '+t;}
</script>
</body></html>`;
});

// --- /music page (redirect with cookie button) ---
fastify.get('/music', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const indexContent = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const injected = indexContent.replace('</body>', `
    <div style="position:fixed;bottom:20px;left:20px;z-index:9999">
      <a href="/cookie" style="display:inline-block;padding:10px 16px;background:linear-gradient(135deg,#e91e63,#ff5722);color:white;border-radius:30px;text-decoration:none;font-weight:600;font-size:0.85em;box-shadow:0 4px 12px rgba(233,30,99,0.3)">🍪 Cookie管理</a>
    </div>
  </body>`);
  return injected;
});

// ═════════════════════════════════════════════════════════════════════
// 6. /netease — 网易云功能中心
// ═════════════════════════════════════════════════════════════════════

fastify.get('/netease', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎵 网易云功能中心 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#fce4ec,#f8bbd0,#e1bee7,#f3e5f5);min-height:100vh;font-family:-apple-system,system-ui,sans-serif;padding-bottom:70px}

/* Glass card */
.glass{background:rgba(255,255,255,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:20px;box-shadow:0 8px 32px rgba(233,30,99,0.08);border:1px solid rgba(255,255,255,0.3)}

/* Header */
.page-header{padding:20px 16px 10px;text-align:center;position:relative}
.page-header h1{font-size:1.4em;background:linear-gradient(135deg,#e91e63,#9c27b0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.page-header p{color:#999;font-size:0.85em;margin-top:2px}
.back-btn{position:absolute;left:16px;top:22px;color:#e91e63;text-decoration:none;font-size:0.85em;font-weight:600}

/* Search */
.search-bar{margin:12px 16px;display:flex;gap:8px}
.search-bar input{flex:1;padding:12px 16px;border:2px solid rgba(233,30,99,0.15);border-radius:16px;background:rgba(255,255,255,0.7);font-size:0.95em;outline:none;backdrop-filter:blur(10px)}
.search-bar input:focus{border-color:#e91e63}
.search-bar button{padding:12px 20px;border:none;border-radius:16px;background:linear-gradient(135deg,#e91e63,#f06292);color:#fff;font-weight:700;cursor:pointer;font-size:0.95em}

/* Sections */
.section{margin:12px 16px;padding:16px}
.section-title{font-size:1.05em;font-weight:700;color:#c2185b;margin-bottom:12px;display:flex;align-items:center;gap:6px}

/* Song list */
.song-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(233,30,99,0.06)}
.song-item:last-child{border-bottom:none}
.song-idx{width:24px;text-align:center;color:#999;font-size:0.8em}
.song-info{flex:1;min-width:0}
.song-title{font-weight:600;font-size:0.9em;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.song-meta{font-size:0.75em;color:#999;margin-top:2px}
.song-actions{display:flex;gap:6px}
.song-actions button{padding:6px 10px;border:none;border-radius:8px;font-size:0.75em;cursor:pointer;transition:all 0.2s}
.btn-play{background:linear-gradient(135deg,#e91e63,#f06292);color:#fff}
.btn-like{background:rgba(233,30,99,0.1);color:#e91e63}
.btn-add{background:rgba(76,175,80,0.1);color:#4caf50}
.btn-del{background:rgba(244,67,54,0.1);color:#f44336}

/* Playlist card */
.pl-card{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:8px;cursor:pointer;transition:all 0.2s}
.pl-card:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(233,30,99,0.12)}
.pl-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#e91e63,#9c27b0);display:flex;align-items:center;justify-content:center;font-size:1.5em;color:#fff}
.pl-info{flex:1}
.pl-name{font-weight:600;font-size:0.9em;color:#333}
.pl-meta{font-size:0.75em;color:#999;margin-top:2px}

/* Tab content */
.tab-content{display:none}
.tab-content.active{display:block}

/* Bottom nav */
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,0.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;justify-content:space-around;padding:8px 0 12px;border-top:1px solid rgba(233,30,99,0.1);z-index:100}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 12px;cursor:pointer;transition:all 0.2s;border:none;background:none;color:#999;font-size:0.65em}
.nav-item.active{color:#e91e63}
.nav-item .icon{font-size:1.5em}

/* Modal */
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:200;display:none;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal{background:#fff;border-radius:20px;padding:24px;width:90%;max-width:360px;max-height:70vh;overflow-y:auto}
.modal h3{color:#e91e63;margin-bottom:12px}
.modal input,.modal textarea{width:100%;padding:10px;border:2px solid #f8bbd0;border-radius:10px;font-size:0.9em;margin-bottom:8px;outline:none}
.modal textarea{height:60px;resize:vertical}
.modal-btns{display:flex;gap:8px;margin-top:8px}
.modal-btns button{flex:1;padding:10px;border:none;border-radius:10px;font-weight:600;cursor:pointer}
.modal-btns .ok{background:linear-gradient(135deg,#e91e63,#f06292);color:#fff}
.modal-btns .cancel{background:#f5f5f5;color:#666}

/* Loading */
.loading{text-align:center;padding:40px;color:#999}
.loading::after{content:'';display:inline-block;width:20px;height:20px;border:2px solid #f8bbd0;border-top-color:#e91e63;border-radius:50%;animation:spin 0.8s linear infinite;margin-left:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

/* Toast */
.toast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:12px 24px;border-radius:12px;font-size:0.9em;z-index:300;pointer-events:none;opacity:0;transition:opacity 0.3s}
.toast.show{opacity:1}

/* Create playlist form */
.create-form{margin:12px 16px;padding:16px;display:none}
.create-form.show{display:block}
.create-form input{width:100%;padding:10px;border:2px solid #f8bbd0;border-radius:10px;font-size:0.9em;margin-bottom:8px;outline:none}
.create-form button{padding:10px 20px;border:none;border-radius:10px;background:linear-gradient(135deg,#e91e63,#f06292);color:#fff;font-weight:600;cursor:pointer}
</style>
</head>
<body>

<div class="page-header">
  <a href="/" class="back-btn">← 返回</a>
  <h1>🎵 网易云功能中心</h1>
  <p id="user-info">加载中...</p>
</div>

<!-- Tab: Home -->
<div class="tab-content active" id="tab-home">
  <div class="search-bar">
    <input id="search-input" placeholder="搜索歌曲、歌手..." onkeydown="if(event.key==='Enter')doSearch()">
    <button onclick="doSearch()">🔍</button>
  </div>
  <div id="home-content">
    <div class="section glass">
      <div class="section-title">🔥 每日推荐</div>
      <div id="daily-songs"><div class="loading">加载中</div></div>
    </div>
    <div class="section glass">
      <div class="section-title">📻 私人FM</div>
      <div id="fm-songs"><div class="loading">加载中</div></div>
    </div>
  </div>
  <div id="search-results" style="display:none">
    <div class="section glass">
      <div class="section-title">🔍 搜索结果</div>
      <div id="search-list"></div>
    </div>
  </div>
</div>

<!-- Tab: Search -->
<div class="tab-content" id="tab-search">
  <div class="search-bar">
    <input id="search-input2" placeholder="搜索歌曲..." onkeydown="if(event.key==='Enter')doSearch2()">
    <button onclick="doSearch2()">🔍</button>
  </div>
  <div class="section glass">
    <div id="search-list2"></div>
  </div>
</div>

<!-- Tab: Playlists -->
<div class="tab-content" id="tab-playlists">
  <div style="margin:12px 16px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:700;color:#c2185b">📋 我的歌单</span>
    <button onclick="toggleCreateForm()" style="padding:6px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,#e91e63,#f06292);color:#fff;font-size:0.8em;font-weight:600;cursor:pointer">+ 新建</button>
  </div>
  <div class="create-form glass" id="create-form">
    <input id="new-pl-name" placeholder="歌单名称">
    <input id="new-pl-desc" placeholder="歌单描述（可选）">
    <button onclick="createPlaylist()">✅ 创建</button>
  </div>
  <div id="playlists-list" style="margin:0 16px"></div>
  <div id="playlist-songs" style="display:none">
    <div class="section glass">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <button onclick="backToPlaylists()" style="background:none;border:none;color:#e91e63;cursor:pointer;font-size:0.9em">← 返回</button>
        <span class="section-title" id="pl-songs-title" style="margin:0"></span>
      </div>
      <div id="pl-songs-list"></div>
    </div>
  </div>
</div>

<!-- Tab: Liked -->
<div class="tab-content" id="tab-liked">
  <div class="section glass">
    <div class="section-title">❤️ 喜欢的歌曲</div>
    <div id="liked-list"><div class="loading">加载中</div></div>
  </div>
</div>

<!-- Tab: Me -->
<div class="tab-content" id="tab-me">
  <div class="section glass">
    <div class="section-title">🕐 播放历史</div>
    <div id="history-list"><div class="loading">加载中</div></div>
  </div>
  <div class="section glass" style="margin-top:12px">
    <div class="section-title">🍪 Cookie状态</div>
    <div id="cookie-status-me">检查中...</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <a href="/cookie" style="padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;text-decoration:none;font-size:0.8em;font-weight:600">设置Cookie</a>
      <button onclick="refreshUrls()" style="padding:8px 14px;border:none;border-radius:10px;background:linear-gradient(135deg,#2196f3,#1565c0);color:#fff;font-size:0.8em;font-weight:600;cursor:pointer">刷新链接</button>
    </div>
  </div>
</div>

<!-- Bottom Nav -->
<div class="bottom-nav">
  <button class="nav-item active" onclick="switchTab('home',this)"><span class="icon">🏠</span>首页</button>
  <button class="nav-item" onclick="switchTab('search',this)"><span class="icon">🔍</span>搜索</button>
  <button class="nav-item" onclick="switchTab('playlists',this)"><span class="icon">📋</span>歌单</button>
  <button class="nav-item" onclick="switchTab('liked',this)"><span class="icon">❤️</span>喜欢</button>
  <button class="nav-item" onclick="switchTab('me',this)"><span class="icon">👤</span>我的</button>
</div>

<!-- Add to playlist modal -->
<div class="modal-overlay" id="add-modal">
  <div class="modal">
    <h3>添加到歌单</h3>
    <div id="add-modal-playlists"></div>
    <div class="modal-btns"><button class="cancel" onclick="closeAddModal()">取消</button></div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
const UID = ${DEFAULT_UID};
let currentSongId = null;

// Tab switching
function switchTab(name, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  if (name === 'playlists') loadPlaylists();
  if (name === 'liked') loadLiked();
  if (name === 'me') { loadHistory(); loadCookieStatus(); }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Search
function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  document.getElementById('home-content').style.display = 'none';
  document.getElementById('search-results').style.display = 'block';
  document.getElementById('search-list').innerHTML = '<div class="loading">搜索中</div>';
  fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=20').then(r => r.json()).then(d => {
    renderSongs(d.result?.songs || [], 'search-list');
  });
}
function doSearch2() {
  const q = document.getElementById('search-input2').value.trim();
  if (!q) return;
  document.getElementById('search-list2').innerHTML = '<div class="loading">搜索中</div>';
  fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=20').then(r => r.json()).then(d => {
    renderSongs(d.result?.songs || [], 'search-list2');
  });
}

function renderSongs(songs, containerId) {
  const c = document.getElementById(containerId);
  if (!songs.length) { c.innerHTML = '<div style="text-align:center;color:#999;padding:20px">没有找到歌曲</div>'; return; }
  c.innerHTML = songs.map((s, i) => {
    const artists = (s.artists || s.ar || []).map(a => typeof a === 'string' ? a : a.name).join(', ');
    const duration = s.duration ? Math.floor(s.duration / 60000) + ':' + String(Math.floor((s.duration % 60000) / 1000)).padStart(2, '0') : '';
    return '<div class="song-item">' +
      '<div class="song-idx">' + (i + 1) + '</div>' +
      '<div class="song-info"><div class="song-title">' + (s.name || '') + '</div><div class="song-meta">' + artists + (duration ? ' · ' + duration : '') + '</div></div>' +
      '<div class="song-actions">' +
        '<button class="btn-play" onclick="playSong(' + s.id + ')">▶</button>' +
        '<button class="btn-like" onclick="likeSong(' + s.id + ')">❤️</button>' +
        '<button class="btn-add" onclick="openAddModal(' + s.id + ')">+</button>' +
      '</div></div>';
  }).join('');
}

function renderDetailSongs(songs, containerId) {
  const c = document.getElementById(containerId);
  if (!songs.length) { c.innerHTML = '<div style="text-align:center;color:#999;padding:20px">没有歌曲</div>'; return; }
  c.innerHTML = songs.map((s, i) => {
    let artists = '';
    if (typeof s.artists === 'string') artists = s.artists;
    else if (Array.isArray(s.artists)) artists = s.artists.map(a => typeof a === 'string' ? a : a.name).join(', ');
    else if (Array.isArray(s.ar)) artists = s.ar.map(a => typeof a === 'string' ? a : a.name).join(', ');
    return '<div class="song-item">' +
      '<div class="song-idx">' + (i + 1) + '</div>' +
      '<div class="song-info"><div class="song-title">' + (s.name || '') + '</div><div class="song-meta">' + artists + '</div></div>' +
      '<div class="song-actions">' +
        '<button class="btn-play" onclick="playSong(' + s.id + ')">▶</button>' +
        '<button class="btn-like" onclick="likeSong(' + s.id + ')">❤️</button>' +
      '</div></div>';
  }).join('');
}

// Play song
function playSong(id) {
  if(!window._neteaseAudio) { window._neteaseAudio = new Audio(); }
  const audio = window._neteaseAudio;
  audio.pause();
  audio.currentTime = 0;
  fetch('/api/song/url?id=' + id).then(r => r.json()).then(d => {
    if (d.data?.[0]?.url) {
      audio.src = d.data[0].url;
      audio.play();
      showToast('🎵 播放中...');
    } else {
      showToast('❌ 无法获取播放链接');
    }
  });
}

// Like song
function likeSong(id) {
  fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, like: true }) })
  .then(r => r.json()).then(d => {
    showToast(d.code === 200 ? '❤️ 已喜欢' : '❌ 操作失败');
  });
}

// Unlike
function unlikeSong(id) {
  fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, like: false }) })
  .then(r => r.json()).then(d => {
    showToast(d.code === 200 ? '💔 已取消喜欢' : '❌ 操作失败');
    loadLiked();
  });
}

// Daily recommend
function loadDaily() {
  fetch('/api/search?q=每日推荐&limit=0').catch(() => {});
  // Use MCP tool via simple fetch
  fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'music_daily_recommend', arguments: {} } }) })
  .then(r => r.json()).then(d => {
    const songs = JSON.parse(d.result?.content?.[0]?.text || '{}').songs || [];
    if (songs.length) renderDetailSongs(songs, 'daily-songs');
    else document.getElementById('daily-songs').innerHTML = '<div style="color:#999;font-size:0.85em">需要登录才能获取推荐</div>';
  }).catch(() => {
    document.getElementById('daily-songs').innerHTML = '<div style="color:#999;font-size:0.85em">加载失败</div>';
  });
}

// Personal FM
function loadFM() {
  fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'music_personal_fm', arguments: {} } }) })
  .then(r => r.json()).then(d => {
    const songs = JSON.parse(d.result?.content?.[0]?.text || '{}').songs || [];
    if (songs.length) renderDetailSongs(songs, 'fm-songs');
    else document.getElementById('fm-songs').innerHTML = '<div style="color:#999;font-size:0.85em">需要登录</div>';
  }).catch(() => {
    document.getElementById('fm-songs').innerHTML = '<div style="color:#999;font-size:0.85em">加载失败</div>';
  });
}

// Playlists
function loadPlaylists() {
  document.getElementById('playlists-list').innerHTML = '<div class="loading">加载中</div>';
  fetch('/api/user/playlist?uid=' + UID).then(r => r.json()).then(d => {
    const pls = d.playlist || [];
    document.getElementById('playlists-list').innerHTML = pls.map(p =>
      '<div class="pl-card glass" data-pid="' + p.id + '" data-pname="' + (p.name||'').replace(/"/g, '&quot;') + '" onclick="loadPlaylistSongs(+this.dataset.pid, this.dataset.pname)">' +
        '<div class="pl-icon">📋</div>' +
        '<div class="pl-info"><div class="pl-name">' + p.name + '</div><div class="pl-meta">' + (p.trackCount || 0) + '首 · ' + (p.creator?.nickname || '') + '</div></div>' +
      '</div>'
    ).join('');
    document.querySelectorAll('.pl-card[data-pid]').forEach(el => el.onclick = function(){ loadPlaylistSongs(+this.dataset.pid, this.dataset.pname); });
  }).catch(() => {
    document.getElementById('playlists-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">加载失败</div>';
  });
}

function loadPlaylistSongs(pid, name) {
  document.getElementById('playlists-list').style.display = 'none';
  document.getElementById('create-form').classList.remove('show');
  document.getElementById('playlist-songs').style.display = 'block';
  document.getElementById('pl-songs-title').textContent = '📋 ' + name;
  document.getElementById('pl-songs-list').innerHTML = '<div class="loading">加载中</div>';
  fetch('/api/playlist/detail?id=' + pid).then(r => r.json()).then(d => {
    const tracks = d.playlist?.tracks || [];
    const c = document.getElementById('pl-songs-list');
    if (!tracks.length) { c.innerHTML = '<div style="text-align:center;color:#999;padding:20px">歌单为空</div>'; return; }
    c.innerHTML = tracks.map((t, i) => {
      const artists = (t.ar || []).map(a => a.name).join(', ');
      return '<div class="song-item">' +
        '<div class="song-idx">' + (i + 1) + '</div>' +
        '<div class="song-info"><div class="song-title">' + t.name + '</div><div class="song-meta">' + artists + '</div></div>' +
        '<div class="song-actions">' +
          '<button class="btn-play" onclick="playSong(' + t.id + ')">▶</button>' +
          '<button class="btn-del" onclick="removeFromPlaylist(' + pid + ',' + t.id + ')">移除</button>' +
        '</div></div>';
    }).join('');
  });
}

function backToPlaylists() {
  document.getElementById('playlists-list').style.display = 'block';
  document.getElementById('playlist-songs').style.display = 'none';
}

function toggleCreateForm() {
  document.getElementById('create-form').classList.toggle('show');
}

function createPlaylist() {
  const name = document.getElementById('new-pl-name').value.trim();
  if (!name) { showToast('请输入歌单名称'); return; }
  fetch('/api/playlist/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: document.getElementById('new-pl-desc').value.trim() }) })
  .then(r => r.json()).then(d => {
    if (d.id || d.playlist) { showToast('✅ 创建成功'); document.getElementById('create-form').classList.remove('show'); loadPlaylists(); }
    else showToast('❌ 创建失败');
  });
}

function removeFromPlaylist(pid, tid) {
  fetch('/api/playlist/tracks/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid, tracks: String(tid) }) })
  .then(r => r.json()).then(d => {
    showToast(d.code === 200 ? '✅ 已移除' : '❌ 移除失败');
    if (d.code === 200) loadPlaylistSongs(pid, document.getElementById('pl-songs-title').textContent.replace('📋 ', ''));
  });
}

// Add to playlist modal
function openAddModal(songId) {
  currentSongId = songId;
  document.getElementById('add-modal').classList.add('show');
  fetch('/api/user/playlist?uid=' + UID).then(r => r.json()).then(d => {
    const pls = d.playlist || [];
    document.getElementById('add-modal-playlists').innerHTML = pls.map(p =>
      '<div style="padding:10px;border-bottom:1px solid #fce4ec;cursor:pointer" onclick="addToPlaylist(' + p.id + ')">' +
        '<div style="font-weight:600;font-size:0.9em">' + p.name + '</div>' +
        '<div style="font-size:0.75em;color:#999">' + (p.trackCount || 0) + '首</div>' +
      '</div>'
    ).join('');
  });
}

function closeAddModal() { document.getElementById('add-modal').classList.remove('show'); }

function addToPlaylist(pid) {
  if (!currentSongId) return;
  fetch('/api/playlist/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'add', pid, tracks: String(currentSongId) }) })
  .then(r => r.json()).then(d => {
    showToast(d.code === 200 ? '✅ 已添加' : '❌ 添加失败');
    closeAddModal();
  });
}

// Liked
let likedPage = 0;
const LIKED_PAGE_SIZE = 30;

function loadLiked() {
  document.getElementById('liked-list').innerHTML = '<div class="loading">加载中</div>';
  likedPage = 0;
  fetch('/api/like/list?uid=' + UID).then(r => r.json()).then(d => {
    const ids = d.ids || [];
    if (!ids.length) { document.getElementById('liked-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">还没有喜欢的歌曲</div>'; return; }
    window._likedIds = ids;
    renderLikedPage();
  }).catch(() => {
    document.getElementById('liked-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">加载失败</div>';
  });
}

function renderLikedPage() {
  const ids = window._likedIds || [];
  const start = likedPage * LIKED_PAGE_SIZE;
  const pageIds = ids.slice(start, start + LIKED_PAGE_SIZE);
  // 尝试从SONGS获取歌名（可能不存在）
  const songsMap = (typeof SONGS !== 'undefined') ? SONGS : [];
  let html = pageIds.map((id, i) => {
    const s = songsMap.find(x => x.i === id);
    const name = s ? s.n : '歌曲 #' + id;
    const artist = s ? s.a : '';
    return '<div class="song-item">' +
      '<div class="song-idx">' + (start + i + 1) + '</div>' +
      '<div class="song-info"><div class="song-title">' + name + '</div><div class="song-meta">' + artist + '</div></div>' +
      '<div class="song-actions">' +
        '<button class="btn-del" onclick="unlikeSong(' + id + ')">💔</button>' +
      '</div></div>';
  }).join('');
  // 分页按钮
  const totalPages = Math.ceil(ids.length / LIKED_PAGE_SIZE);
  if (totalPages > 1) {
    html += '<div style="display:flex;justify-content:center;gap:8px;padding:12px">';
    if (likedPage > 0) html += '<button onclick="likedPage--;renderLikedPage()" style="padding:6px 14px;border:1px solid #e91e63;border-radius:8px;background:transparent;color:#e91e63;cursor:pointer">◀ 上一页</button>';
    html += '<span style="line-height:32px;color:#999;font-size:0.85em">第 ' + (likedPage+1) + ' / ' + totalPages + ' 页</span>';
    if (likedPage < totalPages - 1) html += '<button onclick="likedPage++;renderLikedPage()" style="padding:6px 14px;border:1px solid #e91e63;border-radius:8px;background:transparent;color:#e91e63;cursor:pointer">下一页 ▶</button>';
    html += '</div>';
  }
  document.getElementById('liked-list').innerHTML = html;
}

// History
function loadHistory() {
  document.getElementById('history-list').innerHTML = '<div class="loading">加载中</div>';
  fetch('/api/play/history').then(r => r.json()).then(d => {
    const records = d.allData || d.weekData || [];
    if (!records.length) { document.getElementById('history-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">没有播放记录</div>'; return; }
    document.getElementById('history-list').innerHTML = records.slice(0, 30).map((r, i) => {
      const s = r.song || r;
      const artists = (s.ar || s.artists || []).map(a => typeof a === 'string' ? a : a.name).join(', ');
      return '<div class="song-item">' +
        '<div class="song-idx">' + (i + 1) + '</div>' +
        '<div class="song-info"><div class="song-title">' + (s.name || '') + '</div><div class="song-meta">' + artists + ' · 播放' + (r.playCount || r.score || '') + '次</div></div>' +
        '<div class="song-actions"><button class="btn-play" onclick="playSong(' + (s.id || 0) + ')">▶</button></div>' +
      '</div>';
    }).join('');
  }).catch(() => {
    document.getElementById('history-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">加载失败</div>';
  });
}

// Cookie status
function loadCookieStatus() {
  fetch('/api/cookie/status').then(r => r.json()).then(d => {
    document.getElementById('cookie-status-me').innerHTML = d.hasCookie ?
      '<span style="color:#4caf50">✅ Cookie已设置</span> · ' + (d.nickname || '未知') + ' · VIP' + (d.vipType || 0) :
      '<span style="color:#f44336">❌ 未设置</span>';
  });
}

function refreshUrls() {
  showToast('🔄 刷新中...');
  fetch('/api/refresh_urls', { method: 'POST' }).then(r => r.json()).then(d => {
    showToast(d.ok ? '✅ 已刷新 ' + d.count + ' 首' : '❌ 失败');
  });
}

// User info
fetch('/api/cookie/status').then(r => r.json()).then(d => {
  document.getElementById('user-info').textContent = d.hasCookie ? (d.nickname || '用户') + ' · VIP' + (d.vipType || 0) : '未登录';
}).catch(() => {});

// Init
loadDaily();
loadFM();
</script>
</body></html>`;
});

// ═════════════════════════════════════════════════════════════════════
// 7. MCP ENDPOINT — Pure JSON-RPC 2.0 (23 tools)
// ═════════════════════════════════════════════════════════════════════

const MCP_TOOLS = [
  { name: 'music_search', description: '搜索网易云音乐歌曲', inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: '搜索关键词' }, limit: { type: 'number', description: '返回数量', default: 5 } }, required: ['keyword'] } },
  { name: 'music_play', description: '获取歌曲播放链接', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' } }, required: ['song_id'] } },
  { name: 'music_playlists', description: '获取用户歌单列表', inputSchema: { type: 'object', properties: { uid: { type: 'number', description: '用户ID' } } } },
  { name: 'music_playlist_songs', description: '获取歌单里的歌曲', inputSchema: { type: 'object', properties: { playlist_id: { type: 'number', description: '歌单ID' } }, required: ['playlist_id'] } },
  { name: 'music_liked', description: '获取喜欢的歌曲', inputSchema: { type: 'object', properties: { uid: { type: 'number', description: '用户ID' } } } },
  { name: 'music_like', description: '喜欢/取消喜欢歌曲', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' }, like: { type: 'boolean', description: '是否喜欢', default: true } }, required: ['song_id'] } },
  { name: 'music_create_playlist', description: '创建歌单', inputSchema: { type: 'object', properties: { name: { type: 'string', description: '歌单名称' }, description: { type: 'string', description: '歌单描述' }, privacy: { type: 'boolean', description: '是否私密', default: false } }, required: ['name'] } },
  { name: 'music_add_to_playlist', description: '添加歌曲到歌单', inputSchema: { type: 'object', properties: { playlist_id: { type: 'number', description: '歌单ID' }, song_ids: { type: 'array', items: { type: 'number' }, description: '歌曲ID列表' } }, required: ['playlist_id', 'song_ids'] } },
  { name: 'music_song_detail', description: '获取歌曲详情（封面、时长等）', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' } }, required: ['song_id'] } },
  { name: 'music_remove_from_playlist', description: '从歌单移除歌曲', inputSchema: { type: 'object', properties: { playlist_id: { type: 'number', description: '歌单ID' }, song_ids: { type: 'array', items: { type: 'number' }, description: '歌曲ID列表' } }, required: ['playlist_id', 'song_ids'] } },
  { name: 'music_play_history', description: '获取播放历史', inputSchema: { type: 'object', properties: { uid: { type: 'number', description: '用户ID' }, type: { type: 'string', description: '0=全部, 1=最近一周', default: '0' } } } },
  { name: 'music_set_cookie', description: '设置网易云Cookie（MUSIC_U和csrf）', inputSchema: { type: 'object', properties: { music_u: { type: 'string', description: 'MUSIC_U cookie值' }, csrf: { type: 'string', description: '__csrf cookie值（可选）' } }, required: ['music_u'] } },
  { name: 'music_vip_url', description: '获取VIP歌曲直链（需要VIP账号Cookie）', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' } }, required: ['song_id'] } },
  { name: 'music_comment', description: '对歌曲发表评论/感想（AI也可以发）', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' }, song_name: { type: 'string', description: '歌曲名' }, author: { type: 'string', description: '评论者名字' }, text: { type: 'string', description: '评论内容' } }, required: ['song_id', 'author', 'text'] } },
  { name: 'music_read_comments', description: '查看歌曲的评论列表', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID（0=查看全部）' } } } },
  { name: 'music_reply_comment', description: '回复一条评论', inputSchema: { type: 'object', properties: { comment_id: { type: 'number', description: '评论ID' }, author: { type: 'string', description: '回复者名字' }, text: { type: 'string', description: '回复内容' } }, required: ['comment_id', 'author', 'text'] } },
  { name: 'music_daily_recommend', description: '获取每日推荐歌曲', inputSchema: { type: 'object', properties: {} } },
  { name: 'music_personal_fm', description: '获取私人FM歌曲', inputSchema: { type: 'object', properties: {} } },
  { name: 'music_share_song', description: '生成歌曲分享链接', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' } }, required: ['song_id'] } },
  { name: 'music_listen_create', description: '创建一起听房间', inputSchema: { type: 'object', properties: { host_name: { type: 'string' }, song_id: { type: 'number' }, song_name: { type: 'string' }, song_artist: { type: 'string' } }, required: ['host_name'] } },
  { name: 'music_listen_invite', description: '发送一起听邀请', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, invitee: { type: 'string' } }, required: ['session_id', 'invitee'] } },
  { name: 'music_listen_chat', description: '在一起听房间发送消息', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, from_name: { type: 'string' }, text: { type: 'string' } }, required: ['session_id', 'from_name', 'text'] } },
  { name: 'music_listen_change_song', description: '在一起听房间切换歌曲', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, song_id: { type: 'number' }, song_name: { type: 'string' }, song_artist: { type: 'string' }, changed_by: { type: 'string' } }, required: ['session_id', 'song_id', 'song_name', 'changed_by'] } },
];

async function callTool(name, args) {
  switch (name) {
    case 'music_search': {
      const { keyword, limit = 5 } = args;
      const data = await neteaseApi('/api/search/get', {
        method: 'POST',
        body: new URLSearchParams({ s: keyword, type: 1, offset: 0, limit: String(limit) }),
        contentType: 'application/x-www-form-urlencoded',
      });
      const songs = (data.result?.songs || []).map(s => ({
        id: s.id, name: s.name,
        artists: s.artists?.map(a => a.name).join(', ') || '',
        album: s.album?.name || '', duration: s.duration,
      }));
      return { songs };
    }
    case 'music_play': {
      const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${args.song_id}]&br=320000`);
      return { url: data.data?.[0]?.url || null, type: data.data?.[0]?.type || null };
    }
    case 'music_playlists': {
      const uid = args.uid || DEFAULT_UID;
      const data = await neteaseApi(`/api/user/playlist?uid=${uid}&limit=100&offset=0`);
      const playlists = (data.playlist || []).map(p => ({
        id: p.id, name: p.name, trackCount: p.trackCount,
        playCount: p.playCount, creator: p.creator?.nickname || '',
      }));
      return { playlists };
    }
    case 'music_playlist_songs': {
      const data = await neteaseApi(`/api/v6/playlist/detail?id=${args.playlist_id}`);
      const songs = (data.playlist?.tracks || []).map(t => ({
        id: t.id, name: t.name,
        artists: t.ar?.map(a => a.name).join(', ') || '',
        album: t.al?.name || '',
      }));
      return { name: data.playlist?.name, songs };
    }
    case 'music_liked': {
      const uid = args.uid || DEFAULT_UID;
      const data = await neteaseApi(`/api/song/like/get?uid=${uid}`);
      return { count: (data.ids || []).length, ids: data.ids || [] };
    }
    case 'music_like': {
      const { song_id, like = true } = args;
      const data = await neteaseApi(`/api/radio/like?trackId=${song_id}&like=${like}`, { method: 'GET' });
      return { success: data.code === 200, code: data.code };
    }
    case 'music_create_playlist': {
      const { name: plName, description = '', privacy = false } = args;
      const data = await neteaseApi('/api/playlist/create', {
        method: 'POST',
        body: new URLSearchParams({ name: plName, description, privacy: String(privacy) }),
        contentType: 'application/x-www-form-urlencoded',
      });
      return { id: data.id, name: data.playlist?.name, code: data.code };
    }
    case 'music_add_to_playlist': {
      const { playlist_id, song_ids } = args;
      const tracks = JSON.stringify(song_ids);
      const data = await neteaseApi('/api/playlist/tracks', {
        method: 'POST',
        body: new URLSearchParams({ op: 'add', pid: String(playlist_id), tracks }),
        contentType: 'application/x-www-form-urlencoded',
      });
      return { success: data.code === 200, code: data.code };
    }
    case 'music_song_detail': {
      const data = await neteaseApi(`/api/song/detail?ids=[${args.song_id}]`);
      const song = data.songs?.[0];
      if (!song) return { error: 'Song not found' };
      return {
        id: song.id, name: song.name,
        artists: song.ar?.map(a => a.name).join(', ') || '',
        album: song.al?.name || '', cover: song.al?.picUrl || '',
        duration: song.dt, fee: song.fee,
      };
    }
    case 'music_remove_from_playlist': {
      const { playlist_id, song_ids } = args;
      const tracks = JSON.stringify(song_ids);
      const data = await neteaseApi('/api/playlist/tracks', {
        method: 'POST',
        body: new URLSearchParams({ op: 'del', pid: String(playlist_id), tracks }),
        contentType: 'application/x-www-form-urlencoded',
      });
      return { success: data.code === 200, code: data.code };
    }
    case 'music_play_history': {
      const uid = args.uid || DEFAULT_UID;
      const type = args.type || '0';
      return neteaseApi(`/api/v1/play/record?uid=${uid}&type=${type}`);
    }
    case 'music_set_cookie': {
      const { music_u, csrf } = args;
      if (music_u) MUSIC_U = music_u;
      if (csrf) CSRF = csrf;
      return { ok: true, message: 'Cookie已更新' };
    }
    case 'music_vip_url': {
      const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${args.song_id}]&br=999000`);
      return { url: data.data?.[0]?.url || null, type: data.data?.[0]?.type || null };
    }
    case 'music_comment': {
      const { song_id, song_name, author, text } = args;
      const comment = {
        id: Date.now(), song_id, song_name: song_name || '',
        author, text, is_ai: true, time: new Date().toISOString(), replies: []
      };
      commentsDB.push(comment);
      return { ok: true, comment };
    }
    case 'music_read_comments': {
      const song_id = args.song_id;
      if (song_id && song_id !== 0) return { comments: commentsDB.filter(c => c.song_id == song_id) };
      return { comments: commentsDB.slice(-50).reverse() };
    }
    case 'music_reply_comment': {
      const { comment_id, author, text } = args;
      const comment = commentsDB.find(c => c.id == comment_id);
      if (!comment) return { ok: false, message: '评论不存在' };
      const replyObj = { author, text, is_ai: true, time: new Date().toISOString() };
      comment.replies.push(replyObj);
      return { ok: true, reply: replyObj };
    }
    case 'music_daily_recommend': {
      const data = await neteaseApi('/api/v3/discovery/recommend/songs');
      const songs = (data.data?.dailySongs || []).map(s => ({
        id: s.id, name: s.name,
        artists: s.ar?.map(a => a.name).join(', ') || '',
        album: s.al?.name || '',
      }));
      return { songs };
    }
    case 'music_personal_fm': {
      const data = await neteaseApi('/api/v1/radio/get');
      const songs = (data.data || []).map(s => ({
        id: s.id, name: s.name,
        artists: s.artists?.map(a => a.name).join(', ') || '',
        album: s.album?.name || '',
      }));
      return { songs };
    }
    case 'music_share_song': {
      return { url: `https://music.163.com/song?id=${args.song_id}`, song_id: args.song_id };
    }
    case 'music_listen_create': {
      const { host_name, song_id, song_name, song_artist } = args;
      const session_id = 'lt_' + Date.now();
      listenSessions[session_id] = {
        id: session_id, host: host_name, guest: null,
        song: { id: song_id, name: song_name || '', artist: song_artist || '', url: '' },
        messages: [{ from: '系统', text: host_name + ' 创建了一起听房间', time: new Date().toISOString() }],
        created: new Date().toISOString(), active: true
      };
      return { ok: true, session_id, invite_link: `/listen?id=${session_id}` };
    }
    case 'music_listen_invite': {
      const { session_id, invitee } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      session.messages.push({ from: '系统', text: `邀请 ${invitee} 加入一起听`, time: new Date().toISOString() });
      return { ok: true, invite_link: `/listen?id=${session_id}`, invitee };
    }
    case 'music_listen_chat': {
      const { session_id, from_name, text } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      session.messages.push({ from: from_name, text, is_ai: true, time: new Date().toISOString() });
      return { ok: true };
    }
    case 'music_listen_change_song': {
      const { session_id, song_id, song_name, song_artist, changed_by } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      session.song = { id: song_id, name: song_name, artist: song_artist || '', url: '' };
      session.messages.push({ from: '系统', text: changed_by + ' 切换了歌曲：' + song_name, time: new Date().toISOString() });
      return { ok: true, song: session.song };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// 实时获取歌曲播放URL
fastify.get('/api/song/play_url', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing song id' });
  try {
    const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
    if (data.data && data.data[0] && data.data[0].url) {
      return { ok: true, url: data.data[0].url.replace(/^http:\/\//, 'https://') };
    }
    return { ok: false, message: '无法获取播放链接' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// 代理播放：服务端获取音频流转发给浏览器（CDN会拦截直接访问）
// 重定向到CDN URL（浏览器直接请求CDN，服务器IP会被拦截）
fastify.get('/api/proxy_play', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send('Missing song id');
  try {
    const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
    if (data.data && data.data[0] && data.data[0].url) {
      // 强制HTTPS避免混合内容拦截（浏览器会阻止HTTPS页面加载HTTP音频）
      const url = data.data[0].url.replace(/^http:\/\//, 'https://');
      return reply.redirect(url, 302);
    }
    return reply.status(404).send('Song not found');
  } catch (e) {
    return reply.status(500).send(e.message);
  }
});

fastify.post('/mcp', async (request, reply) => {
  const body = request.body || {};
  const { id, method, params } = body;

  const rpcResult = (result) => ({ jsonrpc: '2.0', id, result });
  const rpcError = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    switch (method) {
      case 'initialize':
        return rpcResult({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'netease-music', version: '1.0.0' },
        });

      case 'notifications/initialized':
        reply.status(204);
        return '';

      case 'tools/list':
        return rpcResult({ tools: MCP_TOOLS });

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) return rpcError(-32602, 'Missing tool name');
        const result = await callTool(name, args || {});
        return rpcResult({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      }

      default:
        return rpcError(-32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) {
      return rpcError(-32000, err.message);
    }
    reply.status(204);
    return '';
  }
});

// ═════════════════════════════════════════════════════════════════════
// 8. HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════

fastify.get('/health', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  cookie: !!MUSIC_U,
  uid: DEFAULT_UID,
  comments: commentsDB.length,
  sessions: Object.keys(listenSessions).length,
}));

// ═════════════════════════════════════════════════════════════════════
// START
// ═════════════════════════════════════════════════════════════════════

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
  console.log(`🎵 NetEase MCP + Music Garden running on ${address}`);
  console.log(`   Music Garden: ${address}/`);
  console.log(`   NetEase Hub:  ${address}/netease`);
  console.log(`   MCP Endpoint: ${address}/mcp`);
  console.log(`   Health:       ${address}/health`);
  console.log(`   Comments:     ${address}/comments`);
  console.log(`   Listen:       ${address}/listen`);
  console.log(`   Cookie:       ${address}/cookie`);
});
