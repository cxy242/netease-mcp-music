self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim())
})

// Large exports are produced by the page a chunk at a time.  The download
// response asks for the next chunk only when its consumer is ready, so the
// page cannot accidentally queue the whole backup in memory.
var wanwanExportStreams = new Map()

self.addEventListener('message', function(event) {
  var data = event.data || {}
  if (data.type !== 'wanwan-export-start' || !data.token || !event.ports[0]) return
  var token = String(data.token)
  var port = event.ports[0]
  var entry = {
    port: port,
    filename: String(data.filename || 'wanwan-backup.json'),
    timer: setTimeout(function() { wanwanExportStreams.delete(token); try { port.close() } catch (_) {} }, 60000)
  }
  port.onmessage = function(message) {
    if ((message.data || {}).type !== 'abort') return
    clearTimeout(entry.timer)
    wanwanExportStreams.delete(token)
    try { port.close() } catch (_) {}
  }
  wanwanExportStreams.set(token, entry)
  port.postMessage({ type: 'ready' })
})

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url)
  var prefix = '/__wanwan_export__/'
  if (url.pathname.indexOf(prefix) < 0) return
  var token = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(prefix) + prefix.length))
  var entry = wanwanExportStreams.get(token)
  if (!entry) {
    event.respondWith(new Response('Export stream is unavailable', { status: 404 }))
    return
  }
  clearTimeout(entry.timer)
  wanwanExportStreams.delete(token)
  var port = entry.port
  var waiting = null
  var ended = false
  var streamController = null
  port.onmessage = function(message) {
    var data = message.data || {}
    if (data.type === 'abort') {
      ended = true
      if (waiting) {
        var abortWaiter = waiting
        waiting = null
        abortWaiter({ type: 'error', message: 'Export aborted' })
      } else if (streamController) {
        try { streamController.error(new Error('Export aborted')) } catch (_) {}
      }
      try { port.close() } catch (_) {}
      return
    }
    if (!waiting) return
    var current = waiting
    waiting = null
    current(data)
  }
  var stream = new ReadableStream({
    start: function(controller) { streamController = controller },
    pull: function(controller) {
      if (ended) return
      return new Promise(function(resolve, reject) {
        waiting = function(message) {
          if (message.type === 'chunk') {
            controller.enqueue(new Uint8Array(message.chunk))
            resolve()
          } else if (message.type === 'end') {
            ended = true
            controller.close()
            port.close()
            resolve()
          } else {
            ended = true
            controller.error(new Error(message.message || 'Export failed'))
            port.close()
            reject(new Error(message.message || 'Export failed'))
          }
        }
        port.postMessage({ type: 'pull' })
      })
    },
    cancel: function() {
      ended = true
      port.postMessage({ type: 'abort' })
      setTimeout(function() { try { port.close() } catch (_) {} }, 0)
    }
  })
  event.respondWith(new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + entry.filename.replace(/["\\\r\n]/g, '_') + '"',
      'Cache-Control': 'no-store'
    }
  }))
})

self.addEventListener('push', function(event) {
  var payload = {
    title: '弯弯',
    body: '你收到一条新消息',
    url: './'
  }

  if (event.data) {
    try {
      var data = event.data.json()
      payload.title = data.title || payload.title
      payload.body = data.body || data.message || payload.body
      payload.url = data.url || payload.url
    } catch (err) {
      payload.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: 'img/wanwan.png',
      badge: 'img/wanwan.png',
      data: { url: payload.url }
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  var targetUrl = './'
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i]
          if ('focus' in client) return client.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      })
  )
})
