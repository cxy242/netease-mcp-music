// terminal.js — 远程 MCP 管理、OAuth PKCE、工具目录与 tools/call 执行

(function() {
  'use strict'

  var MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
  var MCP_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[0]
  var MCP_TOKEN_PREFIX = 'wanwan_mcp_oauth_'
  var MCP_SECRET_PREFIX = 'wanwan_mcp_secret_'
  var MCP_OAUTH_PENDING_KEY = 'wanwan_mcp_oauth_pending'
  var MCP_OAUTH_RESULT_KEY = 'wanwan_mcp_oauth_result'
  var MCP_TIMEOUT_MS = 20000
  var MCP_TOOL_RESULT_MAX_CHARS = 30000
  var _requestId = 0
  var _terminalState = { view: 'list', serverId: '', busy: false }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    })
  }

  function now() {
    return Date.now()
  }

  function randomId(prefix) {
    var bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    return String(prefix || '') + Array.prototype.map.call(bytes, function(byte) {
      return byte.toString(16).padStart(2, '0')
    }).join('')
  }

  function supportsMcpProtocolVersion(version) {
    return MCP_PROTOCOL_VERSIONS.indexOf(String(version || '')) !== -1
  }

  function requiresMcpProtocolHeader(version) {
    return version === '2025-11-25' || version === '2025-06-18'
  }

  function tokenKey(serverId) {
    return MCP_TOKEN_PREFIX + String(serverId)
  }

  function secretKey(serverId) {
    return MCP_SECRET_PREFIX + String(serverId)
  }

  function readSecret(serverId) {
    try {
      var raw = localStorage.getItem(secretKey(serverId))
      return raw ? JSON.parse(raw) : {}
    } catch (_) {
      return {}
    }
  }

  function saveSecret(serverId, values) {
    var next = Object.assign({}, readSecret(serverId), values || {})
    Object.keys(next).forEach(function(key) {
      if (!next[key]) delete next[key]
    })
    if (Object.keys(next).length) localStorage.setItem(secretKey(serverId), JSON.stringify(next))
    else localStorage.removeItem(secretKey(serverId))
    return next
  }

  function clearSecret(serverId) {
    localStorage.removeItem(secretKey(serverId))
  }

  function readToken(serverId) {
    try {
      var raw = localStorage.getItem(tokenKey(serverId))
      return raw ? JSON.parse(raw) : null
    } catch (_) {
      return null
    }
  }

  function saveToken(serverId, token, previous) {
    var merged = Object.assign({}, previous || {}, token || {})
    if (!merged.refresh_token && previous && previous.refresh_token) merged.refresh_token = previous.refresh_token
    var expiresIn = Number(merged.expires_in)
    if (Number.isFinite(expiresIn) && expiresIn > 0) merged.expiresAt = now() + expiresIn * 1000
    delete merged.expires_in
    delete merged.client_secret
    localStorage.setItem(tokenKey(serverId), JSON.stringify(merged))
    return merged
  }

  function clearToken(serverId) {
    localStorage.removeItem(tokenKey(serverId))
  }

  function normalizeEndpoint(raw) {
    var value = String(raw || '').trim()
    var parsed
    try {
      parsed = new URL(value)
    } catch (_) {
      throw new Error('请输入完整的 MCP Endpoint')
    }
    if (parsed.protocol !== 'https:') throw new Error('MCP Endpoint 必须使用 HTTPS')
    parsed.hash = ''
    return parsed.href
  }

  function normalizeAuth(server) {
    var auth = Object.assign({}, server && server.auth || {})
    var allowed = ['auto', 'none', 'oauth', 'bearer', 'apiKeyHeader', 'apiKeyQuery']
    if (allowed.indexOf(auth.type) < 0) auth.type = 'auto'
    if (auth.type === 'apiKeyHeader') auth.headerName = String(auth.headerName || 'X-API-Key').trim()
    if (auth.type === 'apiKeyQuery') auth.queryParam = String(auth.queryParam || 'key').trim()
    return auth
  }

  function normalizeTransport(server) {
    var transport = Object.assign({}, server && server.transport || {})
    if (['direct', 'fallbackRelay', 'relay'].indexOf(transport.mode) < 0) transport.mode = 'direct'
    return transport
  }

  function authLabel(server) {
    return ({
      auto: '自动检测',
      none: '无需鉴权',
      oauth: 'OAuth',
      bearer: 'Bearer Token',
      apiKeyHeader: 'API Key 请求头',
      apiKeyQuery: 'API Key 查询参数'
    })[normalizeAuth(server).type]
  }

  function transportLabel(server) {
    return ({
      direct: '仅直连',
      fallbackRelay: '失败后中转',
      relay: '仅中转'
    })[normalizeTransport(server).mode]
  }

  function isManualAuth(server) {
    return ['bearer', 'apiKeyHeader', 'apiKeyQuery'].indexOf(normalizeAuth(server).type) >= 0
  }

  function hasCredential(server) {
    var type = normalizeAuth(server).type
    if (type === 'auto' || type === 'oauth') return !!readToken(server.id)
    if (isManualAuth(server)) return !!readSecret(server.id).credential
    return true
  }

  function redactServerSecrets(server, value) {
    var text = String(value == null ? '' : value)
    var secret = readSecret(server.id)
    var token = readToken(server.id) || {}
    ;[secret.credential, secret.relayToken, token.access_token, token.refresh_token].forEach(function(item) {
      if (item) text = text.split(String(item)).join('••••••••')
    })
    return text
  }

  function callbackUri() {
    if (location.protocol === 'file:') return ''
    var url = new URL(location.href)
    url.hash = ''
    url.search = ''
    url.searchParams.set('mcp_oauth_callback', '1')
    return url.href
  }

  function formatTime(timestamp) {
    if (!timestamp) return '尚未检测'
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(new Date(timestamp))
    } catch (_) {
      return new Date(timestamp).toLocaleString()
    }
  }

  function statusInfo(server) {
    var status = server && server.lastConnection && server.lastConnection.status
    if (status === 'connected') return { className: 'ok', label: '已连接' }
    if (status === 'auth_required') return {
      className: 'warn',
      label: isManualAuth(server) || /中转访问令牌/.test(server.lastConnection.error || '') ? '需要凭据' : '需要授权'
    }
    if (status === 'connecting') return { className: 'busy', label: '连接中' }
    if (status === 'error') return { className: 'error', label: '连接失败' }
    return { className: 'idle', label: '未检测' }
  }

  function friendlyError(error) {
    if (!error) return '未知错误'
    if (error.name === 'AbortError') return '连接超时，请检查 MCP 地址和网络'
    if (error.code === 'MCP_CORS') return error.message
    if (error instanceof TypeError && /fetch|network|load/i.test(error.message || '')) {
      return '无法访问 MCP 服务。请确认服务允许当前网页跨域访问，并暴露 MCP-Session-Id 与 WWW-Authenticate 响应头。'
    }
    return String(error.message || error)
  }

  function parseWwwAuthenticate(value) {
    var text = String(value || '')
    var result = {}
    text.replace(/([a-zA-Z_][\w-]*)=(?:"([^"]*)"|([^,\s]+))/g, function(_, key, quoted, plain) {
      result[key.toLowerCase()] = quoted != null ? quoted : plain
      return _
    })
    return result
  }

  function parseSse(text, expectedId) {
    var messages = []
    var dataLines = []
    String(text || '').split(/\r?\n/).forEach(function(line) {
      if (line === '') {
        if (dataLines.length) {
          var raw = dataLines.join('\n')
          dataLines = []
          try { messages.push(JSON.parse(raw)) } catch (_) {}
        }
        return
      }
      if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^ /, ''))
    })
    if (dataLines.length) {
      try { messages.push(JSON.parse(dataLines.join('\n'))) } catch (_) {}
    }
    for (var i = messages.length - 1; i >= 0; i--) {
      if (expectedId == null || String(messages[i].id) === String(expectedId)) return messages[i]
    }
    throw new Error('MCP SSE 响应中没有找到对应的 JSON-RPC 结果')
  }

  async function readMcpResponse(response, expectedId) {
    if (response.status === 202 || response.status === 204) return null
    var type = String(response.headers.get('content-type') || '').toLowerCase()
    var text = await response.text()
    var message
    if (type.indexOf('text/event-stream') >= 0) {
      message = parseSse(text, expectedId)
    } else {
      try {
        message = JSON.parse(text)
      } catch (_) {
        throw new Error('MCP 返回了无法解析的 JSON 响应')
      }
      if (Array.isArray(message)) {
        message = message.find(function(item) { return String(item && item.id) === String(expectedId) })
      }
    }
    if (!message) throw new Error('MCP 返回了空响应')
    if (message.error) {
      var detail = message.error.message || JSON.stringify(message.error)
      throw new Error('MCP 协议错误：' + detail)
    }
    return message
  }

  async function fetchWithTimeout(url, options) {
    var controller = new AbortController()
    var timer = setTimeout(function() { controller.abort() }, MCP_TIMEOUT_MS)
    options = Object.assign({}, options || {}, { signal: controller.signal })
    try {
      return await fetch(url, options)
    } finally {
      clearTimeout(timer)
    }
  }

  function isNetworkFailure(error) {
    return !!error && error.name !== 'AbortError' &&
      (error instanceof TypeError || error.code === 'MCP_CORS' || error.code === 'MCP_NETWORK')
  }

  async function relayFetch(server, targetUrl, options) {
    var transport = normalizeTransport(server)
    if (!transport.relayUrl) throw new Error('请先填写此服务的中转地址')
    var relayUrl = normalizeEndpoint(transport.relayUrl)
    var relayToken = readSecret(server.id).relayToken
    if (!relayToken) {
      var relayCredentialError = new Error('请先填写此服务的中转访问令牌')
      relayCredentialError.code = 'MCP_RELAY_CREDENTIAL_REQUIRED'
      throw relayCredentialError
    }
    var headers = new Headers(options && options.headers || {})
    headers.set('X-WanWan-MCP-Target', String(targetUrl))
    headers.set('X-WanWan-Relay-Token', relayToken)
    var relayOptions = Object.assign({}, options || {}, { headers: headers })
    var response = await fetchWithTimeout(relayUrl, relayOptions)
    server.lastRouteUsed = 'relay'
    return response
  }

  async function fetchForServer(server, targetUrl, options) {
    var transport = normalizeTransport(server)
    if (transport.mode === 'relay') return await relayFetch(server, targetUrl, options)
    try {
      var response = await fetchWithTimeout(targetUrl, options)
      server.lastRouteUsed = 'direct'
      return response
    } catch (error) {
      if (transport.mode !== 'fallbackRelay' || !isNetworkFailure(error)) throw error
      return await relayFetch(server, targetUrl, options)
    }
  }

  async function applyMcpAuthentication(server, targetUrl, headers) {
    var auth = normalizeAuth(server)
    var url = new URL(targetUrl)
    if (auth.type === 'auto' || auth.type === 'oauth') {
      var accessToken = await validAccessToken(server)
      if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken)
    } else if (isManualAuth(server)) {
      var credential = readSecret(server.id).credential
      if (!credential) {
        var missing = new Error('请先填写此服务的访问凭据')
        missing.code = 'MCP_CREDENTIAL_REQUIRED'
        throw missing
      }
      if (auth.type === 'bearer') headers.set('Authorization', 'Bearer ' + credential)
      else if (auth.type === 'apiKeyHeader') headers.set(auth.headerName, credential)
      else url.searchParams.set(auth.queryParam, credential)
    }
    return url.href
  }

  async function refreshAccessToken(server, token) {
    var oauth = server.oauth || {}
    if (!token || !token.refresh_token || !oauth.tokenEndpoint || !oauth.clientId) {
      clearToken(server.id)
      throw new Error('OAuth 授权已过期，请重新授权')
    }
    var body = new URLSearchParams()
    body.set('grant_type', 'refresh_token')
    body.set('refresh_token', token.refresh_token)
    body.set('client_id', oauth.clientId)
    if (oauth.resource) body.set('resource', oauth.resource)
    var response = await fetchForServer(server, oauth.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString()
    })
    var json = null
    try { json = await response.json() } catch (_) {}
    if (!response.ok || !json || !json.access_token) {
      clearToken(server.id)
      throw new Error((json && (json.error_description || json.error)) || 'OAuth 令牌刷新失败，请重新授权')
    }
    return saveToken(server.id, json, token)
  }

  async function validAccessToken(server) {
    var token = readToken(server.id)
    if (!token) return ''
    if (token.expiresAt && token.expiresAt <= now() + 60000) {
      token = await refreshAccessToken(server, token)
    }
    return token.access_token || ''
  }

  async function mcpPost(server, payload, session) {
    var headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    })
    if (session && session.id) headers.set('MCP-Session-Id', session.id)
    if (session && requiresMcpProtocolHeader(session.protocolVersion)) {
      headers.set('MCP-Protocol-Version', session.protocolVersion)
    }
    var requestUrl = await applyMcpAuthentication(server, server.endpointUrl, headers)
    var response
    try {
      response = await fetchForServer(server, requestUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      })
    } catch (error) {
      if (error.name !== 'AbortError' && error instanceof TypeError) {
        error.code = 'MCP_CORS'
        error.message = '无法访问 MCP 服务。请确认服务允许当前网页跨域访问，并暴露 MCP-Session-Id 与 WWW-Authenticate 响应头。'
      }
      throw error
    }
    if (response.status === 401 || response.status === 403) {
      var auth = normalizeAuth(server)
      if (auth.type === 'auto' || auth.type === 'oauth') {
        var authError = new Error('MCP 服务需要 OAuth 授权')
        authError.code = 'MCP_AUTH_REQUIRED'
        authError.wwwAuthenticate = response.headers.get('www-authenticate') || ''
        authError.endpoint = server.endpointUrl
        throw authError
      }
      var credentialError = new Error(auth.type === 'none'
        ? '服务拒绝了无鉴权请求，请修改鉴权方式'
        : '访问凭据无效或权限不足')
      credentialError.code = 'MCP_CREDENTIAL_INVALID'
      throw credentialError
    }
    if (!response.ok) {
      var raw = ''
      try { raw = await response.text() } catch (_) {}
      throw new Error('MCP HTTP ' + response.status + (raw ? '：' + redactServerSecrets(server, raw.slice(0, 300)) : ''))
    }
    var assignedSession = response.headers.get('mcp-session-id')
    if (assignedSession && session) session.id = assignedSession
    return await readMcpResponse(response, payload.id)
  }

  async function closeMcpSession(server, session) {
    if (!session || !session.id) return
    var headers = new Headers({ 'MCP-Session-Id': session.id })
    if (requiresMcpProtocolHeader(session.protocolVersion)) {
      headers.set('MCP-Protocol-Version', session.protocolVersion)
    }
    try {
      var requestUrl = await applyMcpAuthentication(server, server.endpointUrl, headers)
      await fetchForServer(server, requestUrl, { method: 'DELETE', headers: headers })
    } catch (_) {}
  }

  async function discoverTools(server) {
    var session = { id: '', protocolVersion: '' }
    try {
      var initId = ++_requestId
      var initMessage = await mcpPost(server, {
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'wanwan-terminal', title: '弯弯终端', version: '1.0.0' }
        }
      }, session)
      var init = initMessage && initMessage.result
      if (!init || !init.protocolVersion) throw new Error('MCP 初始化响应缺少 protocolVersion')
      if (!supportsMcpProtocolVersion(init.protocolVersion)) {
        throw new Error('服务协商了不受支持的 MCP 版本：' + init.protocolVersion +
          '。终端支持：' + MCP_PROTOCOL_VERSIONS.join('、'))
      }
      if (!init.capabilities || !init.capabilities.tools) {
        throw new Error('这个 MCP 服务没有声明 tools 能力')
      }
      session.protocolVersion = init.protocolVersion
      await mcpPost(server, {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      }, session)
      var tools = []
      var cursor = null
      do {
        var listId = ++_requestId
        var params = {}
        if (cursor) params.cursor = cursor
        var listedMessage = await mcpPost(server, {
          jsonrpc: '2.0',
          id: listId,
          method: 'tools/list',
          params: params
        }, session)
        var listed = listedMessage && listedMessage.result
        if (!listed || !Array.isArray(listed.tools)) throw new Error('tools/list 返回格式无效')
        tools = tools.concat(listed.tools)
        cursor = listed.nextCursor || null
      } while (cursor)
      return {
        tools: tools,
        protocolVersion: init.protocolVersion,
        serverInfo: init.serverInfo || {},
        serverInstructions: init.instructions || '',
        capabilities: init.capabilities
      }
    } finally {
      await closeMcpSession(server, session)
    }
  }

  async function initializeToolSession(server, session) {
    session = session || { id: '', protocolVersion: '' }
    var initId = ++_requestId
    var initMessage = await mcpPost(server, {
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'wanwan-wechat', title: '弯弯微信', version: '1.0.0' }
      }
    }, session)
    var init = initMessage && initMessage.result
    if (!init || !supportsMcpProtocolVersion(init.protocolVersion)) {
      throw new Error('MCP 初始化失败或协议版本不受支持')
    }
    if (!init.capabilities || !init.capabilities.tools) {
      throw new Error('这个 MCP 服务没有声明 tools 能力')
    }
    session.protocolVersion = init.protocolVersion
    await mcpPost(server, {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }, session)
    return session
  }

  function isToolClearlyReadOnly(tool) {
    var annotations = tool && tool.annotations
    return !!annotations && annotations.readOnlyHint === true && annotations.destructiveHint !== true
  }

  function confirmRiskyToolCall(server, tool, args) {
    var detail = ''
    try { detail = JSON.stringify(args || {}, null, 2) } catch (_) { detail = String(args || '') }
    if (detail.length > 4000) detail = detail.slice(0, 4000) + '\n…（参数过长，已省略）'
    var title = tool.title || tool.name
    return window.confirm(
      'MCP 工具调用确认\n\n' +
      '服务：' + (server.name || server.id) + '\n' +
      '工具：' + title + '\n' +
      (tool.description ? '说明：' + tool.description + '\n' : '') +
      '\n此工具未明确标注为安全只读操作。\n\n参数：\n' + detail +
      '\n\n是否允许本次调用？'
    )
  }

  function describeMcpContentPart(part) {
    if (!part || typeof part !== 'object') return String(part == null ? '' : part)
    if (part.type === 'text') return String(part.text || '')
    if (part.type === 'resource_link') {
      return '[资源链接] ' + String(part.name || part.title || '') + ' ' + String(part.uri || '')
    }
    if (part.type === 'resource') {
      var resource = part.resource || {}
      if (typeof resource.text === 'string') return '[资源 ' + String(resource.uri || '') + ']\n' + resource.text
      return '[资源] ' + String(resource.uri || '') + '（非文本内容）'
    }
    if (part.type === 'image') return '[图片内容，MIME：' + String(part.mimeType || '未知') + ']'
    if (part.type === 'audio') return '[音频内容，MIME：' + String(part.mimeType || '未知') + ']'
    try { return JSON.stringify(part) } catch (_) { return '[无法序列化的 MCP 内容]' }
  }

  function normalizeMcpToolResult(result) {
    result = result && typeof result === 'object' ? result : {}
    var payload = {
      ok: result.isError !== true,
      content: Array.isArray(result.content)
        ? result.content.map(describeMcpContentPart).filter(Boolean)
        : []
    }
    if (result.structuredContent != null) payload.structuredContent = result.structuredContent
    var text
    try { text = JSON.stringify(payload) } catch (_) {
      text = JSON.stringify({ ok: false, content: ['MCP 返回结果无法序列化'] })
    }
    return text.length > MCP_TOOL_RESULT_MAX_CHARS
      ? text.slice(0, MCP_TOOL_RESULT_MAX_CHARS) + '…（结果过长，已截断）'
      : text
  }

  function createExecutionRun() {
    return { sessions: {}, closed: false }
  }

  async function closeExecutionRun(run) {
    if (!run || run.closed) return
    run.closed = true
    var entries = Object.keys(run.sessions || {}).map(function(key) { return run.sessions[key] })
    await Promise.all(entries.map(async function(entry) {
      if (!entry) return
      await closeMcpSession(entry.server, entry.session)
    }))
    run.sessions = {}
  }

  async function getExecutionRunSession(run, server) {
    if (!run || run.closed) throw new Error('MCP 执行轮次已经结束')
    var existing = run.sessions[server.id]
    if (existing) return existing.session
    var session = { id: '', protocolVersion: '' }
    var entry = { server: server, session: session }
    run.sessions[server.id] = entry
    try {
      await initializeToolSession(server, session)
      return session
    } catch (error) {
      delete run.sessions[server.id]
      await closeMcpSession(server, session)
      throw error
    }
  }

  function sanitizeMcpTraceValue(value, depth) {
    if (depth > 12) return '[内容层级过深，已省略]'
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return value.length > 50000 ? value.slice(0, 50000) + '…（已截断）' : value
    }
    if (Array.isArray(value)) {
      return value.slice(0, 200).map(function(item) { return sanitizeMcpTraceValue(item, depth + 1) })
    }
    if (typeof value !== 'object') return String(value)
    var clean = {}
    Object.keys(value).slice(0, 200).forEach(function(key) {
      if (key === 'data' && typeof value[key] === 'string' && value[key].length > 10000) {
        clean[key] = '[二进制或长数据已省略]'
        return
      }
      clean[key] = sanitizeMcpTraceValue(value[key], depth + 1)
    })
    return clean
  }

  function extractMcpUrls(value) {
    var found = []
    var seen = {}
    function add(raw, paymentHint) {
      var matches = String(raw || '').match(/https?:\/\/[^\s<>"'，。！？；、\]\[（）(){}]+/gi) || []
      matches.forEach(function(item) {
        var url = item.replace(/[.,;:!?，。！？；、]+$/g, '')
        try {
          var parsed = new URL(url)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
          if (seen[parsed.href]) return
          seen[parsed.href] = true
          found.push({
            url: parsed.href,
            payment: !!paymentHint || /(?:pay|payment|checkout|purchase|order-confirm|结账|支付)/i.test(parsed.href)
          })
        } catch (_) {}
      })
    }
    function visit(item, depth, keyHint) {
      if (depth > 12 || item == null) return
      var paymentHint = /(?:pay|payment|checkout|purchase|结账|支付)/i.test(String(keyHint || ''))
      if (typeof item === 'string') { add(item, paymentHint); return }
      if (Array.isArray(item)) {
        item.slice(0, 200).forEach(function(child) { visit(child, depth + 1, keyHint) })
        return
      }
      if (typeof item !== 'object') return
      Object.keys(item).slice(0, 200).forEach(function(key) {
        visit(item[key], depth + 1, key)
      })
    }
    visit(value, 0, '')
    return found.slice(0, 20)
  }

  async function executeEnabledToolDetailed(binding, args, options) {
    options = options || {}
    var serverId = binding && binding.serverId
    var toolName = binding && binding.toolName
    var server = serverId && await db.mcpServers.get(serverId)
    if (!server || server.enabled === false) throw new Error('MCP 服务不存在或已关闭')
    var tool = (server.tools || []).find(function(item) { return item.name === toolName })
    if (!tool || tool.enabled === false) throw new Error('MCP 工具不存在或已关闭')
    var callArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
    if (!isToolClearlyReadOnly(tool) && options.confirmRisky !== false) {
      if (!confirmRiskyToolCall(server, tool, callArgs)) {
        var deniedContent = JSON.stringify({
          ok: false,
          denied: true,
          error: '用户拒绝了本次 MCP 工具调用，请不要假装操作已经完成。'
        })
        return {
          modelContent: deniedContent,
          result: { denied: true, error: '用户拒绝了本次 MCP 工具调用' },
          urls: [],
          isError: true,
          denied: true
        }
      }
    }
    var ownedRun = !options.executionRun
    var run = options.executionRun || createExecutionRun()
    try {
      var session = await getExecutionRunSession(run, server)
      var callId = ++_requestId
      var message = await mcpPost(server, {
        jsonrpc: '2.0',
        id: callId,
        method: 'tools/call',
        params: { name: tool.name, arguments: callArgs }
      }, session)
      var result = message && message.result
      var isError = !!(result && result.isError === true)
      var errorText = ''
      if (isError) {
        errorText = Array.isArray(result.content)
          ? result.content.map(describeMcpContentPart).filter(Boolean).join('\n').slice(0, 4000)
          : ''
        if (!errorText) errorText = 'MCP 工具返回错误'
      }
      return {
        modelContent: normalizeMcpToolResult(result),
        result: sanitizeMcpTraceValue(result, 0),
        urls: extractMcpUrls(result),
        isError: isError,
        error: errorText,
        denied: false
      }
    } finally {
      if (ownedRun) await closeExecutionRun(run)
    }
  }

  async function executeEnabledTool(binding, args, options) {
    var detailed = await executeEnabledToolDetailed(binding, args, options)
    return detailed.modelContent
  }

  function resourceMetadataCandidates(endpoint) {
    var url = new URL(endpoint)
    var path = url.pathname === '/' ? '' : url.pathname
    return [
      url.origin + '/.well-known/oauth-protected-resource' + path,
      url.origin + '/.well-known/oauth-protected-resource'
    ].filter(function(item, index, list) { return list.indexOf(item) === index })
  }

  function authorizationMetadataCandidates(issuer) {
    var url = new URL(issuer)
    var path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
    return [
      url.origin + '/.well-known/oauth-authorization-server' + path,
      url.origin + '/.well-known/openid-configuration' + path,
      issuer.replace(/\/$/, '') + '/.well-known/openid-configuration'
    ].filter(function(item, index, list) { return list.indexOf(item) === index })
  }

  async function fetchJsonCandidates(server, urls, label) {
    var lastError = null
    for (var i = 0; i < urls.length; i++) {
      try {
        var response = await fetchForServer(server, urls[i], { headers: { Accept: 'application/json' } })
        if (!response.ok) {
          lastError = new Error(label + ' HTTP ' + response.status)
          continue
        }
        return { url: urls[i], value: await response.json() }
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(label + '发现失败：' + friendlyError(lastError))
  }

  async function discoverOAuth(server, authError) {
    var challenge = parseWwwAuthenticate(authError && authError.wwwAuthenticate)
    var resourceResult
    if (challenge.resource_metadata) {
      resourceResult = await fetchJsonCandidates(server, [challenge.resource_metadata], 'OAuth 资源元数据')
    } else {
      resourceResult = await fetchJsonCandidates(server, resourceMetadataCandidates(server.endpointUrl), 'OAuth 资源元数据')
    }
    var resource = resourceResult.value || {}
    var authorizationServers = resource.authorization_servers || []
    if (!authorizationServers.length) throw new Error('OAuth 资源元数据没有提供 authorization_servers')
    var authResult = await fetchJsonCandidates(server, authorizationMetadataCandidates(authorizationServers[0]), 'OAuth 授权服务器')
    var metadata = authResult.value || {}
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new Error('OAuth 元数据缺少 authorization_endpoint 或 token_endpoint')
    }
    var methods = metadata.code_challenge_methods_supported || []
    if (methods.length && methods.indexOf('S256') < 0) throw new Error('OAuth 服务不支持 PKCE S256')
    return {
      resourceMetadataUrl: resourceResult.url,
      resource: resource.resource || server.endpointUrl,
      authorizationServer: authorizationServers[0],
      authorizationMetadataUrl: authResult.url,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      registrationEndpoint: metadata.registration_endpoint || '',
      revocationEndpoint: metadata.revocation_endpoint || '',
      scopes: challenge.scope || (resource.scopes_supported || []).join(' ')
    }
  }

  async function registerPublicClient(server, oauth, redirectUri) {
    if (!oauth.registrationEndpoint) {
      throw new Error('授权服务器不支持动态客户端注册，请在高级设置中填写预注册 Client ID')
    }
    var response = await fetchForServer(server, oauth.registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_name: '弯弯终端',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
      })
    })
    var result = null
    try { result = await response.json() } catch (_) {}
    if (!response.ok || !result || !result.client_id) {
      throw new Error((result && (result.error_description || result.error)) || '动态客户端注册失败')
    }
    if (result.client_secret && result.token_endpoint_auth_method !== 'none') {
      throw new Error('授权服务器只提供机密客户端，浏览器不能安全保存 Client Secret')
    }
    return result.client_id
  }

  function base64Url(bytes) {
    var binary = ''
    bytes.forEach(function(byte) { binary += String.fromCharCode(byte) })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  async function sha256(value) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  }

  async function beginOAuth(server, authError) {
    if (location.protocol === 'file:') throw new Error('OAuth 需要先把应用部署到 HTTP(S) 地址')
    var redirectUri = callbackUri()
    var oauth = await discoverOAuth(server, authError)
    var clientId = String(server.oauth && server.oauth.clientId || '').trim()
    var clientIdSource = String(server.oauth && server.oauth.clientIdSource || (clientId ? 'manual' : ''))
    if (!clientId) {
      clientId = await registerPublicClient(server, oauth, redirectUri)
      clientIdSource = 'dynamic'
    }
    oauth.clientId = clientId
    oauth.clientIdSource = clientIdSource
    server.oauth = Object.assign({}, server.oauth || {}, oauth, { authorized: false })
    server.updatedAt = now()
    await db.mcpServers.put(server)

    var verifierBytes = new Uint8Array(48)
    crypto.getRandomValues(verifierBytes)
    var verifier = base64Url(verifierBytes)
    var challenge = base64Url(await sha256(verifier))
    var state = randomId('state_')
    var pending = {
      serverId: server.id,
      state: state,
      verifier: verifier,
      redirectUri: redirectUri,
      tokenEndpoint: oauth.tokenEndpoint,
      clientId: clientId,
      resource: oauth.resource,
      createdAt: now()
    }
    sessionStorage.setItem(MCP_OAUTH_PENDING_KEY, JSON.stringify(pending))
    var authorize = new URL(oauth.authorizationEndpoint)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('client_id', clientId)
    authorize.searchParams.set('redirect_uri', redirectUri)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')
    authorize.searchParams.set('state', state)
    if (oauth.resource) authorize.searchParams.set('resource', oauth.resource)
    if (oauth.scopes) authorize.searchParams.set('scope', oauth.scopes)
    location.assign(authorize.href)
  }

  function cleanOAuthCallbackUrl() {
    if (!history || !history.replaceState) return
    var clean = new URL(location.href)
    ;['mcp_oauth_callback', 'code', 'state', 'error', 'error_description'].forEach(function(key) {
      clean.searchParams.delete(key)
    })
    history.replaceState(null, '', clean.pathname + (clean.search ? clean.search : '') + clean.hash)
  }

  async function handleOAuthCallback() {
    if (location.protocol === 'file:') return false
    var url = new URL(location.href)
    if (url.searchParams.get('mcp_oauth_callback') !== '1') return false
    var pending = null
    try { pending = JSON.parse(sessionStorage.getItem(MCP_OAUTH_PENDING_KEY) || 'null') } catch (_) {}
    var result = { ok: false, serverId: pending && pending.serverId || '', message: '' }
    try {
      if (!pending) throw new Error('OAuth 登录状态已丢失，请重新授权')
      if (now() - Number(pending.createdAt || 0) > 15 * 60 * 1000) throw new Error('OAuth 授权已超时，请重新授权')
      var returnedState = url.searchParams.get('state') || ''
      if (!returnedState || returnedState !== pending.state) throw new Error('OAuth state 校验失败，已阻止本次授权')
      if (url.searchParams.get('error')) {
        throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'))
      }
      var code = url.searchParams.get('code')
      if (!code) throw new Error('OAuth 回调缺少授权码')
      var body = new URLSearchParams()
      body.set('grant_type', 'authorization_code')
      body.set('code', code)
      body.set('redirect_uri', pending.redirectUri)
      body.set('client_id', pending.clientId)
      body.set('code_verifier', pending.verifier)
      if (pending.resource) body.set('resource', pending.resource)
      var server = await db.mcpServers.get(pending.serverId)
      if (!server) throw new Error('OAuth 对应的 MCP 服务已不存在')
      var response = await fetchForServer(server, pending.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString()
      })
      var token = null
      try { token = await response.json() } catch (_) {}
      if (!response.ok || !token || !token.access_token) {
        throw new Error((token && (token.error_description || token.error)) || 'OAuth 令牌交换失败')
      }
      saveToken(pending.serverId, token)
      if (server) {
        server.oauth = Object.assign({}, server.oauth || {}, { authorized: true })
        server.lastConnection = { status: 'idle', checkedAt: now(), error: '' }
        server.updatedAt = now()
        await db.mcpServers.put(server)
      }
      result.ok = true
      result.message = 'OAuth 授权成功'
    } catch (error) {
      result.message = friendlyError(error)
    } finally {
      sessionStorage.removeItem(MCP_OAUTH_PENDING_KEY)
      sessionStorage.setItem(MCP_OAUTH_RESULT_KEY, JSON.stringify(result))
      cleanOAuthCallbackUrl()
    }
    return true
  }

  function mergeTools(previous, discovered, catalogInitialized) {
    var oldTools = Array.isArray(previous) ? previous : []
    var firstDiscovery = catalogInitialized !== true
    var oldByName = {}
    oldTools.forEach(function(tool) { oldByName[tool.name] = tool })
    return discovered.map(function(tool) {
      var old = oldByName[tool.name]
      return {
        name: String(tool.name || ''),
        title: String(tool.title || ''),
        description: String(tool.description || ''),
        inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object' },
        outputSchema: tool.outputSchema && typeof tool.outputSchema === 'object' ? tool.outputSchema : null,
        annotations: tool.annotations && typeof tool.annotations === 'object' ? tool.annotations : null,
        enabled: old ? old.enabled !== false : firstDiscovery,
        isNew: old ? !!old.isNew : !firstDiscovery
      }
    }).filter(function(tool) { return !!tool.name })
  }

  async function updateConnectionState(server, status, error) {
    server.lastConnection = { status: status, checkedAt: now(), error: error || '' }
    server.updatedAt = now()
    await db.mcpServers.put(server)
  }

  async function connectServer(serverId, interactive) {
    var server = await db.mcpServers.get(serverId)
    if (!server) throw new Error('MCP 服务不存在')
    await updateConnectionState(server, 'connecting', '')
    renderCurrentView()
    try {
      var result = await discoverTools(server)
      server.tools = mergeTools(server.tools, result.tools, server.toolCatalogInitialized)
      server.toolCatalogInitialized = true
      server.protocolVersion = result.protocolVersion
      server.serverInfo = result.serverInfo
      server.serverInstructions = result.serverInstructions
      server.capabilities = result.capabilities
      server.oauth = Object.assign({}, server.oauth || {}, { authorized: !!readToken(server.id) })
      await updateConnectionState(server, 'connected', '')
      if (window.toast) window.toast('已发现 ' + server.tools.length + ' 个 MCP 工具')
      renderCurrentView()
      return server
    } catch (error) {
      if (error.code === 'MCP_AUTH_REQUIRED') {
        await updateConnectionState(server, 'auth_required', '需要 OAuth 授权')
        renderCurrentView()
        if (interactive) {
          await beginOAuth(server, error)
          return null
        }
      } else {
        var message = friendlyError(error)
        if (error.code === 'MCP_CREDENTIAL_REQUIRED' || error.code === 'MCP_CREDENTIAL_INVALID' ||
            error.code === 'MCP_RELAY_CREDENTIAL_REQUIRED' ||
            /授权已过期|重新授权/.test(message)) {
          await updateConnectionState(server, 'auth_required', message)
        } else {
          await updateConnectionState(server, 'error', message)
        }
        renderCurrentView()
        throw error
      }
      return null
    }
  }

  async function revokeServerToken(server) {
    var token = readToken(server.id)
    var oauth = server.oauth || {}
    if (token && token.access_token && oauth.revocationEndpoint && oauth.clientId) {
      try {
        var body = new URLSearchParams()
        body.set('token', token.access_token)
        body.set('client_id', oauth.clientId)
        await fetchForServer(server, oauth.revocationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        })
      } catch (_) {}
    }
    clearToken(server.id)
  }

  async function getEnabledToolCatalog() {
    if (!window.db || !db.mcpServers) return []
    var servers = (await db.mcpServers.toArray()).filter(function(server) {
      return server.enabled !== false
    })
    var catalog = []
    servers.forEach(function(server) {
      ;(server.tools || []).forEach(function(tool) {
        if (tool.enabled === false) return
        catalog.push({
          id: server.id + '__' + tool.name,
          name: tool.name,
          title: tool.title || tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || { type: 'object' },
          outputSchema: tool.outputSchema || null,
          annotations: tool.annotations || null,
          server: {
            id: server.id,
            name: server.name,
            endpointUrl: server.endpointUrl
          }
        })
      })
    })
    return catalog
  }

  function sanitizeToolInputSchemaForModel(schema) {
    function visit(value) {
      if (Array.isArray(value)) return value.map(visit)
      if (!value || typeof value !== 'object') return value
      var clean = {}
      Object.keys(value).forEach(function(key) {
        if (key === 'enum' && Array.isArray(value.enum)) return
        clean[key] = visit(value[key])
      })
      if (Array.isArray(value.enum)) {
        var stringEnum = value.enum.every(function(item) { return typeof item === 'string' })
        if (stringEnum) {
          clean.enum = value.enum.slice()
        } else if (value.enum.length) {
          var enumHint = value.enum.map(function(item) {
            try { return JSON.stringify(item) } catch (_) { return String(item) }
          }).join('、')
          clean.description = String(clean.description || '') +
            (clean.description ? '；' : '') + '可选值：' + enumHint.slice(0, 1000)
        }
      }
      return clean
    }
    var normalized = visit(schema)
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      return { type: 'object', properties: {} }
    }
    if (!normalized.type && !normalized.properties) normalized.type = 'object'
    return normalized
  }

  async function createModelToolBinding() {
    var catalog = await getEnabledToolCatalog()
    var bindings = {}
    var tools = catalog.map(function(item, index) {
      var modelName = 'wanwan_mcp_' + String(index + 1)
      bindings[modelName] = {
        serverId: item.server.id,
        toolName: item.name,
        title: item.title,
        serverName: item.server.name
      }
      return {
        type: 'function',
        function: {
          name: modelName,
          description: '[' + item.server.name + '] ' + (item.description || item.title || item.name),
          parameters: sanitizeToolInputSchemaForModel(item.inputSchema)
        }
      }
    })
    return { tools: tools, bindings: bindings }
  }

  function mcpRelayWorkerSource() {
    return [
      'export default {',
      '  async fetch(request, env) {',
      '    const origin = request.headers.get("Origin") || ""',
      '    const allowedOrigins = String(env.WANWAN_ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean)',
      '    const allowOrigin = allowedOrigins.includes(origin) ? origin : ""',
      '    const requestedHeaders = request.headers.get("Access-Control-Request-Headers") || ""',
      '    const cors = {',
      '      "Access-Control-Allow-Origin": allowOrigin,',
      '      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",',
      '      "Access-Control-Allow-Headers": requestedHeaders,',
      '      "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version, Content-Type",',
      '      "Vary": "Origin"',
      '    }',
      '    if (!allowOrigin) return new Response("Origin not allowed", { status: 403 })',
      '    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })',
      '    if (!["GET", "POST", "DELETE"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: cors })',
      '    if (request.headers.get("X-WanWan-Relay-Token") !== env.WANWAN_RELAY_TOKEN) return new Response("Unauthorized", { status: 401, headers: cors })',
      '    let target',
      '    try { target = new URL(request.headers.get("X-WanWan-MCP-Target") || "") } catch { return new Response("Invalid target", { status: 400, headers: cors }) }',
      '    if (target.protocol !== "https:") return new Response("HTTPS required", { status: 400, headers: cors })',
      '    const allowedHosts = String(env.WANWAN_ALLOWED_HOSTS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean)',
      '    const host = target.hostname.toLowerCase()',
      '    const privateHost = host === "localhost" || host.endsWith(".local") || /^(127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(host) || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host) || host === "::1"',
      '    if (privateHost || !allowedHosts.includes(host)) return new Response("Target host not allowed", { status: 403, headers: cors })',
      '    const headers = new Headers(request.headers)',
      '    ;["Host", "Origin", "X-WanWan-MCP-Target", "X-WanWan-Relay-Token", "Access-Control-Request-Headers", "Access-Control-Request-Method"].forEach(name => headers.delete(name))',
      '    const init = { method: request.method, headers, redirect: "manual" }',
      '    if (request.method !== "GET") init.body = request.body',
      '    let upstream',
      '    try { upstream = await fetch(target, init) } catch (error) { return new Response("Upstream fetch failed", { status: 502, headers: cors }) }',
      '    const responseHeaders = new Headers(upstream.headers)',
      '    Object.entries(cors).forEach(([key, value]) => responseHeaders.set(key, value))',
      '    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })',
      '  }',
      '}'
    ].join('\n')
  }

  function mcpDenoRelaySource() {
    return mcpRelayWorkerSource()
      .replace(
        'export default {\n  async fetch(request, env) {',
        'Deno.serve(async (request) => {\n    const env = {\n' +
          '      WANWAN_RELAY_TOKEN: Deno.env.get("WANWAN_RELAY_TOKEN"),\n' +
          '      WANWAN_ALLOWED_ORIGINS: Deno.env.get("WANWAN_ALLOWED_ORIGINS"),\n' +
          '      WANWAN_ALLOWED_HOSTS: Deno.env.get("WANWAN_ALLOWED_HOSTS")\n' +
          '    }'
      )
      .replace(/\n  }\n}$/, '\n  })')
  }

  function copyPlainText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value)
    var textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    var copied = document.execCommand('copy')
    textarea.remove()
    return copied ? Promise.resolve() : Promise.reject(new Error('浏览器不支持自动复制'))
  }

  function openMcpRelayTutorial(kind) {
    var isDeno = kind === 'deno'
    var source = isDeno ? mcpDenoRelaySource() : mcpRelayWorkerSource()
    var platform = isDeno ? 'Deno Deploy' : 'Cloudflare Worker'
    var deploySteps = isDeno
      ? '在 Deno Deploy 免费创建 App，将代码保存为 main.ts，并在应用设置中添加三个环境变量后部署。'
      : '新建 Cloudflare Worker，设置三个 Secret/环境变量，然后粘贴下方代码并部署。'
    var html =
      '<div class="setting-section"><div class="section-title">部署步骤</div>' +
        '<div class="section-desc">' + deploySteps + '</div>' +
        '<div class="tutorial-code">WANWAN_RELAY_TOKEN：中转访问令牌<br>WANWAN_ALLOWED_ORIGINS：弯弯部署地址，多个用逗号分隔<br>WANWAN_ALLOWED_HOSTS：允许访问的 MCP 与 OAuth 主机，多个用逗号分隔</div></div>' +
      '<div class="setting-section"><div class="tutorial-section-head"><div class="section-title">中转代码</div>' +
        '<button class="tutorial-copy-btn" id="btn-copy-mcp-relay" type="button"><i class="fa-regular fa-clone"></i>复制</button></div>' +
        '<pre class="tutorial-code tutorial-code-block"><code>' + esc(source) + '</code></pre></div>' +
      '<div class="setting-section"><div class="section-title">安全提醒</div>' +
        '<div class="section-desc">不要使用通配 Origin 或开放所有目标主机。OAuth 使用其他域名时，也要把元数据、注册和 Token 端点的主机加入白名单。</div></div>'
    var page = buildSubPage('sub-mcp-relay-tutorial', platform + ' 中转教程', html)
    openSubPage(page)
    page.querySelector('#btn-copy-mcp-relay').addEventListener('click', function() {
      copyPlainText(source).then(function() { window.toast('中转代码已复制') })
        .catch(function(error) { window.toast('复制失败：' + friendlyError(error)) })
    })
  }

  // ===== MCP 跑腿助理专属 API =====
  function readMcpApiForm(page) {
    var get = function(id) {
      var el = page.querySelector('#' + id)
      return el ? String(el.value || '').trim() : ''
    }
    var cfg = {
      url: String(get('mcp-api-base-url')).replace(/\/+$/, ''),
      key: get('mcp-api-key'),
      model: get('mcp-api-model-input')
    }
    cfg.complete = !!(cfg.url && cfg.key && cfg.model)
    return cfg
  }

  function validateMcpApiForm(cfg) {
    var missing = []
    if (!cfg.url) missing.push('Base URL')
    if (!cfg.key) missing.push('API Key')
    if (!cfg.model) missing.push('模型')
    if (missing.length) throw new Error('请填写：' + missing.join('、'))
  }

  async function openMcpApiConfigPage() {
    var oldPage = document.getElementById('mcp-api-config-page')
    if (oldPage) oldPage.remove()
    var cfg = window.loadMcpApiConfig
      ? await window.loadMcpApiConfig(true)
      : { url: '', key: '', model: '', complete: false }
    var html =
      '<div class="setting-section">' +
        '<div class="api-form memory-api-form">' +
          '<div class="memory-api-desc">' +
            '聊天里触发 MCP 时，会先由一个后台跑腿助理判断该不该调用工具，并把结果写成一段人话交给角色。' +
            '这里可以给跑腿助理单独配一个便宜的模型——它不需要角色扮演能力。' +
            '<br><strong>留空即使用主 API。</strong>' +
          '</div>' +
          '<label class="form-label">Base URL</label>' +
          '<input class="input-field" id="mcp-api-base-url" placeholder="https://api.openai.com/v1" value="' + esc(cfg.url) + '">' +
          '<label class="form-label">API Key</label>' +
          '<div class="input-with-toggle">' +
            '<input class="input-field" id="mcp-api-key" type="password" autocomplete="off" placeholder="sk-..." value="' + esc(cfg.key) + '">' +
            '<button class="btn-text-toggle" id="mcp-api-key-toggle" type="button">显示</button>' +
          '</div>' +
          '<label class="form-label">模型</label>' +
          '<input class="input-field" id="mcp-api-model-input" placeholder="手动输入模型名，例如 gpt-4o-mini" value="' + esc(cfg.model) + '">' +
          '<div class="model-row">' +
            '<select class="input-field" id="mcp-api-model">' +
              '<option value="">拉取后选择模型</option>' +
              (cfg.model ? '<option value="' + esc(cfg.model) + '" selected>' + esc(cfg.model) + '</option>' : '') +
            '</select>' +
            '<button class="btn-ghost btn-sm" id="mcp-api-load-models" type="button">获取</button>' +
          '</div>' +
          '<div class="api-test-row">' +
            '<button class="btn-ghost" id="mcp-api-test" type="button">连接测试</button>' +
          '</div>' +
          '<button class="btn-pill btn-full" id="mcp-api-save" type="button">保存 MCP API</button>' +
          '<button class="btn-ghost btn-full btn-text-danger memory-api-clear" id="mcp-api-clear" type="button">清除配置并使用主 API</button>' +
        '</div>' +
      '</div>'
    var page = buildSubPage('mcp-api-config-page', 'MCP 专属 API', html)
    openSubPage(page)

    var keyInput = page.querySelector('#mcp-api-key')
    var keyToggle = page.querySelector('#mcp-api-key-toggle')
    keyToggle.addEventListener('click', function() {
      var hidden = keyInput.type === 'password'
      keyInput.type = hidden ? 'text' : 'password'
      keyToggle.textContent = hidden ? '隐藏' : '显示'
    })
    page.querySelector('#mcp-api-model').addEventListener('change', function(e) {
      if (e.target.value) page.querySelector('#mcp-api-model-input').value = e.target.value
    })
    page.querySelector('#mcp-api-load-models').addEventListener('click', async function(e) {
      var btn = e.currentTarget
      var formCfg = readMcpApiForm(page)
      if (!formCfg.url) { window.toast('请先填写 Base URL'); return }
      btn.disabled = true
      btn.textContent = '获取中...'
      try {
        var res = await fetch(formCfg.url + '/models', {
          headers: { Authorization: 'Bearer ' + formCfg.key }
        })
        var text = await res.text()
        var json = text ? JSON.parse(text) : {}
        if (!res.ok) throw new Error((json.error && json.error.message) || json.message || ('HTTP ' + res.status))
        var models = Array.isArray(json.data)
          ? json.data.map(function(item) { return item && item.id }).filter(Boolean)
          : []
        var current = page.querySelector('#mcp-api-model-input').value.trim()
        var options = ['<option value="">拉取后选择模型</option>']
        models.forEach(function(model) {
          options.push('<option value="' + esc(model) + '"' + (model === current ? ' selected' : '') + '>' + esc(model) + '</option>')
        })
        if (current && models.indexOf(current) < 0) {
          options.push('<option value="' + esc(current) + '" selected>' + esc(current) + '</option>')
        }
        page.querySelector('#mcp-api-model').innerHTML = options.join('')
        window.toast('已加载 ' + models.length + ' 个模型')
      } catch (error) {
        window.toast('获取模型失败：' + friendlyError(error))
      } finally {
        btn.disabled = false
        btn.textContent = '获取'
      }
    })
    page.querySelector('#mcp-api-test').addEventListener('click', async function(e) {
      var btn = e.currentTarget
      var oldText = btn.textContent
      btn.disabled = true
      btn.textContent = '测试中...'
      try {
        var formCfg = readMcpApiForm(page)
        validateMcpApiForm(formCfg)
        var json = await window.runTrackedChatCompletion(formCfg, {
          model: formCfg.model,
          messages: [{ role: 'user', content: '请只回复：连接成功' }]
        }, 'MCP 专属 API 连接测试')
        var message = json && json.choices && json.choices[0] && json.choices[0].message
        if (!message || (message.content == null && !message.reasoning_content)) {
          throw new Error('接口已响应，但没有返回有效的聊天内容')
        }
        window.toast('MCP API 连接成功')
      } catch (error) {
        window.toast('连接测试失败：' + friendlyError(error))
      } finally {
        btn.disabled = false
        btn.textContent = oldText
      }
    })
    page.querySelector('#mcp-api-save').addEventListener('click', async function(e) {
      var btn = e.currentTarget
      try {
        var formCfg = readMcpApiForm(page)
        validateMcpApiForm(formCfg)
        btn.disabled = true
        await Promise.all([
          db.config.put({ key: 'mcpApiBaseUrl', value: formCfg.url }),
          db.config.put({ key: 'mcpApiKey', value: formCfg.key }),
          db.config.put({ key: 'mcpApiModel', value: formCfg.model })
        ])
        window._mcpApiConfigCache = null
        window.toast('MCP API 已保存')
      } catch (error) {
        window.toast('保存失败：' + friendlyError(error))
      } finally {
        btn.disabled = false
      }
    })
    page.querySelector('#mcp-api-clear').addEventListener('click', async function(e) {
      if (!confirm('清除 MCP 专属 API 配置并恢复使用主 API？')) return
      var btn = e.currentTarget
      btn.disabled = true
      try {
        await Promise.all([
          db.config.delete('mcpApiBaseUrl'),
          db.config.delete('mcpApiKey'),
          db.config.delete('mcpApiModel')
        ])
        window._mcpApiConfigCache = null
        page.querySelector('#mcp-api-base-url').value = ''
        page.querySelector('#mcp-api-key').value = ''
        page.querySelector('#mcp-api-model-input').value = ''
        page.querySelector('#mcp-api-model').innerHTML = '<option value="">拉取后选择模型</option>'
        window.toast('已恢复使用主 API')
      } catch (error) {
        window.toast('清除失败：' + friendlyError(error))
      } finally {
        btn.disabled = false
      }
    })
  }

  function createPage() {
    var page = document.createElement('div')
    page.id = 'terminal-page'
    page.className = 'full-page terminal-page'
    page.innerHTML =
      '<header class="page-header terminal-header">' +
        '<button class="header-back" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
        '<div class="terminal-title-wrap"><span class="header-title">终端</span><small>MCP MANAGER</small></div>' +
        '<button class="terminal-header-action" type="button" data-terminal-api aria-label="MCP 专属 API"><i class="fa-solid fa-sliders"></i></button>' +
        '<button class="terminal-header-action" type="button" data-terminal-add aria-label="添加 MCP"><i class="fa fa-plus"></i></button>' +
      '</header>' +
      '<main class="terminal-shell" id="terminal-shell"></main>'
    page.querySelector('.header-back').addEventListener('click', function() {
      if (_terminalState.view === 'list') window.closePage('terminal-page')
      else {
        _terminalState = { view: 'list', serverId: '', busy: false }
        renderCurrentView()
      }
    })
    page.querySelector('[data-terminal-api]').addEventListener('click', function() {
      openMcpApiConfigPage()
    })
    page.querySelector('[data-terminal-add]').addEventListener('click', function() {
      _terminalState = { view: 'form', serverId: '', busy: false }
      renderCurrentView()
    })
    return page
  }

  function setHeaderForView() {
    var page = document.getElementById('terminal-page')
    if (!page) return
    var title = page.querySelector('.header-title')
    var add = page.querySelector('[data-terminal-add]')
    var api = page.querySelector('[data-terminal-api]')
    title.textContent = _terminalState.view === 'list' ? '终端' :
      (_terminalState.view === 'form' ? (_terminalState.serverId ? '编辑 MCP' : '添加 MCP') : 'MCP 详情')
    add.style.visibility = _terminalState.view === 'list' ? 'visible' : 'hidden'
    if (api) api.style.visibility = _terminalState.view === 'list' ? 'visible' : 'hidden'
  }

  function renderEmpty() {
    return '<section class="terminal-empty">' +
      '<div class="terminal-empty-icon" aria-hidden="true"><span>&gt;_</span></div>' +
      '<h2>还没有 MCP 服务</h2>' +
      '<p>添加一个支持 Streamable HTTP 的远程 MCP，在这里完成授权并管理它提供的工具。</p>' +
      '<button class="terminal-primary" type="button" data-empty-add><i class="fa fa-plus"></i> 添加 MCP</button>' +
      '<div class="terminal-hint"><span>HTTPS</span><span>OAuth PKCE</span><span>2025-03-26+</span></div>' +
    '</section>'
  }

  function serverCard(server) {
    var status = statusInfo(server)
    var tools = Array.isArray(server.tools) ? server.tools : []
    var enabledCount = tools.filter(function(tool) { return tool.enabled !== false }).length
    return '<article class="terminal-server-card" data-server-id="' + esc(server.id) + '">' +
      '<button class="terminal-server-open" type="button" data-open-server="' + esc(server.id) + '">' +
        '<span class="terminal-server-icon"><i class="fa-solid fa-server"></i></span>' +
        '<span class="terminal-server-copy">' +
          '<strong>' + esc(server.name) + '</strong>' +
          '<small>' + esc(new URL(server.endpointUrl).host) + '</small>' +
        '</span>' +
        '<span class="terminal-status ' + status.className + '"><i></i>' + esc(status.label) + '</span>' +
        '<i class="fa fa-angle-right terminal-chevron"></i>' +
      '</button>' +
      '<div class="terminal-server-meta">' +
        '<span>' + enabledCount + ' / ' + tools.length + ' 个工具</span>' +
        '<label class="terminal-switch" title="启用服务">' +
          '<input type="checkbox" data-server-toggle="' + esc(server.id) + '"' + (server.enabled !== false ? ' checked' : '') + '>' +
          '<span></span>' +
        '</label>' +
      '</div>' +
    '</article>'
  }

  async function renderList(shell) {
    var servers = await db.mcpServers.orderBy('updatedAt').reverse().toArray()
    if (!servers.length) {
      shell.innerHTML = renderEmpty()
      shell.querySelector('[data-empty-add]').addEventListener('click', function() {
        _terminalState = { view: 'form', serverId: '', busy: false }
        renderCurrentView()
      })
      return
    }
    shell.innerHTML =
      '<section class="terminal-list-intro"><span>已配置 ' + servers.length + ' 个服务</span><small>关闭的服务不会提供给未来的聊天功能</small></section>' +
      '<section class="terminal-server-list">' + servers.map(serverCard).join('') + '</section>'
    shell.querySelectorAll('[data-open-server]').forEach(function(button) {
      button.addEventListener('click', function() {
        _terminalState = { view: 'detail', serverId: button.dataset.openServer, busy: false }
        renderCurrentView()
      })
    })
    shell.querySelectorAll('[data-server-toggle]').forEach(function(input) {
      input.addEventListener('change', async function(event) {
        event.stopPropagation()
        var server = await db.mcpServers.get(input.dataset.serverToggle)
        if (!server) return
        server.enabled = input.checked
        server.updatedAt = now()
        await db.mcpServers.put(server)
      })
    })
  }

  function formHtml(server) {
    server = server || {}
    var auth = normalizeAuth(server)
    var transport = normalizeTransport(server)
    var secret = server.id ? readSecret(server.id) : {}
    var editableClientId = server.oauth && server.oauth.clientIdSource !== 'dynamic' ? server.oauth.clientId : ''
    function option(value, label, current) {
      return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + label + '</option>'
    }
    return '<form class="terminal-form" id="terminal-server-form">' +
      '<div class="terminal-form-lead"><i class="fa-solid fa-link"></i><div><strong>远程 MCP</strong><span>连接支持 Streamable HTTP 的 HTTPS 服务</span></div></div>' +
      '<label class="terminal-field"><span>显示名称</span><input id="terminal-name" maxlength="60" placeholder="例如 Notion MCP" value="' + esc(server.name || '') + '"></label>' +
      '<label class="terminal-field"><span>MCP Endpoint</span><input id="terminal-endpoint" inputmode="url" autocapitalize="none" placeholder="https://example.com/mcp" value="' + esc(server.endpointUrl || '') + '"></label>' +
      '<label class="terminal-field"><span>鉴权方式</span><select id="terminal-auth-type">' +
        option('auto', '自动检测', auth.type) +
        option('none', '无需鉴权', auth.type) +
        option('oauth', 'OAuth', auth.type) +
        option('bearer', 'Bearer Token', auth.type) +
        option('apiKeyHeader', 'API Key 请求头', auth.type) +
        option('apiKeyQuery', 'API Key 查询参数', auth.type) +
      '</select></label>' +
      '<div class="terminal-dynamic-fields" data-auth-manual>' +
        '<label class="terminal-field" data-auth-header-name><span>请求头名称</span><input id="terminal-header-name" autocapitalize="none" placeholder="X-Goog-Api-Key" value="' + esc(auth.headerName || '') + '"></label>' +
        '<label class="terminal-field" data-auth-query-param><span>查询参数名称</span><input id="terminal-query-param" autocapitalize="none" placeholder="key" value="' + esc(auth.queryParam || '') + '"></label>' +
        '<label class="terminal-field"><span>访问凭据 <small>' + (secret.credential ? '已保存在本机，留空则保留' : '仅保存在本机') + '</small></span><input id="terminal-credential" type="password" autocomplete="off" placeholder="' + (secret.credential ? '••••••••' : '输入 Token 或 API Key') + '"></label>' +
        (secret.credential ? '<button class="terminal-inline-danger" type="button" data-clear-credential>清除已保存凭据</button>' : '') +
      '</div>' +
      '<details class="terminal-advanced" data-oauth-settings' + (editableClientId ? ' open' : '') + '>' +
        '<summary>OAuth 高级设置 <i class="fa fa-angle-down"></i></summary>' +
        '<label class="terminal-field"><span>预注册 Client ID <small>可选</small></span><input id="terminal-client-id" autocapitalize="none" placeholder="不填则尝试动态注册" value="' + esc(editableClientId || '') + '"></label>' +
        '<p>浏览器只支持公共 OAuth 客户端，不会接收或保存 Client Secret。</p>' +
      '</details>' +
      '<details class="terminal-advanced" data-transport-settings' + (transport.mode !== 'direct' ? ' open' : '') + '>' +
        '<summary>连接与中转 <i class="fa fa-angle-down"></i></summary>' +
        '<label class="terminal-field"><span>连接模式</span><select id="terminal-transport-mode">' +
          option('direct', '仅直连', transport.mode) +
          option('fallbackRelay', '直连失败后中转', transport.mode) +
          option('relay', '仅中转', transport.mode) +
        '</select></label>' +
        '<div class="terminal-dynamic-fields" data-relay-fields>' +
          '<label class="terminal-field"><span>中转地址</span><input id="terminal-relay-url" inputmode="url" autocapitalize="none" placeholder="https://your-worker.workers.dev" value="' + esc(transport.relayUrl || '') + '"></label>' +
          '<label class="terminal-field"><span>中转访问令牌 <small>' + (secret.relayToken ? '已保存在本机，留空则保留' : '仅保存在本机') + '</small></span><input id="terminal-relay-token" type="password" autocomplete="off" placeholder="' + (secret.relayToken ? '••••••••' : '输入 Worker 令牌') + '"></label>' +
          (secret.relayToken ? '<button class="terminal-inline-danger" type="button" data-clear-relay-token>清除中转令牌</button>' : '') +
          '<div class="terminal-relay-tutorials">' +
            '<button class="terminal-inline-link" type="button" data-relay-tutorial="cloudflare"><i class="fa-brands fa-cloudflare"></i> Cloudflare Worker</button>' +
            '<button class="terminal-inline-link" type="button" data-relay-tutorial="deno"><i class="fa-solid fa-bolt"></i> Deno Deploy（免费）</button>' +
          '</div>' +
          '<p>中转只应用于网络请求，OAuth 登录页面仍会直接打开官方地址。</p>' +
        '</div>' +
      '</details>' +
      '<div class="terminal-form-note"><i class="fa-solid fa-shield-halved"></i><span>地址和非敏感设置会进入备份；所有令牌与密钥只保存在当前设备。</span></div>' +
      '<button class="terminal-primary terminal-submit" type="submit">' + (server.id ? '保存修改' : '保存并测试连接') + '</button>' +
    '</form>'
  }

  async function renderForm(shell) {
    var server = _terminalState.serverId ? await db.mcpServers.get(_terminalState.serverId) : null
    shell.innerHTML = formHtml(server)
    var form = shell.querySelector('#terminal-server-form')
    var clearCredentialRequested = false
    var clearRelayRequested = false
    function refreshDynamicFields() {
      var authType = shell.querySelector('#terminal-auth-type').value
      var manual = ['bearer', 'apiKeyHeader', 'apiKeyQuery'].indexOf(authType) >= 0
      if (authType === 'apiKeyHeader' && !shell.querySelector('#terminal-header-name').value.trim()) {
        shell.querySelector('#terminal-header-name').value = 'X-API-Key'
      }
      if (authType === 'apiKeyQuery' && !shell.querySelector('#terminal-query-param').value.trim()) {
        shell.querySelector('#terminal-query-param').value = 'key'
      }
      shell.querySelector('[data-auth-manual]').hidden = !manual
      shell.querySelector('[data-auth-header-name]').hidden = authType !== 'apiKeyHeader'
      shell.querySelector('[data-auth-query-param]').hidden = authType !== 'apiKeyQuery'
      shell.querySelector('[data-oauth-settings]').hidden = ['auto', 'oauth'].indexOf(authType) < 0
      shell.querySelector('[data-relay-fields]').hidden = shell.querySelector('#terminal-transport-mode').value === 'direct'
    }
    shell.querySelector('#terminal-auth-type').addEventListener('change', refreshDynamicFields)
    shell.querySelector('#terminal-transport-mode').addEventListener('change', refreshDynamicFields)
    var clearCredentialButton = shell.querySelector('[data-clear-credential]')
    if (clearCredentialButton) clearCredentialButton.addEventListener('click', function() {
      clearCredentialRequested = true
      clearCredentialButton.disabled = true
      clearCredentialButton.textContent = '保存后清除'
      shell.querySelector('#terminal-credential').placeholder = '输入新凭据可直接替换'
    })
    var clearRelayButton = shell.querySelector('[data-clear-relay-token]')
    if (clearRelayButton) clearRelayButton.addEventListener('click', function() {
      clearRelayRequested = true
      clearRelayButton.disabled = true
      clearRelayButton.textContent = '保存后清除'
      shell.querySelector('#terminal-relay-token').placeholder = '输入新令牌可直接替换'
    })
    shell.querySelectorAll('[data-relay-tutorial]').forEach(function(button) {
      button.addEventListener('click', function() {
        openMcpRelayTutorial(button.dataset.relayTutorial)
      })
    })
    refreshDynamicFields()
    form.addEventListener('submit', async function(event) {
      event.preventDefault()
      if (_terminalState.busy) return
      var name = shell.querySelector('#terminal-name').value.trim()
      var endpoint
      var authType = shell.querySelector('#terminal-auth-type').value
      var headerName = shell.querySelector('#terminal-header-name').value.trim()
      var queryParam = shell.querySelector('#terminal-query-param').value.trim()
      var credentialInput = shell.querySelector('#terminal-credential').value.trim()
      var transportMode = shell.querySelector('#terminal-transport-mode').value
      var relayUrl = shell.querySelector('#terminal-relay-url').value.trim()
      var relayTokenInput = shell.querySelector('#terminal-relay-token').value.trim()
      try {
        if (!name) throw new Error('请输入显示名称')
        endpoint = normalizeEndpoint(shell.querySelector('#terminal-endpoint').value)
        if (authType === 'apiKeyHeader' && !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(headerName)) {
          throw new Error('请输入有效的 API Key 请求头名称')
        }
        if (authType === 'apiKeyQuery' && !queryParam) throw new Error('请输入 API Key 查询参数名称')
        if (authType === 'apiKeyQuery') {
          var endpointObject = new URL(endpoint)
          if (!credentialInput && endpointObject.searchParams.has(queryParam)) {
            credentialInput = endpointObject.searchParams.get(queryParam) || ''
          }
          endpointObject.searchParams.delete(queryParam)
          endpoint = endpointObject.href
        }
        if (transportMode !== 'direct') relayUrl = normalizeEndpoint(relayUrl)
      } catch (error) {
        window.toast(friendlyError(error))
        return
      }
      var formClientId = shell.querySelector('#terminal-client-id').value.trim()
      var existing = server || null
      var changedEndpoint = !!(existing && existing.endpointUrl !== endpoint)
      var previousAuth = normalizeAuth(existing)
      var nextAuth = {
        type: authType,
        headerName: authType === 'apiKeyHeader' ? headerName : '',
        queryParam: authType === 'apiKeyQuery' ? queryParam : ''
      }
      var changedAuth = !!(existing && (
        previousAuth.type !== nextAuth.type ||
        (nextAuth.type === 'apiKeyHeader' && previousAuth.headerName !== nextAuth.headerName) ||
        (nextAuth.type === 'apiKeyQuery' && previousAuth.queryParam !== nextAuth.queryParam)
      ))
      var previousTransport = normalizeTransport(existing)
      var changedTransport = !!(existing && (
        previousTransport.mode !== transportMode ||
        String(previousTransport.relayUrl || '') !== String(relayUrl || '')
      ))
      var row = existing || {
        id: randomId('mcp_'),
        enabled: true,
        tools: [],
        createdAt: now()
      }
      row.name = name
      row.endpointUrl = endpoint
      row.auth = nextAuth
      row.transport = { mode: transportMode, relayUrl: transportMode === 'direct' ? '' : relayUrl }
      var existingOauth = row.oauth || {}
      var clientId = formClientId
      var clientIdSource = formClientId ? 'manual' : ''
      if (!changedEndpoint && !formClientId && existingOauth.clientIdSource === 'dynamic') {
        clientId = existingOauth.clientId
        clientIdSource = 'dynamic'
      }
      row.oauth = (changedEndpoint || changedAuth)
        ? { clientId: clientId, clientIdSource: clientIdSource, authorized: false }
        : Object.assign({}, existingOauth, {
            clientId: clientId,
            clientIdSource: clientIdSource,
            authorized: !!existingOauth.authorized
          })
      row.updatedAt = now()
      var identityChanged = changedEndpoint || changedAuth
      var shouldReconnect = !existing || identityChanged || changedTransport || !!credentialInput || !!relayTokenInput || clearCredentialRequested || clearRelayRequested
      row.lastConnection = shouldReconnect ? { status: 'idle', checkedAt: 0, error: '' } : (row.lastConnection || { status: 'idle', checkedAt: 0, error: '' })
      if (identityChanged) {
        row.tools = []
        row.toolCatalogInitialized = false
        clearToken(row.id)
        saveSecret(row.id, { credential: '' })
      }
      if (clearCredentialRequested) saveSecret(row.id, { credential: '' })
      if (clearRelayRequested) saveSecret(row.id, { relayToken: '' })
      if (credentialInput) saveSecret(row.id, { credential: credentialInput })
      if (relayTokenInput) saveSecret(row.id, { relayToken: relayTokenInput })
      _terminalState.busy = true
      var submit = shell.querySelector('.terminal-submit')
      submit.disabled = true
      submit.textContent = '正在保存…'
      try {
        await db.mcpServers.put(row)
        _terminalState = { view: 'detail', serverId: row.id, busy: false }
        renderCurrentView()
        if (shouldReconnect) await connectServer(row.id, true)
        else window.toast('MCP 配置已保存')
      } catch (error) {
        _terminalState.busy = false
        submit.disabled = false
        submit.textContent = existing ? '保存修改' : '保存并测试连接'
        window.toast(friendlyError(error))
      }
    })
  }

  function toolRow(server, tool) {
    var title = tool.title || tool.name
    var propertyCount = tool.inputSchema && tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties).length : 0
    return '<article class="terminal-tool-row">' +
      '<div class="terminal-tool-main">' +
        '<div class="terminal-tool-title"><code>' + esc(title) + '</code>' + (tool.isNew ? '<span>新增</span>' : '') + '</div>' +
        (title !== tool.name ? '<small class="terminal-tool-name">' + esc(tool.name) + '</small>' : '') +
        '<p>' + esc(tool.description || '该工具没有提供说明') + '</p>' +
        '<small class="terminal-tool-schema">' + propertyCount + ' 个输入参数</small>' +
      '</div>' +
      '<label class="terminal-switch">' +
        '<input type="checkbox" data-tool-toggle="' + esc(tool.name) + '"' + (tool.enabled !== false ? ' checked' : '') + '>' +
        '<span></span>' +
      '</label>' +
    '</article>'
  }

  async function renderDetail(shell) {
    var server = await db.mcpServers.get(_terminalState.serverId)
    if (!server) {
      _terminalState = { view: 'list', serverId: '', busy: false }
      return renderCurrentView()
    }
    var status = statusInfo(server)
    var tools = Array.isArray(server.tools) ? server.tools : []
    var infoName = server.serverInfo && (server.serverInfo.title || server.serverInfo.name)
    var auth = normalizeAuth(server)
    var credentialState = auth.type === 'none' ? '不需要凭据' :
      (hasCredential(server) ? (isManualAuth(server) ? '凭据已保存在本机' : 'OAuth 已授权') :
        (auth.type === 'auto' && server.lastConnection && server.lastConnection.status === 'connected'
          ? '无需凭据「自动检测」'
          : '需要填写或授权'))
    var routeState = transportLabel(server) + (server.lastRouteUsed ? ' · 上次' + (server.lastRouteUsed === 'relay' ? '中转' : '直连') : '')
    var showOAuthAction = auth.type === 'oauth' || (auth.type === 'auto' &&
      (!!readToken(server.id) || (server.lastConnection && server.lastConnection.status === 'auth_required')))
    var authAction = showOAuthAction
      ? '<button type="button" data-auth-action="oauth"><i class="fa-solid fa-key"></i><span>重新授权</span></button>'
      : (isManualAuth(server)
          ? '<button type="button" data-auth-action="manual"><i class="fa-solid fa-key"></i><span>更新凭据</span></button>'
          : '')
    shell.innerHTML =
      '<section class="terminal-detail-hero">' +
        '<div class="terminal-detail-icon"><i class="fa-solid fa-server"></i></div>' +
        '<div class="terminal-detail-title"><h2>' + esc(server.name) + '</h2><p>' + esc(server.endpointUrl) + '</p></div>' +
        '<label class="terminal-switch terminal-switch-large"><input type="checkbox" data-detail-server-toggle' + (server.enabled !== false ? ' checked' : '') + '><span></span></label>' +
      '</section>' +
      '<section class="terminal-diagnostic ' + status.className + '">' +
        '<div><span class="terminal-status ' + status.className + '"><i></i>' + esc(status.label) + '</span><small>' + esc(formatTime(server.lastConnection && server.lastConnection.checkedAt)) + '</small></div>' +
        (server.lastConnection && server.lastConnection.error ? '<p>' + esc(server.lastConnection.error) + '</p>' : '') +
        '<dl>' +
          '<div><dt>协议</dt><dd>' + esc(server.protocolVersion || MCP_PROTOCOL_VERSION) + '</dd></div>' +
          '<div><dt>服务</dt><dd>' + esc(infoName || '等待连接') + '</dd></div>' +
          '<div><dt>鉴权</dt><dd>' + esc(authLabel(server)) + '</dd></div>' +
          '<div><dt>凭据</dt><dd>' + esc(credentialState) + '</dd></div>' +
          '<div><dt>连接</dt><dd>' + esc(routeState) + '</dd></div>' +
        '</dl>' +
      '</section>' +
      '<section class="terminal-actions' + (authAction ? ' has-auth-action' : '') + '">' +
        '<button type="button" data-refresh-server><i class="fa-solid fa-arrows-rotate"></i><span>刷新工具</span></button>' +
        authAction +
        '<button type="button" data-edit-server><i class="fa-solid fa-pen"></i><span>编辑</span></button>' +
        '<button type="button" class="danger" data-delete-server><i class="fa-solid fa-trash"></i><span>删除</span></button>' +
      '</section>' +
      '<section class="terminal-tools-section">' +
        '<div class="terminal-section-title"><div><h3>工具</h3><span>' + tools.length + ' 个</span></div><small>新发现的工具会保持关闭</small></div>' +
        (tools.length ? '<div class="terminal-tool-list">' + tools.map(function(tool) { return toolRow(server, tool) }).join('') + '</div>' :
          '<div class="terminal-tools-empty"><i class="fa-solid fa-wrench"></i><p>连接成功后会在这里显示工具</p></div>') +
      '</section>'

    shell.querySelector('[data-detail-server-toggle]').addEventListener('change', async function(event) {
      server.enabled = event.target.checked
      server.updatedAt = now()
      await db.mcpServers.put(server)
    })
    shell.querySelectorAll('[data-tool-toggle]').forEach(function(input) {
      input.addEventListener('change', async function() {
        var current = await db.mcpServers.get(server.id)
        var tool = (current.tools || []).find(function(item) { return item.name === input.dataset.toolToggle })
        if (!tool) return
        tool.enabled = input.checked
        tool.isNew = false
        current.updatedAt = now()
        await db.mcpServers.put(current)
      })
    })
    shell.querySelector('[data-refresh-server]').addEventListener('click', async function(event) {
      event.currentTarget.disabled = true
      try { await connectServer(server.id, true) } catch (error) { window.toast(friendlyError(error)) }
    })
    var authButton = shell.querySelector('[data-auth-action]')
    if (authButton) authButton.addEventListener('click', async function(event) {
      if (event.currentTarget.dataset.authAction === 'manual') {
        _terminalState = { view: 'form', serverId: server.id, busy: false }
        renderCurrentView()
        return
      }
      event.currentTarget.disabled = true
      clearToken(server.id)
      server.oauth = Object.assign({}, server.oauth || {}, { authorized: false })
      await db.mcpServers.put(server)
      try { await connectServer(server.id, true) } catch (error) { window.toast(friendlyError(error)) }
    })
    shell.querySelector('[data-edit-server]').addEventListener('click', function() {
      _terminalState = { view: 'form', serverId: server.id, busy: false }
      renderCurrentView()
    })
    shell.querySelector('[data-delete-server]').addEventListener('click', async function() {
      if (!window.confirm('删除“' + server.name + '”？配置、工具开关和全部本机凭据都会被清除。')) return
      await revokeServerToken(server)
      clearSecret(server.id)
      await db.mcpServers.delete(server.id)
      _terminalState = { view: 'list', serverId: '', busy: false }
      renderCurrentView()
      window.toast('MCP 服务已删除')
    })
  }

  async function renderCurrentView() {
    var page = document.getElementById('terminal-page')
    if (!page) return
    setHeaderForView()
    var shell = page.querySelector('#terminal-shell')
    shell.innerHTML = '<div class="terminal-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Loading</span></div>'
    try {
      if (_terminalState.view === 'form') await renderForm(shell)
      else if (_terminalState.view === 'detail') await renderDetail(shell)
      else await renderList(shell)
    } catch (error) {
      shell.innerHTML = '<div class="terminal-load-error"><i class="fa-solid fa-triangle-exclamation"></i><p>' + esc(friendlyError(error)) + '</p></div>'
    }
  }

  function showTerminalPage(options) {
    options = options || {}
    var existing = document.getElementById('terminal-page')
    if (existing) {
      if (options.serverId) _terminalState = { view: 'detail', serverId: options.serverId, busy: false }
      renderCurrentView()
      return
    }
    _terminalState = options.serverId
      ? { view: 'detail', serverId: options.serverId, busy: false }
      : { view: 'list', serverId: '', busy: false }
    var page = createPage()
    window.openPage(page)
    renderCurrentView()
  }

  async function resumePendingOAuthResult() {
    var raw = sessionStorage.getItem(MCP_OAUTH_RESULT_KEY)
    if (!raw) return
    sessionStorage.removeItem(MCP_OAUTH_RESULT_KEY)
    var result = null
    try { result = JSON.parse(raw) } catch (_) {}
    if (!result) return
    showTerminalPage({ serverId: result.serverId })
    if (!result.ok) {
      window.toast(result.message || 'OAuth 授权失败')
      return
    }
    window.toast(result.message || 'OAuth 授权成功')
    try {
      await connectServer(result.serverId, false)
    } catch (error) {
      window.toast('授权成功，但连接失败：' + friendlyError(error))
    }
  }

  window.showTerminalPage = showTerminalPage
  window.WanWanMCP = Object.freeze({
    protocolVersion: MCP_PROTOCOL_VERSION,
    getEnabledToolCatalog: getEnabledToolCatalog,
    createModelToolBinding: createModelToolBinding,
    createExecutionRun: createExecutionRun,
    closeExecutionRun: closeExecutionRun,
    executeEnabledToolDetailed: executeEnabledToolDetailed,
    executeEnabledTool: executeEnabledTool,
    handleOAuthCallback: handleOAuthCallback,
    resumePendingOAuthResult: resumePendingOAuthResult
  })
})()
