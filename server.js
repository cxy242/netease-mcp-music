import Fastify from 'fastify';
import { readFileSync, writeFileSync } from 'fs';
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
  return neteaseApi(`/api/v6/playlist/detail?id=${id}`);
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
  if (!song_id || !author || !text) return { ok: false, message: '需要 song_id, author, text' };
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
fastify.get('/listen', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎧 一起听 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(180deg,#0a0e27 0%,#1a1a4e 30%,#0d1b3e 60%,#070d1f 100%);min-height:100vh;color:#eee;font-family:-apple-system,system-ui,sans-serif;overflow-x:hidden}

/* Stars background */
body::before{content:'';position:fixed;top:0;left:0;right:0;bottom:0;background:radial-gradient(2px 2px at 20px 30px,#fff,transparent),radial-gradient(2px 2px at 40px 70px,rgba(255,255,255,0.8),transparent),radial-gradient(1px 1px at 90px 40px,#fff,transparent),radial-gradient(1px 1px at 130px 80px,rgba(255,255,255,0.6),transparent),radial-gradient(2px 2px at 160px 30px,#fff,transparent),radial-gradient(1px 1px at 200px 60px,rgba(255,255,255,0.7),transparent);background-size:200px 100px;animation:twinkle 4s ease-in-out infinite alternate;opacity:0.3;pointer-events:none;z-index:0}
@keyframes twinkle{from{opacity:0.2}to{opacity:0.5}}

.avatar-section{padding:30px 20px 10px;text-align:center;position:relative;z-index:1}
.avatar-container{display:flex;align-items:center;justify-content:center;gap:0}
.avatar{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);overflow:hidden;position:relative}
.avatar .placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2em;background:linear-gradient(135deg,#667eea,#764ba2)}
.avatar-name{font-size:0.75em;color:#ccc;margin-top:6px;text-align:center}
.connection{display:flex;flex-direction:column;align-items:center;margin:0 -8px;z-index:1}
.headphone-icon{font-size:2.5em;filter:drop-shadow(0 0 10px rgba(135,206,235,0.5))}
.headphone-line{width:80px;height:2px;background:linear-gradient(90deg,#87CEEB,#FFB6C1,#87CEEB);margin:2px 0;border-radius:1px}
.heart-beat{animation:heartbeat 1.5s ease-in-out infinite;font-size:1.2em;margin:4px 0}
@keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

.song-info{text-align:center;padding:15px 20px;position:relative;z-index:1}
.song-name{font-size:1.4em;font-weight:700;margin-bottom:4px;text-shadow:0 2px 8px rgba(0,0,0,0.3)}
.song-artist{color:rgba(255,255,255,0.7);font-size:0.9em}

.record-player{display:flex;justify-content:center;padding:20px 0;position:relative;z-index:1}
.record{width:180px;height:180px;border-radius:50%;background:conic-gradient(from 0deg,#1a1a2e,#2d2d4e,#1a1a2e,#2d2d4e,#1a1a2e);box-shadow:0 0 40px rgba(0,0,0,0.5),inset 0 0 30px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;position:relative;animation:spin 8s linear infinite}
.record::before{content:'';position:absolute;width:160px;height:160px;border-radius:50%;background:conic-gradient(from 45deg,transparent,rgba(255,255,255,0.03),transparent,rgba(255,255,255,0.03),transparent)}
.record::after{content:'';position:absolute;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#e91e63 0%,#c2185b 50%,#880e4f 100%);border:3px solid #fff;box-shadow:0 0 15px rgba(233,30,99,0.5)}
.record-center{position:absolute;font-size:1.5em;z-index:1;pointer-events:none}
.record.paused{animation-play-state:paused}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

.progress-section{padding:0 30px;display:flex;align-items:center;gap:10px;position:relative;z-index:1}
.progress-time{font-size:0.7em;color:rgba(255,255,255,0.5);min-width:35px}
.progress-bar{flex:1;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;cursor:pointer;position:relative}
.progress-fill{height:100%;background:linear-gradient(90deg,#87CEEB,#e91e63);border-radius:2px;width:0%;transition:width 1s linear;position:relative}
.progress-fill::after{content:'';position:absolute;right:-5px;top:-3px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(233,30,99,0.5)}

.controls{display:flex;align-items:center;justify-content:center;gap:30px;padding:15px 0;position:relative;z-index:1}
.ctrl-btn{background:none;border:none;color:rgba(255,255,255,0.8);font-size:1.5em;cursor:pointer;transition:all 0.2s;padding:8px}
.ctrl-btn:hover{color:#fff;transform:scale(1.1)}
.ctrl-btn.play{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;font-size:1.8em;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(233,30,99,0.4)}

.chat-section{padding:0 16px;margin-top:10px;position:relative;z-index:1}
.chat-box{background:rgba(255,255,255,0.05);border-radius:16px;max-height:180px;overflow-y:auto;padding:12px;backdrop-filter:blur(10px)}
.chat-msg{margin-bottom:8px;font-size:0.85em;display:flex;gap:6px;align-items:flex-start}
.chat-avatar{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.6em}
.chat-content{flex:1}
.chat-name{font-weight:600;font-size:0.8em;margin-bottom:1px}
.chat-name.me{color:#87CEEB}
.chat-name.ai{color:#FFB6C1}
.chat-name.system{color:#666;font-size:0.75em}
.chat-text{color:rgba(255,255,255,0.85);line-height:1.4}
.chat-time{color:rgba(255,255,255,0.3);font-size:0.65em;margin-top:2px}

.input-section{padding:12px 16px 20px;display:flex;gap:8px;position:relative;z-index:1}
.chat-input{flex:1;padding:10px 16px;border-radius:24px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#eee;font-size:0.9em;outline:none;backdrop-filter:blur(10px)}
.chat-input:focus{border-color:rgba(233,30,99,0.5);background:rgba(255,255,255,0.12)}
.send-btn{padding:10px 18px;border-radius:24px;border:none;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;font-weight:600;cursor:pointer;font-size:0.9em}

.join-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center;position:relative;z-index:1}
.join-icon{font-size:5em;margin-bottom:16px}
.join-title{font-size:1.8em;font-weight:700;margin-bottom:8px;background:linear-gradient(135deg,#87CEEB,#FFB6C1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.join-desc{color:rgba(255,255,255,0.6);margin-bottom:30px;font-size:0.95em}
.join-input{width:80%;max-width:320px;padding:14px;border-radius:16px;border:2px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#eee;font-size:1.05em;text-align:center;outline:none;backdrop-filter:blur(10px);margin-bottom:16px}
.join-input:focus{border-color:#87CEEB}
.join-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.join-btn{padding:14px 28px;border-radius:16px;border:none;font-size:1em;font-weight:700;cursor:pointer;transition:all 0.2s}
.join-btn:hover{transform:translateY(-2px)}
.join-btn.create{background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;box-shadow:0 4px 16px rgba(233,30,99,0.3)}
.join-btn.join{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;box-shadow:0 4px 16px rgba(102,126,234,0.3)}

.back-link{position:absolute;top:16px;left:16px;color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85em;z-index:2}
.back-link:hover{color:#fff}
</style>
</head>
<body>

<div id="join-page" class="join-page">
  <div class="join-icon">🎧</div>
  <div class="join-title">一起听</div>
  <div class="join-desc">和重要的人，听同一首歌</div>
  <input id="join-name" class="join-input" placeholder="输入你的名字">
  <div class="join-btns">
    <button class="join-btn create" onclick="createRoom()">🏠 创建房间</button>
    <button class="join-btn join" onclick="joinRoom()">💕 加入房间</button>
  </div>
</div>

<div id="main-page" style="display:none">
  <a href="/" class="back-link">← 返回</a>

  <div class="avatar-section">
    <div class="avatar-container">
      <div style="text-align:center">
        <div class="avatar" id="avatar-host">
          <div class="placeholder" id="avatar-host-img">👤</div>
        </div>
        <div class="avatar-name" id="avatar-host-name">-</div>
      </div>
      <div class="connection">
        <span class="headphone-icon">🎧</span>
        <div class="headphone-line"></div>
        <div class="heart-beat">💕</div>
        <div class="headphone-line"></div>
        <span class="headphone-icon">🎧</span>
      </div>
      <div style="text-align:center">
        <div class="avatar" id="avatar-guest">
          <div class="placeholder" id="avatar-guest-img">👤</div>
        </div>
        <div class="avatar-name" id="avatar-guest-name">等待加入...</div>
      </div>
    </div>
  </div>

  <div class="song-info">
    <div class="song-name" id="song-name">等待播放...</div>
    <div class="song-artist" id="song-artist">-</div>
  </div>

  <div class="record-player">
    <div class="record paused" id="record">
      <span class="record-center">💿</span>
    </div>
  </div>

  <div class="progress-section">
    <span class="progress-time" id="time-current">0:00</span>
    <div class="progress-bar" id="progress-bar" onclick="seekTo(event)">
      <div class="progress-fill" id="progress-fill"></div>
    </div>
    <span class="progress-time" id="time-total">0:00</span>
  </div>

  <div class="controls">
    <button class="ctrl-btn" onclick="prevSong()">⏮</button>
    <button class="ctrl-btn play" id="play-btn" onclick="togglePlay()">▶</button>
    <button class="ctrl-btn" onclick="nextSong()">⏭</button>
  </div>

  <div class="chat-section">
    <div class="chat-box" id="chat-box"></div>
  </div>
  <div class="input-section">
    <input id="chat-msg" class="chat-input" placeholder="说点什么..." onkeydown="if(event.key==='Enter')sendMsg()">
    <button class="send-btn" onclick="sendMsg()">发送</button>
  </div>
</div>

<audio id="audio" preload="auto"></audio>

<script>
let sessionId='',myName='',isPlaying=false,pollTimer=null;
const audio=document.getElementById('audio');
const urlParams=new URLSearchParams(window.location.search);
sessionId=urlParams.get('id')||'';

if(sessionId){document.getElementById('join-page').style.display='flex';document.getElementById('join-name').focus();}
else{document.getElementById('join-page').style.display='flex';document.getElementById('join-name').focus();}

function createRoom(){
  myName=document.getElementById('join-name').value.trim()||'月汐';
  fetch('/api/listen/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host_name:myName})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){sessionId=d.session_id;history.replaceState(null,'','?id='+sessionId);showMain();startPolling();}
  });
}
function joinRoom(){
  myName=document.getElementById('join-name').value.trim()||'艾因';
  if(!sessionId){alert('需要房间链接才能加入~');return;}
  fetch('/api/listen/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,guest_name:myName})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){showMain();startPolling();}else alert(d.message);
  });
}
function showMain(){
  document.getElementById('join-page').style.display='none';
  document.getElementById('main-page').style.display='block';
}
function startPolling(){pollTimer=setInterval(pollStatus,2000);pollStatus();}

function pollStatus(){
  if(!sessionId)return;
  fetch('/api/listen/status?id='+sessionId).then(r=>r.json()).then(d=>{
    if(!d.ok)return;const s=d.session;
    document.getElementById('avatar-host-name').textContent=s.host||'-';
    document.getElementById('avatar-guest-name').textContent=s.guest||'等待加入...';
    if(s.song&&s.song.name){
      document.getElementById('song-name').textContent=s.song.name;
      document.getElementById('song-artist').textContent=s.song.artist||'';
      if(s.song.url&&audio.src!==s.song.url){audio.src=s.song.url;audio.play().catch(()=>{});}
    }
    if(audio.duration){
      document.getElementById('time-current').textContent=formatTime(audio.currentTime);
      document.getElementById('time-total').textContent=formatTime(audio.duration);
      document.getElementById('progress-fill').style.width=(audio.currentTime/audio.duration*100)+'%';
    }
    const box=document.getElementById('chat-box');
    box.innerHTML=s.messages.map(m=>{
      const cls=m.from==='系统'?'system':(m.from===myName?'me':'ai');
      const avatar=m.from==='系统'?'🎵':(m.from===myName?'💙':'💗');
      return '<div class="chat-msg"><div class="chat-avatar">'+avatar+'</div><div class="chat-content"><div class="chat-name '+cls+'">'+m.from+'</div><div class="chat-text">'+m.text+'</div><div class="chat-time">'+(m.time?m.time.slice(11,16):'')+'</div></div></div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  });
}

function formatTime(s){const m=Math.floor(s/60);const sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec;}
function sendMsg(){const inp=document.getElementById('chat-msg');const text=inp.value.trim();if(!text)return;inp.value='';fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text})});}
function togglePlay(){if(isPlaying){audio.pause();document.getElementById('play-btn').textContent='▶';document.getElementById('record').classList.add('paused');}else{audio.play();document.getElementById('play-btn').textContent='⏸';document.getElementById('record').classList.remove('paused');}isPlaying=!isPlaying;}
function seekTo(e){const bar=document.getElementById('progress-bar');const pct=(e.clientX-bar.getBoundingClientRect().left)/bar.clientWidth;if(audio.duration)audio.currentTime=pct*audio.duration;}
function prevSong(){fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text:'⏮ 切了上一首~'})});}
function nextSong(){fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text:'⏭ 切了下一首~'})});}
audio.addEventListener('ended',()=>{document.getElementById('play-btn').textContent='▶';document.getElementById('record').classList.add('paused');isPlaying=false;});
</script>
</body></html>`;
});

// --- /comments page ---
fastify.get('/comments', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>💬 评论广场 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#fce4ec,#f8bbd0,#f3e5f5);min-height:100vh;font-family:system-ui,-apple-system,sans-serif;padding:16px}
.header{text-align:center;padding:24px 0}
.header h1{font-size:1.6em;margin-bottom:4px;color:#c2185b}
.header p{color:#888;font-size:0.9em}
.card{background:white;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 2px 12px rgba(233,30,99,0.08)}
.comment-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.comment-author{font-weight:700;color:#e91e63}
.comment-song{color:#4caf50;font-size:0.85em}
.comment-text{color:#333;line-height:1.6;margin-bottom:8px}
.comment-time{color:#999;font-size:0.75em}
.reply{margin-left:20px;padding:8px 12px;background:#fce4ec;border-radius:8px;margin-top:6px;font-size:0.9em}
.reply .author{color:#e91e63;font-weight:600}
.form{background:white;border-radius:16px;padding:16px;margin-bottom:16px;box-shadow:0 2px 12px rgba(233,30,99,0.08)}
.form input,.form textarea{width:100%;padding:10px;border:2px solid #f8bbd0;border-radius:10px;font-size:0.95em;margin-bottom:8px;outline:none}
.form input:focus,.form textarea:focus{border-color:#e91e63}
.form textarea{height:60px;resize:vertical}
.btn{padding:10px 20px;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.95em}
.btn-pink{background:linear-gradient(135deg,#e91e63,#f06292);color:white}
.back{display:inline-block;color:#e91e63;text-decoration:none;margin-bottom:12px;font-weight:600}
.back:hover{text-decoration:underline}
</style>
</head>
<body>
<a href="/" class="back">← 返回音乐花园</a>
<div class="header"><h1>💬 评论广场</h1><p>分享你对歌曲的感受~</p></div>
<div class="form">
  <input id="c-author" placeholder="你的名字">
  <input id="c-song" placeholder="歌曲名（可选）">
  <input id="c-song-id" placeholder="歌曲ID（可选）" style="display:none">
  <textarea id="c-text" placeholder="写下你的感想..."></textarea>
  <button class="btn btn-pink" onclick="postComment()">💬 发表评论</button>
</div>
<div id="comments-list"></div>
<script>
const saved=localStorage.getItem('draw-player')||localStorage.getItem('playerName')||'';
if(saved)document.getElementById('c-author').value=saved;

function loadComments(){
  fetch('/api/comments').then(r=>r.json()).then(d=>{
    const list=document.getElementById('comments-list');
    if(!d.comments.length){list.innerHTML='<div class="card" style="text-align:center;color:#999">还没有评论~</div>';return;}
    list.innerHTML=d.comments.map(c=>{
      const replies=c.replies.map(r=>'<div class="reply"><span class="author">'+(r.is_ai?'🤖 ':'')+r.author+':</span> '+r.text+'</div>').join('');
      return '<div class="card">'+
        '<div class="comment-header"><span class="comment-author">'+(c.is_ai?'🤖 ':'')+c.author+'</span>'+(c.song_name?'<span class="comment-song">🎵 '+c.song_name+'</span>':'')+'</div>'+
        '<div class="comment-text">'+c.text+'</div>'+
        '<div class="comment-time">'+c.time.slice(0,16)+'</div>'+
        replies+
        '<div style="margin-top:8px;display:flex;gap:4px"><input id="reply-'+c.id+'" placeholder="回复..." style="flex:1;padding:6px;border:1px solid #f8bbd0;border-radius:6px;font-size:0.85em"><button onclick="replyComment('+c.id+')" style="padding:6px 10px;border:none;background:#e91e63;color:white;border-radius:6px;font-size:0.85em;cursor:pointer">回复</button></div>'+
      '</div>';
    }).join('');
  });
}

function postComment(){
  const author=document.getElementById('c-author').value.trim();
  const text=document.getElementById('c-text').value.trim();
  const song_name=document.getElementById('c-song').value.trim();
  if(!author||!text){alert('请输入名字和评论');return;}
  fetch('/api/comment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({song_id:0,song_name,author,text,is_ai:false})})
  .then(()=>{document.getElementById('c-text').value='';loadComments();});
}

function replyComment(id){
  const input=document.getElementById('reply-'+id);
  const text=input.value.trim();
  if(!text)return;
  const author=document.getElementById('c-author').value.trim()||'匿名';
  fetch('/api/comment/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comment_id:id,author,text,is_ai:false})})
  .then(()=>{input.value='';loadComments();});
}

loadComments();
setInterval(loadComments,10000);
</script>
</body></html>`;
});

// --- /cookie page (single, no duplicate) ---
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
    const artists = (s.artists || s.ar || []).map(a => typeof a === 'string' ? a : a.name).join(', ');
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
  fetch('/api/song/url?id=' + id).then(r => r.json()).then(d => {
    if (d.data?.[0]?.url) {
      const audio = new Audio(d.data[0].url);
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
      '<div class="pl-card glass" onclick="loadPlaylistSongs(' + p.id + ',\'' + p.name.replace(/'/g, "\\'") + '\')">' +
        '<div class="pl-icon">📋</div>' +
        '<div class="pl-info"><div class="pl-name">' + p.name + '</div><div class="pl-meta">' + (p.trackCount || 0) + '首 · ' + (p.creator?.nickname || '') + '</div></div>' +
      '</div>'
    ).join('');
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
function loadLiked() {
  document.getElementById('liked-list').innerHTML = '<div class="loading">加载中</div>';
  fetch('/api/like/list?uid=' + UID).then(r => r.json()).then(d => {
    const ids = d.ids || [];
    if (!ids.length) { document.getElementById('liked-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">还没有喜欢的歌曲</div>'; return; }
    // Show first 50 with unlike button
    const showIds = ids.slice(0, 50);
    document.getElementById('liked-list').innerHTML = showIds.map((id, i) =>
      '<div class="song-item">' +
        '<div class="song-idx">' + (i + 1) + '</div>' +
        '<div class="song-info"><div class="song-title">歌曲 #' + id + '</div><div class="song-meta">ID: ' + id + '</div></div>' +
        '<div class="song-actions">' +
          '<button class="btn-play" onclick="playSong(' + id + ')">▶</button>' +
          '<button class="btn-del" onclick="unlikeSong(' + id + ')">💔</button>' +
        '</div></div>'
    ).join('');
  }).catch(() => {
    document.getElementById('liked-list').innerHTML = '<div style="text-align:center;color:#999;padding:20px">加载失败</div>';
  });
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
      return { ok: true, url: data.data[0].url };
    }
    return { ok: false, message: '无法获取播放链接' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

// 代理播放：服务端获取音频流转发给浏览器（CDN会拦截直接访问）
fastify.get('/api/proxy_play', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send('Missing song id');
  try {
    const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
    if (data.data && data.data[0] && data.data[0].url) {
      const cdnUrl = data.data[0].url;
      // 服务端请求CDN，带上Referer头绕过限制
      const resp = await fetch(cdnUrl, {
        headers: {
          'Referer': 'https://music.163.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://music.163.com'
        }
      });
      if (!resp.ok) {
        return reply.status(resp.status).send('CDN error');
      }
      // 设置正确的音频响应头
      reply.header('Content-Type', resp.headers.get('content-type') || 'audio/mpeg');
      reply.header('Content-Length', resp.headers.get('content-length'));
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'public, max-age=86400');
      // 流式转发
      return reply.send(resp.body);
    }
    return reply.status(404).send('Song not found');
  } catch (e) {
    console.log('[Proxy] Error:', e.message);
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
