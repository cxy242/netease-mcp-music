// online.js — 真人联机客户端
// 依赖：db.js、wechat.js

(function() {
  var socket = null
  var state = 'disabled'
  var reconnectTimer = null
  var heartbeatTimer = null
  var heartbeatDeadline = null
  var reconnectAttempt = 0
  var manuallyClosed = false
  var currentConfig = null
  var pendingRequests = new Map()
  var listeners = new Set()
  var incomingMutationQueue = Promise.resolve()
  var MAX_TEXT_BYTES = 10 * 1024
  var MAX_EXTRA_BYTES = 20 * 1024
  var HEARTBEAT_MS = 25000
  var HEARTBEAT_TIMEOUT_MS = 50000
  var RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]
  var DEVICE_ID_KEY = 'wanwan_online_device_id'

  function setState(next, detail) {
    state = next
    listeners.forEach(function(listener) {
      try { listener({ state: next, detail: detail || '' }) } catch (e) {}
    })
    document.dispatchEvent(new CustomEvent('wanwan-online-state', {
      detail: { state: next, message: detail || '' }
    }))
  }

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.add(listener)
    listener({ state: state, detail: '' })
    return function() { listeners.delete(listener) }
  }

  function createId(prefix) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    var bytes = new Uint8Array(16)
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes)
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    return (prefix || 'id') + '_' + Array.from(bytes, function(n) {
      return n.toString(16).padStart(2, '0')
    }).join('')
  }

  function getDeviceId() {
    var existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    var id = createId('device')
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  }

  function normalizeSocketUrl(url, token) {
    var parsed = new URL(String(url || '').trim(), window.location.href)
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      throw new Error('联机服务器地址必须以 ws:// 或 wss:// 开头')
    }
    if (window.location.protocol === 'https:' && parsed.protocol !== 'wss:') {
      throw new Error('HTTPS 页面只能连接 wss:// 联机服务器')
    }
    if (token) parsed.searchParams.set('token', token)
    return parsed.toString()
  }

  function getRestBase(url) {
    var parsed = new URL(String(url || '').trim(), window.location.href)
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:'
    parsed.search = ''
    parsed.hash = ''
    parsed.pathname = parsed.pathname.replace(/\/ws\/?$/, '').replace(/\/$/, '')
    return parsed.toString().replace(/\/$/, '')
  }

  async function loadConfig() {
    var rows = await Promise.all([
      db.config.get('onlineEnabled'),
      db.config.get('onlineServer'),
      db.config.get('onlineToken')
    ])
    return {
      enabled: !!(rows[0] && rows[0].value),
      url: String(rows[1] && rows[1].value || '').trim(),
      token: String(rows[2] && rows[2].value || '').trim()
    }
  }

  async function getIdentity() {
    return window.WanWanWechatOnline && window.WanWanWechatOnline.getIdentity
      ? await window.WanWanWechatOnline.getIdentity()
      : null
  }

  async function init() {
    currentConfig = await loadConfig()
    if (!currentConfig.enabled) {
      disconnect('disabled')
      return
    }
    if (!currentConfig.url || !currentConfig.token) {
      disconnect('unconfigured')
      return
    }
    connect(currentConfig)
  }

  async function reconfigure() {
    disconnect('reconfigure')
    manuallyClosed = false
    return init()
  }

  function connect(config) {
    if (!config || !config.enabled) return
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
    manuallyClosed = false
    currentConfig = config
    var url
    try {
      url = normalizeSocketUrl(config.url, config.token)
    } catch (err) {
      setState('error', err.message)
      return
    }
    setState(reconnectAttempt ? 'reconnecting' : 'connecting')
    try {
      socket = new WebSocket(url)
    } catch (err) {
      setState('error', err.message || '无法连接联机服务器')
      scheduleReconnect()
      return
    }
    socket.addEventListener('open', function() {
      reconnectAttempt = 0
      setState('authenticating')
      bindCurrentAccount().catch(function(err) {
        setState('error', err.message || '联机身份绑定失败')
      })
      startHeartbeat()
    })
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('error', function() {
      if (state !== 'ready') setState('error', '联机连接失败')
    })
    socket.addEventListener('close', function() {
      stopHeartbeat()
      socket = null
      rejectPendingRequests(new Error('联机连接已断开'))
      if (!manuallyClosed && currentConfig && currentConfig.enabled) scheduleReconnect()
      else if (state !== 'disabled' && state !== 'unconfigured') setState('disconnected')
    })
  }

  function disconnect(reason) {
    manuallyClosed = true
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    stopHeartbeat()
    rejectPendingRequests(new Error('联机连接已关闭'))
    if (socket) {
      try { socket.close(1000, reason || 'manual') } catch (e) {}
      socket = null
    }
    setState(reason === 'unconfigured' ? 'unconfigured' : reason === 'disabled' ? 'disabled' : 'disconnected')
  }

  function scheduleReconnect() {
    if (reconnectTimer || manuallyClosed || !currentConfig || !currentConfig.enabled) return
    var delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    reconnectAttempt += 1
    setState('reconnecting')
    reconnectTimer = setTimeout(function() {
      reconnectTimer = null
      connect(currentConfig)
    }, delay)
  }

  function sendPacket(type, data, requestId) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify({ type: type, requestId: requestId || undefined, data: data || {} }))
    return true
  }

  function request(type, data, timeoutMs) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('联机尚未连接'))
    }
    var requestId = createId('req')
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        pendingRequests.delete(requestId)
        reject(new Error('联机服务器响应超时'))
      }, timeoutMs || 12000)
      pendingRequests.set(requestId, { resolve: resolve, reject: reject, timer: timer })
      sendPacket(type, data, requestId)
    })
  }

  function rejectPendingRequests(error) {
    pendingRequests.forEach(function(pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
    })
    pendingRequests.clear()
  }

  async function bindCurrentAccount() {
    var identity = await getIdentity()
    if (!identity || !identity.wxAccount) {
      setState('waiting_account', '请先登录微信并设置微信号')
      return false
    }
    return sendPacket('bind_account', {
      wxAccount: identity.wxAccount,
      deviceId: getDeviceId(),
      profile: {
        name: identity.name || '',
        avatar: identity.avatar || ''
      }
    })
  }

  function enqueueIncomingMutation(task) {
    incomingMutationQueue = incomingMutationQueue
      .then(task)
      .catch(function(err) {
        console.warn('[弯弯联机] 处理服务器事件失败:', err)
      })
    return incomingMutationQueue
  }

  function handleMessage(event) {
    var packet
    try { packet = JSON.parse(event.data) } catch (e) { return }
    if (!packet || !packet.type) return
    if (packet.requestId && pendingRequests.has(packet.requestId)) {
      var pending = pendingRequests.get(packet.requestId)
      pendingRequests.delete(packet.requestId)
      clearTimeout(pending.timer)
      if (packet.type === 'error' || packet.error) {
        pending.reject(new Error(packet.message || packet.error || '联机请求失败'))
      } else {
        pending.resolve(packet.data || {})
      }
      return
    }
    switch (packet.type) {
      case 'ready':
        setState('ready')
        heartbeatDeadline = Date.now() + HEARTBEAT_TIMEOUT_MS
        retryPendingMessages()
        break
      case 'pong':
        heartbeatDeadline = Date.now() + HEARTBEAT_TIMEOUT_MS
        break
      case 'ping':
        sendPacket('pong', { time: packet.data && packet.data.time || Date.now() })
        break
      case 'private_message':
        if (window.WanWanWechatOnline && window.WanWanWechatOnline.receivePrivateMessage) {
          enqueueIncomingMutation(function() {
            return window.WanWanWechatOnline.receivePrivateMessage(packet.data || {})
          })
        }
        break
      case 'message_ack':
        handleMessageAck(packet.data || {})
        break
      case 'friend_request':
      case 'friend_added':
      case 'friend_accepted':
        if (window.WanWanWechatOnline && window.WanWanWechatOnline.handleFriendEvent) {
          enqueueIncomingMutation(function() {
            return window.WanWanWechatOnline.handleFriendEvent(packet.type, packet.data || {})
          })
        }
        break
      case 'error':
        setState(state === 'ready' ? 'ready' : 'error', packet.message || packet.data && packet.data.message || '联机服务器错误')
        break
    }
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatDeadline = Date.now() + HEARTBEAT_TIMEOUT_MS
    heartbeatTimer = setInterval(function() {
      if (heartbeatDeadline && Date.now() > heartbeatDeadline) {
        if (socket) socket.close(4000, 'heartbeat timeout')
        return
      }
      sendPacket('ping', { time: Date.now() })
    }, HEARTBEAT_MS)
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    heartbeatDeadline = null
  }

  function byteLength(value) {
    return new Blob([String(value || '')]).size
  }

  async function sendPrivateMessage(message) {
    if (!message || !message.clientMessageId || !message.toWxAccount) {
      throw new Error('联机消息参数不完整')
    }
    if (byteLength(message.content) > MAX_TEXT_BYTES) {
      await markMessageFailed(message.localMessageId, '消息超过 10 KB')
      throw new Error('消息超过 10 KB')
    }
    var extra = message.extra || {}
    if (byteLength(JSON.stringify(extra)) > MAX_EXTRA_BYTES) {
      await markMessageFailed(message.localMessageId, '消息附加数据过大')
      throw new Error('消息附加数据过大')
    }
    var sent = sendPacket('private_message', {
      clientMessageId: message.clientMessageId,
      toWxAccount: message.toWxAccount,
      messageType: message.messageType || 'text',
      content: String(message.content || ''),
      extra: extra,
      clientCreatedAt: message.clientCreatedAt || Date.now()
    })
    if (!sent) {
      await markMessageFailed(message.localMessageId, '联机未连接')
      throw new Error('联机未连接')
    }
  }

  async function markMessageFailed(localMessageId, reason) {
    if (!localMessageId) return
    await db.messages.update(localMessageId, { onlineStatus: 'failed', onlineError: reason || '发送失败' })
    notifyMessageChanged(localMessageId)
  }

  async function handleMessageAck(data) {
    if (!data.clientMessageId) return
    var message = await db.messages.where('clientMessageId').equals(data.clientMessageId).first()
    if (!message) return
    await db.messages.update(message.id, {
      serverMessageId: data.serverMessageId || message.serverMessageId || '',
      onlineStatus: data.status || 'sent',
      serverCreatedAt: data.serverCreatedAt || Date.now(),
      onlineError: ''
    })
    notifyMessageChanged(message.id)
  }

  function notifyMessageChanged(messageId) {
    if (window.WanWanWechatOnline && window.WanWanWechatOnline.messageChanged) {
      window.WanWanWechatOnline.messageChanged(messageId)
    }
  }

  async function retryPendingMessages() {
    var pending = await db.messages.where('onlineStatus').anyOf('sending', 'failed').toArray()
    var identity = await getIdentity()
    for (var i = 0; i < pending.length; i++) {
      var msg = pending[i]
      if (!msg.isOnlineMessage || !msg.clientMessageId || !msg.remoteWxAccount) continue
      var chat = await db.chats.get(msg.chatId)
      if (!chat || !identity || String(chat.ownerUid) !== String(identity.uid)) continue
      await db.messages.update(msg.id, { onlineStatus: 'sending', onlineError: '' })
      notifyMessageChanged(msg.id)
      try {
        await sendPrivateMessage({
          localMessageId: msg.id,
          clientMessageId: msg.clientMessageId,
          toWxAccount: msg.remoteWxAccount,
          messageType: msg.messageType || 'text',
          content: msg.content,
          extra: msg.onlineExtra || {},
          clientCreatedAt: msg.createdAt
        })
      } catch (e) {}
    }
  }

  async function searchUser(wxAccount) {
    var account = String(wxAccount || '').trim()
    if (!account) throw new Error('请输入微信号')
    currentConfig = currentConfig || await loadConfig()
    if (!currentConfig.enabled || !currentConfig.url || !currentConfig.token) {
      throw new Error('请先在设置中启用并配置联机')
    }
    var response = await fetch(
      getRestBase(currentConfig.url) + '/api/online/users/by-wx-account/' + encodeURIComponent(account),
      { headers: { Authorization: 'Bearer ' + currentConfig.token } }
    )
    var body = null
    try { body = await response.json() } catch (e) {}
    if (!response.ok) throw new Error(body && body.message || (response.status === 404 ? '未找到该微信号' : '搜索联机用户失败'))
    var payload = body && body.data ? body.data : body
    return payload && (payload.user || payload.profile) ? (payload.user || payload.profile) : payload
  }

  async function addFriend(profile) {
    if (!profile || !profile.wxAccount) throw new Error('联机用户资料不完整')
    var data = {
      toWxAccount: profile.wxAccount,
      wxAccount: profile.wxAccount
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (!sendPacket('friend_request', data)) throw new Error('联机尚未连接')
      return { pending: true }
    }
    currentConfig = currentConfig || await loadConfig()
    var response = await fetch(getRestBase(currentConfig.url) + '/api/online/friends/requests', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + currentConfig.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    var body = null
    try { body = await response.json() } catch (e) {}
    if (!response.ok) throw new Error(body && body.message || '添加联机好友失败')
    return body && body.data ? body.data : body
  }

  function sendDelivered(serverMessageId) {
    if (serverMessageId) sendPacket('message_delivered', { serverMessageId: serverMessageId })
  }

  document.addEventListener('wanwan-wechat-identity-changed', function() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      bindCurrentAccount().catch(function(err) {
        setState('error', err.message || '联机身份绑定失败')
      })
    }
    else if (currentConfig && currentConfig.enabled) init()
  })
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && currentConfig && currentConfig.enabled) {
      if (!socket || socket.readyState === WebSocket.CLOSED) connect(currentConfig)
    }
  })
  window.addEventListener('online', function() {
    if (currentConfig && currentConfig.enabled) connect(currentConfig)
  })

  window.WanWanOnline = {
    init: init,
    reconfigure: reconfigure,
    connect: connect,
    disconnect: disconnect,
    getState: getState,
    subscribe: subscribe,
    bindCurrentAccount: bindCurrentAccount,
    createClientMessageId: function() { return createId('msg') },
    sendPrivateMessage: sendPrivateMessage,
    sendDelivered: sendDelivered,
    searchUser: searchUser,
    addFriend: addFriend,
    retryPendingMessages: retryPendingMessages
  }
})()
