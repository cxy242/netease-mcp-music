// One-file, bounded-memory download transport for large JSON backups.
(function() {
  'use strict'

  var CHUNK_BYTES = 1024 * 1024
  var HANDSHAKE_TIMEOUT = 5000
  var FIRST_PULL_TIMEOUT = 10000
  var IDLE_TIMEOUT = 30000
  var PROGRESS_INTERVAL = 250

  function taggedError(message, key) {
    var error = new Error(message)
    if (key) error[key] = true
    return error
  }

  async function* coalesce(source, onProgress) {
    var encoder = new TextEncoder()
    var buffer = new Uint8Array(CHUNK_BYTES)
    var used = 0, total = 0, lastProgress = 0
    for await (var value of source) {
      var bytes = encoder.encode(String(value))
      var offset = 0
      while (offset < bytes.byteLength) {
        var count = Math.min(CHUNK_BYTES - used, bytes.byteLength - offset)
        buffer.set(bytes.subarray(offset, offset + count), used)
        used += count
        offset += count
        if (used === CHUNK_BYTES) {
          total += used
          var now = Date.now()
          if (onProgress && now - lastProgress >= PROGRESS_INTERVAL) {
            lastProgress = now
            onProgress(total)
          }
          yield buffer
          buffer = new Uint8Array(CHUNK_BYTES)
          used = 0
        }
      }
    }
    if (used) {
      total += used
      if (onProgress) onProgress(total)
      yield buffer.slice(0, used)
    } else if (onProgress) {
      onProgress(total)
    }
  }

  async function download(options) {
    options = options || {}
    if (!options.source || !options.filename) throw new Error('大文件导出参数不完整')
    if (!navigator.serviceWorker || !window.ReadableStream || !window.MessageChannel || !window.TextEncoder) {
      throw taggedError('当前浏览器不支持大文件流式导出', 'streamUnavailable')
    }

    var registration
    try { registration = await navigator.serviceWorker.ready } catch (_) {
      throw taggedError('大文件导出服务启动失败', 'streamUnavailable')
    }
    var worker = navigator.serviceWorker.controller || registration.active
    if (!worker) throw taggedError('大文件导出服务尚未接管页面，请刷新后重试', 'streamUnavailable')

    var token = Date.now().toString(36) + Math.random().toString(36).slice(2)
    var channel = new MessageChannel()
    var iterator = coalesce(options.source, options.onProgress)[Symbol.asyncIterator]()
    var stopped = false, started = false, doneArmed = false
    var handshakeTimer = null, activityTimer = null
    var resolveReady, rejectReady, resolveDone, rejectDone
    var ready = new Promise(function(resolve, reject) { resolveReady = resolve; rejectReady = reject })
    var done = new Promise(function(resolve, reject) { resolveDone = resolve; rejectDone = reject })

    function clearTimers() {
      clearTimeout(handshakeTimer)
      clearTimeout(activityTimer)
      handshakeTimer = null
      activityTimer = null
    }
    function armActivityTimer() {
      clearTimeout(activityTimer)
      if (stopped || document.visibilityState === 'hidden') return
      activityTimer = setTimeout(function() {
        stop(taggedError(started ? '下载流已停止响应，请重试' : 'Safari 未启动文件下载，请刷新页面后重试', 'streamStalled'))
      }, started ? IDLE_TIMEOUT : FIRST_PULL_TIMEOUT)
    }
    function handleVisibility() {
      if (document.visibilityState === 'hidden') clearTimeout(activityTimer)
      else armActivityTimer()
    }
    function closeIterator() {
      try {
        var closing = iterator.return && iterator.return()
        if (closing && closing.catch) closing.catch(function() {})
      } catch (_) {}
    }
    function stop(error) {
      if (stopped) return
      stopped = true
      clearTimers()
      document.removeEventListener('visibilitychange', handleVisibility)
      if (options.cancelSource) { try { options.cancelSource() } catch (_) {} }
      closeIterator()
      try { channel.port1.postMessage({ type: 'abort' }) } catch (_) {}
      setTimeout(function() { try { channel.port1.close() } catch (_) {} }, 0)
      if (doneArmed) rejectDone(error)
    }

    channel.port1.onmessage = async function(event) {
      var message = event.data || {}
      if (message.type === 'ready') {
        clearTimeout(handshakeTimer)
        resolveReady()
        return
      }
      if (message.type === 'abort') {
        stop(new DOMException('导出已取消', 'AbortError'))
        return
      }
      if (message.type !== 'pull' || stopped) return

      started = true
      armActivityTimer()
      try {
        if (options.signal && options.signal.aborted) throw new DOMException('导出已取消', 'AbortError')
        var next = await iterator.next()
        if (stopped) return
        if (next.done) {
          stopped = true
          clearTimers()
          document.removeEventListener('visibilitychange', handleVisibility)
          channel.port1.postMessage({ type: 'end' })
          channel.port1.close()
          resolveDone()
        } else {
          var bytes = next.value
          channel.port1.postMessage({ type: 'chunk', chunk: bytes.buffer }, [bytes.buffer])
          armActivityTimer()
        }
      } catch (error) {
        try { channel.port1.postMessage({ type: 'error', message: error.message || String(error) }) } catch (_) {}
        stop(error)
      }
    }

    handshakeTimer = setTimeout(function() {
      var error = taggedError('大文件导出服务连接超时，请刷新后重试', 'streamUnavailable')
      rejectReady(error)
      stop(error)
    }, HANDSHAKE_TIMEOUT)
    worker.postMessage({ type: 'wanwan-export-start', token: token, filename: options.filename }, [channel.port2])
    try { await ready } catch (error) { throw error }
    doneArmed = true

    document.addEventListener('visibilitychange', handleVisibility)
    if (options.signal) options.signal.addEventListener('abort', function() {
      stop(new DOMException('导出已取消', 'AbortError'))
    }, { once: true })

    var link = document.createElement('a')
    link.href = new URL('__wanwan_export__/' + encodeURIComponent(token), location.href).href
    link.download = options.filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    armActivityTimer()
    await done
  }

  window.WanWanExportStream = { download: download }
})()
