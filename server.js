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
let commentsDB = []; // {id, song_id, song_name, author, text, is_ai, time, replies:[]}

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
