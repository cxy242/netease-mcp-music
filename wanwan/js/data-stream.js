// Incremental importer for WanWan JSON backups. Keeps at most one encoded
// record (with base64 removed) and one decoded Blob in memory.
(function() {
  'use strict'
  var TABLES = ['config', 'characters', 'chats', 'messages', 'groupChats', 'groupMessages',
    'moments', 'finance', 'offlineChats', 'stickers', 'stickerCategories', 'memories',
    'memoryRuns', 'callRecords', 'smsConversations', 'smsMessages', 'imageBlobs',
    'doorModules', 'doorResults', 'avgSaves', 'avgConfigs', 'mcpServers', 'mcpToolTraces']
  var PROTECTED = ['wanwan_online_device_id']
  var PROTECTED_PREFIXES = ['wanwan_mcp_oauth_', 'wanwan_mcp_secret_']

  function isProtectedKey(key) {
    return PROTECTED.indexOf(key) >= 0 || PROTECTED_PREFIXES.some(function(prefix) {
      return String(key).indexOf(prefix) === 0
    })
  }

  function Reader(source, progress) {
    this.reader = source.stream().getReader(); this.decoder = new TextDecoder()
    this.buffer = ''; this.pos = 0; this.done = false; this.bytes = 0
    this.progress = progress; this.size = Number(source.size) || 0
  }
  Reader.prototype.fill = async function() {
    if (this.pos < this.buffer.length || this.done) return
    var r = await this.reader.read(); this.pos = 0
    if (r.done) { this.done = true; this.buffer = this.decoder.decode() }
    else {
      this.bytes += r.value.byteLength; this.buffer = this.decoder.decode(r.value, { stream: true })
      var pct = this.size ? Math.min(98, this.bytes / this.size * 100) : 0
      this.progress(pct, '读取备份数据…')
    }
    if (!this.buffer.length && !this.done) await this.fill()
  }
  Reader.prototype.peek = async function() { await this.fill(); return this.buffer[this.pos] || '' }
  Reader.prototype.next = async function() { await this.fill(); return this.buffer[this.pos++] || '' }
  Reader.prototype.space = async function() { while (/\s/.test(await this.peek() || 'x')) await this.next() }
  Reader.prototype.expect = async function(ch) {
    await this.space(); var got = await this.next()
    if (got !== ch) throw new Error('JSON格式错误：缺少 ' + ch)
  }

  async function stringToken(input) {
    await input.space(); if (await input.next() !== '"') throw new Error('JSON字符串格式错误')
    var raw = '"', escaped = false
    while (true) {
      var ch = await input.next(); if (!ch) throw new Error('JSON字符串未结束')
      raw += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') break
    }
    return { raw: raw, value: JSON.parse(raw) }
  }

  async function base64Blob(input) {
    var parts = [], carry = ''
    while (true) {
      var ch = await input.next(); if (!ch) throw new Error('Base64字段未结束')
      if (ch === '"') break
      carry += ch
      if (carry.length >= 65536) {
        var n = carry.length - carry.length % 4, binary = atob(carry.slice(0, n)), bytes = new Uint8Array(binary.length)
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        parts.push(bytes); carry = carry.slice(n)
      }
    }
    if (carry) {
      var tail = atob(carry), last = new Uint8Array(tail.length)
      for (var j = 0; j < tail.length; j++) last[j] = tail.charCodeAt(j)
      parts.push(last)
    }
    return new Blob(parts)
  }

  async function value(input) {
    await input.space(); var first = await input.next()
    if (!first) throw new Error('JSON值不完整')
    if (first === '"') { input.pos--; var str = await stringToken(input); return { raw: str.raw, blobs: [] } }
    var raw = first, blobs = [], depth = first === '{' || first === '[' ? 1 : 0
    if (!depth) {
      while (true) {
        var scalarNext = await input.peek()
        if (!scalarNext || scalarNext === ',' || scalarNext === '}' || scalarNext === ']') break
        raw += await input.next()
      }
      return { raw: raw.trim(), blobs: blobs }
    }
    while (depth) {
      var ch = await input.next(); if (!ch) throw new Error('JSON值未结束')
      if (ch === '"') {
        input.pos--; var token = await stringToken(input); raw += token.raw
        if (token.value === 'b64') {
          await input.space()
          if (await input.peek() === ':') {
            raw += await input.next(); await input.space()
            if (await input.peek() === '"') {
              await input.next(); blobs.push(await base64Blob(input)); raw += '""'
            }
          }
        }
      } else {
        raw += ch
        if (ch === '{' || ch === '[') depth++
        else if (ch === '}' || ch === ']') depth--
      }
    }
    return { raw: raw, blobs: blobs }
  }

  function hydrate(v, blobs) {
    if (v && typeof v === 'object' && v.__blob__ === 1 && typeof v.b64 === 'string') {
      var blob = blobs.shift()
      if (!blob) {
        var binary = atob(v.b64 || ''), bytes = new Uint8Array(binary.length)
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        blob = new Blob([bytes])
      }
      return new Blob([blob], { type: v.type || '' })
    }
    if (Array.isArray(v)) return v.map(function(x) { return hydrate(x, blobs) })
    if (v && typeof v === 'object') Object.keys(v).forEach(function(k) { v[k] = hydrate(v[k], blobs) })
    return v
  }

  async function put(name, rows) {
    if (!rows.length || !db[name]) return
    if (name === 'config') rows = rows.filter(function(row) {
      return row && ['memoryEmbeddingStatus', 'memoryLastError'].indexOf(String(row.key)) < 0
    })
    if (name === 'memories') rows = rows.map(function(memory) {
      var row = Object.assign({}, memory), source = Number(row.sourceAt), created = Number(row.createdAt)
      if (!Number.isFinite(source) || source <= 0 || (Number.isFinite(created) && created > 0 && source === created)) row.sourceAt = null
      return row
    })
    if (rows.length) await db[name].bulkPut(rows)
  }

  function databaseError(err) {
    var name = err && err.name ? err.name : 'IndexedDBError'
    var message = err && err.message ? err.message : String(err)
    if (name === 'QuotaExceededError') return 'QuotaExceededError：本机存储空间不足，请清理空间后重试'
    if (name === 'UnknownError' || /internal error.*Indexed Database/i.test(message)) {
      return 'UnknownError：浏览器 IndexedDB 内部写入失败，通常与存储空间、超大单条数据或数据库连接中断有关'
    }
    return name + '：' + message
  }

  async function array(input, name, progress, options) {
    await input.expect('['); await input.space()
    if (options.clearBeforeImport && db[name]) {
      try { await db[name].clear() } catch (err) { throw new Error('清理 ' + name + ' 失败：' + databaseError(err)) }
    }
    if (await input.peek() === ']') { await input.next(); return }
    var rows = [], count = 0, limit = name === 'imageBlobs' ? 1 : 200
    while (true) {
      var encoded = await value(input)
      rows.push(hydrate(JSON.parse(encoded.raw), encoded.blobs)); count++
      if (rows.length >= limit) {
        try { await put(name, rows) } catch (err) {
          throw new Error('写入 ' + name + ' 失败（第 ' + Math.max(1, count - rows.length + 1) + '-' + count + ' 条）：' + databaseError(err))
        }
        rows = []; progress(input.size ? Math.min(98, input.bytes / input.size * 100) : 0, '正在导入 ' + name + '（' + count + ' 条）')
        await new Promise(function(resolve) { setTimeout(resolve, 0) })
      }
      await input.space(); var separator = await input.next()
      if (separator === ']') break
      if (separator !== ',') throw new Error(name + ' 数组格式错误')
    }
    try { await put(name, rows) } catch (err) {
      throw new Error('写入 ' + name + ' 失败（共 ' + count + ' 条）：' + databaseError(err))
    }
  }

  window.runWanWanStreamImport = async function(source, progress, options) {
    if (!source || !source.stream || !window.TextDecoder) throw new Error('当前浏览器不支持流式导入')
    progress = typeof progress === 'function' ? progress : function() {}
    options = options || {}
    var protectedValues = {}
    Object.keys(localStorage).forEach(function(key) {
      if (isProtectedKey(key)) protectedValues[key] = localStorage.getItem(key)
    })
    var input = new Reader(source, progress), version = null, appName = null, local = null
    var importFailed = false
    try {
      await input.expect('{')
      while (true) {
        await input.space(); if (await input.peek() === '}') { await input.next(); break }
        var key = (await stringToken(input)).value; await input.expect(':')
        if (TABLES.indexOf(key) >= 0) {
          if (version !== 1 || appName !== '弯弯') throw new Error('备份头部无效或字段顺序不受支持')
          await array(input, key, progress, options)
        } else {
          var encoded = await value(input), decoded = hydrate(JSON.parse(encoded.raw), encoded.blobs)
          if (key === 'version') version = decoded
          else if (key === 'appName') appName = decoded
          else if (key === 'localStorage') local = decoded
        }
        await input.space(); var separator = await input.next()
        if (separator === '}') break
        if (separator !== ',') throw new Error('备份顶层格式错误')
      }
      await input.space(); if (await input.peek()) throw new Error('JSON结尾存在额外内容')
      if (version !== 1 || appName !== '弯弯') throw new Error('不支持的备份格式')
      if (options.clearBeforeImport) localStorage.clear()
      if (local) Object.keys(local).forEach(function(key) {
        if (!isProtectedKey(key)) localStorage.setItem(key, local[key])
      })
      Object.keys(protectedValues).forEach(function(key) {
        localStorage.setItem(key, protectedValues[key])
      })
      progress(100, '导入完成！')
    } catch (err) {
      importFailed = true
      throw err
    } finally {
      PROTECTED.forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(protectedValues, key)) localStorage.setItem(key, protectedValues[key])
        else localStorage.removeItem(key)
      })
      Object.keys(protectedValues).forEach(function(key) {
        localStorage.setItem(key, protectedValues[key])
      })
      if (Array.isArray(options.preserveConfigRows) && options.preserveConfigRows.length && db.config) {
        try { await db.config.bulkPut(options.preserveConfigRows) } catch (preserveError) {
          if (!importFailed) throw preserveError
          console.warn('[data-import] 恢复本机同步设置失败', preserveError)
        }
      }
    }
  }
})()
