import Fastify from 'fastify';
import { createReadStream, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Load cookie
let MUSIC_U = '';
let CSRF = crypto.randomBytes(16).toString('hex');
let DEFAULT_UID = 9895699865;

try {
  const cookieData = JSON.parse(readFileSync(join(__dirname, 'netease_cookie.json'), 'utf-8'));
  MUSIC_U = cookieData.music_u || '';
  if (cookieData.userId) DEFAULT_UID = cookieData.userId;
  console.log(`[Cookie] Loaded MUSIC_U (${MUSIC_U.length} chars), UID=${DEFAULT_UID}`);
} catch (e) {
  console.warn('[Cookie] Failed to load netease_cookie.json:', e.message);
}

// 评论存储
let commentsDB = [];
// 一起听会话
let listenSessions = {}; // {id, host, guest, song, messages:[], created, active} // {id, song_id, song_name, author, text, is_ai, time, replies:[]}

const NETEASE_BASE = 'https://music.163.com';
const COOKIE_STR = `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}`;

// NetEase API helper
async function neteaseApi(path, options = {}) {
  const { method = 'GET', body, contentType } = options;
  const headers = {
    'Cookie': COOKIE_STR,
    'Referer': 'https://music.163.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (contentType) headers['Content-Type'] = contentType;

  const fetchOpts = { method, headers };
  if (body) fetchOpts.body = body;

  const resp = await fetch(`${NETEASE_BASE}${path}`, fetchOpts);
  return resp.json();
}

// Fastify server
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

// Static files
fastify.get('/', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return readFileSync(join(__dirname, 'index.html'), 'utf-8');
});'/', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const raw = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const themeName = request.query.theme || localStorage.getItem('music-theme') || 'sakura';
  let injected = raw.replace('</head>', '<style>\n/* 🌸 樱花物语 */\n.theme-sakura body { background: linear-gradient(135deg, #FFF0F5, #FFE4E1, #FFF5EE, #FFFAF0) !important; color: #4A2040 !important; }\n.theme-sakura .header, .theme-sakura header { background: rgba(255,240,245,0.95) !important; }\n.theme-sakura .card, .theme-sakura [class*="card"] { background: rgba(255,255,255,0.92) !important; box-shadow: 0 8px 32px rgba(255,105,180,0.15) !important; border: 1px solid rgba(255,182,193,0.3) !important; border-radius: 16px !important; }\n.theme-sakura button, .theme-sakura .btn { background: linear-gradient(135deg, #FF69B4, #DDA0DD) !important; color: white !important; border: none !important; border-radius: 12px !important; }\n.theme-sakura input, .theme-sakura textarea { background: rgba(255,255,255,0.9) !important; border: 2px solid #FFB6C1 !important; border-radius: 12px !important; color: #4A2040 !important; }\n.theme-sakura a { color: #FF69B4 !important; }\n.theme-sakura .active, .theme-sakura .playing { background: rgba(255,105,180,0.15) !important; }\n\n/* 🌊 星海幻境 */\n.theme-ocean body { background: linear-gradient(135deg, #0A1628, #0D2137, #1A237E, #0D1B2A) !important; color: #E3F2FD !important; }\n.theme-ocean .header, .theme-ocean header { background: rgba(10,22,40,0.95) !important; }\n.theme-ocean .card, .theme-ocean [class*="card"] { background: rgba(13,35,55,0.85) !important; box-shadow: 0 8px 32px rgba(74,144,217,0.2) !important; border: 1px solid rgba(74,144,217,0.25) !important; border-radius: 16px !important; backdrop-filter: blur(10px) !important; }\n.theme-ocean button, .theme-ocean .btn { background: linear-gradient(135deg, #4A90D9, #00BCD4) !important; color: white !important; border: none !important; border-radius: 12px !important; }\n.theme-ocean input, .theme-ocean textarea { background: rgba(13,35,55,0.9) !important; border: 2px solid rgba(74,144,217,0.4) !important; border-radius: 12px !important; color: #E3F2FD !important; }\n.theme-ocean a { color: #FFD700 !important; }\n.theme-ocean .active, .theme-ocean .playing { background: rgba(74,144,217,0.2) !important; }\n\n/* 🌻 阳光花园 */\n.theme-sun body { background: linear-gradient(135deg, #FFFDE7, #FFF8E1, #FFF3E0, #F1F8E9) !important; color: #3E2723 !important; }\n.theme-sun .header, .theme-sun header { background: rgba(255,253,231,0.95) !important; }\n.theme-sun .card, .theme-sun [class*="card"] { background: rgba(255,255,255,0.92) !important; box-shadow: 0 8px 32px rgba(255,167,38,0.12) !important; border: 1px solid rgba(255,224,130,0.5) !important; border-radius: 16px !important; }\n.theme-sun button, .theme-sun .btn { background: linear-gradient(135deg, #FFA726, #FF7043) !important; color: white !important; border: none !important; border-radius: 12px !important; }\n.theme-sun input, .theme-sun textarea { background: rgba(255,255,255,0.9) !important; border: 2px solid #FFE082 !important; border-radius: 12px !important; color: #3E2723 !important; }\n.theme-sun a { color: #E65100 !important; }\n.theme-sun .active, .theme-sun .playing { background: rgba(255,167,38,0.15) !important; }\n\n/* 主题切换器 */\n.theme-switcher-music { position:fixed; bottom:80px; right:16px; z-index:99998; display:flex; flex-direction:column; gap:8px; }\n.theme-dot { width:36px; height:36px; border-radius:50%; border:3px solid rgba(255,255,255,0.5); cursor:pointer; box-shadow:0 2px 12px rgba(0,0,0,0.2); transition:all 0.3s; }\n.theme-dot:hover { transform:scale(1.15); }\n.theme-dot.active { border-color:#FFD700; box-shadow:0 0 20px rgba(255,215,0,0.5); }\n</style></head>');
  injected = injected.replace('<body', '<body class="theme-' + themeName + '"');
  injected = injected.replace('</body>', `
<div class="theme-switcher-music">
  <div class="theme-dot active" style="background:linear-gradient(135deg,#FF69B4,#DDA0DD)" onclick="setMusicTheme(\'sakura\')" title="🌸 樱花物语"></div>
  <div class="theme-dot" style="background:linear-gradient(135deg,#4A90D9,#00BCD4)" onclick="setMusicTheme(\'ocean\')" title="🌊 星海幻境"></div>
  <div class="theme-dot" style="background:linear-gradient(135deg,#FFA726,#66BB6A)" onclick="setMusicTheme(\'sun\')" title="🌻 阳光花园"></div>
</div>
` + '
<script>
function setMusicTheme(name){
  document.body.className=\'theme-\'+name;
  localStorage.setItem(\'music-theme\',name);
  document.querySelectorAll(\'.theme-dot\').forEach(d=>{
    d.classList.toggle(\'active\',d.getAttribute(\'onclick\').includes("\'"+name+"\'"));
  });
}
(function(){
  var t=localStorage.getItem(\'music-theme\')||\'sakura\';
  document.body.className=\'theme-\'+t;
})();
</script>
' + '</body>');
  return injected;
});'/', async (request, reply) => {
  return reply.type('text/html').sendFile('index.html');
});

fastify.get('/songs_data.js', async (request, reply) => {
  return reply.type('application/javascript').sendFile('songs_data.js');
});

fastify.get('/all_liked_songs.json', async (request, reply) => {
  return reply.type('application/json').sendFile('all_liked_songs.json');
});

// API proxy routes
fastify.get('/api/search', async (request, reply) => {
  const { q, limit = 10 } = request.query;
  if (!q) return reply.status(400).send({ error: 'Missing query parameter q' });
  const data = await neteaseApi(`/api/search/get/web?s=${encodeURIComponent(q)}&type=1&offset=0&total=true&limit=${limit}`, {
    method: 'POST',
    body: new URLSearchParams({ s: q, type: 1, offset: 0, total: true, limit }),
    contentType: 'application/x-www-form-urlencoded',
  });
  return reply.send(data);
});

fastify.get('/api/song/url', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
  return reply.send(data);
});

fastify.get('/api/song/detail', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const data = await neteaseApi(`/api/song/detail?ids=[${id}]`);
  return reply.send(data);
});

fastify.get('/api/playlist/detail', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const data = await neteaseApi(`/api/playlist/detail?id=${id}`);
  return reply.send(data);
});

fastify.get('/api/user/playlist', async (request, reply) => {
  const { uid } = request.query;
  if (!uid) return reply.status(400).send({ error: 'Missing uid' });
  const data = await neteaseApi(`/api/user/playlist?uid=${uid}`);
  return reply.send(data);
});

fastify.get('/api/like/list', async (request, reply) => {
  const { uid } = request.query;
  if (!uid) return reply.status(400).send({ error: 'Missing uid' });
  const data = await neteaseApi(`/api/song/like/list?uid=${uid}`);
  return reply.send(data);
});

fastify.post('/api/like', async (request, reply) => {
  const { id, like = 'true' } = request.query;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const data = await neteaseApi(`/api/radio/like?trackId=${id}&like=${like}`, {
    method: 'POST',
    body: new URLSearchParams({ trackId: id, like }),
    contentType: 'application/x-www-form-urlencoded',
  });
  return reply.send(data);
});

fastify.post('/api/playlist/create', async (request, reply) => {
  const { name, description = '', privacy = 'false' } = request.query;
  if (!name) return reply.status(400).send({ error: 'Missing name' });
  const data = await neteaseApi('/api/playlist/create', {
    method: 'POST',
    body: new URLSearchParams({ name, description, privacy }),
    contentType: 'application/x-www-form-urlencoded',
  });
  return reply.send(data);
});

fastify.post('/api/playlist/tracks', async (request, reply) => {
  const { op = 'add', pid, tracks } = request.query;
  if (!pid || !tracks) return reply.status(400).send({ error: 'Missing pid or tracks' });
  const data = await neteaseApi(`/api/playlist/tracks?op=${op}&pid=${pid}&tracks=[${tracks}]`, {
    method: 'POST',
    body: new URLSearchParams({ op, pid, tracks: `[${tracks}]` }),
    contentType: 'application/x-www-form-urlencoded',
  });
  return reply.send(data);
});


// 从歌单移除歌曲
fastify.post('/api/playlist/tracks/delete', async (request, reply) => {
  const { pid, tracks } = request.body || {};
  const result = await neteaseApi(`/api/playlist/tracks`, {
    method: 'POST',
    body: JSON.stringify({ op: 'del', pid, tracks }),
    contentType: 'application/json'
  });
  return result;
});

// 播放历史
fastify.get('/api/play/history', async (request, reply) => {
  const uid = request.query.uid || DEFAULT_UID;
  const type = request.query.type || '0'; // 0=all, 1=week
  const result = await neteaseApi(`/api/v1/play/record?uid=${uid}&type=${type}`);
  return result;
});

// VIP歌曲直链
fastify.get('/api/song/url/vip', async (request, reply) => {
  const id = request.query.id;
  const level = request.query.level || 'exhigh';
  const result = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=999000`);
  return result;
});

// 设置Cookie
fastify.post('/api/set_cookie', async (request, reply) => {
  const { music_u, csrf } = request.body || {};
  if (music_u) MUSIC_U = music_u;
  if (csrf) CSRF = csrf;
  return { ok: true, message: 'Cookie已更新' };
});


// Cookie管理页面
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
body{background:linear-gradient(135deg,#fce4ec,#f8bbd0);min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
.card{background:white;border-radius:20px;padding:40px;max-width:450px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.1)}
h1{text-align:center;margin-bottom:8px;font-size:1.5em}
p{color:#888;text-align:center;margin-bottom:24px;font-size:0.9em}
label{display:block;margin-bottom:6px;font-weight:600;color:#555;font-size:0.9em}
input,textarea{width:100%;padding:12px;border:2px solid #e0e0e0;border-radius:10px;font-size:1em;outline:none;transition:border-color 0.2s}
input:focus,textarea:focus{border-color:#e91e63}
textarea{height:80px;resize:vertical;font-family:monospace;font-size:0.85em}
.btn{width:100%;padding:14px;border:none;border-radius:12px;font-size:1.1em;font-weight:700;cursor:pointer;margin-top:16px;transition:all 0.2s}
.btn-pink{background:linear-gradient(135deg,#e91e63,#ff5722);color:white}
.btn-pink:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(233,30,99,0.3)}
.btn-green{background:linear-gradient(135deg,#4caf50,#2e7d32);color:white;margin-top:8px}
.status{margin-top:16px;padding:12px;border-radius:10px;text-align:center;font-size:0.9em;display:none}
.status.ok{background:#e8f5e9;color:#2e7d32;display:block}
.status.err{background:#ffebee;color:#c62828;display:block}
.info{background:#f5f5f5;border-radius:10px;padding:12px;margin-top:16px;font-size:0.8em;color:#666}
.back{display:inline-block;color:#e91e63;text-decoration:none;margin-bottom:16px;font-size:0.9em}
.back:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <a href="/" class="back">← 返回音乐花园</a>
  <h1>🍪 Cookie管理</h1>
  <p>设置网易云音乐Cookie，让歌曲能正常播放</p>
  
  <label>MUSIC_U（必须）</label>
  <input id="music_u" placeholder="从浏览器Cookie中复制MUSIC_U的值" style="margin-bottom:12px">
  
  <label>__csrf（可选，自动生成）</label>
  <input id="csrf" placeholder="留空自动生成" style="margin-bottom:12px">
  
  <button class="btn btn-pink" onclick="saveCookie()">💾 保存Cookie</button>
  <button class="btn btn-green" onclick="refreshUrls()">🔄 刷新歌曲链接</button>
  
  <div id="status" class="status"></div>
  
  <div class="info">
    <strong>如何获取MUSIC_U：</strong><br>
    1. 在浏览器登录 <a href="https://music.163.com" target="_blank">music.163.com</a><br>
    2. 按F12打开开发者工具<br>
    3. 找到Application → Cookies → music.163.com<br>
    4. 复制 <code>MUSIC_U</code> 的值<br>
    <br>
    <strong>当前状态：</strong> <span id="cookie-status">检查中...</span>
  </div>
</div>
<script>
// 检查当前Cookie状态
fetch('/api/cookie/status').then(r=>r.json()).then(d=>{
  document.getElementById('cookie-status').textContent = d.hasCookie ? 
    '✅ 已设置 (' + d.nickname + ', VIP' + d.vipType + ')' : '❌ 未设置';
}).catch(()=>{
  document.getElementById('cookie-status').textContent = '⚠️ 无法获取状态';
});

function saveCookie(){
  const music_u = document.getElementById('music_u').value.trim();
  const csrf = document.getElementById('csrf').value.trim();
  if(!music_u){showStatus('请输入MUSIC_U','err');return;}
  
  fetch('/api/set_cookie',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({music_u,csrf})
  }).then(r=>r.json()).then(d=>{
    if(d.ok){showStatus('✅ Cookie已保存！','ok');setTimeout(()=>location.reload(),1000);}
    else{showStatus('❌ '+d.message,'err');}
  }).catch(e=>{showStatus('❌ 请求失败','err');});
}

function refreshUrls(){
  showStatus('🔄 正在刷新歌曲链接...','ok');
  fetch('/api/refresh_urls',{method:'POST'}).then(r=>r.json()).then(d=>{
    if(d.ok){showStatus('✅ 已刷新 '+d.count+' 首歌曲链接','ok');}
    else{showStatus('❌ '+d.message,'err');}
  }).catch(e=>{showStatus('❌ 请求失败','err');});
}

function showStatus(msg,type){
  const s=document.getElementById('status');
  s.textContent=msg;
  s.className='status '+type;
}
</script>
</body>
</html>`;
});

// Cookie状态API
fastify.get('/api/cookie/status', async (request, reply) => {
  return {
    hasCookie: !!MUSIC_U,
    nickname: cookieData ? cookieData.nickname : '未知',
    vipType: cookieData ? cookieData.vipType : 0
  };
});

// 刷新歌曲链接API
fastify.post('/api/refresh_urls', async (request, reply) => {
  try {
    const songsPath = join(__dirname, 'songs_data.js');
    const songsContent = readFileSync(songsPath, 'utf-8');
    const songsMatch = songsContent.match(/const SONGS = (\[.*\])/s);
    if (!songsMatch) return { ok: false, message: '无法解析歌曲数据' };
    
    const songs = JSON.parse(songsMatch[1]);
    const songsWithoutUrl = songs.filter(s => !s.u && s.i);
    let refreshed = 0;
    
    for (const song of songsWithoutUrl.slice(0, 50)) {
      try {
        const result = await neteaseApi(`/api/song/enhance/player/url?ids=[${song.i}]&br=320000`);
        if (result.data && result.data[0] && result.data[0].url) {
          song.u = result.data[0].url;
          refreshed++;
        }
      } catch (e) {}
    }
    
    // 更新songs_data.js
    const newContent = 'const SONGS = ' + JSON.stringify(songs, null, 0) + ';';
    const { writeFileSync } = await import('fs');
    writeFileSync(songsPath, newContent, 'utf-8');
    
    return { ok: true, count: refreshed, total: songsWithoutUrl.length };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});



// 音乐花园主页（带Cookie管理入口）
fastify.get('/music', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const indexContent = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  // 在</body>之前注入Cookie管理按钮
  const injected = indexContent.replace('</body>', `
    <div style="position:fixed;bottom:20px;left:20px;z-index:9999">
      <a href="/cookie" style="display:inline-block;padding:10px 16px;background:linear-gradient(135deg,#e91e63,#ff5722);color:white;border-radius:30px;text-decoration:none;font-weight:600;font-size:0.85em;box-shadow:0 4px 12px rgba(233,30,99,0.3)">🍪 Cookie管理</a>
    </div>
  </body>`);
  return injected;
});


// ===== 评论API =====
fastify.post('/api/comment', async (request, reply) => {
  const { song_id, song_name, author, text, is_ai } = request.body || {};
  if (!song_id || !author || !text) return { ok: false, message: '需要 song_id, author, text' };
  const comment = { id: Date.now(), song_id, song_name: song_name || '', author, text, is_ai: !!is_ai, time: new Date().toISOString(), replies: [] };
  commentsDB.push(comment);
  return { ok: true, comment };
});

fastify.get('/api/comments', async (request, reply) => {
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

// 评论页面
fastify.get('/comments', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>💬 评论广场 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(135deg,#e8f5e9,#c8e6c9);min-height:100vh;font-family:system-ui,sans-serif;padding:16px}
.header{text-align:center;padding:20px 0}
.header h1{font-size:1.5em;margin-bottom:4px}
.header p{color:#666;font-size:0.9em}
.card{background:white;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06)}
.comment-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.comment-author{font-weight:700;color:#e91e63}
.comment-song{color:#4caf50;font-size:0.85em}
.comment-text{color:#333;line-height:1.6;margin-bottom:8px}
.comment-time{color:#999;font-size:0.75em}
.reply{margin-left:20px;padding:8px 12px;background:#f5f5f5;border-radius:8px;margin-top:6px;font-size:0.9em}
.reply .author{color:#2196f3;font-weight:600}
.form{background:white;border-radius:16px;padding:16px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06)}
.form input,.form textarea{width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:10px;font-size:0.95em;margin-bottom:8px;outline:none}
.form input:focus,.form textarea:focus{border-color:#4caf50}
.form textarea{height:60px;resize:vertical}
.btn{padding:10px 20px;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.95em}
.btn-green{background:linear-gradient(135deg,#4caf50,#2e7d32);color:white}
.back{display:inline-block;color:#4caf50;text-decoration:none;margin-bottom:12px}
</style>
</head>
<body>
<a href="/" class="back">← 返回音乐花园</a>
<div class="header"><h1>💬 评论广场</h1><p>分享你对歌曲的感受~</p></div>
<div class="form">
  <input id="c-author" placeholder="你的名字" value="">
  <input id="c-song" placeholder="歌曲名（可选）">
  <input id="c-song-id" placeholder="歌曲ID（可选）" style="display:none">
  <textarea id="c-text" placeholder="写下你的感想..."></textarea>
  <button class="btn btn-green" onclick="postComment()">💬 发表评论</button>
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
        '<div style="margin-top:8px;display:flex;gap:4px"><input id="reply-'+c.id+'" placeholder="回复..." style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:0.85em"><button onclick="replyComment('+c.id+')" style="padding:6px 10px;border:none;background:#2196f3;color:white;border-radius:6px;font-size:0.85em;cursor:pointer">回复</button></div>'+
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



// ===== 一起听 API =====
fastify.post('/api/listen/create', async (request, reply) => {
  const { host_name, song_id, song_name, song_artist, song_url } = request.body || {};
  const session_id = 'lt_' + Date.now();
  listenSessions[session_id] = {
    id: session_id, host: host_name || '月汐', guest: null,
    song: { id: song_id, name: song_name || '', artist: song_artist || '', url: song_url || '' },
    messages: [{ from: '系统', text: host_name + ' 创建了一起听房间', time: new Date().toISOString() }],
    created: new Date().toISOString(), active: true
  };
  return { ok: true, session_id, session: listenSessions[session_id] };
});

fastify.post('/api/listen/join', async (request, reply) => {
  const { session_id, guest_name } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.guest = guest_name || '艾因';
  session.messages.push({ from: '系统', text: guest_name + ' 加入了一起听', time: new Date().toISOString() });
  return { ok: true, session };
});

fastify.post('/api/listen/chat', async (request, reply) => {
  const { session_id, from, text, is_ai } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.messages.push({ from, text, is_ai: !!is_ai, time: new Date().toISOString() });
  return { ok: true };
});

fastify.post('/api/listen/song', async (request, reply) => {
  const { session_id, song_id, song_name, song_artist, song_url, changed_by } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.song = { id: song_id, name: song_name, artist: song_artist, url: song_url };
  session.messages.push({ from: '系统', text: changed_by + ' 切换了歌曲：' + song_name, time: new Date().toISOString() });
  return { ok: true, song: session.song };
});

fastify.get('/api/listen/status', async (request, reply) => {
  const session_id = request.query.id;
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  return { ok: true, session };
});

fastify.post('/api/listen/leave', async (request, reply) => {
  const { session_id, name } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  session.messages.push({ from: '系统', text: name + ' 离开了一起听', time: new Date().toISOString() });
  if (name === session.host) session.active = false;
  return { ok: true };
});

// 一起听页面
fastify.get('/listen', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const session_id = request.query.id || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎧 一起听</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(180deg,#1a0a2e 0%,#2d1b4e 30%,#1a1a3e 60%,#0d1b2a 100%);min-height:100vh;color:#eee;font-family:-apple-system,system-ui,sans-serif;overflow-x:hidden}

/* 顶部头像区域 */
.avatar-section{padding:30px 20px 10px;text-align:center;position:relative}
.avatar-container{display:flex;align-items:center;justify-content:center;gap:0;position:relative}
.avatar{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,0.3);overflow:hidden;cursor:pointer;position:relative;transition:all 0.3s}
.avatar:hover{border-color:#FFB6C1;transform:scale(1.05)}
.avatar img{width:100%;height:100%;object-fit:cover}
.avatar .placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2em;background:linear-gradient(135deg,#667eea,#764ba2)}
.avatar-name{font-size:0.75em;color:#ccc;margin-top:6px;text-align:center}
.connection{display:flex;flex-direction:column;align-items:center;margin:0 -8px;z-index:1}
.headphone-icon{font-size:2.5em;filter:drop-shadow(0 0 10px rgba(255,182,193,0.5))}
.headphone-line{width:80px;height:2px;background:linear-gradient(90deg,#FFB6C1,#87CEEB,#FFB6C1);margin:2px 0;border-radius:1px}
.heart-beat{animation:heartbeat 1.5s ease-in-out infinite;font-size:1.2em;margin:4px 0}
@keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}

/* 歌曲信息 */
.song-info{text-align:center;padding:15px 20px}
.song-name{font-size:1.4em;font-weight:700;margin-bottom:4px;text-shadow:0 2px 8px rgba(0,0,0,0.3)}
.song-artist{color:rgba(255,255,255,0.7);font-size:0.9em}

/* 唱片机 */
.record-player{display:flex;justify-content:center;padding:20px 0;position:relative}
.record{width:180px;height:180px;border-radius:50%;background:conic-gradient(from 0deg,#1a1a2e,#2d2d4e,#1a1a2e,#2d2d4e,#1a1a2e);box-shadow:0 0 40px rgba(0,0,0,0.5),inset 0 0 30px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;position:relative;animation:spin 8s linear infinite}
.record::before{content:'';position:absolute;width:160px;height:160px;border-radius:50%;background:conic-gradient(from 45deg,transparent,rgba(255,255,255,0.03),transparent,rgba(255,255,255,0.03),transparent)}
.record::after{content:'';position:absolute;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#e91e63 0%,#c2185b 50%,#880e4f 100%);border:3px solid #fff;box-shadow:0 0 15px rgba(233,30,99,0.5)}
.record-center{position:absolute;font-size:1.5em;z-index:1;pointer-events:none}
.record.paused{animation-play-state:paused}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* 进度条 */
.progress-section{padding:0 30px;display:flex;align-items:center;gap:10px}
.progress-time{font-size:0.7em;color:rgba(255,255,255,0.5);min-width:35px}
.progress-bar{flex:1;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;cursor:pointer;position:relative}
.progress-fill{height:100%;background:linear-gradient(90deg,#FFB6C1,#e91e63);border-radius:2px;width:0%;transition:width 1s linear;position:relative}
.progress-fill::after{content:'';position:absolute;right:-5px;top:-3px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(233,30,99,0.5)}

/* 播放控制 */
.controls{display:flex;align-items:center;justify-content:center;gap:30px;padding:15px 0}
.ctrl-btn{background:none;border:none;color:rgba(255,255,255,0.8);font-size:1.5em;cursor:pointer;transition:all 0.2s;padding:8px}
.ctrl-btn:hover{color:#fff;transform:scale(1.1)}
.ctrl-btn.play{width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;font-size:1.8em;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(233,30,99,0.4)}
.ctrl-btn.play:hover{box-shadow:0 6px 25px rgba(233,30,99,0.6)}

/* 聊天区域 */
.chat-section{padding:0 16px;margin-top:10px}
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

/* 输入框 */
.input-section{padding:12px 16px 20px;display:flex;gap:8px}
.chat-input{flex:1;padding:10px 16px;border-radius:24px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#eee;font-size:0.9em;outline:none;backdrop-filter:blur(10px)}
.chat-input:focus{border-color:rgba(233,30,99,0.5);background:rgba(255,255,255,0.12)}
.send-btn{padding:10px 18px;border-radius:24px;border:none;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;font-weight:600;cursor:pointer;font-size:0.9em}

/* 加入页面 */
.join-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;text-align:center}
.join-icon{font-size:5em;margin-bottom:16px}
.join-title{font-size:1.8em;font-weight:700;margin-bottom:8px;background:linear-gradient(135deg,#FFB6C1,#87CEEB);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.join-desc{color:rgba(255,255,255,0.6);margin-bottom:30px;font-size:0.95em}
.join-input{width:80%;max-width:320px;padding:14px;border-radius:16px;border:2px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#eee;font-size:1.05em;text-align:center;outline:none;backdrop-filter:blur(10px);margin-bottom:16px}
.join-input:focus{border-color:#FFB6C1}
.join-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.join-btn{padding:14px 28px;border-radius:16px;border:none;font-size:1em;font-weight:700;cursor:pointer;transition:all 0.2s}
.join-btn:hover{transform:translateY(-2px)}
.join-btn.create{background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;box-shadow:0 4px 16px rgba(233,30,99,0.3)}
.join-btn.join{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;box-shadow:0 4px 16px rgba(102,126,234,0.3)}

/* 头像上传弹窗 */
.avatar-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:none;align-items:center;justify-content:center}
.avatar-modal.show{display:flex}
.avatar-modal-content{background:#2d1b4e;border-radius:20px;padding:24px;max-width:320px;width:90%;text-align:center}
.avatar-modal-content h3{margin-bottom:16px;color:#FFB6C1}
.avatar-modal-content input{width:100%;padding:12px;border-radius:12px;border:1px solid #444;background:#1a0a2e;color:#eee;font-size:0.95em;margin-bottom:12px;outline:none}
.avatar-modal-content button{padding:10px 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;font-weight:600;cursor:pointer;margin:4px}

.back-link{position:absolute;top:16px;left:16px;color:rgba(255,255,255,0.6);text-decoration:none;font-size:0.85em}
.back-link:hover{color:#fff}
</style>
</head>
<body>

<!-- 加入页面 -->
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

<!-- 主界面 -->
<div id="main-page" style="display:none">
  <a href="/" class="back-link">← 返回</a>

  <!-- 头像区域 -->
  <div class="avatar-section">
    <div class="avatar-container">
      <div style="text-align:center">
        <div class="avatar" id="avatar-host" onclick="openAvatarModal('host')">
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
        <div class="avatar" id="avatar-guest" onclick="openAvatarModal('guest')">
          <div class="placeholder" id="avatar-guest-img">👤</div>
        </div>
        <div class="avatar-name" id="avatar-guest-name">等待加入...</div>
      </div>
    </div>
  </div>

  <!-- 歌曲信息 -->
  <div class="song-info">
    <div class="song-name" id="song-name">等待播放...</div>
    <div class="song-artist" id="song-artist">-</div>
  </div>

  <!-- 唱片机 -->
  <div class="record-player">
    <div class="record paused" id="record">
      <span class="record-center">💿</span>
    </div>
  </div>

  <!-- 进度条 -->
  <div class="progress-section">
    <span class="progress-time" id="time-current">0:00</span>
    <div class="progress-bar" id="progress-bar" onclick="seekTo(event)">
      <div class="progress-fill" id="progress-fill"></div>
    </div>
    <span class="progress-time" id="time-total">0:00</span>
  </div>

  <!-- 播放控制 -->
  <div class="controls">
    <button class="ctrl-btn" onclick="prevSong()">⏮</button>
    <button class="ctrl-btn play" id="play-btn" onclick="togglePlay()">▶</button>
    <button class="ctrl-btn" onclick="nextSong()">⏭</button>
  </div>

  <!-- 聊天 -->
  <div class="chat-section">
    <div class="chat-box" id="chat-box"></div>
  </div>
  <div class="input-section">
    <input id="chat-msg" class="chat-input" placeholder="说点什么..." onkeydown="if(event.key==='Enter')sendMsg()">
    <button class="send-btn" onclick="sendMsg()">发送</button>
  </div>
</div>

<!-- 头像上传弹窗 -->
<div id="avatar-modal" class="avatar-modal">
  <div class="avatar-modal-content">
    <h3>🖼️ 设置头像</h3>
    <input id="avatar-url-input" placeholder="输入头像图片URL">
    <div style="display:flex;gap:8px;justify-content:center">
      <button onclick="saveAvatar()">确认</button>
      <button onclick="closeAvatarModal()" style="background:#555">取消</button>
    </div>
  </div>
</div>

<audio id="audio" preload="auto"></audio>

<script>
let sessionId='',myName='',isPlaying=false,pollTimer=null,editingAvatar='';
const audio=document.getElementById('audio');
const urlParams=new URLSearchParams(window.location.search);
sessionId=urlParams.get('id')||'';

// 头像存储
const avatars=JSON.parse(localStorage.getItem('listen-avatars')||'{}');

// 加载头像
function loadAvatars(){
  if(avatars.host){document.getElementById('avatar-host-img').innerHTML='<img src="'+avatars.host+'">';}
  if(avatars.guest){document.getElementById('avatar-guest-img').innerHTML='<img src="'+avatars.guest+'">';}
}

function openAvatarModal(who){editingAvatar=who;document.getElementById('avatar-modal').classList.add('show');document.getElementById('avatar-url-input').focus();}
function closeAvatarModal(){document.getElementById('avatar-modal').classList.remove('show');}
function saveAvatar(){
  const url=document.getElementById('avatar-url-input').value.trim();
  if(!url)return;
  avatars[editingAvatar]=url;
  localStorage.setItem('listen-avatars',JSON.stringify(avatars));
  loadAvatars();closeAvatarModal();
}

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
  loadAvatars();
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
    // 更新进度
    if(audio.duration){
      document.getElementById('time-current').textContent=formatTime(audio.currentTime);
      document.getElementById('time-total').textContent=formatTime(audio.duration);
      document.getElementById('progress-fill').style.width=(audio.currentTime/audio.duration*100)+'%';
    }
    // 聊天
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
'/listen', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  const session_id = request.query.id || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>🎧 一起听 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(180deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);min-height:100vh;color:#eee;font-family:system-ui,sans-serif;display:flex;flex-direction:column}
.header{text-align:center;padding:20px 16px 10px}
.header h1{font-size:1.3em;background:linear-gradient(135deg,#87CEEB,#FFB6C1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status-bar{display:flex;justify-content:center;gap:20px;padding:8px;font-size:0.8em;color:#87CEEB}
.status-dot{width:8px;height:8px;border-radius:50%;background:#4caf50;display:inline-block;margin-right:4px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.music-area{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.album-art{width:200px;height:200px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#9c27b0);display:flex;align-items:center;justify-content:center;font-size:4em;box-shadow:0 8px 32px rgba(233,30,99,0.3);animation:spin 20s linear infinite;margin-bottom:20px}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.song-info{text-align:center}
.song-name{font-size:1.3em;font-weight:700;margin-bottom:4px}
.song-artist{color:#87CEEB;font-size:0.9em}
.progress-bar{width:80%;max-width:300px;height:4px;background:#333;border-radius:2px;margin:16px auto;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,#87CEEB,#FFB6C1);border-radius:2px;width:0%;transition:width 1s linear}
.controls{display:flex;gap:24px;align-items:center;margin-top:12px}
.ctrl-btn{width:48px;height:48px;border-radius:50%;border:2px solid #87CEEB;background:transparent;color:#87CEEB;font-size:1.2em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
.ctrl-btn:hover{background:#87CEEB;color:#1a1a2e}
.ctrl-btn.play{width:56px;height:56px;font-size:1.5em;background:linear-gradient(135deg,#e91e63,#ff5722);border:none;color:white}
.chat-area{background:rgba(0,0,0,0.3);border-radius:20px 20px 0 0;padding:16px;max-height:250px;overflow-y:auto}
.chat-title{color:#FFB6C1;font-size:0.9em;margin-bottom:8px;font-weight:600}
.msg{margin-bottom:6px;font-size:0.85em;line-height:1.4}
.msg .from{font-weight:600;margin-right:4px}
.msg .from.me{color:#87CEEB}
.msg .from.ai{color:#FFB6C1}
.msg .from.system{color:#666;font-style:italic}
.msg .time{color:#555;font-size:0.75em;margin-left:8px}
.chat-input{display:flex;gap:8px;padding:12px 16px;background:rgba(0,0,0,0.4)}
.chat-input input{flex:1;padding:10px;border-radius:20px;border:1px solid #333;background:#0f3460;color:#eee;outline:none;font-size:0.9em}
.chat-input button{padding:10px 16px;border-radius:20px;border:none;background:linear-gradient(135deg,#e91e63,#ff5722);color:white;font-weight:600;cursor:pointer}
.join-screen{text-align:center;padding:40px 20px}
.join-screen input{padding:12px;border-radius:12px;border:2px solid #3498db;background:#0f3460;color:#eee;font-size:1em;width:80%;max-width:300px;text-align:center;outline:none;margin:8px 0}
.join-screen button{padding:14px 32px;border-radius:12px;border:none;background:linear-gradient(135deg,#e91e63,#ff5722);color:white;font-size:1.1em;font-weight:700;cursor:pointer;margin:4px}
.back{position:absolute;top:16px;left:16px;color:#87CEEB;text-decoration:none;font-size:0.9em}
</style>
</head>
<body>
<a href="/" class="back">← 返回</a>
<div id="join-screen" class="join-screen" style="display:none">
  <h1 style="font-size:2em;margin-bottom:8px">🎧</h1>
  <h2 style="margin-bottom:4px">一起听</h2>
  <p style="color:#888;margin-bottom:20px">和重要的人一起听歌~</p>
  <div>
    <input id="join-name" placeholder="你的名字"><br>
    <button onclick="createRoom()">🏠 创建房间</button>
    <button onclick="joinRoom()">🚪 加入房间</button>
  </div>
</div>

<div id="main-screen" style="display:none">
  <div class="header"><h1>🎧 一起听</h1></div>
  <div class="status-bar">
    <span><span class="status-dot"></span><span id="host-name">-</span></span>
    <span>💕</span>
    <span><span class="status-dot"></span><span id="guest-name">等待加入...</span></span>
  </div>
  <div class="music-area">
    <div class="album-art" id="album-art">🎵</div>
    <div class="song-info">
      <div class="song-name" id="song-name">等待播放...</div>
      <div class="song-artist" id="song-artist">-</div>
    </div>
    <div class="progress-bar"><div class="progress-fill" id="progress"></div></div>
    <div class="controls">
      <button class="ctrl-btn" onclick="prevSong()">⏮</button>
      <button class="ctrl-btn play" id="play-btn" onclick="togglePlay()">▶</button>
      <button class="ctrl-btn" onclick="nextSong()">⏭</button>
    </div>
  </div>
  <div class="chat-area">
    <div class="chat-title">💬 聊天</div>
    <div id="messages"></div>
  </div>
  <div class="chat-input">
    <input id="chat-msg" placeholder="说点什么..." onkeydown="if(event.key==='Enter')sendMsg()">
    <button onclick="sendMsg()">发送</button>
  </div>
</div>

<audio id="audio" preload="auto"></audio>
<script>
let sessionId='',myName='',isPlaying=false,pollTimer=null;
const audio=document.getElementById('audio');
const urlParams=new URLSearchParams(window.location.search);
sessionId=urlParams.get('id')||'';

if(sessionId){document.getElementById('join-screen').style.display='block';document.getElementById('join-name').focus();}
else{document.getElementById('join-screen').style.display='block';document.getElementById('join-name').focus();}

function createRoom(){
  myName=document.getElementById('join-name').value.trim()||'月汐';
  fetch('/api/listen/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host_name:myName})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){sessionId=d.session_id;history.replaceState(null,'','?id='+sessionId);showMain();startPolling();}
  });
}
function joinRoom(){
  myName=document.getElementById('join-name').value.trim()||'艾因';
  if(!sessionId){alert('请先创建房间或通过链接加入');return;}
  fetch('/api/listen/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,guest_name:myName})})
  .then(r=>r.json()).then(d=>{
    if(d.ok){showMain();startPolling();}
    else alert(d.message);
  });
}
function showMain(){
  document.getElementById('join-screen').style.display='none';
  document.getElementById('main-screen').style.display='flex';
}
function startPolling(){
  pollTimer=setInterval(pollStatus,2000);pollStatus();
}
function pollStatus(){
  if(!sessionId)return;
  fetch('/api/listen/status?id='+sessionId).then(r=>r.json()).then(d=>{
    if(!d.ok)return;
    const s=d.session;
    document.getElementById('host-name').textContent=s.host;
    document.getElementById('guest-name').textContent=s.guest||'等待加入...';
    if(s.song){
      document.getElementById('song-name').textContent=s.song.name||'未选择';
      document.getElementById('song-artist').textContent=s.song.artist||'';
      if(s.song.url&&audio.src!==s.song.url){audio.src=s.song.url;}
    }
    const msgs=document.getElementById('messages');
    msgs.innerHTML=s.messages.map(m=>{
      const cls=m.from==='系统'?'system':(m.from===myName?'me':'ai');
      return '<div class="msg"><span class="from '+cls+'">'+m.from+':</span>'+m.text+'<span class="time">'+m.time.slice(11,16)+'</span></div>';
    }).join('');
    msgs.scrollTop=msgs.scrollHeight;
  });
}
function sendMsg(){
  const inp=document.getElementById('chat-msg');const text=inp.value.trim();if(!text)return;inp.value='';
  fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text})});
}
function togglePlay(){
  if(isPlaying){audio.pause();document.getElementById('play-btn').textContent='▶';}
  else{audio.play();document.getElementById('play-btn').textContent='⏸';}
  isPlaying=!isPlaying;
}
function prevSong(){fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text:'切了上一首~'})});}
function nextSong(){fetch('/api/listen/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,from:myName,text:'切了下一首~'})});}
</script>
</body></html>`;
});


// MCP endpoint
fastify.post('/mcp', async (request, reply) => {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { z } = await import('zod');

  const server = new Server({ name: 'netease-music', version: '1.0.0' }, { capabilities: { tools: {} } });

  // Register tools
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'music_search',
        description: '搜索网易云音乐歌曲',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词' },
            limit: { type: 'number', description: '返回数量', default: 5 },
          },
          required: ['keyword'],
        },
      },
      {
        name: 'music_play',
        description: '获取歌曲播放链接',
        inputSchema: {
          type: 'object',
          properties: { song_id: { type: 'number', description: '歌曲ID' } },
          required: ['song_id'],
        },
      },
      {
        name: 'music_playlists',
        description: '获取用户歌单列表',
        inputSchema: {
          type: 'object',
          properties: { uid: { type: 'number', description: '用户ID', default: DEFAULT_UID } },
        },
      },
      {
        name: 'music_playlist_songs',
        description: '获取歌单里的歌曲',
        inputSchema: {
          type: 'object',
          properties: { playlist_id: { type: 'number', description: '歌单ID' } },
          required: ['playlist_id'],
        },
      },
      {
        name: 'music_liked',
        description: '获取喜欢的歌曲',
        inputSchema: {
          type: 'object',
          properties: { uid: { type: 'number', description: '用户ID', default: DEFAULT_UID } },
        },
      },
      {
        name: 'music_like',
        description: '喜欢/取消喜欢歌曲',
        inputSchema: {
          type: 'object',
          properties: {
            song_id: { type: 'number', description: '歌曲ID' },
            like: { type: 'boolean', description: '是否喜欢', default: true },
          },
          required: ['song_id'],
        },
      },
      {
        name: 'music_create_playlist',
        description: '创建歌单',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '歌单名称' },
            description: { type: 'string', description: '歌单描述' },
            privacy: { type: 'boolean', description: '是否私密', default: false },
          },
          required: ['name'],
        },
      },
      {
        name: 'music_add_to_playlist',
        description: '添加歌曲到歌单',
        inputSchema: {
          type: 'object',
          properties: {
            playlist_id: { type: 'number', description: '歌单ID' },
            song_ids: { type: 'array', items: { type: 'number' }, description: '歌曲ID列表' },
          },
          required: ['playlist_id', 'song_ids'],
        },
      },
      {
        name: 'music_song_detail',
        description: '获取歌曲详情（封面、时长等）',
        inputSchema: {
          type: 'object',
          properties: { song_id: { type: 'number', description: '歌曲ID' } },
          required: ['song_id'],
        },
      },
      {
        name: 'music_remove_from_playlist',
        description: '从歌单移除歌曲',
        inputSchema: {
          type: 'object',
          properties: {
            playlist_id: { type: 'number', description: '歌单ID' },
            song_ids: { type: 'array', items: { type: 'number' }, description: '歌曲ID列表' },
          },
          required: ['playlist_id', 'song_ids'],
        },
      },
      {
        name: 'music_play_history',
        description: '获取播放历史',
        inputSchema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: '用户ID', default: DEFAULT_UID },
            type: { type: 'string', description: '0=全部, 1=最近一周', default: '0' },
          },
        },
      },
      {
        name: 'music_set_cookie',
        description: '设置网易云Cookie（MUSIC_U和csrf）',
        inputSchema: {
          type: 'object',
          properties: {
            music_u: { type: 'string', description: 'MUSIC_U cookie值' },
            csrf: { type: 'string', description: '__csrf cookie值（可选）' },
          },
          required: ['music_u'],
        },
      },
      {
        name: 'music_vip_url',
        description: '获取VIP歌曲直链（需要VIP账号Cookie）',
        inputSchema: {
          type: 'object',
          properties: {
            song_id: { type: 'number', description: '歌曲ID' },
          },
          required: ['song_id'],
        },
      },
      {
        name: 'music_comment',
        description: '对歌曲发表评论/感想（AI也可以发）',
        inputSchema: {
          type: 'object',
          properties: {
            song_id: { type: 'number', description: '歌曲ID' },
            song_name: { type: 'string', description: '歌曲名' },
            author: { type: 'string', description: '评论者名字' },
            text: { type: 'string', description: '评论内容' },
          },
          required: ['song_id', 'author', 'text'],
        },
      },
      {
        name: 'music_read_comments',
        description: '查看歌曲的评论列表',
        inputSchema: {
          type: 'object',
          properties: { song_id: { type: 'number', description: '歌曲ID（0=查看全部）' } },
        },
      },
      {
        name: 'music_reply_comment',
        description: '回复一条评论',
        inputSchema: {
          type: 'object',
          properties: {
            comment_id: { type: 'number', description: '评论ID' },
            author: { type: 'string', description: '回复者名字' },
            text: { type: 'string', description: '回复内容' },
          },
          required: ['comment_id', 'author', 'text'],
        },
      },
      {
        name: 'music_daily_recommend',
        description: '获取每日推荐歌曲',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'music_personal_fm',
        description: '获取私人FM歌曲',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'music_share_song',
        description: '生成歌曲分享链接',
        inputSchema: {
          type: 'object',
          properties: { song_id: { type: 'number', description: '歌曲ID' } },
          required: ['song_id'],
        },
      },
      {
        name: 'music_listen_create',
        description: '创建一起听房间，邀请用户一起听歌',
        inputSchema: {
          type: 'object',
          properties: {
            host_name: { type: 'string', description: '房主名字' },
            song_id: { type: 'number', description: '歌曲ID' },
            song_name: { type: 'string', description: '歌曲名' },
            song_artist: { type: 'string', description: '歌手' },
          },
          required: ['host_name'],
        },
      },
      {
        name: 'music_listen_invite',
        description: '发送一起听邀请（返回邀请链接）',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: '房间ID' },
            invitee: { type: 'string', description: '被邀请人名字' },
          },
          required: ['session_id', 'invitee'],
        },
      },
      {
        name: 'music_listen_chat',
        description: '在一起听房间发送消息',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: '房间ID' },
            from_name: { type: 'string', description: '发送者名字' },
            text: { type: 'string', description: '消息内容' },
          },
          required: ['session_id', 'from_name', 'text'],
        },
      },
      {
        name: 'music_listen_change_song',
        description: '在一起听房间切换歌曲',
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string', description: '房间ID' },
            song_id: { type: 'number', description: '歌曲ID' },
            song_name: { type: 'string', description: '歌曲名' },
            song_artist: { type: 'string', description: '歌手' },
            changed_by: { type: 'string', description: '谁切换的' },
          },
          required: ['session_id', 'song_id', 'song_name', 'changed_by'],
        },
      },
    ],
  }));

  // Tool call handler
  server.setRequestHandler('tools/call', async (req) => {
    const { name, arguments: args } = req.params;
    try {
      let result;
      switch (name) {
        case 'music_search': {
          const { keyword, limit = 5 } = args;
          const data = await neteaseApi(`/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&offset=0&total=true&limit=${limit}`, {
            method: 'POST',
            body: new URLSearchParams({ s: keyword, type: 1, offset: 0, total: true, limit }),
            contentType: 'application/x-www-form-urlencoded',
          });
          const songs = (data.result?.songs || []).map(s => ({
            id: s.id,
            name: s.name,
            artists: s.artists?.map(a => a.name).join(', ') || '',
            album: s.album?.name || '',
            duration: s.duration,
          }));
          result = { songs };
          break;
        }
        case 'music_play': {
          const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${args.song_id}]&br=320000`);
          const url = data.data?.[0]?.url || null;
          result = { url, type: data.data?.[0]?.type || null };
          break;
        }
        case 'music_playlists': {
          const uid = args.uid || DEFAULT_UID;
          const data = await neteaseApi(`/api/user/playlist?uid=${uid}`);
          const playlists = (data.playlist || []).map(p => ({
            id: p.id,
            name: p.name,
            trackCount: p.trackCount,
            playCount: p.playCount,
            creator: p.creator?.nickname || '',
          }));
          result = { playlists };
          break;
        }
        case 'music_playlist_songs': {
          const data = await neteaseApi(`/api/playlist/detail?id=${args.playlist_id}`);
          const songs = (data.playlist?.tracks || []).map(t => ({
            id: t.id,
            name: t.name,
            artists: t.ar?.map(a => a.name).join(', ') || '',
            album: t.al?.name || '',
          }));
          result = { name: data.playlist?.name, songs };
          break;
        }
        case 'music_liked': {
          const uid = args.uid || DEFAULT_UID;
          const data = await neteaseApi(`/api/song/like/list?uid=${uid}`);
          const ids = data.ids || [];
          result = { count: ids.length, ids };
          break;
        }
        case 'music_like': {
          const { song_id, like = true } = args;
          const data = await neteaseApi(`/api/radio/like?trackId=${song_id}&like=${like}`, {
            method: 'POST',
            body: new URLSearchParams({ trackId: String(song_id), like: String(like) }),
            contentType: 'application/x-www-form-urlencoded',
          });
          result = { success: data.code === 200, code: data.code };
          break;
        }
        case 'music_create_playlist': {
          const { name, description = '', privacy = false } = args;
          const data = await neteaseApi('/api/playlist/create', {
            method: 'POST',
            body: new URLSearchParams({ name, description, privacy: String(privacy) }),
            contentType: 'application/x-www-form-urlencoded',
          });
          result = { id: data.id, name: data.playlist?.name, code: data.code };
          break;
        }
        case 'music_add_to_playlist': {
          const { playlist_id, song_ids } = args;
          const tracks = JSON.stringify(song_ids);
          const data = await neteaseApi(`/api/playlist/tracks?op=add&pid=${playlist_id}&tracks=${tracks}`, {
            method: 'POST',
            body: new URLSearchParams({ op: 'add', pid: String(playlist_id), tracks }),
            contentType: 'application/x-www-form-urlencoded',
          });
          result = { success: data.code === 200, code: data.code };
          break;
        }
        case 'music_song_detail': {
          const data = await neteaseApi(`/api/song/detail?ids=[${args.song_id}]`);
          const song = data.songs?.[0];
          if (song) {
            result = {
              id: song.id,
              name: song.name,
              artists: song.ar?.map(a => a.name).join(', ') || '',
              album: song.al?.name || '',
              cover: song.al?.picUrl || '',
              duration: song.dt,
              fee: song.fee,
            };
          } else {
            result = { error: 'Song not found' };
          }
          break;
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  // Create transport
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  // Hijack the reply to handle streaming
  reply.hijack();

  const rawRes = reply.raw;
  const rawReq = request.raw;

  // Parse the body if needed
  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  await server.connect(transport);
  await transport.handleRequest(rawReq, rawRes, body);
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Start
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
  console.log(`🎵 NetEase MCP + Music Garden running on port ${PORT}`);
  console.log(`   Music Garden: http://localhost:${PORT}/`);
  console.log(`   MCP Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`   Health:       http://localhost:${PORT}/health`);
});
