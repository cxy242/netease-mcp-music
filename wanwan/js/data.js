// data.js — 数据管理模块（导入/导出/清除）
// 依赖：db.js 必须先加载

var PROTECTED_LOCAL_STORAGE_KEYS = ['wanwan_online_device_id']
var PROTECTED_LOCAL_STORAGE_PREFIXES = ['wanwan_mcp_oauth_', 'wanwan_mcp_secret_']

function isProtectedLocalStorageKey(key) {
  return PROTECTED_LOCAL_STORAGE_KEYS.indexOf(String(key)) >= 0 ||
    PROTECTED_LOCAL_STORAGE_PREFIXES.some(function(prefix) {
      return String(key).indexOf(prefix) === 0
    })
}

// 只用于当前设备的诊断状态，不写入备份，也不计入备份数据总量。
var BACKUP_EXCLUDED_CONFIG_KEYS = [
  'memoryEmbeddingStatus',
  'memoryLastError'
]

function isBackupConfigRow(row) {
  return row && BACKUP_EXCLUDED_CONFIG_KEYS.indexOf(String(row.key)) < 0
}

function filterBackupConfigRows(rows) {
  return Array.isArray(rows) ? rows.filter(isBackupConfigRow) : []
}

async function getBackupConfigRows() {
  return filterBackupConfigRows(await db.config.toArray())
}

// ===== Blob 安全序列化（config / imageBlobs 里可能存 Blob，JSON 无法直接导出）=====
function blobToB64(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader()
    reader.onload = function() {
      var dataUrl = String(reader.result || '')
      var comma = dataUrl.indexOf(',')
      resolve({ __blob__: 1, type: blob.type || '', b64: comma >= 0 ? dataUrl.slice(comma + 1) : '' })
    }
    reader.onerror = function() { reject(reader.error) }
    reader.readAsDataURL(blob)
  })
}

function b64ToBlob(marker) {
  var binary = atob(marker.b64 || '')
  var len = binary.length
  var bytes = new Uint8Array(len)
  for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: marker.type || '' })
}

function isBlobMarker(v) {
  return v && typeof v === 'object' && v.__blob__ === 1 && typeof v.b64 === 'string'
}

// 递归把对象/数组里的 Blob 转成 marker（异步）
async function serializeBlobs(value) {
  if (value instanceof Blob) return await blobToB64(value)
  if (Array.isArray(value)) {
    var arr = []
    for (var i = 0; i < value.length; i++) arr.push(await serializeBlobs(value[i]))
    return arr
  }
  if (value && typeof value === 'object') {
    var out = {}
    var keys = Object.keys(value)
    for (var k = 0; k < keys.length; k++) out[keys[k]] = await serializeBlobs(value[keys[k]])
    return out
  }
  return value
}

// 递归把 marker 还原成 Blob
function deserializeBlobs(value) {
  if (isBlobMarker(value)) return b64ToBlob(value)
  if (Array.isArray(value)) return value.map(deserializeBlobs)
  if (value && typeof value === 'object') {
    var out = {}
    var keys = Object.keys(value)
    for (var k = 0; k < keys.length; k++) out[keys[k]] = deserializeBlobs(value[keys[k]])
    return out
  }
  return value
}

// ===== 注入数据管理点击事件到设置页 =====
window.injectDataButtons = function(page) {
  var row = page.querySelector('#row-data-manage')
  if (!row) return
  row.addEventListener('click', function() {
    openDataManagePage(page)
  })
}

// ===== 打开数据管理子页面 =====
// 先用占位大小把页面秒开（避免在计算完成前阻塞主线程，Edge/Via 数据量大时会直接卡死），
// 打开后再后台分片计算各分组占用，算完就地回填。同一次设置页会话复用结果；
// 设置页关闭后 DOM 实例连同缓存一起销毁，下次打开设置时才重新计算。
function openDataManagePage(settingsPage) {
  var cachedSizes = settingsPage && settingsPage._dataSizesResult
  var placeholder = { wechat: 0, characters: 0, lorebook: 0, missyou: 0, social: 0, other: 0 }
  var html = buildDataPageHTML(cachedSizes || placeholder)
  var page = buildSubPage('sub-data-manage', '数据管理', html)
  openSubPage(page)
  initDataManagePage(page)

  if (!cachedSizes) {
    // 占位文案，提示正在后台计算
    var totalEl = page.querySelector('.data-used-total')
    if (totalEl) totalEl.textContent = '计算中…'
    var sizeEls = page.querySelectorAll('.data-overview-size')
    for (var i = 0; i < sizeEls.length; i++) sizeEls[i].textContent = '…'

    getSettingsSessionDataSizes(settingsPage).then(function(sizes) {
      updateDataSizesDOM(page, sizes)
    }).catch(function(e) {
      console.error('[data] getDataSizes 失败', e)
      if (page.isConnected && totalEl) totalEl.textContent = '计算失败'
    })
  }
  updateBrowserStorageDOM(page)
}

// 缓存绑定在本次 settings-page DOM 上：返回子页时复用，退出设置页后自动失效。
// Promise 也一起缓存，避免计算途中重复进入数据管理时并发扫描全库。
function getSettingsSessionDataSizes(settingsPage) {
  if (!settingsPage) return getDataSizes()
  if (settingsPage._dataSizesResult) return Promise.resolve(settingsPage._dataSizesResult)
  if (!settingsPage._dataSizesPromise) {
    settingsPage._dataSizesPromise = getDataSizes().then(function(sizes) {
      settingsPage._dataSizesResult = sizes
      return sizes
    }).catch(function(error) {
      settingsPage._dataSizesPromise = null
      throw error
    })
  }
  return settingsPage._dataSizesPromise
}

// 把算好的大小就地回填到已打开的数据管理页（用户已离开则丢弃）
function updateDataSizesDOM(page, sizes) {
  if (!page || !page.isConnected) return
  var totalEl = page.querySelector('.data-used-total')
  if (totalEl) totalEl.textContent = formatBytes(getTotalDataSize(sizes))
  var listEl = page.querySelector('.data-overview-list')
  if (listEl) listEl.innerHTML = buildOverviewRowsHTML(sizes)
}

async function updateBrowserStorageDOM(page) {
  var usageEl = page && page.querySelector('#browser-storage-usage')
  var quotaEl = page && page.querySelector('#browser-storage-quota')
  var noteEl = page && page.querySelector('#browser-storage-note')
  if (!usageEl || !quotaEl || !noteEl) return
  try {
    var info = window.getWanWanStorageDiagnostic
      ? await window.getWanWanStorageDiagnostic()
      : null
    if (!page.isConnected) return
    if (!info || info.usage == null || info.quota == null) {
      usageEl.textContent = '不可用'
      quotaEl.textContent = '不可用'
      noteEl.textContent = '当前浏览器未提供存储配额信息'
      return
    }
    usageEl.textContent = formatBytes(info.usage)
    quotaEl.textContent = formatBytes(info.quota)
    var percent = info.quota > 0 ? info.usage / info.quota * 100 : 0
    noteEl.textContent = '已使用浏览器配额的 ' + percent.toFixed(1) + '%'
    if (percent >= 80) {
      noteEl.textContent += '，存储空间接近上限'
      noteEl.style.color = 'var(--c-red)'
    }
  } catch (error) {
    usageEl.textContent = '读取失败'
    quotaEl.textContent = '读取失败'
    noteEl.textContent = error && error.message ? error.message : '无法读取浏览器存储信息'
  }
}

// ===== 数据概览6行（按占用空间，概览与导出弹窗共用）=====
function buildSizeRowsHTML(sizes) {
  return '<div class="preview-row"><span>微信数据</span><span>' + formatBytes(sizes.wechat) + '</span></div>' +
    '<div class="preview-row"><span>角色档案</span><span>' + formatBytes(sizes.characters) + '</span></div>' +
    '<div class="preview-row"><span>世界书</span><span>' + formatBytes(sizes.lorebook) + '</span></div>' +
    '<div class="preview-row"><span>想见你</span><span>' + formatBytes(sizes.missyou) + '</span></div>' +
    '<div class="preview-row"><span>社媒软件</span><span>' + formatBytes(sizes.social) + '</span></div>' +
    '<div class="preview-row"><span>其他</span><span>' + formatBytes(sizes.other) + '</span></div>'
}

function getTotalDataSize(sizes) {
  return ['wechat', 'characters', 'lorebook', 'missyou', 'social', 'other'].reduce(function(total, key) {
    return total + (Number(sizes[key]) || 0)
  }, 0)
}

function buildOverviewRowsHTML(sizes) {
  var rows = [
    ['fa-brands fa-weixin', '微信数据', sizes.wechat, 'data-icon-wechat'],
    ['fa-solid fa-folder-closed', '角色档案', sizes.characters, 'data-icon-character'],
    ['fa-solid fa-earth-americas', '世界书', sizes.lorebook, 'data-icon-lore'],
    ['fa-solid fa-fire-flame-curved', '想见你', sizes.missyou, 'data-icon-miss'],
    ['fa-solid fa-hashtag', '社媒软件', sizes.social, 'data-icon-social'],
    ['fa-solid fa-box-archive', '其他', sizes.other, 'data-icon-other']
  ]
  return rows.map(function(row) {
    return '<div class="data-overview-row">' +
      '<span class="data-overview-icon ' + row[3] + '"><i class="' + row[0] + '"></i></span>' +
      '<span class="data-overview-name">' + row[1] + '</span>' +
      '<span class="data-overview-size">' + formatBytes(row[2]) + '</span>' +
    '</div>'
  }).join('')
}

// ===== 数据管理子页面HTML =====
function buildDataPageHTML(sizes) {
  var total = getTotalDataSize(sizes)
  return '<div class="setting-section data-used-card">' +
    '<div class="data-used-inner">' +
      '<div class="data-used-label">已使用</div>' +
      '<div class="data-used-total">' + formatBytes(total) + '</div>' +
      '<div class="data-used-meter"><span></span></div>' +
      '<div class="data-used-note">计算所有本地数据</div>' +
    '</div>' +
  '</div>' +
  '<div class="setting-section">' +
    '<div class="section-title">浏览器存储</div>' +
    '<div class="preview-list">' +
      '<div class="preview-row"><span>实际已使用</span><span id="browser-storage-usage">读取中…</span></div>' +
      '<div class="preview-row"><span>可用配额</span><span id="browser-storage-quota">读取中…</span></div>' +
    '</div>' +
    '<div class="section-desc" id="browser-storage-note">正在读取浏览器提供的存储信息…</div>' +
  '</div>' +
  '<div class="setting-section">' +
    '<div class="data-actions">' +
      '<button class="btn-pill btn-full" id="btn-export-data">' +
        '<i class="fa fa-download"></i> 导出数据</button>' +
      '<button class="btn-ghost btn-full" id="btn-import-data">' +
        '<i class="fa fa-upload"></i> 导入数据</button>' +
    '</div>' +
  '</div>' +
  '<div class="setting-section">' +
    '<div class="section-title">数据概览</div>' +
    '<div class="data-overview-list">' + buildOverviewRowsHTML(sizes) + '</div>' +
  '</div>' +
  '<div class="setting-section">' +
    '<div class="data-actions">' +
      '<button class="btn-pill btn-full" id="btn-compress-images">' +
        '<i class="fa-solid fa-image"></i> 压缩本地图片</button>' +
      '<button class="btn-ghost btn-full data-delete-app-btn" id="btn-delete-app-data">' +
        '<i class="fa-solid fa-broom"></i> 清理 App 数据</button>' +
      '<button class="btn-danger btn-pill btn-full" id="btn-clear-data">' +
        '<i class="fa fa-trash"></i> 清空所有数据</button>' +
    '</div>' +
  '</div>' +
  buildSyncSectionHTML() +
  '<input type="file" id="import-file-input" accept=".json" style="display:none">'
}

// ===== 同步数据区块HTML =====
function buildSyncSectionHTML() {
  return '<div class="setting-section sync-section">' +
    '<div class="section-title">同步设置</div>' +
    '<div class="api-form sync-form">' +
      '<label class="form-label">同步方式</label>' +
      '<select class="input-field" id="sync-backend">' +
        '<option value="off">关闭</option>' +
        '<option value="github">GitHub</option>' +
        '<option value="cloudflare">Cloudflare</option>' +
      '</select>' +
      '<label class="form-label">定时同步</label>' +
      '<select class="input-field" id="sync-interval">' +
        '<option value="0">关闭</option>' +
        '<option value="5">每 5 分钟</option>' +
        '<option value="15">每 15 分钟</option>' +
        '<option value="30">每 30 分钟</option>' +
        '<option value="60">每 60 分钟</option>' +
      '</select>' +
      '<div class="sync-provider-fields" id="sync-github-fields">' +
        '<label class="form-label">GitHub Token</label>' +
        '<input class="input-field" id="sync-github-token" type="password" autocomplete="off" placeholder="Fine-grained token">' +
        '<label class="form-label">仓库</label>' +
        '<input class="input-field" id="sync-github-repo" placeholder="username/wanwan-sync">' +
        '<label class="form-label">分支</label>' +
        '<input class="input-field" id="sync-github-branch" placeholder="main">' +
        '<label class="form-label">同步文件路径</label>' +
        '<input class="input-field" id="sync-github-path" placeholder="wanwan-sync.json">' +
      '</div>' +
      '<div class="sync-provider-fields" id="sync-cloudflare-fields">' +
        '<label class="form-label">后端地址</label>' +
        '<input class="input-field" id="sync-cloudflare-url" placeholder="https://xxx.workers.dev">' +
        '<label class="form-label">访问 Token</label>' +
        '<input class="input-field" id="sync-cloudflare-token" type="password" autocomplete="off" placeholder="后端访问密钥">' +
      '</div>' +
      '<button class="btn-pill btn-full" id="btn-save-sync-config">' +
        '<i class="fa fa-floppy-disk"></i> 保存同步设置</button>' +
    '</div>' +
  '</div>' +
  '<div class="setting-section sync-section">' +
    '<div class="section-title">手动同步</div>' +
    '<div class="data-actions">' +
      '<button class="btn-pill btn-full" id="btn-sync-upload">' +
        '<i class="fa fa-cloud-arrow-up"></i> 上传到同步后端</button>' +
      '<button class="btn-ghost btn-full" id="btn-sync-download">' +
        '<i class="fa fa-cloud-arrow-down"></i> 从同步后端下载</button>' +
      '<button class="btn-ghost btn-full" id="btn-sync-status">' +
        '<i class="fa fa-circle-info"></i> 查看远端状态</button>' +
    '</div>' +
  '</div>' +
  '<div class="setting-section sync-section">' +
    '<div class="section-title">同步状态</div>' +
    '<div class="export-preview sync-status-list">' +
      '<div class="preview-row"><span>当前后端</span><span id="sync-status-backend">关闭</span></div>' +
      '<div class="preview-row"><span>上次上传</span><span id="sync-status-upload">从未</span></div>' +
      '<div class="preview-row"><span>上次下载</span><span id="sync-status-download">从未</span></div>' +
      '<div class="preview-row"><span>远端更新时间</span><span id="sync-status-remote">未知</span></div>' +
      '<div class="preview-row"><span>最近错误</span><span id="sync-status-error">无</span></div>' +
    '</div>' +
  '</div>'
}

// ===== 绑定数据管理子页面事件 =====
function initDataManagePage(page) {
  page.querySelector('#btn-export-data').addEventListener('click', showExportConfirm)
  page.querySelector('#btn-import-data').addEventListener('click', function() {
    page.querySelector('#import-file-input').click()
  })
  page.querySelector('#import-file-input').addEventListener('change', function(e) {
    if (e.target.files[0]) startImport(e.target.files[0])
  })
  page.querySelector('#btn-clear-data').addEventListener('click', showClearConfirm)
  page.querySelector('#btn-compress-images').addEventListener('click', showCompressConfirm)
  page.querySelector('#btn-delete-app-data').addEventListener('click', showAppDataPicker)
  if (window.WanWanSync && window.WanWanSync.initDataManagePage) {
    window.WanWanSync.initDataManagePage(page)
  }
}

// ===== 可独立清理的 App 数据边界（不触碰微信、角色档案、世界书、想见你） =====
var APP_DATA_DEFS = [
  { id: 'phone', name: '查看记录', icon: 'fa-brands fa-chrome', configPrefixes: ['phoneRecordsPersonalization_'], configKeys: ['phoneRecordsIScreenPresets'] },
  { id: 'music', name: '网易云音乐', icon: 'fa-solid fa-music', configPrefixes: ['userPlaylistSongs_'], configKeys: ['likedSongs', 'playlistSettings', 'userPlaylists', 'musicProfile'] },
  { id: 'icity', name: 'iCity', icon: 'fa-solid fa-feather-pointed', localPrefixes: ['wanwan_icity_posts_'] },
  { id: 'x', name: 'X', icon: 'fa-brands fa-x-twitter', configPrefixes: ['wanwan_x_'], localPrefixes: ['wanwan_x_'] },
  { id: 'instagram', name: 'Instagram', icon: 'fa-brands fa-instagram', configPrefixes: ['wanwan_ig_', 'ig_reels_'], configKeys: ['igForumSettings'], localPrefixes: ['wanwan_ig_', 'ig_reels_'], localKeys: ['igForumSettings'] },
  { id: 'memory', name: '记忆', icon: 'fa-brands fa-deezer', tables: ['memories', 'memoryRuns'], configPrefixes: ['memory', 'chatLongMemory_'] },
  { id: 'wallet', name: '钱迹', icon: 'fa-brands fa-apple-pay', tables: ['finance'], configPrefixes: ['wechat_wallet_', 'work_state_', 'huabei_state_', 'investment_state_', 'hire_state_', 'char_work_values_'] },
  { id: 'taobao', name: '淘宝', icon: 'fa-solid fa-bag-shopping', configPrefixes: ['taobao_orders_', 'taobao_links_'], configKeys: ['taobao_products'], localPrefixes: ['wanwan_taobao_'] },
  { id: 'bookstore', name: 'Readen', icon: 'fa-solid fa-book-open' },
  { id: 'yumyum', name: 'YumYum', icon: 'fa-solid fa-drumstick-bite', configPrefixes: ['yumyum_orders_'], localPrefixes: ['wanwan_yumyum_'] },
  { id: 'anydoor', name: '任意门', icon: 'fa-solid fa-cubes', tables: ['doorModules', 'doorResults'] },
  { id: 'gamehall', name: '游戏大厅', icon: 'fa-solid fa-dice', configPrefixes: ['gameApi'], localKeys: ['wanwanWerewolfState', 'wanwanWerewolfHistory'] },
  { id: 'terminal', name: '终端', icon: 'fa-solid fa-terminal', tables: ['mcpServers'], configPrefixes: ['mcpApi'], localPrefixes: ['wanwan_mcp_oauth_', 'wanwan_mcp_secret_'] },
  { id: 'iscreens', name: 'iScreens', icon: 'fa-solid fa-wand-magic-sparkles', configKeys: ['desktopIconCustomizations', 'desktopLabelColor', 'desktopWidgets', 'wallpaperData', 'topWidgetText'] },
  { id: 'message', name: '信息', icon: 'fa-solid fa-message', tables: ['smsConversations', 'smsMessages'] }
]

function keyMatchesApp(key, def, type) {
  var exact = def[type + 'Keys'] || []
  var prefixes = def[type + 'Prefixes'] || []
  if (exact.indexOf(key) >= 0) return true
  return prefixes.some(function(prefix) { return key.indexOf(prefix) === 0 })
}

async function getAppDataSizes() {
  var result = {}
  var configRows = await db.config.toArray()
  var localKeys = Object.keys(localStorage)
  for (var i = 0; i < APP_DATA_DEFS.length; i++) {
    var def = APP_DATA_DEFS[i]
    var size = 0
    var tables = def.tables || []
    for (var t = 0; t < tables.length; t++) {
      if (db[tables[t]]) size += valueByteSize(await db[tables[t]].toArray())
    }
    for (var c = 0; c < configRows.length; c++) {
      if (keyMatchesApp(String(configRows[c].key), def, 'config')) size += valueByteSize(configRows[c].value)
    }
    for (var l = 0; l < localKeys.length; l++) {
      if (keyMatchesApp(localKeys[l], def, 'local')) {
        size += new Blob([localKeys[l] + (localStorage.getItem(localKeys[l]) || '')]).size
      }
    }
    result[def.id] = size
  }
  return result
}

function buildAppPickerHTML(appSizes) {
  return APP_DATA_DEFS.map(function(def) {
    var size = appSizes[def.id] || 0
    return '<label class="app-data-choice' + (size ? '' : ' is-empty') + '">' +
      '<input type="checkbox" value="' + def.id + '"' + (size ? '' : ' disabled') + '>' +
      '<span class="app-data-choice-icon"><i class="' + def.icon + '"></i></span>' +
      '<span class="app-data-choice-body"><b>' + def.name + '</b><small>' + (size ? formatBytes(size) : '暂无本地数据') + '</small></span>' +
      '<span class="app-data-check"><i class="fa-solid fa-check"></i></span>' +
    '</label>'
  }).join('')
}

async function showAppDataPicker() {
  var appSizes = await getAppDataSizes()
  var overlay = createOverlay()
  var sheet = createSheet('<div class="sheet-title danger-title">清理 App 数据</div>' +
    '<div class="section-desc">选择要清理的软件。只删除 App 自有数据，不会删除微信联动消息；微信、想见你、角色档案和世界书始终受保护。</div>' +
    '<div class="app-data-picker">' + buildAppPickerHTML(appSizes) + '</div>' +
    '<div class="sheet-actions"><button class="btn-danger btn-pill btn-full" id="btn-confirm-app-delete" disabled>删除所选数据</button>' +
    '<button class="btn-ghost btn-full" id="btn-cancel-app-delete">取消</button></div>')
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(function() { overlay.classList.add('show'); sheet.classList.add('show') })
  var close = function() { closeSheet(overlay, sheet) }
  overlay.addEventListener('click', close)
  sheet.querySelector('#btn-cancel-app-delete').addEventListener('click', close)
  var confirmBtn = sheet.querySelector('#btn-confirm-app-delete')
  sheet.querySelectorAll('input[type="checkbox"]').forEach(function(input) {
    input.addEventListener('change', function() {
      confirmBtn.disabled = !sheet.querySelector('input[type="checkbox"]:checked')
    })
  })
  confirmBtn.addEventListener('click', async function() {
    var ids = Array.from(sheet.querySelectorAll('input[type="checkbox"]:checked')).map(function(input) { return input.value })
    confirmBtn.disabled = true
    confirmBtn.textContent = '正在删除…'
    try {
      await deleteSelectedAppData(ids)
      window.toast('所选 App 数据已删除')
      setTimeout(function() { location.reload() }, 700)
    } catch (e) {
      window.toast('删除失败：' + e.message)
      close()
    }
  })
}

async function deleteSelectedAppData(ids) {
  var selected = APP_DATA_DEFS.filter(function(def) { return ids.indexOf(def.id) >= 0 })
  var configRows = await db.config.toArray()
  for (var i = 0; i < selected.length; i++) {
    var def = selected[i]
    var tables = def.tables || []
    for (var t = 0; t < tables.length; t++) if (db[tables[t]]) await db[tables[t]].clear()
    var configKeys = configRows.filter(function(row) {
      return keyMatchesApp(String(row.key), def, 'config')
    }).map(function(row) { return row.key })
    if (configKeys.length) await db.config.bulkDelete(configKeys)
    Object.keys(localStorage).forEach(function(key) {
      if (keyMatchesApp(key, def, 'local')) localStorage.removeItem(key)
    })
  }
}

// ===== 本地图片压缩 =====
function showCompressConfirm() {
  var overlay = createOverlay()
  var sheet = createSheet('<div class="sheet-title">压缩本地图片</div>' +
    '<div class="section-desc">将扫描全部本地数据，把较大的 PNG、JPEG、WebP 图片压缩为最长边不超过 1920px 的 WebP。只有压缩后更小的图片才会替换，GIF 和 SVG 不处理。</div>' +
    '<div class="export-progress-wrap" id="compress-progress" style="display:none"><div class="export-progress-bar"><div class="export-progress-fill" id="compress-progress-fill"></div></div><div class="export-progress-text" id="compress-progress-text">准备中…</div></div>' +
    '<div class="sheet-actions"><button class="btn-pill btn-full" id="btn-confirm-compress">确认压缩</button><button class="btn-ghost btn-full" id="btn-cancel-compress">取消</button></div>')
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(function() { overlay.classList.add('show'); sheet.classList.add('show') })
  var close = function() { closeSheet(overlay, sheet) }
  overlay.addEventListener('click', close)
  sheet.querySelector('#btn-cancel-compress').addEventListener('click', close)
  sheet.querySelector('#btn-confirm-compress').addEventListener('click', async function() {
    var button = sheet.querySelector('#btn-confirm-compress')
    button.disabled = true
    sheet.querySelector('#btn-cancel-compress').style.display = 'none'
    sheet.querySelector('#compress-progress').style.display = 'block'
    try {
      var stats = await compressAllLocalImages(function(pct, text) {
        sheet.querySelector('#compress-progress-fill').style.width = pct + '%'
        sheet.querySelector('#compress-progress-text').textContent = text
      })
      window.toast(stats.changed ? '图片压缩完成，已释放 ' + formatBytes(stats.saved) : '没有需要压缩的图片')
      setTimeout(function() { location.reload() }, 900)
    } catch (e) {
      window.toast('压缩失败：' + e.message)
      close()
    }
  })
}

function dataUrlToBlob(dataUrl) {
  var parts = dataUrl.split(',')
  var type = ((parts[0] || '').match(/data:([^;]+)/) || [])[1] || 'image/png'
  var binary = atob(parts[1] || '')
  var bytes = new Uint8Array(binary.length)
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: type })
}

function blobToDataUrl(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader()
    reader.onload = function() { resolve(String(reader.result || '')) }
    reader.onerror = function() { reject(reader.error) }
    reader.readAsDataURL(blob)
  })
}

function loadImageFromBlob(blob) {
  return new Promise(function(resolve, reject) {
    var url = URL.createObjectURL(blob)
    var image = new Image()
    image.onload = function() { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = function() { URL.revokeObjectURL(url); reject(new Error('图片读取失败')) }
    image.src = url
  })
}

async function compressImageBlob(blob) {
  if (!(blob instanceof Blob) || blob.size < 100 * 1024 || !/^image\/(png|jpe?g|webp)$/i.test(blob.type || '')) return null
  var image = await loadImageFromBlob(blob)
  var scale = Math.min(1, 1920 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
  var canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  var compressed = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/webp', 0.82) })
  if (!compressed || compressed.size >= blob.size * 0.95) return null
  return compressed
}

async function compressValueImages(value, seen) {
  seen = seen || new WeakSet()
  if (value instanceof Blob) {
    try {
      var compressedBlob = await compressImageBlob(value)
      return compressedBlob ? { value: compressedBlob, changed: 1, saved: value.size - compressedBlob.size } : { value: value, changed: 0, saved: 0 }
    } catch (e) { return { value: value, changed: 0, saved: 0 } }
  }
  if (typeof value === 'string' && /^data:image\/(png|jpe?g|webp);base64,/i.test(value)) {
    try {
      var sourceBlob = dataUrlToBlob(value)
      var nextBlob = await compressImageBlob(sourceBlob)
      if (!nextBlob) return { value: value, changed: 0, saved: 0 }
      return { value: await blobToDataUrl(nextBlob), changed: 1, saved: sourceBlob.size - nextBlob.size }
    } catch (e) { return { value: value, changed: 0, saved: 0 } }
  }
  if (!value || typeof value !== 'object') return { value: value, changed: 0, saved: 0 }
  if (seen.has(value)) return { value: value, changed: 0, saved: 0 }
  seen.add(value)
  var output = Array.isArray(value) ? value.slice() : Object.assign({}, value)
  var keys = Object.keys(value)
  var changed = 0
  var saved = 0
  for (var i = 0; i < keys.length; i++) {
    var result = await compressValueImages(value[keys[i]], seen)
    output[keys[i]] = result.value
    changed += result.changed
    saved += result.saved
  }
  return { value: changed ? output : value, changed: changed, saved: saved }
}

async function compressAllLocalImages(report) {
  var tableNames = db.tables.map(function(table) { return table.name })
  var totalSteps = tableNames.length + 1
  var stats = { changed: 0, saved: 0 }
  for (var i = 0; i < tableNames.length; i++) {
    var table = db[tableNames[i]]
    report(Math.round(i / totalSteps * 100), '正在扫描 ' + tableNames[i] + '…')
    await compressTableImagesInBatches(table, stats)
  }
  report(92, '正在扫描本地缓存…')
  var localKeys = Object.keys(localStorage)
  for (var l = 0; l < localKeys.length; l++) {
    var raw = localStorage.getItem(localKeys[l])
    if (!raw) continue
    var parsed
    var direct = /^data:image\//i.test(raw)
    try { parsed = direct ? raw : JSON.parse(raw) } catch (e) { continue }
    var localResult = await compressValueImages(parsed)
    if (localResult.changed) {
      localStorage.setItem(localKeys[l], direct ? localResult.value : JSON.stringify(localResult.value))
      stats.changed += localResult.changed
      stats.saved += localResult.saved
    }
  }
  report(100, '压缩完成')
  return stats
}

async function compressTableImagesInBatches(table, stats) {
  if (!table) return
  var batchSize = table.name === 'imageBlobs' ? 5 : 50
  var primaryKey = table.schema.primKey.keyPath
  var lastKey = null
  while (true) {
    var collection = lastKey == null
      ? table.orderBy(':id')
      : table.where(':id').above(lastKey)
    var rows = await collection.limit(batchSize).toArray()
    if (!rows.length) break
    for (var i = 0; i < rows.length; i++) {
      var result = await compressValueImages(rows[i])
      if (result.changed) {
        var write = function() { return table.put(result.value) }
        if (window.runWanWanDBIdempotentWrite) await window.runWanWanDBIdempotentWrite(write)
        else await write()
        stats.changed += result.changed
        stats.saved += result.saved
      }
    }
    lastKey = rows[rows.length - 1][primaryKey]
    var done = rows.length < batchSize
    rows = null
    await yieldMain()
    if (done) break
  }
}

// ===== 让出主线程，防止UI冻结 =====
function yieldMain() { return new Promise(function(r) { setTimeout(r, 0) }) }

// ===== 获取各表数量（用于导出预览） =====
// ===== 把字节数格式化为可读大小 =====
function formatBytes(n) {
  n = n || 0
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// 字符串的 UTF-8 字节数（等价于 new Blob([str]).size，但不额外分配 Blob，
// 对消息/朋友圈里内嵌的超长 base64 字符串可省去一次完整拷贝，降低内存峰值）
function utf8ByteLength(str) {
  if (str == null) return 0
  var len = 0
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c < 0x80) len += 1
    else if (c < 0x800) len += 2
    else if (c >= 0xD800 && c <= 0xDBFF) { len += 4; i++ } // 代理对 → 4 字节
    else len += 3
  }
  return len
}

// 单个值的字节大小（Blob 直接取 size，否则按 JSON 序列化长度）
function valueByteSize(v) {
  if (v instanceof Blob) return v.size
  if (v == null) return 0
  try { return utf8ByteLength(JSON.stringify(v)) } catch (e) { return 0 }
}

// 按备份 JSON 中的实际表现形式计算字节数；Blob 会在导出时转成 Base64 marker。
// 这样无需真正读取并编码 Blob，也能计算出紧凑 JSON 的准确大小。
function backupValueByteSize(value, inArray) {
  if (value instanceof Blob) {
    var marker = { __blob__: 1, type: value.type || '', b64: '' }
    return backupValueByteSize(marker) + 4 * Math.ceil(value.size / 3)
  }
  if (Array.isArray(value)) {
    var arraySize = 2
    for (var i = 0; i < value.length; i++) {
      if (i) arraySize++
      var item = value[i]
      arraySize += item === undefined || typeof item === 'function' || typeof item === 'symbol'
        ? 4
        : backupValueByteSize(item, true)
    }
    return arraySize
  }
  if (value && typeof value === 'object') {
    var objectSize = 2
    var keys = Object.keys(value).filter(function(key) {
      var item = value[key]
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol'
    })
    for (var k = 0; k < keys.length; k++) {
      if (k) objectSize++
      objectSize += valueByteSize(keys[k]) + 1 + backupValueByteSize(value[keys[k]])
    }
    return objectSize
  }
  var json = JSON.stringify(value)
  if (json === undefined) return inArray ? 4 : 0
  return utf8ByteLength(json)
}

// config key 归组
function configKeyGroup(key) {
  if (key === 'lorebooks') return 'lorebook'
  if (key.indexOf('offlineMeetSettings_') === 0) return 'missyou'
  if (key === 'igForumSettings' ||
      key.indexOf('wanwan_ig_') === 0 ||
      key.indexOf('wanwan_x_') === 0 ||
      key.indexOf('ig_reels_') === 0) return 'social'
  return 'other'
}

// localStorage key 归组
function localStorageKeyGroup(key) {
  if (key === 'igForumSettings' ||
      key.indexOf('wanwan_ig_') === 0 ||
      key.indexOf('wanwan_x_') === 0 ||
      key.indexOf('ig_reels_') === 0) return 'social'
  return 'other'
}

// 导出 JSON 顶层字段（与 collectBackupData 保持一致），用于估算结构残差
var TOP_LEVEL_BACKUP_KEYS = ['version', 'exportedAt', 'appName', 'config', 'characters',
  'chats', 'messages', 'groupChats', 'groupMessages', 'moments', 'finance', 'offlineChats',
  'stickers', 'stickerCategories', 'memories', 'memoryRuns', 'callRecords',
  'smsConversations', 'smsMessages', 'imageBlobs', 'doorModules', 'doorResults',
  'avgSaves', 'avgConfigs', 'mcpServers', 'mcpToolTraces', 'localStorage']

// 按主键分批遍历一张表，批间让出主线程；峰值内存只保留一批记录，而非整表。
async function eachTableBatch(table, batchSize, fn) {
  if (!table) return
  var batch = batchSize || 200
  var primKey = table.schema.primKey.keyPath // '++id'→'id'，config→'key'，door→'id'
  var lastKey = null
  while (true) {
    var coll = lastKey == null ? table.orderBy(':id') : table.where(':id').above(lastKey)
    var rows = await coll.limit(batch).toArray()
    if (!rows.length) break
    for (var i = 0; i < rows.length; i++) fn(rows[i])
    lastKey = rows[rows.length - 1][primKey]
    var done = rows.length < batch
    rows = null // 尽快释放，供 GC 回收
    if (done) break
    await yieldMain()
  }
}

// 分批累加一张表按备份 JSON 形式的字节大小（含数组 [] 与逗号，与旧版整表计算等价）。
async function sumTableSize(table, batchSize) {
  var total = 0, count = 0
  await eachTableBatch(table, batchSize, function(row) {
    total += backupValueByteSize(row)
    count++
  })
  if (count === 0) return 2                 // 空数组 "[]"
  return 2 + (count - 1) + total            // [] + 元素间逗号 + 各行
}

// 顶层对象/数组的结构性字节（花括号、key 名、逗号、元数据值、config/localStorage 包裹），
// 各表数组自身的 [] 已计入对应分组，这里只补剩余结构，保持六项之和 ≈ 实际导出 JSON 大小。
function backupStructuralOverhead(configCount, lsKeyCount) {
  var bytes = 2                             // 顶层 {}
  for (var i = 0; i < TOP_LEVEL_BACKUP_KEYS.length; i++) {
    bytes += TOP_LEVEL_BACKUP_KEYS[i].length + 3 // "key": （顶层 key 名均为 ASCII）
  }
  bytes += TOP_LEVEL_BACKUP_KEYS.length - 1      // 顶层逗号
  bytes += 1 + 13 + 8                            // version / exportedAt / appName 三个元数据值
  bytes += 2 + Math.max(0, configCount - 1)      // config 数组包裹 []
  bytes += 2 + Math.max(0, lsKeyCount - 1)       // localStorage 对象包裹 {}
  return bytes
}

// ===== 计算各分组占用空间（字节）—— 流式分批、低内存、可让出主线程 =====
async function getDataSizes() {
  var sizes = { wechat: 0, characters: 0, lorebook: 0, missyou: 0, social: 0, other: 0 }

  // 微信数据：聊天 / 群聊 / 朋友圈 / 通话（逐表分批，批间让出主线程）
  var wechatTables = ['chats', 'messages', 'groupChats', 'groupMessages', 'moments', 'callRecords', 'mcpToolTraces']
  for (var i = 0; i < wechatTables.length; i++) {
    sizes.wechat += await sumTableSize(db[wechatTables[i]])
  }

  // 角色档案
  sizes.characters += await sumTableSize(db.characters)

  // 想见你：离线聊天表
  sizes.missyou += await sumTableSize(db.offlineChats)

  // 其他：剩余会被备份的表（imageBlobs 用较小批，避免一次持有过多图片 Blob）
  var otherTables = ['finance', 'memories', 'memoryRuns', 'stickers',
    'stickerCategories', 'smsConversations', 'smsMessages', 'doorModules', 'doorResults',
    'avgSaves', 'avgConfigs', 'mcpServers']
  for (var j = 0; j < otherTables.length; j++) {
    sizes.other += await sumTableSize(db[otherTables[j]])
  }
  sizes.other += await sumTableSize(db.imageBlobs, 50)

  // config：按 key 前缀归组（排除不备份的 key，分批遍历）
  var configCount = 0
  await eachTableBatch(db.config, 200, function(row) {
    if (!isBackupConfigRow(row)) return
    configCount++
    sizes[configKeyGroup(String(row.key))] += backupValueByteSize(row)
  })

  // localStorage：按 key 前缀归组（排除账号/密码），体量小、同步遍历即可。
  var ls = collectLocalStorage()
  var lsKeys = Object.keys(ls)
  for (var k = 0; k < lsKeys.length; k++) {
    sizes[localStorageKeyGroup(lsKeys[k])] += valueByteSize(lsKeys[k]) + 1 + valueByteSize(ls[lsKeys[k]])
  }

  // 顶层结构残差归入“其他”，使六项之和 ≈ 实际导出 JSON 大小。
  sizes.other += backupStructuralOverhead(configCount, lsKeys.length)

  return sizes
}

// ===== 生成完整备份对象（文件导出与同步共用） =====
async function collectBackupData(onProgress, serializeBlobValues) {
  var report = typeof onProgress === 'function' ? onProgress : function() {}
  var data = { version: 1, exportedAt: Date.now(), appName: '弯弯' }

  report(10, '读取配置...')
  data.config = await getBackupConfigRows()
  if (serializeBlobValues) data.config = await serializeBlobs(data.config)
  await yieldMain()

  report(25, '读取角色...')
  data.characters = await db.characters.toArray()
  await yieldMain()

  report(40, '读取聊天...')
  data.chats = await db.chats.toArray()
  data.messages = await db.messages.toArray()
  await yieldMain()

  report(55, '读取群聊...')
  data.groupChats = await db.groupChats.toArray()
  data.groupMessages = await db.groupMessages.toArray()
  await yieldMain()

  report(70, '读取动态...')
  data.moments = await db.moments.toArray()
  data.finance = await db.finance.toArray()
  await yieldMain()

  report(78, '读取缓存...')
  data.offlineChats = await db.offlineChats.toArray()
  data.stickers = await db.stickers.toArray()
  data.stickerCategories = await db.stickerCategories.toArray()
  data.memories = db.memories ? await db.memories.toArray() : []
  data.memoryRuns = db.memoryRuns ? await db.memoryRuns.toArray() : []
  await yieldMain()

  report(82, '读取通话/短信/图片/任意门/游戏存档/MCP...')
  data.callRecords = db.callRecords ? await db.callRecords.toArray() : []
  data.smsConversations = db.smsConversations ? await db.smsConversations.toArray() : []
  data.smsMessages = db.smsMessages ? await db.smsMessages.toArray() : []
  data.imageBlobs = db.imageBlobs ? await db.imageBlobs.toArray() : []
  if (serializeBlobValues) data.imageBlobs = await serializeBlobs(data.imageBlobs)
  data.doorModules = db.doorModules ? await db.doorModules.toArray() : []
  data.doorResults = db.doorResults ? await db.doorResults.toArray() : []
  data.avgSaves = db.avgSaves ? await db.avgSaves.toArray() : []
  data.avgConfigs = db.avgConfigs ? await db.avgConfigs.toArray() : []
  data.mcpServers = db.mcpServers ? await db.mcpServers.toArray() : []
  data.mcpToolTraces = db.mcpToolTraces ? await db.mcpToolTraces.toArray() : []
  await yieldMain()

  report(85, '读取本地存储...')
  data.localStorage = collectLocalStorage()
  await yieldMain()

  return data
}

window.buildBackupData = async function(onProgress) {
  return await collectBackupData(onProgress, true)
}

// ===== 导入完整备份对象（文件导入与同步下载共用） =====
window.importBackupData = async function(data, onProgress, options) {
  validateBackupData(data)
  options = options || {}
  var report = typeof onProgress === 'function' ? onProgress : function() {}
  var savedProtectedStorage = null

  if (options.clearBeforeImport) {
    report(5, '清理本机数据...')
    savedProtectedStorage = collectProtectedLocalStorage()
    await clearAppDataForImport()
    await yieldMain()
  }

  report(10, '导入配置...')
  if (data.config) {
    var configRows = filterBackupConfigRows(deserializeBlobs(data.config))
    if (configRows.length) await db.config.bulkPut(configRows)
  }
  await yieldMain()

  report(25, '导入角色...')
  if (data.characters) await db.characters.bulkPut(data.characters)
  await yieldMain()

  report(45, '导入聊天...')
  if (data.chats) await db.chats.bulkPut(data.chats)
  if (data.messages) await db.messages.bulkPut(data.messages)
  await yieldMain()

  report(60, '导入群聊...')
  if (data.groupChats) await db.groupChats.bulkPut(data.groupChats)
  if (data.groupMessages) await db.groupMessages.bulkPut(data.groupMessages)
  await yieldMain()

  report(75, '导入动态...')
  if (data.moments) await db.moments.bulkPut(data.moments)
  if (data.finance) await db.finance.bulkPut(data.finance)
  await yieldMain()

  report(82, '导入缓存...')
  if (data.offlineChats) await db.offlineChats.bulkPut(data.offlineChats)
  if (data.stickers) await db.stickers.bulkPut(data.stickers)
  if (data.stickerCategories) await db.stickerCategories.bulkPut(data.stickerCategories)
  if (data.memories && db.memories) {
    var normalizedMemories = data.memories.map(function(memory) {
      var row = Object.assign({}, memory)
      var sourceAt = Number(row.sourceAt)
      var createdAt = Number(row.createdAt)
      if (!Number.isFinite(sourceAt) || sourceAt <= 0 ||
          (Number.isFinite(createdAt) && createdAt > 0 && sourceAt === createdAt)) row.sourceAt = null
      return row
    })
    await db.memories.bulkPut(normalizedMemories)
  }
  if (data.memoryRuns && db.memoryRuns) await db.memoryRuns.bulkPut(data.memoryRuns)
  await yieldMain()

  report(86, '导入通话/短信/图片/任意门/游戏存档/MCP...')
  if (data.callRecords && db.callRecords) await db.callRecords.bulkPut(data.callRecords)
  if (data.smsConversations && db.smsConversations) await db.smsConversations.bulkPut(data.smsConversations)
  if (data.smsMessages && db.smsMessages) await db.smsMessages.bulkPut(data.smsMessages)
  if (data.imageBlobs && db.imageBlobs) await db.imageBlobs.bulkPut(deserializeBlobs(data.imageBlobs))
  if (Array.isArray(data.doorModules) && db.doorModules) await db.doorModules.bulkPut(data.doorModules)
  if (Array.isArray(data.doorResults) && db.doorResults) await db.doorResults.bulkPut(data.doorResults)
  if (Array.isArray(data.avgSaves) && db.avgSaves) await db.avgSaves.bulkPut(data.avgSaves)
  if (Array.isArray(data.avgConfigs) && db.avgConfigs) await db.avgConfigs.bulkPut(data.avgConfigs)
  if (Array.isArray(data.mcpServers) && db.mcpServers) await db.mcpServers.bulkPut(data.mcpServers)
  if (Array.isArray(data.mcpToolTraces) && db.mcpToolTraces) await db.mcpToolTraces.bulkPut(data.mcpToolTraces)
  await yieldMain()

  report(90, '恢复本地存储...')
  if (data.localStorage) {
    var entries = Object.entries(data.localStorage)
    for (var i = 0; i < entries.length; i++) {
      if (isProtectedLocalStorageKey(entries[i][0])) continue
      localStorage.setItem(entries[i][0], entries[i][1])
    }
  }
  if (savedProtectedStorage) restoreProtectedLocalStorage(savedProtectedStorage)

  report(100, '导入完成！')
}

// ===== 同步下载覆盖前清理应用数据 =====
async function clearAppDataForImport() {
  var tables = ['config', 'characters', 'chats', 'messages',
    'groupChats', 'groupMessages', 'moments', 'finance', 'offlineChats',
    'stickers', 'stickerCategories', 'memories', 'memoryRuns',
    'callRecords', 'smsConversations', 'smsMessages', 'imageBlobs',
    'doorModules', 'doorResults', 'avgSaves', 'avgConfigs', 'mcpServers', 'mcpToolTraces']
  await Promise.all(tables.map(function(t) { return db[t] ? db[t].clear() : Promise.resolve() }))
  localStorage.clear()
}

// ===== 校验备份格式 =====
function validateBackupData(data) {
  if (!data || data.version !== 1 || data.appName !== '弯弯') {
    throw new Error('不支持的备份格式')
  }
}

// ===== 创建遮罩层 =====
function createOverlay() {
  var el = document.createElement('div')
  el.className = 'sheet-overlay'
  el.style.zIndex = '200'
  return el
}

// ===== 创建居中弹窗 =====
function createSheet(innerHtml) {
  var el = document.createElement('div')
  el.className = 'center-modal'
  el.style.zIndex = '201'
  el.innerHTML = innerHtml
  return el
}

var STREAM_EXPORT_FALLBACK_LIMIT = 100 * 1024 * 1024
var STREAM_EXPORT_TABLES = ['config', 'characters', 'chats', 'messages', 'groupChats',
  'groupMessages', 'moments', 'finance', 'offlineChats', 'stickers', 'stickerCategories',
  'memories', 'memoryRuns', 'callRecords', 'smsConversations', 'smsMessages', 'imageBlobs',
  'doorModules', 'doorResults', 'avgSaves', 'avgConfigs', 'mcpServers', 'mcpToolTraces']

function bytesToBase64(bytes) {
  var out = '', step = 0x6000
  for (var i = 0; i < bytes.length; i += step) {
    var slice = bytes.subarray(i, Math.min(i + step, bytes.length))
    out += String.fromCharCode.apply(null, slice)
  }
  return btoa(out)
}

async function* streamBlobBase64(blob, signal) {
  var reader = blob.stream().getReader(), carry = new Uint8Array(0)
  try {
    while (true) {
      if (signal && signal.aborted) throw new DOMException('导出已取消', 'AbortError')
      var result = await reader.read()
      if (result.done) break
      var input = result.value
      if (carry.length) {
        var joined = new Uint8Array(carry.length + input.length)
        joined.set(carry); joined.set(input, carry.length); input = joined
      }
      var complete = input.length - (input.length % 3)
      if (complete) yield bytesToBase64(input.subarray(0, complete))
      carry = input.slice(complete)
    }
    if (carry.length) yield bytesToBase64(carry)
  } finally { reader.releaseLock() }
}

async function* streamJsonString(value, signal) {
  value = String(value)
  yield '"'
  var start = 0, chunkChars = 64 * 1024
  while (start < value.length) {
    if (signal && signal.aborted) throw new DOMException('导出已取消', 'AbortError')
    var end = Math.min(start + chunkChars, value.length)
    // Do not split a valid UTF-16 surrogate pair between chunks.
    if (end < value.length) {
      var last = value.charCodeAt(end - 1)
      if (last >= 0xD800 && last <= 0xDBFF) end--
    }
    var encoded = JSON.stringify(value.slice(start, end))
    yield encoded.slice(1, -1)
    start = end
  }
  yield '"'
}

async function* streamJsonValue(value, signal) {
  if (value instanceof Blob) {
    yield '{"__blob__":1,"type":' + JSON.stringify(value.type || '') + ',"b64":"'
    for await (var b64 of streamBlobBase64(value, signal)) yield b64
    yield '"}'
    return
  }
  if (Array.isArray(value)) {
    yield '['
    for (var i = 0; i < value.length; i++) {
      if (i) yield ','
      yield* streamJsonValue(value[i], signal)
    }
    yield ']'
    return
  }
  if (value && typeof value === 'object') {
    yield '{'
    var keys = Object.keys(value).filter(function(key) {
      var item = value[key]
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol'
    })
    for (var k = 0; k < keys.length; k++) {
      if (k) yield ','
      yield JSON.stringify(keys[k]) + ':'
      yield* streamJsonValue(value[keys[k]], signal)
    }
    yield '}'
    return
  }
  if (typeof value === 'string') {
    yield* streamJsonString(value, signal)
    return
  }
  var json = JSON.stringify(value)
  yield json === undefined ? 'null' : json
}

async function* streamTableJson(tableName, signal, report, progress, options) {
  yield '['
  var table = db[tableName], first = true
  if (table) {
    var primKey = table.schema.primKey.keyPath, lastKey = null
    while (true) {
      if (signal.aborted) throw new DOMException('导出已取消', 'AbortError')
      var coll = lastKey == null ? table.orderBy(':id') : table.where(':id').above(lastKey)
      var rows = await coll.limit(tableName === 'imageBlobs' ? 1 : 200).toArray()
      if (!rows.length) break
      for (var i = 0; i < rows.length; i++) {
        if (tableName === 'config' && !isBackupConfigRow(rows[i])) continue
        if (tableName === 'config' && options.excludeSyncConfig && rows[i] && /^sync/.test(String(rows[i].key))) continue
        if (!first) yield ','
        first = false
        yield* streamJsonValue(rows[i], signal)
        progress.rows++
      }
      lastKey = rows[rows.length - 1][primKey]
      report(progress.rows, tableName)
      if (rows.length < (tableName === 'imageBlobs' ? 1 : 200)) break
      await yieldMain()
    }
  }
  yield ']'
}

async function* createBackupJsonStream(signal, onProgress, options) {
  options = options || {}
  var progress = { rows: 0 }, report = onProgress || function() {}
  var exportedAt = Number(options.exportedAt) || Date.now()
  yield '{"version":1,"exportedAt":' + exportedAt + ',"appName":"弯弯"'
  for (var i = 0; i < STREAM_EXPORT_TABLES.length; i++) {
    var name = STREAM_EXPORT_TABLES[i]
    yield ',' + JSON.stringify(name) + ':'
    yield* streamTableJson(name, signal, report, progress, options)
  }
  yield ',"localStorage":'
  yield* streamJsonValue(collectLocalStorage(), signal)
  yield '}'
}

// Shared by local file export and remote sync. Consumers pull JSON fragments on
// demand, so IndexedDB is still read in batches instead of materialising a full
// backup object in memory.
window.WanWanBackupStreams = window.WanWanBackupStreams || {}
window.WanWanBackupStreams.createJsonStream = function(options) {
  options = options || {}
  var signal = options.signal || new AbortController().signal
  return createBackupJsonStream(signal, options.onProgress, {
    exportedAt: options.exportedAt,
    excludeSyncConfig: !!options.excludeSyncConfig
  })
}

// ===== 下载JSON文件 =====
function downloadJSON(data, filename) {
  var blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  var a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  var url = a.href
  setTimeout(function() { URL.revokeObjectURL(url) }, 60000)
}

// ===== 关闭Sheet弹窗 =====
function closeSheet(overlay, sheet) {
  overlay.classList.remove('show')
  sheet.classList.remove('show')
  setTimeout(function() { overlay.remove(); sheet.remove() }, 200)
}

// Keep Safari standalone's native save sheet from resizing the app underneath
// the export modal. This deliberately has no visibility/page lifecycle hooks.
function lockExportViewport(app) {
  var previousHeight = app.style.height
  var previousMinHeight = app.style.minHeight
  var height = Math.round(app.getBoundingClientRect().height)
  app.style.height = height + 'px'
  app.style.minHeight = height + 'px'
  var locked = true
  return function() {
    if (!locked) return
    locked = false
    app.style.height = previousHeight
    app.style.minHeight = previousMinHeight
  }
}

// ===== 导出确认弹窗 =====
async function showExportConfirm() {
  var sizes = await getSettingsSessionDataSizes(document.getElementById('settings-page'))
  var overlay = createOverlay()
  overlay.classList.add('export-overlay')
  var sheet = createSheet(buildExportSheetHTML())
  sheet.classList.add('export-modal')
  sheet.dataset.exportBytes = String(getTotalDataSize(sizes))
  var app = document.getElementById('app')
  var unlockViewport = lockExportViewport(app)
  app.appendChild(overlay)
  app.appendChild(sheet)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
  var close = function() {
    if (sheet.dataset.exporting === '1') return
    unlockViewport()
    closeSheet(overlay, sheet)
  }
  overlay.addEventListener('click', close)
  sheet.querySelector('#btn-cancel-export').onclick = close
  sheet.querySelector('#btn-confirm-export').onclick = function() {
    onConfirmExport(sheet, close)
  }
}

// ===== 导出弹窗HTML =====
function buildExportSheetHTML() {
  return '<div class="sheet-title">导出数据</div>' +
    '<div class="export-progress-wrap" id="export-progress-wrap">' +
      '<div class="export-progress-bar"><div class="export-progress-fill" id="export-progress-fill"></div></div>' +
      '<div class="export-progress-text" id="export-progress-text">准备导出</div>' +
    '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-pill btn-full" id="btn-confirm-export">保存文件</button>' +
      '<button class="btn-ghost btn-full" id="btn-cancel-export">完成</button>' +
    '</div>'
}

// ===== 点击确认导出 =====
function onConfirmExport(sheet, onDone) {
  if (sheet.dataset.exporting === '1') return
  sheet.dataset.exporting = '1'
  var confirm = sheet.querySelector('#btn-confirm-export')
  var done = sheet.querySelector('#btn-cancel-export')
  confirm.disabled = true
  done.disabled = true
  setExportProgress(sheet, 0, '正在准备文件…')
  startExport(sheet, onDone)
}

// ===== 更新导出进度UI =====
function setExportProgress(sheet, pct, text) {
  var fill = sheet.querySelector('#export-progress-fill')
  var label = sheet.querySelector('#export-progress-text')
  if (fill) fill.style.width = pct + '%'
  if (label) label.textContent = text
}

function showExportSuccess(sheet, onDone, cancel) {
  setExportProgress(sheet, 100, '导出成功！')
  window.toast('数据已导出')
  var confirm = sheet.querySelector('#btn-confirm-export')
  confirm.disabled = false
  confirm.textContent = '保存文件'
  sheet.dataset.exporting = '0'
  cancel.disabled = false
  cancel.textContent = '完成'
  cancel.onclick = onDone
}

// ===== 导出主逻辑（分步读取+进度） =====
async function startExport(sheet, onDone) {
  var aborter = new AbortController()
  var cancel = sheet.querySelector('#btn-cancel-export')
  try {
    var dateStr = new Date().toISOString().slice(0, 10)
    var filename = 'wanwan-backup-' + dateStr + '.json'
    var estimatedBytes = Number(sheet.dataset.exportBytes || 0)

    // Small backups are faster and more reliable as a regular Blob download;
    // reserve the Service Worker path for files that need bounded memory.
    if (estimatedBytes < STREAM_EXPORT_FALLBACK_LIMIT) {
      var data = await window.buildBackupData(function(pct, text) {
        setExportProgress(sheet, pct, text)
      })
      if (aborter.signal.aborted) throw new DOMException('导出已取消', 'AbortError')
      setExportProgress(sheet, 96, '正在生成文件…')
      downloadJSON(data, filename)
      showExportSuccess(sheet, onDone, cancel)
      return
    }

    if (!window.WanWanExportStream || !window.WanWanExportStream.download) {
      throw new Error('大文件导出组件未加载，请刷新页面后重试')
    }
    var currentTable = '准备数据'
    var generator = createBackupJsonStream(aborter.signal, function(done, table) {
      currentTable = table
    })
    await window.WanWanExportStream.download({
      source: generator,
      filename: filename,
      signal: aborter.signal,
      cancelSource: function() { aborter.abort() },
      onProgress: function(encodedBytes) {
        var pct = estimatedBytes ? Math.min(98, encodedBytes / estimatedBytes * 100) : 0
        setExportProgress(sheet, pct, '正在导出 ' + currentTable + '（' + formatBytes(encodedBytes) + '）')
      }
    })
    showExportSuccess(sheet, onDone, cancel)
  } catch (e) {
    window.toast((e && e.name === 'AbortError' ? '导出已取消' : '导出失败：' + e.message))
    sheet.dataset.exporting = '0'
    onDone()
  }
}

// ===== 收集localStorage（跳过超大值） =====
function collectLocalStorage() {
  var result = {}
  var keys = Object.keys(localStorage)
  for (var i = 0; i < keys.length; i++) {
    if (isProtectedLocalStorageKey(keys[i])) continue
    var v = localStorage.getItem(keys[i])
    if (v != null) result[keys[i]] = v
  }
  return result
}

function collectProtectedLocalStorage() {
  var result = collectSelectedLocalStorage(PROTECTED_LOCAL_STORAGE_KEYS)
  Object.keys(localStorage).forEach(function(key) {
    if (isProtectedLocalStorageKey(key)) result[key] = localStorage.getItem(key)
  })
  return result
}

function collectSelectedLocalStorage(selectedKeys) {
  var result = {}
  for (var i = 0; i < selectedKeys.length; i++) {
    var key = selectedKeys[i]
    var value = localStorage.getItem(key)
    if (value !== null) result[key] = value
  }
  return result
}

function restoreProtectedLocalStorage(values) {
  restoreSelectedLocalStorage(PROTECTED_LOCAL_STORAGE_KEYS, values)
  Object.keys(values || {}).forEach(function(key) {
    if (isProtectedLocalStorageKey(key)) localStorage.setItem(key, values[key])
  })
}

function restoreSelectedLocalStorage(selectedKeys, values) {
  for (var i = 0; i < selectedKeys.length; i++) {
    var key = selectedKeys[i]
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      localStorage.setItem(key, values[key])
    } else {
      localStorage.removeItem(key)
    }
  }
}

// ===== 导入数据入口 =====
async function startImport(file) {
  if (!window.runWanWanStreamImport) { window.toast('流式导入组件未加载，请刷新后重试'); return }
  var overlay = createOverlay(), sheet = createSheet(buildImportSheetHTML())
  document.getElementById('app').appendChild(overlay); document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(function() {
    overlay.classList.add('show'); sheet.classList.add('show')
  })
  try {
    await window.runWanWanStreamImport(file, function(pct, text) { setImportProgress(sheet, pct, text) })
    window.toast('导入成功，即将刷新...')
    setTimeout(function() { location.reload() }, 1800)
  } catch (error) {
    window.toast('导入失败：' + error.message)
    closeSheet(overlay, sheet)
  }
}

// ===== 导入进度弹窗HTML =====
function buildImportSheetHTML() {
  return '<div class="sheet-title">导入数据</div>' +
    '<div class="section-desc">导入会覆盖同ID的现有数据，其他数据保留。</div>' +
    '<div class="export-progress-wrap">' +
      '<div class="export-progress-bar"><div class="export-progress-fill" id="import-progress-fill"></div></div>' +
      '<div class="export-progress-text" id="import-progress-text">准备中...</div>' +
    '</div>'
}

// ===== 更新导入进度UI =====
function setImportProgress(sheet, pct, text) {
  var fill = sheet.querySelector('#import-progress-fill')
  var label = sheet.querySelector('#import-progress-text')
  if (fill) fill.style.width = pct + '%'
  if (label) label.textContent = text
}

// ===== 清空数据确认弹窗 =====
function showClearConfirm() {
  var overlay = createOverlay()
  var sheet = createSheet(buildClearSheetHTML())
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
  var close = function() { closeSheet(overlay, sheet) }
  overlay.addEventListener('click', close)
  sheet.querySelector('#btn-cancel-clear').addEventListener('click', close)
  bindClearConfirmInput(sheet)
  sheet.querySelector('#btn-confirm-clear').addEventListener('click', async function() {
    await clearAllData()
    location.reload()
  })
}

// ===== 清空弹窗HTML =====
function buildClearSheetHTML() {
  return '<div class="sheet-title danger-title">清空所有数据</div>' +
    '<div class="section-desc" style="color:var(--c-red)">' +
      '此操作不可撤销！将删除所有角色、聊天记录、朋友圈等全部数据。' +
    '</div>' +
    '<div class="clear-confirm-wrap">' +
      '<div class="row-label" style="margin-bottom:8px">输入"确认清空"后按确认</div>' +
      '<input class="input-field" id="clear-confirm-input" placeholder="确认清空">' +
    '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-danger btn-pill btn-full" id="btn-confirm-clear" disabled>确认清空</button>' +
      '<button class="btn-ghost btn-full" id="btn-cancel-clear">取消</button>' +
    '</div>'
}

// ===== 输入关键词才激活清空按钮 =====
function bindClearConfirmInput(sheet) {
  sheet.querySelector('#clear-confirm-input').addEventListener('input', function(e) {
    sheet.querySelector('#btn-confirm-clear').disabled = e.target.value !== '确认清空'
  })
}

// ===== 清空所有数据 =====
async function clearAllData() {
  var tables = ['config', 'characters', 'chats', 'messages',
    'groupChats', 'groupMessages', 'moments', 'finance', 'offlineChats',
    'stickers', 'stickerCategories', 'memories', 'memoryRuns',
    'callRecords', 'smsConversations', 'smsMessages', 'imageBlobs',
    'doorModules', 'doorResults', 'avgSaves', 'avgConfigs', 'mcpServers', 'mcpToolTraces']
  await Promise.all(tables.map(function(t) { return db[t] ? db[t].clear() : Promise.resolve() }))
  localStorage.clear()
}
