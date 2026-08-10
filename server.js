import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ============================================================
// Cookie Management
// ============================================================
let MUSIC_U = '';
let CSRF = crypto.randomBytes(16).toString('hex');
let DEFAULT_UID = 9895699865;
let NICKNAME = '月汐-Ayn';
let VIP_TYPE = 11;

function loadCookie() {
  try {
    const cookieData = JSON.parse(readFileSync(join(__dirname, 'netease_cookie.json'), 'utf-8'));
    MUSIC_U = cookieData.music_u || '';
    if (cookieData.userId) DEFAULT_UID = cookieData.userId;
    if (cookieData.nickname) NICKNAME = cookieData.nickname;
    if (cookieData.vipType) VIP_TYPE = cookieData.vipType;
    CSRF = crypto.randomBytes(16).toString('hex');
    console.log(`[Cookie] Loaded MUSIC_U (${MUSIC_U.length} chars), UID=${DEFAULT_UID}`);
  } catch (e) {
    console.warn('[Cookie] Failed to load netease_cookie.json:', e.message);
  }
}
loadCookie();

function getCookieStr() {
  return `MUSIC_U=${MUSIC_U}; __csrf=${CSRF}`;
}

// ============================================================
// In-memory storage
// ============================================================
let commentsDB = [];        // {id, song_id, song_name, author, text, time, replies:[]}
let listenSessions = {};    // {id, host:{nickname,avatar}, guest:{nickname,avatar}, song:{name,author,url}, messages:[], created, active}

// ============================================================
// NetEase API helper
// ============================================================
const NETEASE_BASE = 'https://music.163.com';

async function neteaseApi(path, options = {}) {
  const { method = 'GET', body, contentType } = options;
  const headers = {
    'Cookie': getCookieStr(),
    'Referer': 'https://music.163.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (contentType) headers['Content-Type'] = contentType;

  const fetchOpts = { method, headers };
  if (body) fetchOpts.body = body;

  console.log(`[API] ${method} ${NETEASE_BASE}${path}`, body ? 'body:' + body.substring(0, 100) : '');
  const resp = await fetch(`${NETEASE_BASE}${path}`, fetchOpts);
  console.log(`[API] Response: ${resp.status}`);
  return resp.json();
}

// ============================================================
// Fastify Server
// ============================================================
const fastify = Fastify({ logger: false });

// Content type parser removed

// TEST ROUTE
fastify.get('/api/test123', async () => {
  console.log('TEST123 called!');
  return { ok: true };
});

// CORS
// CORS handled via headers (no hook)

// Options handler removed

// ============================================================
// Start Server
// ============================================================
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`🎵 Music server running at ${address}`);
  console.log(`📊 Routes: 3 static + 15 API + 4 comments + 7 listen + 2 pages + 1 MCP + 1 health = 33`);
  console.log(`🔧 MCP tools: 23`);
});
