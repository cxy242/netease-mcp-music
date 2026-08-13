import Fastify from 'fastify';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createReadStream, statSync } from 'fs';
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

// ─── Local audio files ──────────────────────────────────────────────
const LOCAL_AUDIO_DIR = join(__dirname, 'audio');
let REMOTE_AUDIO_BASE = process.env.REMOTE_AUDIO_BASE || '';
const TUNNEL_URL_FILE = join(__dirname, 'tunnel_url.txt');

// 启动时从 tunnel_url.txt 读取隧道地址
try {
  if (existsSync(TUNNEL_URL_FILE)) {
    const saved = readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
    if (saved && saved.startsWith('https://')) {
      REMOTE_AUDIO_BASE = saved;
      console.log(`[Tunnel] Loaded URL from file: ${saved}`);
    }
  }
} catch (e) {}

// 如果还是空，用默认值
if (!REMOTE_AUDIO_BASE) {
  REMOTE_AUDIO_BASE = 'https://parish-solved-departure-finance.trycloudflare.com';
}

let localAudioMap = {};
try {
  if (existsSync(LOCAL_AUDIO_DIR)) {
    const files = readdirSync(LOCAL_AUDIO_DIR);
    for (const f of files) {
      const m = f.match(/wy_(\d+)\.flac$/);
      if (m) localAudioMap[m[1]] = f;
    }
    console.log(`[Local Audio] Found ${Object.keys(localAudioMap).length} FLAC files`);
  }
} catch (e) {
  console.warn('[Local Audio] Failed to scan audio dir:', e.message);
}

// 如果本地没有音频文件（Railway环境），从远程隧道获取映射
if (Object.keys(localAudioMap).length === 0 && REMOTE_AUDIO_BASE) {
  fetch(`${REMOTE_AUDIO_BASE}/api/local_audio_map`).then(r=>r.json()).then(m=>{
    localAudioMap = m;
    console.log(`[Remote Audio] Loaded ${Object.keys(m).length} FLAC mappings from tunnel`);
  }).catch(e=>console.warn('[Remote Audio] Failed to load:', e.message));
}

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

// ─── User Auth System ───────────────────────────────────────────────
const USERS_FILE = join(__dirname, 'users.json');
const TOKEN_SECRET = crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

// Load users
let usersDB = {};
try {
  if (existsSync(USERS_FILE)) {
    usersDB = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
    console.log(`[Auth] Loaded ${Object.keys(usersDB).length} users`);
  }
} catch(e) {
  console.warn('[Auth] Failed to load users:', e.message);
}

function saveUsers() {
  writeFileSync(USERS_FILE, JSON.stringify(usersDB, null, 2));
}

// Password hashing with PBKDF2
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const result = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return result === hash;
}

// Token generation
function generateToken(userId) {
  const payload = JSON.stringify({ userId, exp: Date.now() + TOKEN_EXPIRY });
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + sig;
}

function verifyToken(token) {
  try {
    const [payloadB64, sig] = token.split('.');
    const payload = Buffer.from(payloadB64, 'base64').toString();
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (sig !== expectedSig) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return data.userId;
  } catch(e) { return null; }
}

// Auth middleware
function getTokenFromRequest(request) {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookie = request.headers.cookie || '';
  const match = cookie.match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}

function getCurrentUser(request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const userId = verifyToken(token);
  if (!userId || !usersDB[userId]) return null;
  return usersDB[userId];
}

// User-scoped data storage
const USER_DATA_DIR = join(__dirname, 'user_data');
if (!existsSync(USER_DATA_DIR)) mkdirSync(USER_DATA_DIR, { recursive: true });

function getUserDataPath(userId, filename) {
  const userDir = join(USER_DATA_DIR, userId);
  if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
  return join(userDir, filename);
}

function loadUserData(userId, filename, defaultVal = {}) {
  try {
    const path = getUserDataPath(userId, filename);
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  } catch(e) {}
  return defaultVal;
}

function saveUserData(userId, filename, data) {
  writeFileSync(getUserDataPath(userId, filename), JSON.stringify(data, null, 2));
}

// ─── Auth API Endpoints ─────────────────────────────────────────────
fastify.post('/api/register', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.code(400).send({ ok: false, message: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return reply.code(400).send({ ok: false, message: '用户名2-20个字符' });
  if (password.length < 4) return reply.code(400).send({ ok: false, message: '密码至少4个字符' });
  // Check if username exists
  const existing = Object.values(usersDB).find(u => u.username === username);
  if (existing) return reply.code(400).send({ ok: false, message: '用户名已存在' });
  const userId = 'u_' + crypto.randomBytes(8).toString('hex');
  const { salt, hash } = hashPassword(password);
  const isFirstUser = Object.keys(usersDB).length === 0;
  usersDB[userId] = {
    userId, username, salt, hash,
    avatar: '', createdAt: Date.now(), lastLogin: Date.now(),
    isAdmin: isFirstUser  // 第一个注册的用户自动成为管理员
  };
  if (isFirstUser) console.log(`[Auth] First user ${username} is now admin`);
  saveUsers();
  const token = generateToken(userId);
  reply.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; Max-Age=${TOKEN_EXPIRY / 1000}`);
  return { ok: true, token, user: { userId, username } };
});

fastify.post('/api/login', async (request, reply) => {
  const { username, password } = request.body || {};
  if (!username || !password) return reply.code(400).send({ ok: false, message: '用户名和密码不能为空' });
  const user = Object.values(usersDB).find(u => u.username === username);
  if (!user) return reply.code(401).send({ ok: false, message: '用户名或密码错误' });
  if (!verifyPassword(password, user.salt, user.hash)) return reply.code(401).send({ ok: false, message: '用户名或密码错误' });
  user.lastLogin = Date.now();
  saveUsers();
  const token = generateToken(user.userId);
  reply.header('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; Max-Age=${TOKEN_EXPIRY / 1000}`);
  return { ok: true, token, user: { userId: user.userId, username: user.username } };
});

fastify.get('/api/me', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false };
  return { ok: true, user: { userId: user.userId, username: user.username, avatar: user.avatar, isAdmin: !!user.isAdmin, createdAt: user.createdAt } };
});

fastify.post('/api/logout', async (request, reply) => {
  reply.header('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
  return { ok: true };
});


// CORS + 安全防护
fastify.addHook('onSend', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  // 安全防护：防止浏览器注入和劫持
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src 'self' data: blob: https:; media-src 'self' blob: https:;");
});

fastify.options('*', async (request, reply) => {
  return reply.send();
});

// ═════════════════════════════════════════════════════════════════════
// 0. LOCAL AUDIO STORAGE
// ═════════════════════════════════════════════════════════════════════
const AUDIO_DIR = join(__dirname, 'audio_cache');
if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

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

// 静态文件：小猫组件
fastify.get('/cat-mascot.css', async (request, reply) => {
  reply.type('text/css; charset=utf-8');
  return readFileSync(join(__dirname, 'cat-mascot.css'), 'utf-8');
});
fastify.get('/cat-mascot.js', async (request, reply) => {
  reply.type('application/javascript; charset=utf-8');
  return readFileSync(join(__dirname, 'cat-mascot.js'), 'utf-8');
});
fastify.get('/listen-cat.css', async (request, reply) => {
  reply.type('text/css; charset=utf-8');
  return readFileSync(join(__dirname, 'listen-cat.css'), 'utf-8');
});
fastify.get('/listen-cat.js', async (request, reply) => {
  reply.type('application/javascript; charset=utf-8');
  return readFileSync(join(__dirname, 'listen-cat.js'), 'utf-8');
});

// Login page
fastify.get('/login', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  return readFileSync(join(__dirname, 'login.html'), 'utf-8');
});

fastify.get('/profile', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  return readFileSync(join(__dirname, 'profile.html'), 'utf-8');
});

fastify.get('/admin', async (request, reply) => {
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  const user = getCurrentUser(request);
  if (!user || !user.isAdmin) {
    reply.code(403).type('text/html');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>无权限</title></head><body style="background:#0a0e1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>🔒 需要管理员权限</h1><p style="color:rgba(255,255,255,0.5);margin-top:12px"><a href="/" style="color:#f8a4c8">返回首页</a></p></div></body></html>';
  }
  reply.type('text/html; charset=utf-8');
  return readFileSync(join(__dirname, 'admin.html'), 'utf-8');
});

fastify.get('/', async (request, reply) => {
  reply.type('text/html; charset=utf-8');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.header('Pragma', 'no-cache');
  reply.header('Expires', '0');
  const raw = readFileSync(join(__dirname, 'index.html'), 'utf-8');
  const nav = `
<div id="nav-float" style="position:fixed;top:12px;right:12px;z-index:99999;display:flex;gap:6px;flex-wrap:wrap;max-width:280px;justify-content:flex-end">
  <a href="/netease" style="padding:8px 14px;background:linear-gradient(135deg,#e91e63,#ff5722);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(233,30,99,0.3)">🎵 网易云</a>
  <a href="/cookie" style="padding:8px 14px;background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(76,175,80,0.3)">🍪 Cookie</a>
  <a href="/comments" style="padding:8px 14px;background:linear-gradient(135deg,#2196f3,#1565c0);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(33,150,243,0.3)">💬 评论</a>
  <a href="/listen" style="padding:8px 14px;background:linear-gradient(135deg,#9c27b0,#6a1b9a);color:#fff;border-radius:20px;text-decoration:none;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(156,39,176,0.3)">🎧 一起听</a>
  <span id="userNavBtn" style="padding:8px 14px;background:linear-gradient(135deg,#ff9800,#f57c00);color:#fff;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(255,152,0,0.3)">👤 登录</span>
</div>`;
    // Inject auth script
  const authScript = `
<script>
(function() {
  function initAuth() {
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    const guestMode = localStorage.getItem('guest_mode');
    
    // Update nav button
    const navBtn = document.getElementById('userNavBtn');
    if (navBtn) {
      if (token && userInfo) {
        try {
          const user = JSON.parse(userInfo);
          navBtn.textContent = '👤 ' + user.username;
          navBtn.style.display = 'inline-block';
          navBtn.onclick = function() {
            window.location.href = '/profile';
          };
        } catch(e) {}
      } else if (!guestMode) {
        // Not logged in and not guest, redirect to login
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      } else {
        navBtn.textContent = '👤 游客';
        navBtn.style.display = 'inline-block';
        navBtn.onclick = function() {
          localStorage.removeItem('guest_mode');
          window.location.href = '/login';
        };
      }
    }
  }
  
  // Run immediately if DOM ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
  
  // Version check - force reload if server updated
  const currentVersion = localStorage.getItem('app_version');
  fetch('/health').then(r=>r.json()).then(d=>{
    const serverVersion = String(d.uptime || '').substring(0,4);
    if(currentVersion && currentVersion !== serverVersion) {
      localStorage.setItem('app_version', serverVersion);
      window.location.reload(true);
    } else {
      localStorage.setItem('app_version', serverVersion);
    }
  }).catch(()=>{});
  
  // Add auth header to fetch
  const origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (!opts) opts = {};
    if (!opts.headers) opts.headers = {};
    const t = localStorage.getItem('auth_token');
    if (t && !opts.headers['Authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + t;
    }
    return origFetch.call(this, url, opts);
  };
})();
</script>`;
  return raw.replace('</body>', nav + authScript + '</body>');
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
  const { song_id, song_name, author, text, is_ai, image_url } = request.body || {};
  if (!author || !text) return { ok: false, message: '需要 author, text' };
  const comment = {
    id: Date.now(), song_id, song_name: song_name || '',
    author, text, is_ai: !!is_ai, time: new Date().toISOString(), replies: [],
    image_url: image_url || ''
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
  const { session_id, from, text, is_ai, song_id, song_name, song_artist, reply_to, image_url } = request.body || {};
  const session = listenSessions[session_id];
  if (!session) return { ok: false, message: '房间不存在' };
  const msg = { from, text, is_ai: !!is_ai, time: new Date().toISOString() };
  if (song_id) { msg.song_id = song_id; msg.song_name = song_name; msg.song_artist = song_artist; }
  if (reply_to) msg.reply_to = reply_to;
  if (image_url) msg.image_url = image_url;
  msg.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  session.messages.push(msg);
  return { ok: true, msg_id: msg.id };
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

// 上传评论图片
fastify.post('/api/listen/upload_image', async (request) => {
  try {
    const data = await request.file();
    if (!data) return { ok: false, message: 'no file' };
    const buffer = await data.toBuffer();
    const ext = (data.filename || '.jpg').split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    // 存为base64 data URL，避免Railway重启丢失文件
    const b64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${b64}`;
    return { ok: true, url: dataUrl };
  } catch(e) {
    return { ok: false, message: e.message };
  }
});

// 静态文件：uploads目录
fastify.get('/uploads/:name', async (request, reply) => {
  const fpath = join(__dirname, 'uploads', request.params.name);
  if (!existsSync(fpath)) return reply.status(404).send('Not found');
  return reply.sendFile(request.params.name, join(__dirname, 'uploads'));
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
<title>评论广场 - 月汐音乐花园</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d1a;color:#e0e0e0;min-height:100vh;font-family:'Segoe UI',system-ui,sans-serif;overflow-x:hidden}
.container{max-width:600px;margin:0 auto;padding:16px}
.header{text-align:center;padding:24px 0 16px}
.header h1{font-size:1.5em;background:linear-gradient(135deg,#e91e63,#f06292,#ce93d8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:800}
.header p{color:rgba(255,255,255,0.4);font-size:0.85em;margin-top:4px}
.back{display:inline-block;color:#e91e63;text-decoration:none;font-size:0.85em;opacity:0.7;margin-bottom:8px}
.back:hover{opacity:1}

/* 发布区 */
.post-box{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;margin-bottom:20px}
.post-box input,.post-box textarea{width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#e0e0e0;font-size:0.9em;outline:none;margin-bottom:10px;font-family:inherit}
.post-box input:focus,.post-box textarea:focus{border-color:#e91e63}
.post-box textarea{height:70px;resize:vertical}
.post-box input::placeholder,.post-box textarea::placeholder{color:rgba(255,255,255,0.3)}

/* 已选歌曲标签 */
.song-tag{display:none;padding:8px 12px;background:rgba(233,30,99,0.1);border:1px solid rgba(233,30,99,0.2);border-radius:10px;margin-bottom:10px;align-items:center;gap:8px;font-size:0.85em}
.song-tag.show{display:flex}
.song-tag .name{flex:1;color:#f06292;font-weight:600}
.song-tag button{background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:1em}

/* 图片预览 */
.img-tag{display:none;margin-bottom:10px;position:relative}
.img-tag.show{display:block}
.img-tag img{max-width:100%;max-height:120px;border-radius:10px}
.img-tag button{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:#fff;cursor:pointer}

/* 按钮行 */
.btn-row{display:flex;gap:8px;align-items:center}
.btn-row label{background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);padding:6px 12px;border-radius:8px;font-size:0.8em;cursor:pointer}
.btn-row label:hover{border-color:#e91e63;color:#e91e63}
.btn-row label input{display:none}
.btn-row .submit{margin-left:auto;background:linear-gradient(135deg,#e91e63,#f06292);color:#fff;border:none;padding:8px 20px;border-radius:10px;font-weight:600;font-size:0.9em;cursor:pointer}
.btn-row .submit:hover{box-shadow:0 4px 15px rgba(233,30,99,0.3)}

/* 歌曲选择弹窗 */
.modal-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:100;justify-content:center;align-items:flex-end}
.modal-overlay.show{display:flex}
.modal{background:#1a1a2e;width:100%;max-width:600px;max-height:70vh;border-radius:20px 20px 0 0;padding:20px;overflow-y:auto}
.modal h3{text-align:center;margin-bottom:16px;color:#f06292}
.modal input{width:100%;padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#e0e0e0;font-size:0.95em;outline:none;margin-bottom:12px}
.modal input:focus{border-color:#e91e63}
.modal-list{max-height:50vh;overflow-y:auto}
.modal-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;cursor:pointer;transition:background 0.2s}
.modal-item:hover{background:rgba(233,30,99,0.1)}
.modal-item .icon{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#e91e63,#9c27b0);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.modal-item .icon::after{content:'';width:0;height:0;border-left:10px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;margin-left:2px}
.modal-item .info{flex:1;min-width:0}
.modal-item .info .n{font-weight:600;font-size:0.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.modal-item .info .a{font-size:0.75em;color:rgba(255,255,255,0.4)}
.modal-close{display:block;margin:16px auto 0;background:rgba(255,255,255,0.1);border:none;color:#fff;padding:10px 30px;border-radius:10px;font-size:0.9em;cursor:pointer}

/* 评论卡片 */
.cmt{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;margin-bottom:12px}
.cmt-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.cmt-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#e91e63,#9c27b0);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85em;color:#fff;flex-shrink:0}
.cmt-meta{flex:1}
.cmt-name{font-weight:700;font-size:0.95em;color:#f8bbd0}
.cmt-time{font-size:0.7em;color:rgba(255,255,255,0.3)}
.cmt-text{color:rgba(255,255,255,0.85);line-height:1.7;font-size:0.9em;margin-bottom:8px}
.cmt-img{max-width:100%;max-height:200px;border-radius:10px;margin-bottom:8px;cursor:pointer}
.cmt-song{display:flex;align-items:center;gap:10px;padding:10px;background:rgba(233,30,99,0.06);border:1px solid rgba(233,30,99,0.12);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.2s}
.cmt-song:hover{background:rgba(233,30,99,0.12)}
.cmt-song .s-icon{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#e91e63,#f06292);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
.cmt-song .s-icon::before{content:'';width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,0.8);position:absolute}
.cmt-song .s-icon::after{content:'';width:4px;height:4px;border-radius:50%;background:#fff;position:absolute}
.cmt-song .s-info{flex:1;min-width:0}
.cmt-song .s-info .n{font-weight:600;font-size:0.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmt-song .s-info .a{font-size:0.7em;color:rgba(255,255,255,0.4)}
.cmt-song .s-play{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#e91e63,#f06292);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cmt-song .s-play::after{content:'';width:0;height:0;border-left:8px solid #fff;border-top:5px solid transparent;border-bottom:5px solid transparent;margin-left:2px}
.cmt-song:hover .s-play{transform:scale(1.1)}
.cmt-foot{display:flex;gap:16px;margin-top:6px}
.cmt-act{font-size:0.75em;color:rgba(255,255,255,0.3);cursor:pointer;transition:color 0.2s}
.cmt-act:hover{color:#e91e63}
.cmt-act.on{color:#e91e63}

/* 回复 */
.replies{margin-top:10px;padding-left:12px;border-left:2px solid rgba(233,30,99,0.15)}
.rep{padding:8px 12px;background:rgba(255,255,255,0.02);border-radius:8px;margin-bottom:6px;font-size:0.85em}
.rep .r-name{color:#f06292;font-weight:600;font-size:0.8em}
.rep .r-text{color:rgba(255,255,255,0.7);margin-top:2px}
.rep .r-time{font-size:0.65em;color:rgba(255,255,255,0.2);margin-top:2px}
.rep-box{display:none;margin-top:10px;gap:6px;align-items:center}
.rep-box.show{display:flex}
.rep-box input{flex:1;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e0e0e0;font-size:0.85em;outline:none}
.rep-box input:focus{border-color:#e91e63}
.rep-box button{background:#e91e63;border:none;color:#fff;padding:8px 14px;border-radius:8px;font-size:0.8em;cursor:pointer}

/* 统计 */
.stats{display:flex;justify-content:center;gap:24px;padding:12px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.05)}
.stats .s{text-align:center}
.stats .s .n{font-size:1.2em;font-weight:700;color:#e91e63}
.stats .s .l{font-size:0.7em;color:rgba(255,255,255,0.4);margin-top:2px}

.empty{text-align:center;padding:40px;color:rgba(255,255,255,0.3)}

::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:rgba(233,30,99,0.3);border-radius:2px}
</style>
</head>
<body>
<div class="container">
  <a href="/" class="back">← 返回音乐花园</a>
  <div class="header"><h1>评论广场</h1><p>分享你对每一首歌的感受</p></div>

  <div class="stats">
    <div class="s"><div class="n" id="statCmt">0</div><div class="l">评论</div></div>
    <div class="s"><div class="n" id="statSong">0</div><div class="l">歌曲</div></div>
    <div class="s"><div class="n" id="statUser">0</div><div class="l">用户</div></div>
  </div>

  <!-- 正在播放 -->
  <div id="nowPlayingBar" style="display:none;padding:10px 16px;background:rgba(233,30,99,0.08);border:1px solid rgba(233,30,99,0.15);border-radius:12px;margin-bottom:16px;align-items:center;gap:10px">
    <span style="font-size:1.1em">🎵</span>
    <span id="npName" style="flex:1;font-size:0.85em;font-weight:600;color:#f06292;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
    <button onclick="stopSong()" style="background:rgba(233,30,99,0.2);border:none;color:#e91e63;padding:6px 12px;border-radius:8px;font-size:0.8em;cursor:pointer">⏹ 停止</button>
  </div>

  <div class="post-box">
    <input id="c-author" placeholder="你的名字" maxlength="20">
    <div class="song-tag" id="songTag">
      <span>🎵</span>
      <span class="name" id="songTagName"></span>
      <button onclick="clearSong()">✕</button>
    </div>
    <div class="img-tag" id="imgTag">
      <img id="imgPreview">
      <button onclick="clearImg()">✕</button>
    </div>
    <textarea id="c-text" placeholder="写下你的感想..."></textarea>
    <div class="btn-row">
      <button onclick="openSongPicker()" style="background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);padding:6px 12px;border-radius:8px;font-size:0.8em;cursor:pointer">🎵 选歌</button>
      <label>📷 图片<input type="file" id="imgInput" accept="image/*" onchange="pickImg(this.files[0])"></label>
      <button class="submit" onclick="postComment()">发布评论</button>
    </div>
  </div>

  <div id="cmtList"></div>
</div>

<!-- 歌曲选择弹窗 -->
<div class="modal-overlay" id="songModal">
  <div class="modal">
    <h3>选择歌曲</h3>
    <input id="songSearchInput" placeholder="输入歌名或歌手..." oninput="doSongSearch(this.value)">
    <div class="modal-list" id="songList"></div>
    <button class="modal-close" onclick="closeSongPicker()">取消</button>
  </div>
</div>

<script>
let allSongs=[];
let _selSongId=0,_selSongName='',_imgUrl='';
let searchTimer=null;

const saved=localStorage.getItem('draw-player')||'';
if(saved)document.getElementById('c-author').value=saved;

// 加载歌曲
fetch('/songs_data.js').then(r=>r.text()).then(t=>{
  try{const s=t.indexOf('['),e=t.lastIndexOf(']');if(s>=0&&e>s)allSongs=JSON.parse(t.substring(s,e+1));}catch(e){}
}).catch(()=>{});

// 打开/关闭歌曲选择
function openSongPicker(){
  document.getElementById('songModal').classList.add('show');
  document.getElementById('songSearchInput').value='';
  document.getElementById('songSearchInput').focus();
  document.getElementById('songList').innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3)">输入歌名搜索...</div>';
}
function closeSongPicker(){
  document.getElementById('songModal').classList.remove('show');
}

// 搜索歌曲
function doSongSearch(q){
  clearTimeout(searchTimer);
  const list=document.getElementById('songList');
  if(!q.trim()){list.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3)">输入歌名搜索...</div>';return;}
  searchTimer=setTimeout(()=>{
    const ql=q.toLowerCase().trim();
    const matched=allSongs.filter(s=>((s.n||'').toLowerCase().includes(ql)||(s.a||'').toLowerCase().includes(ql))).slice(0,10);
    if(!matched.length){list.innerHTML='<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3)">没有找到</div>';return;}
    list.innerHTML=matched.map(s=>
      '<div class="modal-item" onclick="pickSong('+s.i+',this)" data-name="'+(s.n||'').replace(/"/g,'&quot;')+'" data-artist="'+(s.a||'').replace(/"/g,'&quot;')+'">'+
      '<div class="icon"></div><div class="info"><div class="n">'+s.n+'</div><div class="a">'+s.a+'</div></div></div>'
    ).join('');
  },200);
}

// 选择歌曲
function pickSong(id,el){
  _selSongId=id;
  _selSongName=el.dataset.name;
  const artist=el.dataset.artist;
  document.getElementById('songTagName').textContent=artist+' - '+_selSongName;
  document.getElementById('songTag').classList.add('show');
  closeSongPicker();
}
function clearSong(){
  _selSongId=0;_selSongName='';
  document.getElementById('songTag').classList.remove('show');
}

// 图片
async function pickImg(file){
  if(!file)return;
  const fd=new FormData();fd.append('file',file);
  try{
    const r=await fetch('/api/listen/upload_image',{method:'POST',body:fd});
    const d=await r.json();
    if(d.ok){_imgUrl=d.url;document.getElementById('imgPreview').src=d.url;document.getElementById('imgTag').classList.add('show');}
  }catch(e){alert('上传失败');}
}
function clearImg(){_imgUrl='';document.getElementById('imgTag').classList.remove('show');document.getElementById('imgInput').value='';}

// 发布
function postComment(){
  const author=document.getElementById('c-author').value.trim();
  const text=document.getElementById('c-text').value.trim();
  if(!author){alert('请输入名字');return;}
  if(!text&&!_selSongId&&!_imgUrl){alert('请输入内容');return;}
  if(author)localStorage.setItem('draw-player',author);
  fetch('/api/comment',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({song_id:_selSongId,song_name:_selSongName,author,text,is_ai:false,image_url:_imgUrl})
  }).then(r=>r.json()).then(d=>{
    if(d.ok){document.getElementById('c-text').value='';clearSong();clearImg();loadComments();}
    else alert('发布失败');
  });
}

// 回复
function showRep(id){document.getElementById('rep-'+id).classList.toggle('show');}
function sendRep(id){
  const inp=document.getElementById('repIn-'+id);
  const text=inp.value.trim();if(!text)return;
  const author=document.getElementById('c-author').value.trim()||'匿名';
  fetch('/api/comment/reply',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({comment_id:id,author,text,is_ai:false})
  }).then(()=>{inp.value='';loadComments();});
}

// 点赞
function toggleLike(el){
  const on=el.classList.toggle('on');
  const c=parseInt(el.dataset.c||'0')+(on?1:-1);el.dataset.c=c;el.innerHTML='♥ '+c;
}

// 播放
let _audio=null;
let _playingId=0;
function playSong(id){
  if(!id)return;
  if(!_audio){_audio=new Audio();_audio.volume=0.8;}
  if(_playingId===id&&!_audio.paused){_audio.pause();updatePlayBtns();return;}
  if(_playingId!==id){_audio.src='/api/proxy_play?id='+id;}
  _audio.play().catch(()=>{});
  _playingId=id;
  // 显示正在播放
  const npBar=document.getElementById('nowPlayingBar');
  const npName=document.getElementById('npName');
  if(npBar&&npName){
    const song=allSongs.find(s=>s.i===id);
    npName.textContent=song?(song.a+' - '+song.n):('歌曲 #'+id);
    npBar.style.display='flex';
  }
  updatePlayBtns();
}
function stopSong(){
  if(_audio){_audio.pause();_audio.currentTime=0;}
  _playingId=0;updatePlayBtns();
  const npBar=document.getElementById('nowPlayingBar');
  if(npBar)npBar.style.display='none';
}
function updatePlayBtns(){
  document.querySelectorAll('.s-play').forEach(b=>{
    const cid=parseInt(b.dataset.sid||'0');
    if(cid===_playingId&&!_audio.paused){b.innerHTML='⏸';b.style.background='linear-gradient(135deg,#9c27b0,#7b1fa2)';}
    else{b.innerHTML='';b.style.background='linear-gradient(135deg,#e91e63,#f06292)';}
  });
}
_audio&&_audio.addEventListener('ended',()=>{_playingId=0;updatePlayBtns();});

// 加载评论
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function loadComments(){
  fetch('/api/comments').then(r=>r.json()).then(d=>{
    const list=document.getElementById('cmtList');
    if(!d.comments||!d.comments.length){list.innerHTML='<div class="empty">还没有评论~<br>来做第一个分享感受的人吧</div>';return;}
    const users=new Set(d.comments.map(c=>c.author));
    const songs=new Set(d.comments.filter(c=>c.song_name).map(c=>c.song_name));
    document.getElementById('statCmt').textContent=d.comments.length;
    document.getElementById('statSong').textContent=songs.size;
    document.getElementById('statUser').textContent=users.size;

    list.innerHTML=d.comments.map(c=>{
      const av=(c.author||'?')[0].toUpperCase();
      const t=c.time?c.time.slice(0,16).replace('T',' '):'';
      let songH='';
      if(c.song_id>0&&c.song_name){
        songH='<div class="cmt-song" onclick="playSong('+c.song_id+')">'+
          '<div class="s-icon"></div><div class="s-info"><div class="n">'+esc(c.song_name)+'</div></div>'+
          '<div class="s-play" data-sid="'+c.song_id+'"></div></div>';
      }
      let imgH=c.image_url?'<img class="cmt-img" src="'+c.image_url+'" onclick="window.open(this.src)">':'';
      let reps='';
      if(c.replies&&c.replies.length){
        reps='<div class="replies">'+c.replies.map(r=>
          '<div class="rep"><div class="r-name">'+esc(r.author)+'</div><div class="r-text">'+esc(r.text)+'</div><div class="r-time">'+(r.time?r.time.slice(0,16).replace('T',' '):'')+'</div></div>'
        ).join('')+'</div>';
      }
      return '<div class="cmt">'+
        '<div class="cmt-head"><div class="cmt-avatar">'+av+'</div><div class="cmt-meta"><div class="cmt-name">'+esc(c.author)+'</div><div class="cmt-time">'+t+'</div></div></div>'+
        songH+(c.text?'<div class="cmt-text">'+esc(c.text)+'</div>':'')+imgH+
        '<div class="cmt-foot"><span class="cmt-act" data-c="0" onclick="toggleLike(this)">♡ 0</span><span class="cmt-act" onclick="showRep('+c.id+')">回复</span></div>'+
        reps+
        '<div class="rep-box" id="rep-'+c.id+'"><input id="repIn-'+c.id+'" placeholder="回复..." onkeydown="if(event.key===\\'Enter\\')sendRep('+c.id+')"><button onclick="sendRep('+c.id+')">发送</button></div>'+
        '</div>';
    }).join('');
  });
}

document.addEventListener('click',e=>{
  if(e.target.id==='songModal')closeSongPicker();
});

loadComments();
setInterval(loadComments,8000);
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
  { name: 'music_local_songs', description: '列出本地音乐花园的所有歌曲（带分页）', inputSchema: { type: 'object', properties: { page: { type: 'number', description: '页码（从1开始）', default: 1 }, limit: { type: 'number', description: '每页数量', default: 50 } } } },
  { name: 'music_local_play', description: '播放本地花园的歌曲', inputSchema: { type: 'object', properties: { song_id: { type: 'string', description: '歌曲ID（本地音频映射中的ID）' } }, required: ['song_id'] } },
  { name: 'music_lyrics', description: '获取歌曲歌词', inputSchema: { type: 'object', properties: { song_id: { type: 'number', description: '歌曲ID' } }, required: ['song_id'] } },
  { name: 'music_listen_status', description: '获取一起听房间状态（谁在里面、播放什么）', inputSchema: { type: 'object', properties: { session_id: { type: 'string', description: '房间ID' } }, required: ['session_id'] } },
  { name: 'music_listen_join', description: '加入一起听房间', inputSchema: { type: 'object', properties: { session_id: { type: 'string', description: '房间ID' }, guest_name: { type: 'string', description: '加入者名字' } }, required: ['session_id'] } },
  { name: 'music_listen_leave', description: '离开一起听房间', inputSchema: { type: 'object', properties: { session_id: { type: 'string', description: '房间ID' }, name: { type: 'string', description: '离开者名字' } }, required: ['session_id', 'name'] } },
  { name: 'music_comment_with_song', description: '在评论广场发布带歌曲的评论', inputSchema: { type: 'object', properties: { song_id: { type: 'number' }, song_name: { type: 'string' }, author: { type: 'string' }, text: { type: 'string' } }, required: ['song_id', 'author', 'text'] } },
  { name: 'music_comment_with_image', description: '发布带图片的评论', inputSchema: { type: 'object', properties: { song_id: { type: 'number' }, song_name: { type: 'string' }, author: { type: 'string' }, text: { type: 'string' }, image_url: { type: 'string', description: '图片URL（data:URL或https链接）' } }, required: ['author', 'text'] } },
  { name: 'music_upload_image', description: '上传评论图片（base64或文件）', inputSchema: { type: 'object', properties: { image_data: { type: 'string', description: '图片的base64编码' }, filename: { type: 'string', description: '文件名（含扩展名）', default: 'image.jpg' } }, required: ['image_data'] } },
  { name: 'music_garden_stats', description: '获取音乐花园统计信息', inputSchema: { type: 'object', properties: {} } },
  { name: 'music_refresh_audio', description: '刷新本地音频映射', inputSchema: { type: 'object', properties: {} } },
  { name: 'music_cookie_status', description: '检查网易云Cookie是否有效', inputSchema: { type: 'object', properties: {} } },
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
    case 'music_local_songs': {
      const { page = 1, limit = 50 } = args;
      const allIds = Object.keys(localAudioMap);
      const total = allIds.length;
      const start = (page - 1) * limit;
      const pageIds = allIds.slice(start, start + limit);
      return { total, page, limit, pages: Math.ceil(total / limit), songs: pageIds.map(id => ({ id, filename: localAudioMap[id] })) };
    }
    case 'music_local_play': {
      const { song_id } = args;
      const filename = localAudioMap[song_id];
      if (!filename) return { ok: false, message: '本地无此歌曲音频' };
      return { ok: true, url: `/api/local_audio?id=${song_id}`, filename };
    }
    case 'music_lyrics': {
      const { song_id } = args;
      try {
        const data = await neteaseApi(`/api/song/lyric?id=${song_id}&lv=1&tv=1`);
        return { lyric: data.lrc ? data.lrc.lyric : '', tlyric: data.tlyric ? data.tlyric.lyric : '' };
      } catch (e) {
        return { lyric: '', error: e.message };
      }
    }
    case 'music_listen_status': {
      const { session_id } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      return { ok: true, session };
    }
    case 'music_listen_join': {
      const { session_id, guest_name } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      session.guest = guest_name || '艾因';
      session.messages.push({ from: '系统', text: (guest_name || '艾因') + ' 加入了一起听', time: new Date().toISOString() });
      return { ok: true, session };
    }
    case 'music_listen_leave': {
      const { session_id, name } = args;
      const session = listenSessions[session_id];
      if (!session) return { ok: false, message: '房间不存在' };
      session.messages.push({ from: '系统', text: name + ' 离开了一起听', time: new Date().toISOString() });
      if (name === session.host) session.active = false;
      return { ok: true };
    }
    case 'music_comment_with_song': {
      const { song_id, song_name, author, text } = args;
      const comment = {
        id: Date.now(), song_id, song_name: song_name || '',
        author, text, is_ai: true, time: new Date().toISOString(), replies: [], image_url: ''
      };
      commentsDB.push(comment);
      return { ok: true, comment };
    }
    case 'music_comment_with_image': {
      const { song_id, song_name, author, text, image_url } = args;
      const comment = {
        id: Date.now(), song_id: song_id || 0, song_name: song_name || '',
        author, text, is_ai: true, time: new Date().toISOString(), replies: [], image_url: image_url || ''
      };
      commentsDB.push(comment);
      return { ok: true, comment };
    }
    case 'music_upload_image': {
      const { image_data, filename = 'image.jpg' } = args;
      const ext = filename.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      // Return as data URL for inline use
      const dataUrl = `data:${mime};base64,${image_data}`;
      return { ok: true, url: dataUrl };
    }
    case 'music_garden_stats': {
      const audioDir = existsSync(AUDIO_DIR) ? readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3')).length : 0;
      const flacDir = existsSync(LOCAL_AUDIO_DIR) ? readdirSync(LOCAL_AUDIO_DIR).filter(f => f.endsWith('.flac')).length : 0;
      return {
        local_audio_map_count: Object.keys(localAudioMap).length,
        flac_files: flacDir,
        cached_mp3_files: audioDir,
        comments_count: commentsDB.length,
        listen_sessions: Object.keys(listenSessions).length,
        has_cookie: !!MUSIC_U,
        uid: DEFAULT_UID,
      };
    }
    case 'music_refresh_audio': {
      try {
        const mapPath = join(__dirname, 'local_audio_map.json');
        const newMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
        Object.keys(localAudioMap).forEach(k => delete localAudioMap[k]);
        Object.assign(localAudioMap, newMap);
        return { ok: true, count: Object.keys(localAudioMap).length };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    case 'music_cookie_status': {
      return {
        hasCookie: !!MUSIC_U,
        music_u_length: MUSIC_U.length,
        nickname: cookieData ? cookieData.nickname : '未知',
        vipType: cookieData ? cookieData.vipType : 0,
        uid: DEFAULT_UID,
      };
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

// 本地FLAC音频流（优先本地，fallback到远程隧道）
fastify.get('/api/local_audio', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send('Missing song id');
  const filename = localAudioMap[id];
  if (!filename) return reply.status(404).send('No local audio');
  // 本地文件存在 → 直接读取
  const filePath = join(LOCAL_AUDIO_DIR, filename);
  if (existsSync(filePath)) {
    const stat = statSync(filePath);
    reply.header('Content-Type', 'audio/flac');
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(createReadStream(filePath));
  }
  // 本地文件不存在（Railway环境）→ 从远程隧道流式代理
  if (REMOTE_AUDIO_BASE) {
    try {
      const resp = await fetch(`${REMOTE_AUDIO_BASE}/api/local_audio?id=${id}`);
      if (resp.ok) {
        reply.header('Content-Type', resp.headers.get('content-type') || 'audio/flac');
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Cache-Control', 'public, max-age=86400');
        if (resp.headers.get('content-length')) reply.header('Content-Length', resp.headers.get('content-length'));
        // 流式传输，不缓冲整个文件
        return reply.send(resp.body);
      }
    } catch (e) {}
  }
  return reply.status(404).send('Audio not available');
});

// 兼容路径参数格式 /api/local_audio/12345
fastify.get('/api/local_audio/:id', async (request, reply) => {
  const { id } = request.params;
  const filename = localAudioMap[id];
  if (!filename) return reply.status(404).send('No local audio');
  const filePath = join(LOCAL_AUDIO_DIR, filename);
  if (existsSync(filePath)) {
    const stat = statSync(filePath);
    reply.header('Content-Type', 'audio/flac');
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(createReadStream(filePath));
  }
  if (REMOTE_AUDIO_BASE) {
    try {
      const resp = await fetch(`${REMOTE_AUDIO_BASE}/api/local_audio/${id}`);
      if (resp.ok) {
        reply.header('Content-Type', resp.headers.get('content-type') || 'audio/flac');
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Cache-Control', 'public, max-age=86400');
        if (resp.headers.get('content-length')) reply.header('Content-Length', resp.headers.get('content-length'));
        return reply.send(resp.body);
      }
    } catch (e) {}
  }
  return reply.status(404).send('Audio not available');
});

// 本地音频映射表（前端用来判断哪些歌有本地版本）
fastify.get('/api/local_audio_map', async (request, reply) => {
  return localAudioMap;
});

// 刷新音频地图（不用重启服务器）
fastify.post('/api/refresh_audio_map', async (request, reply) => {
  try {
    const mapPath = join(__dirname, 'local_audio_map.json');
    const newMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
    Object.keys(localAudioMap).forEach(k => delete localAudioMap[k]);
    Object.assign(localAudioMap, newMap);
    return { ok: true, count: Object.keys(localAudioMap).length };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

// 代理播放：优先本地FLAC，fallback到网易云CDN
fastify.get('/api/proxy_play', async (request, reply) => {
  const { id } = request.query;
  if (!id) return reply.status(400).send('Missing song id');
  // 优先本地FLAC
  if (localAudioMap[id]) {
    return reply.redirect(`/api/local_audio?id=${id}`, 302);
  }
  try {
    const data = await neteaseApi(`/api/song/enhance/player/url?ids=[${id}]&br=320000`);
    if (data.data && data.data[0] && data.data[0].url) {
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

// ─── User-Scoped Data Endpoints ──────────────────────────────────────
// Favorites
fastify.get('/api/user/favorites', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const favs = loadUserData(user.userId, 'favorites.json', { songs: [] });
  return { ok: true, ...favs };
});

fastify.post('/api/user/favorites', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const { songId, action } = request.body || {};
  if (!songId) return { ok: false, message: 'Missing songId' };
  const favs = loadUserData(user.userId, 'favorites.json', { songs: [] });
  const idx = favs.songs.indexOf(songId);
  if (action === 'add' && idx === -1) {
    favs.songs.push(songId);
    saveUserData(user.userId, 'favorites.json', favs);
  } else if (action === 'remove' && idx !== -1) {
    favs.songs.splice(idx, 1);
    saveUserData(user.userId, 'favorites.json', favs);
  }
  return { ok: true, songs: favs.songs };
});

// Play History
fastify.get('/api/user/history', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const history = loadUserData(user.userId, 'history.json', { plays: [] });
  return { ok: true, ...history };
});

fastify.post('/api/user/history', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const { songId } = request.body || {};
  if (!songId) return { ok: false, message: 'Missing songId' };
  const history = loadUserData(user.userId, 'history.json', { plays: [] });
  // Add to front, remove duplicates, keep last 500
  history.plays = history.plays.filter(p => p.songId !== songId);
  history.plays.unshift({ songId, time: Date.now() });
  if (history.plays.length > 500) history.plays = history.plays.slice(0, 500);
  saveUserData(user.userId, 'history.json', history);
  return { ok: true };
});

// User Settings
fastify.get('/api/user/settings', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const settings = loadUserData(user.userId, 'settings.json', { theme: 'moonlight', volume: 0.7 });
  return { ok: true, settings };
});

fastify.post('/api/user/settings', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const settings = request.body || {};
  saveUserData(user.userId, 'settings.json', settings);
  return { ok: true };
});

// ─── Profile & Admin Endpoints ──────────────────────────────────────
fastify.get('/api/user/profile', async (request) => {
  const user = getCurrentUser(request);
  if (!user) return { ok: false, needLogin: true };
  const favs = loadUserData(user.userId, 'favorites.json', { songs: [] });
  const history = loadUserData(user.userId, 'history.json', { plays: [] });
  return {
    ok: true,
    user: {
      userId: user.userId,
      username: user.username,
      avatar: user.avatar || '',
      isAdmin: !!user.isAdmin,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    },
    stats: {
      favorites: favs.songs ? favs.songs.length : 0,
      playCount: history.plays ? history.plays.length : 0
    }
  };
});

// Admin: list all users
fastify.get('/api/admin/users', async (request) => {
  const user = getCurrentUser(request);
  if (!user || !user.isAdmin) return { ok: false, message: '需要管理员权限' };
  const users = Object.values(usersDB).map(u => ({
    userId: u.userId,
    username: u.username,
    isAdmin: !!u.isAdmin,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin
  }));
  return { ok: true, users, total: users.length };
});

// Admin: delete user
fastify.post('/api/admin/delete_user', async (request) => {
  const user = getCurrentUser(request);
  if (!user || !user.isAdmin) return { ok: false, message: '需要管理员权限' };
  const { userId } = request.body || {};
  if (!userId) return { ok: false, message: 'Missing userId' };
  if (userId === user.userId) return { ok: false, message: '不能删除自己' };
  if (!usersDB[userId]) return { ok: false, message: '用户不存在' };
  const username = usersDB[userId].username;
  delete usersDB[userId];
  saveUsers();
  return { ok: true, message: `已删除用户 ${username}` };
});

// Admin: toggle admin status
fastify.post('/api/admin/toggle_admin', async (request) => {
  const user = getCurrentUser(request);
  if (!user || !user.isAdmin) return { ok: false, message: '需要管理员权限' };
  const { userId } = request.body || {};
  if (!userId) return { ok: false, message: 'Missing userId' };
  if (userId === user.userId) return { ok: false, message: '不能修改自己的权限' };
  if (!usersDB[userId]) return { ok: false, message: '用户不存在' };
  usersDB[userId].isAdmin = !usersDB[userId].isAdmin;
  saveUsers();
  return { ok: true, isAdmin: usersDB[userId].isAdmin };
});

// Admin: view user data
fastify.get('/api/admin/user_data', async (request) => {
  const user = getCurrentUser(request);
  if (!user || !user.isAdmin) return { ok: false, message: '需要管理员权限' };
  const { userId } = request.query;
  if (!userId || !usersDB[userId]) return { ok: false, message: '用户不存在' };
  const target = usersDB[userId];
  const favs = loadUserData(userId, 'favorites.json', { songs: [] });
  const history = loadUserData(userId, 'history.json', { plays: [] });
  const settings = loadUserData(userId, 'settings.json', {});
  return {
    ok: true,
    user: { userId: target.userId, username: target.username, isAdmin: !!target.isAdmin, createdAt: target.createdAt },
    data: { favorites: favs, history: history, settings: settings }
  };
});

fastify.get('/health', async () => ({
  status: 'ok',
  uptime: process.uptime(),
  cookie: !!MUSIC_U,
  uid: DEFAULT_UID,
  comments: commentsDB.length,
  sessions: Object.keys(listenSessions).length,
  local_audio: Object.keys(localAudioMap).length,
  tunnel: REMOTE_AUDIO_BASE,
}));

// 隧道 URL 自动更新（由 start_tunnel.sh 调用）
fastify.post('/api/update_tunnel', async (request) => {
  const { url } = request.body || {};
  if (!url || !url.startsWith('https://')) {
    return { ok: false, message: 'Invalid URL' };
  }
  REMOTE_AUDIO_BASE = url;
  try { writeFileSync(TUNNEL_URL_FILE, url, 'utf-8'); } catch (e) {}
  console.log(`[Tunnel] URL updated: ${url}`);
  // 重新加载远程音频映射
  try {
    const resp = await fetch(`${url}/api/local_audio_map`);
    const m = await resp.json();
    localAudioMap = m;
    console.log(`[Tunnel] Reloaded ${Object.keys(m).length} FLAC mappings`);
  } catch (e) {
    console.warn('[Tunnel] Failed to reload mappings:', e.message);
  }
  return { ok: true, url };
});

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
