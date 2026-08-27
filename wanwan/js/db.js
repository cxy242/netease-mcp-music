// db.js — 数据库定义层
// 全局暴露 window.db，供所有模块使用

// 初始化Dexie数据库
function initDB() {
  // 主数据库：存储所有应用数据
  window.db = new Dexie('WanWanDB')
  db.version(1).stores({
    config:            'key',                           // 键值配置（API设置、开关状态等）
    characters:        '++id, type, name',              // 角色档案（type: char/npc/user）
    chats:             '++id, charId, ownerUid, [ownerUid+charId]', // 聊天会话，支持按 (ownerUid, charId) 定位
    messages:          '++id, chatId, createdAt',       // 聊天消息
    groupChats:        '++id',                          // 群聊信息
    groupMessages:     '++id, groupId, createdAt',      // 群消息
    moments:           '++id, charId, createdAt',       // 朋友圈动态
    finance:           '++id, charId',                  // 钱包账单记录
    offlineChats:      '++id, charId',                  // 离线/缓存聊天记录
    stickers:          '++id, categoryId',              // 预留，贴纸功能待实现
    stickerCategories: '++id'                           // 预留，贴纸分类待实现
  })
  db.version(2).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt'
  })
  db.version(3).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt'
  })
  db.version(4).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt'
  })
  db.version(5).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt'   // 生成图片二进制 blob，消息 content 仅存引用 key
  })
  db.version(6).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  })
  db.version(7).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, charId, createdAt',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  })
  db.version(8).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  }).upgrade(async tx => {
    const chars = await tx.table('characters').toArray()
    const userIds = new Set(chars.filter(c => c && c.type === 'user').map(c => String(c.id)))
    await tx.table('moments').toCollection().modify(moment => {
      if ((moment.ownerUid === undefined || moment.ownerUid === null || moment.ownerUid === '') && userIds.has(String(moment.charId))) {
        moment.ownerUid = moment.charId
      }
    })
  })
  db.version(9).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  }).upgrade(async tx => {
    await tx.table('memories').toCollection().modify(memory => {
      const sourceAt = Number(memory.sourceAt)
      if (Number.isFinite(sourceAt) && sourceAt > 0) return
      memory.sourceAt = null
    })
  })
  db.version(10).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  }).upgrade(async tx => {
    await tx.table('memories').toCollection().modify(memory => {
      const sourceAt = Number(memory.sourceAt)
      const createdAt = Number(memory.createdAt)
      if (!Number.isFinite(sourceAt) || sourceAt <= 0 ||
          (Number.isFinite(createdAt) && createdAt > 0 && sourceAt === createdAt)) {
        memory.sourceAt = null
      }
    })
  })
  db.version(11).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, [chatId+createdAt], clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt'
  })
  db.version(12).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, [chatId+createdAt], clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt',
    avgSaves:          '++id, gameId, slot, updatedAt',   // 橙光互动游戏存档（数值快照 + 章节进度 + 最近剧情）
    avgConfigs:        'key'                              // 橙光偏好（背景/立绘/横屏等）
  })
  db.version(13).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, [chatId+createdAt], clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt',
    avgSaves:          '++id, gameId, slot, updatedAt',
    avgConfigs:        'key'
  }).upgrade(async tx => {
    await tx.table('messages').toCollection().modify(message => {
      delete message.thoughtHtml
      delete message.thoughtRaw
    })
  })
  db.version(14).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, [chatId+createdAt], clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt',
    avgSaves:          '++id, gameId, slot, updatedAt',
    avgConfigs:        'key',
    mcpServers:        '&id, name, enabled, updatedAt'
  })
  db.version(15).stores({
    config:            'key',
    characters:        '++id, type, name',
    chats:             '++id, charId, ownerUid, [ownerUid+charId]',
    messages:          '++id, chatId, createdAt, [chatId+createdAt], clientMessageId, serverMessageId, onlineStatus',
    groupChats:        '++id',
    groupMessages:     '++id, groupId, createdAt',
    moments:           '++id, ownerUid, charId, createdAt, [ownerUid+charId]',
    finance:           '++id, charId',
    offlineChats:      '++id, charId',
    stickers:          '++id, categoryId',
    stickerCategories: '++id',
    memories:          '++id, ownerUid, charId, chatId, [ownerUid+charId], [chatId+status], updatedAt',
    memoryRuns:        '++id, ownerUid, charId, chatId, fromMsgId, toMsgId, createdAt',
    callRecords:       '++id, chatId, charId, ownerUid, createdAt',
    smsConversations:  '++id, ownerPhone, remotePhone, [ownerPhone+remotePhone], updatedAt',
    smsMessages:       '++id, conversationId, createdAt',
    imageBlobs:        '++id, createdAt',
    doorModules:       '&id, type, enabled, updatedAt',
    doorResults:       '&id, userId, characterId, moduleId, createdAt',
    avgSaves:          '++id, gameId, slot, updatedAt',
    avgConfigs:        'key',
    mcpServers:        '&id, name, enabled, updatedAt',
    mcpToolTraces:     '++id, scope, conversationId, [scope+conversationId], turnId, createdAt'
  })
  installWanWanDBRecovery()
}

var _wanwanDBRecoveryPromise = null
var _wanwanDBHealthCheckPromise = null
var _wanwanDBLifecycleBound = false

function getWanWanDBErrorText(error) {
  if (!error) return ''
  var parts = []
  var current = error
  var seen = new Set()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (current.name) parts.push(String(current.name))
    if (current.message) parts.push(String(current.message))
    current = current.inner || current.cause
  }
  return parts.join('：')
}

function isWanWanRecoverableDBError(error) {
  var text = getWanWanDBErrorText(error)
  return /UnknownError|DatabaseClosedError|InvalidStateError|AbortError|TransactionInactiveError|Indexed Database server|IndexedDB.*(?:connection|连接).*(?:lost|closed|closing|中断|关闭)|database connection is closing|connection to indexed database server lost/i.test(text)
}

async function getWanWanStorageDiagnostic() {
  var info = {
    userAgent: navigator.userAgent || '',
    visibility: document.visibilityState || '',
    online: navigator.onLine,
    usage: null,
    quota: null,
    percent: null
  }
  try {
    if (navigator.storage && navigator.storage.estimate) {
      var estimate = await navigator.storage.estimate()
      info.usage = Number.isFinite(estimate.usage) ? estimate.usage : null
      info.quota = Number.isFinite(estimate.quota) ? estimate.quota : null
      if (info.usage != null && info.quota) info.percent = info.usage / info.quota * 100
    }
  } catch (_) {}
  return info
}

async function buildWanWanDBDiagnostic(error) {
  var storage = await getWanWanStorageDiagnostic()
  var lines = [
    'IndexedDB：' + (getWanWanDBErrorText(error) || '未知错误'),
    '页面状态：' + (storage.visibility || '未知'),
    '网络状态：' + (storage.online ? '在线' : '离线'),
    '浏览器：' + (storage.userAgent || '未知')
  ]
  if (storage.usage != null) lines.push('存储使用：' + storage.usage + ' bytes')
  if (storage.quota != null) lines.push('存储配额：' + storage.quota + ' bytes')
  if (storage.percent != null) lines.push('存储占比：' + storage.percent.toFixed(1) + '%')
  return lines.join('\n')
}

async function createWanWanDBUnavailableError(error) {
  var next = new Error('本地数据库连接已中断，请重新打开应用；如持续出现，请先导出备份后修复本地数据。')
  next.name = 'WanWanDBUnavailableError'
  next.cause = error
  next.diagnostic = await buildWanWanDBDiagnostic(error)
  return next
}

async function recoverWanWanDBConnection(error) {
  if (!window.db) throw await createWanWanDBUnavailableError(error)
  if (_wanwanDBRecoveryPromise) return await _wanwanDBRecoveryPromise
  _wanwanDBRecoveryPromise = (async function() {
    try {
      try {
        db.close({ disableAutoOpen: false })
      } catch (_) {
        try { db.close() } catch (_) {}
      }
      await db.open()
      await db.config.limit(1).toArray()
      return true
    } catch (openError) {
      throw await createWanWanDBUnavailableError(openError || error)
    } finally {
      _wanwanDBRecoveryPromise = null
    }
  })()
  return await _wanwanDBRecoveryPromise
}

async function runWanWanDBRead(operation) {
  try {
    return await operation()
  } catch (error) {
    if (!isWanWanRecoverableDBError(error)) throw error
    await recoverWanWanDBConnection(error)
    try {
      return await operation()
    } catch (retryError) {
      if (isWanWanRecoverableDBError(retryError)) {
        throw await createWanWanDBUnavailableError(retryError)
      }
      throw retryError
    }
  }
}

async function runWanWanDBIdempotentWrite(operation) {
  try {
    return await operation()
  } catch (error) {
    if (!isWanWanRecoverableDBError(error)) throw error
    await recoverWanWanDBConnection(error)
    try {
      return await operation()
    } catch (retryError) {
      if (isWanWanRecoverableDBError(retryError)) {
        throw await createWanWanDBUnavailableError(retryError)
      }
      throw retryError
    }
  }
}

async function checkWanWanDBHealth() {
  if (!window.db || document.visibilityState === 'hidden') return false
  if (_wanwanDBHealthCheckPromise) return await _wanwanDBHealthCheckPromise
  _wanwanDBHealthCheckPromise = (async function() {
    try {
      await db.config.limit(1).toArray()
      return true
    } catch (error) {
      if (!isWanWanRecoverableDBError(error)) throw error
      await recoverWanWanDBConnection(error)
      return true
    } finally {
      _wanwanDBHealthCheckPromise = null
    }
  })()
  return await _wanwanDBHealthCheckPromise
}

function installWanWanDBRecovery() {
  window.isWanWanRecoverableDBError = isWanWanRecoverableDBError
  window.recoverWanWanDBConnection = recoverWanWanDBConnection
  window.runWanWanDBRead = runWanWanDBRead
  window.runWanWanDBIdempotentWrite = runWanWanDBIdempotentWrite
  window.getWanWanStorageDiagnostic = getWanWanStorageDiagnostic
  window.buildWanWanDBDiagnostic = buildWanWanDBDiagnostic
  window.createWanWanDBUnavailableError = createWanWanDBUnavailableError
  if (_wanwanDBLifecycleBound) return
  _wanwanDBLifecycleBound = true
  var resumeCheck = function() {
    if (document.visibilityState === 'hidden') return
    checkWanWanDBHealth().catch(function(error) {
      console.warn('[db] IndexedDB 前台恢复检查失败:', error)
    })
  }
  document.addEventListener('visibilitychange', resumeCheck)
  window.addEventListener('pageshow', resumeCheck)
}

// Dexie可能异步加载，等待后初始化
if (typeof Dexie !== 'undefined') {
  initDB()
} else {
  // 轮询等待Dexie加载
  const _dbTimer = setInterval(() => {
    if (typeof Dexie !== 'undefined') {
      clearInterval(_dbTimer)
      initDB()
    }
  }, 50)
}
