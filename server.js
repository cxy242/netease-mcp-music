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
