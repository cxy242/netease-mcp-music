// sync.js — 数据同步模块（GitHub / Cloudflare）
// 依赖：db.js, data.js, data-stream.js

(function() {
  var timer = null

  var CONFIG_KEYS = [
    'syncBackend',
    'syncIntervalMinutes',
    'syncLastUploadAt',
    'syncLastDownloadAt',
    'syncLastError',
    'syncRemoteUpdatedAt',
    'syncGithubToken',
    'syncGithubRepo',
    'syncGithubBranch',
    'syncGithubPath',
    'syncCloudflareUrl',
    'syncCloudflareToken'
  ]

  function byId(page, id) {
    return page ? page.querySelector('#' + id) : document.getElementById(id)
  }

  async function getConfig() {
    var rows = await Promise.all(CONFIG_KEYS.map(function(key) { return db.config.get(key) }))
    var cfg = {}
    CONFIG_KEYS.forEach(function(key, i) {
      cfg[key] = rows[i] ? rows[i].value : ''
    })
    cfg.syncBackend = cfg.syncBackend || 'off'
    cfg.syncIntervalMinutes = parseInt(cfg.syncIntervalMinutes || 0, 10) || 0
    cfg.syncGithubBranch = cfg.syncGithubBranch || 'main'
    cfg.syncGithubPath = cfg.syncGithubPath || 'wanwan-sync.json'
    return cfg
  }

  async function putConfig(values) {
    var rows = Object.keys(values).map(function(key) {
      return { key: key, value: values[key] }
    })
    if (rows.length) await db.config.bulkPut(rows)
  }

  async function getSyncConfigRows() {
    var rows = await db.config.toArray()
    return rows.filter(function(row) {
      return row && row.key && /^sync/.test(row.key)
    })
  }

  function stripSyncConfig(data) {
    if (!data || !data.config) return data
    data.config = data.config.filter(function(row) {
      return !row || !row.key || !/^sync/.test(row.key)
    })
    return data
  }

  function normalizeUrl(url) {
    return String(url || '').trim().replace(/\/$/, '')
  }

  function formatTime(value) {
    if (!value) return '从未'
    var date = new Date(value)
    if (isNaN(date.getTime())) return String(value)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function backendLabel(value) {
    if (value === 'github') return 'GitHub'
    if (value === 'cloudflare') return 'Cloudflare'
    return '关闭'
  }

  function setBusy(page, busy) {
    ;['btn-save-sync-config', 'btn-sync-upload', 'btn-sync-download', 'btn-sync-status'].forEach(function(id) {
      var el = byId(page, id)
      if (el) el.disabled = !!busy
    })
  }

  // 原生、流式地把 Blob 编码为 base64（借助 FileReader.readAsDataURL），
  // 避免逐字符 `binary += String.fromCharCode(...)` 在大数据下的 O(n²) 内存爆炸。
  function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader()
      reader.onload = function() {
        var dataUrl = String(reader.result || '')
        var comma = dataUrl.indexOf(',')
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : '')
      }
      reader.onerror = function() { reject(reader.error) }
      reader.readAsDataURL(blob)
    })
  }

  function parseRepo(repo) {
    var parts = String(repo || '').trim().split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error('GitHub 仓库格式应为 username/repo')
    }
    return { owner: parts[0], repo: parts[1] }
  }

  function githubHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }

  function githubApiBase(cfg) {
    var repo = parseRepo(cfg.syncGithubRepo)
    return 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo
  }

  // 统一的 GitHub 请求封装：拼 URL、带鉴权头、解析 JSON，并把 401/403/404
  // 翻译成可操作的中文提示（否则只会吐 "Not Found" 这类看不懂的原文）。
  // opts.allow404 为真时，404 返回 null 而非抛错（用于探测 ref / 文件是否存在）。
  async function gh(cfg, path, method, body, opts) {
    opts = opts || {}
    if (!cfg.syncGithubToken) throw new Error('请填写 GitHub Token')
    var init = { method: method || 'GET', headers: githubHeaders(cfg.syncGithubToken) }
    if (body !== undefined && body !== null) {
      init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers)
      init.body = JSON.stringify(body)
    }
    var res = await fetch(githubApiBase(cfg) + path, init)
    if (opts.allow404 && res.status === 404) return null
    var text = ''
    var parsed = null
    try { text = await res.text(); parsed = text ? JSON.parse(text) : {} } catch (e) { parsed = null }
    if (!res.ok) {
      throwGithubError(res.status, parsed && (parsed.message || parsed.error))
    }
    return parsed
  }

  function throwGithubError(status, msg) {
    if (status === 401) throw new Error('GitHub Token 无效或已过期，请重新生成')
    if (status === 403) throw new Error('GitHub 拒绝访问，Token 权限不足（需 Contents 读写）' + (msg ? '：' + msg : ''))
    if (status === 404) throw new Error('找不到仓库或路径，或 Token 无权访问：请确认仓库名 owner/repo 正确，且细粒度 Token 已授权该仓库并开启 Contents 读写权限（私有仓库同样支持，但必须显式授权）')
    throw new Error(msg || ('GitHub 请求失败：' + status))
  }

  // ===== GitHub 流式分片同步 =====
  // Contents API 的 content 必须是 Base64 JSON，无法对单个请求做真正的流式上传。
  // 这里将整个备份边读取边 gzip，并把每个请求控制在约 8 MiB Base64 内。
  var GH_CHUNK_BYTES = 6 * 1024 * 1024
  var GH_MANIFEST_FORMAT = 'wanwan-gzip-chunks-v2'

  function encodePath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/')
  }

  // v2 每次上传使用独立快照目录，manifest 只在所有分片成功后切换。
  function manifestPath(cfg) {
    return cfg.syncGithubPath || 'wanwan-sync.json'
  }
  function chunkBaseName(cfg) {
    return manifestPath(cfg).split('/').pop().replace(/\.[^.]+$/, '')
  }
  function chunkDir(cfg) {
    var p = manifestPath(cfg)
    var slash = p.lastIndexOf('/')
    var prefix = slash >= 0 ? p.slice(0, slash + 1) : ''
    return prefix + chunkBaseName(cfg) + '_chunks'
  }
  function snapshotId(exportedAt) {
    return String(exportedAt) + '-' + Math.random().toString(36).slice(2, 8)
  }

  function snapshotChunkPath(cfg, id, i) {
    return chunkDir(cfg) + '/' + id + '/' + chunkBaseName(cfg) + '.part-' + ('000000' + i).slice(-6)
  }

  function requireGithubStreamSupport() {
    if (!window.ReadableStream || !window.TextEncoder || !window.CompressionStream ||
        !window.DecompressionStream || !window.crypto || !window.crypto.subtle ||
        !window.WanWanBackupStreams || !window.WanWanBackupStreams.createJsonStream ||
        !window.runWanWanStreamImport) {
      throw new Error('当前浏览器不支持 GitHub 大数据流式同步，请使用最新版 Chrome、Edge 或 Safari')
    }
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function(b) { return ('0' + b.toString(16)).slice(-2) }).join('')
  }

  async function sha256(bytes) {
    return bytesToHex(await crypto.subtle.digest('SHA-256', bytes))
  }

  function backupCompressedStream(exportedAt, onProgress, stats) {
    var encoder = new TextEncoder()
    var generator = window.WanWanBackupStreams.createJsonStream({
      exportedAt: exportedAt,
      excludeSyncConfig: true,
      onProgress: function(rows, table) {
        if (onProgress) onProgress(15, '正在读取 ' + table + '（' + rows + ' 条）')
      }
    })
    var iterator = generator[Symbol.asyncIterator]()
    var jsonStream = new ReadableStream({
      async pull(controller) {
        try {
          var next = await iterator.next()
          if (next.done) { controller.close(); return }
          var bytes = encoder.encode(String(next.value))
          stats.jsonBytes += bytes.byteLength
          controller.enqueue(bytes)
        } catch (err) { controller.error(err) }
      },
      async cancel() { if (iterator.return) await iterator.return() }
    })
    return jsonStream.pipeThrough(new CompressionStream('gzip'))
  }

  function concatBytes(parts, total) {
    var out = new Uint8Array(total), offset = 0
    parts.forEach(function(part) { out.set(part, offset); offset += part.byteLength })
    return out
  }

  // GET 文件原始内容（.raw），不存在返回 null。
  async function githubGetRaw(cfg, repoPath) {
    if (!cfg.syncGithubToken) throw new Error('请填写 GitHub Token')
    var branch = encodeURIComponent(cfg.syncGithubBranch || 'main')
    var headers = Object.assign({}, githubHeaders(cfg.syncGithubToken), { Accept: 'application/vnd.github.raw' })
    var res = await fetch(githubApiBase(cfg) + '/contents/' + encodePath(repoPath) + '?ref=' + branch, { headers: headers })
    if (res.status === 404) return null
    if (!res.ok) {
      var msg = ''
      try { var j = JSON.parse(await res.text()); msg = j && (j.message || j.error) } catch (e) {}
      throwGithubError(res.status, msg)
    }
    return await res.text()
  }

  // GET 文件原始字节（.raw），用于取回二进制分片，不存在返回 null。
  async function githubGetRawBytes(cfg, repoPath) {
    if (!cfg.syncGithubToken) throw new Error('请填写 GitHub Token')
    var branch = encodeURIComponent(cfg.syncGithubBranch || 'main')
    var headers = Object.assign({}, githubHeaders(cfg.syncGithubToken), { Accept: 'application/vnd.github.raw' })
    var res = await fetch(githubApiBase(cfg) + '/contents/' + encodePath(repoPath) + '?ref=' + branch, { headers: headers })
    if (res.status === 404) return null
    if (!res.ok) {
      var msg = ''
      try { var j = JSON.parse(await res.text()); msg = j && (j.message || j.error) } catch (e) {}
      throwGithubError(res.status, msg)
    }
    return await res.arrayBuffer()
  }

  // 取路径当前文件 sha（用于覆盖），不存在返回 null。
  async function githubGetSha(cfg, repoPath) {
    var branch = encodeURIComponent(cfg.syncGithubBranch || 'main')
    var meta = await gh(cfg, '/contents/' + encodePath(repoPath) + '?ref=' + branch, 'GET', null, { allow404: true })
    return meta && meta.sha ? meta.sha : null
  }

  // PUT 单个文件（content 为已 base64 的文件内容）。
  async function githubPutFile(cfg, repoPath, contentBase64, message, sha) {
    var body = { message: message || 'Update WanWan sync', content: contentBase64, branch: cfg.syncGithubBranch || 'main' }
    if (sha) body.sha = sha
    return await gh(cfg, '/contents/' + encodePath(repoPath), 'PUT', body)
  }

  // 上传前预检：仓库可访问且有写(push)权限。
  async function githubCheckAccess(cfg) {
    parseRepo(cfg.syncGithubRepo)
    var info = await gh(cfg, '', 'GET') // /repos/{owner}/{repo}
    if (info && info.permissions && info.permissions.push === false) {
      throw new Error('Token 缺少写入(push)权限，请重新生成并授予该仓库的 Contents 读写')
    }
    return info
  }

  async function cleanupPreviousSnapshot(cfg, previousManifest, keepPaths) {
    if (!previousManifest || !Array.isArray(previousManifest.chunkPaths)) return
    for (var i = 0; i < previousManifest.chunkPaths.length; i++) {
      var path = previousManifest.chunkPaths[i]
      if (!path || keepPaths.indexOf(path) >= 0) continue
      try {
        var sha = await githubGetSha(cfg, path)
        if (sha) await gh(cfg, '/contents/' + encodePath(path), 'DELETE', {
          message: 'Remove previous WanWan sync chunk',
          sha: sha,
          branch: cfg.syncGithubBranch || 'main'
        })
      } catch (_) {}
    }
  }

  async function githubUpload(cfg, options) {
    requireGithubStreamSupport()
    await githubCheckAccess(cfg)
    options = options || {}
    var report = options.onProgress || function() {}
    var previousManifest = null
    try {
      var previousText = await githubGetRaw(cfg, manifestPath(cfg))
      previousManifest = previousText ? JSON.parse(previousText) : null
    } catch (_) {}
    var exportedAt = Date.now(), id = snapshotId(exportedAt), stats = { jsonBytes: 0 }
    var reader = backupCompressedStream(exportedAt, report, stats).getReader()
    var pending = [], pendingBytes = 0, compressedBytes = 0, chunks = []

    async function uploadChunk(bytes) {
      var index = chunks.length
      var path = snapshotChunkPath(cfg, id, index)
      report(Math.min(94, 25 + index * 3), '正在上传第 ' + (index + 1) + ' 个分片…')
      await githubPutFile(cfg, path, await blobToBase64(new Blob([bytes])),
        'Upload WanWan sync chunk ' + (index + 1), null)
      var digest = await sha256(bytes)
      chunks.push({ path: path, size: bytes.byteLength, sha256: digest })
      compressedBytes += bytes.byteLength
    }

    while (true) {
      var next = await reader.read()
      if (next.done) break
      pending.push(next.value); pendingBytes += next.value.byteLength
      if (pendingBytes >= GH_CHUNK_BYTES) {
        var joined = concatBytes(pending, pendingBytes)
        await uploadChunk(joined.slice(0, GH_CHUNK_BYTES))
        var remainder = joined.slice(GH_CHUNK_BYTES)
        pending = remainder.byteLength ? [remainder] : []; pendingBytes = remainder.byteLength
      }
    }
    if (pendingBytes || !chunks.length) await uploadChunk(concatBytes(pending, pendingBytes))

    // manifest 最后写入：上传中断时旧 manifest 仍指向上一份完整快照。
    var manifest = {
      app: '弯弯',
      format: GH_MANIFEST_FORMAT,
      gzip: true,
      exportedAt: exportedAt,
      snapshotId: id,
      totalChunks: chunks.length,
      chunks: chunks,
      chunkPaths: chunks.map(function(chunk) { return chunk.path }),
      compressedSize: compressedBytes,
      size: stats.jsonBytes
    }
    var mPath = manifestPath(cfg)
    var mSha = await githubGetSha(cfg, mPath)
    var mContent = await blobToBase64(new Blob([JSON.stringify(manifest)]))
    await githubPutFile(cfg, mPath, mContent, 'Update sync manifest', mSha)
    report(97, '正在清理上一份同步分片…')
    await cleanupPreviousSnapshot(cfg, previousManifest, manifest.chunkPaths)

    return { exists: true, updatedAt: manifest.exportedAt, size: manifest.size }
  }

  async function githubDownloadStream(cfg, onProgress) {
    requireGithubStreamSupport()
    var mText = await githubGetRaw(cfg, manifestPath(cfg))
    if (mText == null) throw new Error('GitHub 同步文件不存在')
    var manifest
    try { manifest = JSON.parse(mText) } catch (e) { throw new Error('同步清单解析失败') }
    if (!manifest || !Array.isArray(manifest.chunkPaths) || !manifest.chunkPaths.length) {
      throw new Error('同步清单格式不正确')
    }
    var descriptors = manifest.format === GH_MANIFEST_FORMAT && Array.isArray(manifest.chunks)
      ? manifest.chunks
      : manifest.chunkPaths.map(function(path) { return { path: path } })
    var index = 0
    var compressed = new ReadableStream({
      async pull(controller) {
        if (index >= descriptors.length) { controller.close(); return }
        var descriptor = descriptors[index]
        try {
          if (onProgress) onProgress(Math.min(45, 5 + index / descriptors.length * 40),
            '正在下载第 ' + (index + 1) + '/' + descriptors.length + ' 个分片…')
          var buf = await githubGetRawBytes(cfg, descriptor.path)
          if (buf == null) throw new Error('同步分片缺失：' + descriptor.path)
          var bytes = new Uint8Array(buf)
          if (descriptor.size != null && bytes.byteLength !== descriptor.size) {
            throw new Error('同步分片长度不符：' + descriptor.path)
          }
          if (descriptor.sha256 && await sha256(bytes) !== descriptor.sha256) {
            throw new Error('同步分片校验失败：' + descriptor.path)
          }
          index++; controller.enqueue(bytes)
        } catch (err) { controller.error(err) }
      }
    })
    var jsonStream = manifest.gzip === false ? compressed : compressed.pipeThrough(new DecompressionStream('gzip'))
    return {
      manifest: manifest,
      source: { size: Number(manifest.size) || 0, stream: function() { return jsonStream } }
    }
  }

  async function githubStatus(cfg) {
    var mText = await githubGetRaw(cfg, manifestPath(cfg))
    if (mText == null) return { exists: false, updatedAt: '', size: 0, detail: '远端文件不存在' }
    var manifest = null
    try { manifest = JSON.parse(mText) } catch (e) {}
    if (!manifest) return { exists: true, updatedAt: '', size: 0, detail: '远端存在文件但清单无法解析' }
    var chunks = manifest.totalChunks || (manifest.chunkPaths ? manifest.chunkPaths.length : 0)
    return {
      exists: true,
      updatedAt: manifest.exportedAt || '',
      size: manifest.size || 0,
      detail: '文件存在，' + chunks + ' 个分片，约 ' + (manifest.size || 0) + ' 字节'
    }
  }

  function cloudflareHeaders(cfg) {
    var headers = { 'Content-Type': 'application/json' }
    if (cfg.syncCloudflareToken) headers.Authorization = 'Bearer ' + cfg.syncCloudflareToken
    return headers
  }

  async function cloudflareRequest(cfg, path, options) {
    var base = normalizeUrl(cfg.syncCloudflareUrl)
    if (!base) throw new Error('请填写 Cloudflare 后端地址')
    return fetch(base + path, options || {})
  }

  async function cloudflareUpload(cfg, data) {
    return await readJsonResponse(await cloudflareRequest(cfg, '/sync/data', {
      method: 'PUT',
      headers: cloudflareHeaders(cfg),
      body: JSON.stringify(data)
    }), '上传到 Cloudflare 失败')
  }

  async function cloudflareDownload(cfg) {
    return await readJsonResponse(await cloudflareRequest(cfg, '/sync/data', {
      headers: cloudflareHeaders(cfg)
    }), '从 Cloudflare 下载失败')
  }

  async function cloudflareStatus(cfg) {
    return await readJsonResponse(await cloudflareRequest(cfg, '/sync/status', {
      headers: cloudflareHeaders(cfg)
    }), '读取 Cloudflare 状态失败')
  }

  async function readJsonResponse(res, fallback) {
    var body = null
    var text = ''
    try {
      text = await res.text()
      body = text ? JSON.parse(text) : {}
    } catch (e) {
      body = null
    }
    if (!res.ok) {
      var message = body && (body.message || body.error)
      throw new Error(message || fallback || ('请求失败：' + res.status))
    }
    return body
  }

  async function uploadData(options) {
    options = options || {}
    var cfg = await getConfig()
    if (cfg.syncBackend === 'off') throw new Error('请先选择同步方式')
    var result
    if (cfg.syncBackend === 'github') {
      result = await githubUpload(cfg, options)
    } else {
      var data = stripSyncConfig(await window.buildBackupData(options.onProgress))
      result = await cloudflareUpload(cfg, data)
    }
    var now = Date.now()
    await putConfig({
      syncLastUploadAt: now,
      syncLastError: '',
      syncRemoteUpdatedAt: (result && result.updatedAt) || now
    })
    return result
  }

  async function downloadData(options) {
    options = options || {}
    var cfg = await getConfig()
    if (cfg.syncBackend === 'off') throw new Error('请先选择同步方式')
    var localSyncConfig = await getSyncConfigRows()
    var remoteUpdatedAt
    if (cfg.syncBackend === 'github') {
      var remote = await githubDownloadStream(cfg, options.onProgress)
      var importProgress = function(pct, text) {
        if (options.onProgress) options.onProgress(45 + Math.max(0, Number(pct) || 0) * 0.55, text)
      }
      await window.runWanWanStreamImport(remote.source, importProgress, {
        clearBeforeImport: true,
        preserveConfigRows: localSyncConfig
      })
      remoteUpdatedAt = remote.manifest.exportedAt
    } else {
      var data = await cloudflareDownload(cfg)
      await window.importBackupData(data, options.onProgress, { clearBeforeImport: true })
      if (localSyncConfig.length) await db.config.bulkPut(localSyncConfig)
      remoteUpdatedAt = data.exportedAt
    }
    var now = Date.now()
    await putConfig({
      syncLastDownloadAt: now,
      syncLastError: '',
      syncRemoteUpdatedAt: remoteUpdatedAt || now
    })
    return { exportedAt: remoteUpdatedAt }
  }

  async function getRemoteStatus() {
    var cfg = await getConfig()
    if (cfg.syncBackend === 'off') throw new Error('请先选择同步方式')
    var status = cfg.syncBackend === 'github' ? await githubStatus(cfg) : await cloudflareStatus(cfg)
    if (status && status.updatedAt) {
      await putConfig({ syncRemoteUpdatedAt: status.updatedAt, syncLastError: '' })
    } else {
      await putConfig({ syncLastError: '' })
    }
    return status
  }

  async function saveConfigFromPage(page) {
    var values = {
      syncBackend: byId(page, 'sync-backend').value,
      syncIntervalMinutes: parseInt(byId(page, 'sync-interval').value || 0, 10) || 0,
      syncGithubToken: byId(page, 'sync-github-token').value.trim(),
      syncGithubRepo: byId(page, 'sync-github-repo').value.trim(),
      syncGithubBranch: byId(page, 'sync-github-branch').value.trim() || 'main',
      syncGithubPath: byId(page, 'sync-github-path').value.trim() || 'wanwan-sync.json',
      syncCloudflareUrl: normalizeUrl(byId(page, 'sync-cloudflare-url').value),
      syncCloudflareToken: byId(page, 'sync-cloudflare-token').value.trim()
    }
    await putConfig(values)
    applyProviderVisibility(page, values.syncBackend)
    startTimer()
    await refreshStatus(page)
    window.toast('同步设置已保存')
  }

  async function loadConfigToPage(page) {
    var cfg = await getConfig()
    byId(page, 'sync-backend').value = cfg.syncBackend
    byId(page, 'sync-interval').value = String(cfg.syncIntervalMinutes || 0)
    byId(page, 'sync-github-token').value = cfg.syncGithubToken || ''
    byId(page, 'sync-github-repo').value = cfg.syncGithubRepo || ''
    byId(page, 'sync-github-branch').value = cfg.syncGithubBranch || 'main'
    byId(page, 'sync-github-path').value = cfg.syncGithubPath || 'wanwan-sync.json'
    byId(page, 'sync-cloudflare-url').value = cfg.syncCloudflareUrl || ''
    byId(page, 'sync-cloudflare-token').value = cfg.syncCloudflareToken || ''
    applyProviderVisibility(page, cfg.syncBackend)
    await refreshStatus(page, cfg)
  }

  function applyProviderVisibility(page, backend) {
    var github = byId(page, 'sync-github-fields')
    var cloudflare = byId(page, 'sync-cloudflare-fields')
    if (github) github.style.display = backend === 'github' ? 'block' : 'none'
    if (cloudflare) cloudflare.style.display = backend === 'cloudflare' ? 'block' : 'none'
  }

  async function refreshStatus(page, cfg) {
    cfg = cfg || await getConfig()
    var backend = byId(page, 'sync-status-backend')
    var upload = byId(page, 'sync-status-upload')
    var download = byId(page, 'sync-status-download')
    var remote = byId(page, 'sync-status-remote')
    var error = byId(page, 'sync-status-error')
    if (backend) backend.textContent = backendLabel(cfg.syncBackend)
    if (upload) upload.textContent = formatTime(cfg.syncLastUploadAt)
    if (download) download.textContent = formatTime(cfg.syncLastDownloadAt)
    if (remote) remote.textContent = cfg.syncRemoteUpdatedAt ? formatTime(cfg.syncRemoteUpdatedAt) : '未知'
    if (error) error.textContent = cfg.syncLastError || '无'
  }

  async function recordError(page, err) {
    var message = err && err.message ? err.message : '同步失败'
    await putConfig({ syncLastError: message })
    await refreshStatus(page)
    window.toast(message)
  }

  function showProgressSheet(title, text) {
    var overlay = document.createElement('div')
    overlay.className = 'sheet-overlay'
    overlay.style.zIndex = '200'
    var sheet = document.createElement('div')
    sheet.className = 'center-modal'
    sheet.style.zIndex = '201'
    sheet.innerHTML =
      '<div class="sheet-title">' + title + '</div>' +
      '<div class="export-progress-wrap">' +
        '<div class="export-progress-bar"><div class="export-progress-fill" id="sync-progress-fill"></div></div>' +
        '<div class="export-progress-text" id="sync-progress-text">' + text + '</div>' +
      '</div>'
    document.getElementById('app').appendChild(overlay)
    document.getElementById('app').appendChild(sheet)
    requestAnimationFrame(function() {
      overlay.classList.add('show')
      sheet.classList.add('show')
    })
    return {
      set: function(pct, label) {
        var fill = sheet.querySelector('#sync-progress-fill')
        var msg = sheet.querySelector('#sync-progress-text')
        if (fill) fill.style.width = pct + '%'
        if (msg) msg.textContent = label
      },
      close: function() {
        overlay.classList.remove('show')
        sheet.classList.remove('show')
        setTimeout(function() { overlay.remove(); sheet.remove() }, 200)
      }
    }
  }

  async function manualUpload(page) {
    if (!confirm('上传后，远端数据会被当前设备的数据覆盖。是否继续？')) return
    setBusy(page, true)
    var progress = showProgressSheet('上传同步数据', '准备中...')
    try {
      await uploadData({ onProgress: progress.set })
      progress.set(100, '上传完成！')
      await refreshStatus(page)
      window.toast('同步数据已上传')
      setTimeout(progress.close, 900)
    } catch (err) {
      progress.close()
      await recordError(page, err)
    } finally {
      setBusy(page, false)
    }
  }

  async function manualDownload(page) {
    if (!confirm('下载后，本机数据会被远端数据覆盖。是否继续？')) return
    setBusy(page, true)
    var progress = showProgressSheet('下载同步数据', '读取远端数据...')
    try {
      await downloadData({ onProgress: progress.set })
      progress.set(100, '恢复完成，即将刷新...')
      await refreshStatus(page)
      window.toast('同步数据已下载')
      setTimeout(function() { location.reload() }, 1200)
    } catch (err) {
      progress.close()
      await recordError(page, err)
      setBusy(page, false)
    }
  }

  async function manualStatus(page) {
    setBusy(page, true)
    try {
      var status = await getRemoteStatus()
      await refreshStatus(page)
      var detail = status && status.detail ? status.detail : '远端状态已更新'
      if (status && status.exists === false) detail = '远端数据不存在'
      window.toast(detail)
    } catch (err) {
      await recordError(page, err)
    } finally {
      setBusy(page, false)
    }
  }

  async function runScheduledUpload() {
    try {
      var cfg = await getConfig()
      if (cfg.syncBackend === 'off' || !cfg.syncIntervalMinutes) return
      await uploadData()
    } catch (err) {
      await putConfig({ syncLastError: err && err.message ? err.message : '定时同步失败' })
    }
  }

  async function startTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!window.db) return
    var cfg = await getConfig()
    if (cfg.syncBackend === 'off' || !cfg.syncIntervalMinutes) return
    timer = setInterval(runScheduledUpload, cfg.syncIntervalMinutes * 60 * 1000)
  }

  function initDataManagePage(page) {
    loadConfigToPage(page)
    byId(page, 'sync-backend').addEventListener('change', function(e) {
      applyProviderVisibility(page, e.target.value)
    })
    byId(page, 'btn-save-sync-config').addEventListener('click', function() {
      saveConfigFromPage(page).catch(function(err) { recordError(page, err) })
    })
    byId(page, 'btn-sync-upload').addEventListener('click', function() { manualUpload(page) })
    byId(page, 'btn-sync-download').addEventListener('click', function() { manualDownload(page) })
    byId(page, 'btn-sync-status').addEventListener('click', function() { manualStatus(page) })
  }

  function waitForDBAndStart() {
    var elapsed = 0
    var handle = setInterval(function() {
      elapsed += 100
      if (window.db || elapsed > 8000) {
        clearInterval(handle)
        if (window.db) startTimer()
      }
    }, 100)
  }

  window.WanWanSync = {
    initDataManagePage: initDataManagePage,
    startTimer: startTimer,
    uploadData: uploadData,
    downloadData: downloadData,
    getRemoteStatus: getRemoteStatus
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDBAndStart)
  } else {
    waitForDBAndStart()
  }
})()
