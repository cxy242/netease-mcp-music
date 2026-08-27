(function() {
  'use strict'

  var state = {
    tab: 'home',
    channel: 'all',
    view: 'home',
    selectedBookId: null,
    detailTab: 'info',
    chapterIndex: 0,
    readerPageIndex: 0,
    readerMenuOpen: false,
    readerTocOpen: false,
    readerTheme: 'paper',
    shelf: {},
    goalPanelOpen: false,
    statisticsRange: 'month',
    statisticsDate: new Date(),
    shelfQuery: '',
    chapterDraft: null
  }

  var READING_STORAGE_KEY = 'wanwan-bookstore-reading'
  var IMPORTED_BOOKS_STORAGE_KEY = 'wanwan-bookstore-imported'
  var WRITING_STYLES_STORAGE_KEY = 'wanwan-bookstore-writing-styles'
  var PAGINATION_WINDOW = 2
  var DEFAULT_RAW_CONTEXT_LIMIT = 12000
  var DEFAULT_SUMMARY_LIMIT = 3500
  var paginationJobs = {}
  var readingTimer = null
  var readingData = loadReadingData()
  var writingStyles = loadWritingStyles()
  var DEFAULT_WRITING_STYLE = {
    id: 'classic-plain-line',
    title: '经典白描',
    description: '{{// (plain-line realism, warmth through restraint)}}\n\n**Premise:** A gentle, unjudging observer\'s voice, the way an elder recalls home. Feeling lives beneath action and detail — it is never announced.\n\n**Reference Lineage:** Wang Zengqi, Shen Congwen, and Xiao Hong for narrative tradition; Fei Ming, Sun Li, and A Cheng for linguistic texture; classical Chinese biji (notebook) literature and folk oral tradition as root source.\n\n**Sensory Field:** Food being prepared, a knife on a cutting board, sun-warmed stone — the textures of ordinary, lived-in life.\n\n**Sentence Mechanics:** Long and flowing for description; short and springy for dialogue and action. Mirrors the rhythm of unhurried recollection.\n\n**Subtext Rules:** Lines are short and natural. Emotion shows in a glance or an unfinished sentence, never stated outright.\n\n**Relationship Logic:** Affection is practical — cooking for someone, brushing dust off a shoulder, waiting without complaint\n\n**Craft Moves:**\n- Choose the single most ordinary, vivid verb or noun rather than reaching for adjectives.\n- Anchor every emotional beat in one concrete sensory detail.\n- Close a passage on an image or a small action, not a statement of feeling.\n\n**Avoid:** Adjective-heavy prose; characters explaining their feelings; melodrama.\n\n**Compass Line:** Clear water simmering plain ingredients — a kind voice making an ordinary world touchable.'
  }

  function localDateKey() {
    var now = new Date()
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  }

  function defaultReadingData() {
    return {
      totalSeconds: 0,
      todaySeconds: 0,
      todayDate: localDateKey(),
      readBooks: {},
      lastBookId: null,
      lastChapterIndex: 0,
      goalMinutes: 10,
      goalView: 'arc',
      dailySeconds: {},
      bookSeconds: {}
    }
  }

  function loadReadingData() {
    var fallback = defaultReadingData()
    try {
      var saved = JSON.parse(localStorage.getItem(READING_STORAGE_KEY) || 'null')
      if (!saved || typeof saved !== 'object') return fallback
      fallback.totalSeconds = Math.max(0, Number(saved.totalSeconds) || 0)
      fallback.todaySeconds = Math.max(0, Number(saved.todaySeconds) || 0)
      fallback.todayDate = String(saved.todayDate || fallback.todayDate)
      fallback.readBooks = saved.readBooks && typeof saved.readBooks === 'object' ? saved.readBooks : {}
      fallback.lastBookId = saved.lastBookId || null
      fallback.lastChapterIndex = Math.max(0, parseInt(saved.lastChapterIndex, 10) || 0)
      var savedGoal = Math.round(Number(saved.goalMinutes))
      fallback.goalMinutes = savedGoal >= 1 && savedGoal <= 1440 ? savedGoal : 10
      fallback.goalView = saved.goalView === 'compact' ? 'compact' : 'arc'
      fallback.dailySeconds = saved.dailySeconds && typeof saved.dailySeconds === 'object' ? saved.dailySeconds : {}
      fallback.bookSeconds = saved.bookSeconds && typeof saved.bookSeconds === 'object' ? saved.bookSeconds : {}
      if (fallback.todaySeconds > 0 && !fallback.dailySeconds[fallback.todayDate]) fallback.dailySeconds[fallback.todayDate] = fallback.todaySeconds
    } catch (error) {}
    resetTodayIfNeeded(fallback)
    return fallback
  }

  function resetTodayIfNeeded(data) {
    var today = localDateKey()
    if (data.todayDate !== today) {
      data.todayDate = today
      data.todaySeconds = 0
    }
    return data
  }

  function saveReadingData() {
    resetTodayIfNeeded(readingData)
    try { localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(readingData)) } catch (error) {}
  }

  function formatClock(seconds) {
    var safeSeconds = Math.floor(Math.max(0, Number(seconds) || 0))
    return Math.floor(safeSeconds / 60) + ':' + String(safeSeconds % 60).padStart(2, '0')
  }

  function formatFileSize(bytes) {
    var size = Math.max(0, Number(bytes) || 0)
    if (size < 1024) return Math.round(size) + ' B'
    if (size < 1024 * 1024) return trimDecimal(size / 1024) + ' KB'
    return trimDecimal(size / (1024 * 1024)) + ' MB'
  }

  function trimDecimal(value) {
    return Number(value).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  }

  function formatWordCount(book) {
    var count = Math.max(0, parseFloat(String(book && book.words || '').replace(/,/g, '')) || 0)
    if (count >= 1000000) return trimDecimal(count / 1000000) + ' M'
    if (count >= 1000) return trimDecimal(count / 1000) + ' K'
    return String(Math.round(count))
  }

  function readingHours() {
    return (readingData.totalSeconds / 3600).toFixed(1)
  }

  function readBookCount() {
    return BOOKS.filter(function(book) { return readingData.readBooks[book.id] }).length
  }

  function markReadingPosition(bookId, chapterIndex) {
    readingData.lastBookId = bookId
    readingData.lastChapterIndex = Math.max(0, Number(chapterIndex) || 0)
    readingData.readBooks[bookId] = true
    saveReadingData()
  }

  function ensureReadingTimer() {
    if (readingTimer) return
    readingTimer = window.setInterval(function() {
      resetTodayIfNeeded(readingData)
      var page = document.getElementById('bookstore-page')
      if (!page || state.view !== 'reader' || document.visibilityState !== 'visible') return
      readingData.totalSeconds += 1
      readingData.todaySeconds += 1
      var today = localDateKey()
      readingData.dailySeconds[today] = (Number(readingData.dailySeconds[today]) || 0) + 1
      if (state.selectedBookId) readingData.bookSeconds[state.selectedBookId] = (Number(readingData.bookSeconds[state.selectedBookId]) || 0) + 1
      if (readingData.totalSeconds % 5 === 0) saveReadingData()
    }, 1000)
  }

  var BOOKS = loadImportedBooks()
  var BOOK_COVER_SVG = '<svg viewBox="0 0 1025 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M854.350417 64.442431H170.870083a48.820024 48.820024 0 0 0-48.820023 48.820024v796.010489a48.820024 48.820024 0 0 0 48.820023 48.820024h683.480334a48.820024 48.820024 0 0 0 48.820024-48.820024V113.262455a48.820024 48.820024 0 0 0-48.820024-48.820024zM411.308701 427.175209l-101.78975-72.009536-100.569249 72.009536V67.371633h202.358999z"></path></svg>'
  var READER_TOC_SVG = '<svg class="bookstore-reader-tool-svg" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M793.1 959.9H232.9C158.5 959.9 98 899.4 98 825V201.5c0-74.4 60.5-134.9 134.9-134.9H793c74.4 0 134.9 60.5 134.9 134.9V825c0.1 74.4-60.4 134.9-134.8 134.9z m-560.2-804c-25.1 0-45.6 20.5-45.6 45.6V825c0 25.1 20.5 45.6 45.6 45.6H793c25.1 0 45.6-20.5 45.6-45.6V201.5c0-25.1-20.5-45.6-45.6-45.6H232.9z"></path><path d="M707.9 365.7H322.1c-24.7 0-44.7-20-44.7-44.7 0-24.7 20-44.7 44.7-44.7h385.7c24.7 0 44.7 20 44.7 44.7 0 24.7-20 44.7-44.6 44.7zM707.9 557.1H322.1c-24.7 0-44.7-20-44.7-44.7s20-44.7 44.7-44.7h385.7c24.7 0 44.7 20 44.7 44.7s-20 44.7-44.6 44.7zM573.3 748.5H322.1c-24.7 0-44.7-20-44.7-44.7 0-24.7 20-44.7 44.7-44.7h251.2c24.7 0 44.7 20 44.7 44.7 0 24.7-20 44.7-44.7 44.7z"></path></svg>'
  var READER_NOTES_SVG = '<svg class="bookstore-reader-tool-svg" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M166.9 831.4c-11.8 0-23.2-4.7-31.6-13.1-9.7-9.7-14.4-23.3-12.8-37 19.3-159.8 92.6-310.6 206.5-424.4l258-258c46.7-46.7 122.7-46.7 169.5 0l98.3 98.3c46.7 46.7 46.7 122.7 0 169.5l-258 258c-114 113.8-264.7 187.1-424.6 206.4-1.8 0.2-3.6 0.3-5.3 0.3z m504.7-678.1c-7.8 0-15.6 3-21.5 8.9l-258 258C306.8 505.5 247.4 614.6 221.5 732 339 706.1 448 646.7 533.4 561.4l258-258c11.8-11.8 11.8-31.1 0-43l-98.3-98.3c-5.9-5.8-13.7-8.8-21.5-8.8zM823 335h0.2-0.2z"></path><path d="M689.1 501.5c-11.5 0-23-4.4-31.7-13.2-1.9-1.9-3.5-3.9-5-6-10.4-11.4-57.7-58-99.9-99-17.7-17.2-18.2-45.5-1-63.3 17.2-17.7 45.5-18.2 63.3-1 119 115.4 119 115.4 119.1 137.3 0.1 12-4.7 23.6-13.2 32.1-8.8 8.7-20.2 13.1-31.6 13.1zM857.7 958.5H166.9c-24.7 0-44.7-20-44.7-44.7 0-24.7 20-44.7 44.7-44.7h690.8c24.7 0 44.7 20 44.7 44.7 0 24.6-20 44.7-44.7 44.7z"></path></svg>'
  var READER_NIGHT_SVG = '<svg class="bookstore-reader-tool-svg" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M620.7 830.9H407.9c-47 0-85.1-38.2-85.1-85.1v-72c0-10.8-5.6-21.6-15.4-29.6-87.7-71.7-131.6-181.8-117.5-294.7C208.2 202 328.9 82.8 476.7 66.3c93.1-10.4 186.3 19.1 255.6 81.1 69.4 62 109.1 150.9 109.1 243.9 0 99.8-44.9 192.9-123.3 255.4-7.7 6.1-12.3 16.6-12.3 28v71.1c0.1 46.9-38.1 85.1-85.1 85.1z m-208.4-89.5h204v-66.7c0-39 16.7-74.7 45.9-98 56.9-45.4 89.6-113 89.6-185.4 0-67.5-28.9-132.1-79.3-177.1-51.1-45.7-117.2-66.6-185.9-58.8-107.2 12-194.6 98.4-208 205.3-10.2 82.1 21.7 162.2 85.4 214.3 30.7 25.1 48.2 61.1 48.2 98.9v67.5z"></path><path d="M549.1 959.6h-69.6c-49.9 0-90.6-40.6-90.6-90.6v-82.9c0-24.7 20-44.8 44.8-44.8h161.2c24.7 0 44.8 20 44.8 44.8V869c0 49.9-40.7 90.6-90.6 90.6z m-70.6-128.7V869l70.6 1 0.5-39.1h-71.1zM383.4 450.2c-21.2 0-40.1-15.2-44-36.8-6.3-34.6 1.1-105.9 68.6-153.4 20.2-14.3 48.1-9.4 62.4 10.8 14.3 20.2 9.4 48.1-10.8 62.4-37.7 26.5-32.1 63.9-32 64.2 4.4 24.3-11.7 47.6-36 52-2.9 0.5-5.6 0.8-8.2 0.8z"></path></svg>'
  var READER_DAY_SVG = '<svg class="bookstore-reader-tool-svg" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M514.2 707.9c-136.9 0-248.4-111.4-248.4-248.4s111.4-248.4 248.4-248.4 248.4 111.4 248.4 248.4c-0.1 137-111.5 248.4-248.4 248.4z m0-407.1c-87.5 0-158.7 71.2-158.7 158.7s71.2 158.7 158.7 158.7S672.9 547 672.9 459.5s-71.2-158.7-158.7-158.7zM654.5 834.8H375.8c-24.8 0-44.8-20.1-44.8-44.8 0-24.8 20.1-44.8 44.8-44.8h278.8c24.8 0 44.8 20.1 44.8 44.8 0 24.8-20.1 44.8-44.9 44.8zM593.8 959.6H436.4c-24.8 0-44.8-20.1-44.8-44.8 0-24.8 20.1-44.8 44.8-44.8h157.4c24.8 0 44.8 20.1 44.8 44.8 0.1 24.7-20 44.8-44.8 44.8zM513.2 184.3c-24.8 0-44.8-20.1-44.8-44.8v-31.7c0-24.8 20.1-44.8 44.8-44.8 24.8-0.1 44.8 20 44.8 44.8v31.7c0 24.7-20 44.8-44.8 44.8zM287.1 278.7c-11.5 0-22.9-4.4-31.7-13.1L233 243.2c-17.5-17.5-17.5-45.9 0-63.4s45.9-17.5 63.4 0l22.4 22.4c17.5 17.5 17.5 45.9 0 63.4-8.7 8.7-20.2 13.1-31.7 13.1zM194.1 505.3h-31.7c-24.8 0-44.8-20.1-44.8-44.8 0-24.8 20.1-44.8 44.8-44.8h31.7c24.8 0 44.8 20.1 44.8 44.8 0 24.8-20.1 44.8-44.8 44.8zM865.9 503.4h-31.7c-24.8 0-44.8-20.1-44.8-44.8 0-24.8 20.1-44.8 44.8-44.8h31.7c24.8 0 44.8 20.1 44.8 44.8 0 24.7-20 44.8-44.8 44.8zM739.8 277.3c-11.5 0-22.9-4.4-31.7-13.1-17.5-17.5-17.5-45.9 0-63.4l22.4-22.4c17.5-17.5 45.9-17.5 63.4 0s17.5 45.9 0 63.4l-22.4 22.4c-8.7 8.8-20.2 13.1-31.7 13.1z"></path></svg>'
  var READER_SETTINGS_SVG = '<svg class="bookstore-reader-tool-svg" viewBox="0 0 1024 1024" aria-hidden="true"><path d="M668.6 922.2H357.4c-48.1 0-92.9-26-116.7-67.8L84.2 579.7c-23.4-41-23.4-92 0-133L240.8 172c23.8-41.8 68.5-67.8 116.7-67.8h311.1c48.1 0 92.9 26 116.7 67.8l156.6 274.7c23.4 41 23.4 92 0 133L785.2 854.4c-23.8 41.8-68.5 67.8-116.6 67.8zM357.4 193.8c-16 0-30.9 8.6-38.9 22.6L162 491.1c-7.8 13.7-7.8 30.6 0 44.3l156.6 274.7c7.9 13.9 22.8 22.6 38.9 22.6h311.1c16 0 30.9-8.6 38.9-22.6L864 535.4c7.8-13.7 7.8-30.6 0-44.3L707.4 216.4c-7.9-13.9-22.8-22.6-38.9-22.6H357.4z"></path><path d="M513 696.4c-101 0-183.2-82.2-183.2-183.2S412 330.1 513 330.1s183.2 82.2 183.2 183.2S614 696.4 513 696.4z m0-276.8c-51.6 0-93.6 42-93.6 93.6s42 93.6 93.6 93.6 93.6-42 93.6-93.6-42-93.6-93.6-93.6z"></path></svg>'

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    })
  }

  function loadImportedBooks() {
    try {
      var saved = JSON.parse(localStorage.getItem(IMPORTED_BOOKS_STORAGE_KEY) || '[]')
      return Array.isArray(saved) ? saved.filter(function(book) {
        return book && book.id && book.title && Array.isArray(book.chapters)
      }) : []
    } catch (error) {
      return []
    }
  }

  function saveImportedBooks() {
    try { localStorage.setItem(IMPORTED_BOOKS_STORAGE_KEY, JSON.stringify(BOOKS)) } catch (error) {}
  }

  function loadWritingStyles() {
    try {
      var saved = JSON.parse(localStorage.getItem(WRITING_STYLES_STORAGE_KEY) || '[]')
      return Array.isArray(saved) ? saved.filter(function(style) {
        return style && style.id && style.title && style.description
      }) : []
    } catch (error) {
      return []
    }
  }

  function ensureWritingStyles() {
    if (!writingStyles.length) {
      writingStyles = [Object.assign({}, DEFAULT_WRITING_STYLE)]
      saveWritingStyles()
    }
    return writingStyles
  }

  function saveWritingStyles() {
    try { localStorage.setItem(WRITING_STYLES_STORAGE_KEY, JSON.stringify(writingStyles)) } catch (error) {}
  }

  function getBook(id) {
    return BOOKS.find(function(book) { return book.id === id }) || BOOKS[0]
  }

  function normalizeBookRoles(roles) {
    if (!Array.isArray(roles)) return []
    var seen = {}
    var normalized = roles.map(function(role) {
      if (!role || typeof role !== 'object') return null
      var id = String(role.id || makeBookRoleId())
      if (seen[id]) id = makeBookRoleId()
      seen[id] = true
      return {
        id: id,
        name: String(role.name || '').trim(),
        description: normalizeImportedDescription(role.description),
        relations: Array.isArray(role.relations) ? role.relations.map(function(relation) {
          if (!relation || typeof relation !== 'object') return null
          return {
            targetRoleId: String(relation.targetRoleId || ''),
            description: normalizeImportedDescription(relation.description)
          }
        }).filter(function(relation) {
          return relation.targetRoleId && relation.description
        }) : []
      }
    }).filter(function(role) {
      return role && role.name
    })
    var validIds = {}
    normalized.forEach(function(role) { validIds[role.id] = true })
    normalized.forEach(function(role) {
      role.relations = role.relations.filter(function(relation) {
        return validIds[relation.targetRoleId] && relation.targetRoleId !== role.id
      })
    })
    return normalized
  }

  function makeBookRoleId() {
    return 'role-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  }

  function makeWritingStyleId() {
    return 'style-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  }

  function filteredBooks() {
    if (state.channel === 'all') return BOOKS
    return BOOKS.filter(function(book) { return book.channel === state.channel })
  }

  function shelfBooks() {
    var query = state.shelfQuery.trim().toLowerCase()
    return BOOKS.filter(function(book) {
      if (!query) return true
      return (book.title + ' ' + book.author).toLowerCase().indexOf(query) !== -1
    })
  }

  function createBookstorePage() {
    var page = document.createElement('div')
    page.id = 'bookstore-page'
    page.className = 'full-page bookstore-page'
    page.innerHTML =
      '<div class="page-header bookstore-header">' +
        '<button class="header-back" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
        '<span class="header-title">Readen</span>' +
        '<button class="bookstore-author-entry" type="button" data-action="author"><i class="fa fa-pen-nib"></i></button>' +
      '</div>' +
      '<main class="bookstore-shell" id="bookstore-shell"></main>' +
      '<nav class="bookstore-tabbar">' +
        '<button type="button" data-tab="home"><i class="fa fa-house"></i><span>首页</span></button>' +
        '<button type="button" data-tab="shelf"><i class="fa fa-book-open"></i><span>书架</span></button>' +
        '<button type="button" data-tab="statistics"><i class="fa fa-chart-column"></i><span>统计</span></button>' +
        '<button type="button" data-tab="author"><i class="fa fa-feather"></i><span>作者</span></button>' +
      '</nav>'
    page.querySelector('.header-back').addEventListener('click', function() { window.closePage('bookstore-page') })
    page.querySelector('.bookstore-author-entry').addEventListener('click', function() {
      state.tab = 'author'
      state.view = 'author'
      render()
    })
    page.querySelectorAll('[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.tab = btn.dataset.tab
        state.view = btn.dataset.tab
        render()
      })
    })
    return page
  }

  function render() {
    var page = document.getElementById('bookstore-page')
    if (!page) return
    page.dataset.view = state.view
    page.querySelectorAll('.bookstore-tabbar [data-tab]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === state.tab)
    })
    var shell = page.querySelector('#bookstore-shell')
    if (state.view === 'detail') shell.innerHTML = renderDetail()
    else if (state.view === 'edit') shell.innerHTML = renderBookEdit()
    else if (state.view === 'reader') shell.innerHTML = renderReader()
    else if (state.view === 'shelf') shell.innerHTML = renderShelf()
    else if (state.view === 'statistics') shell.innerHTML = renderStatistics()
    else if (state.view === 'author') shell.innerHTML = renderAuthor()
    else if (state.view === 'writing-styles') shell.innerHTML = renderWritingStyles()
    else if (state.view === 'create-work') shell.innerHTML = renderCreateWork()
    else if (state.view === 'create-chapter') shell.innerHTML = renderCreateChapter()
    else if (state.view === 'chapter-plan') shell.innerHTML = renderChapterPlan()
    else if (state.view === 'edit-history') shell.innerHTML = renderEditHistory()
    else shell.innerHTML = renderHome()
    bindContentEvents(shell)
  }

  function renderHome() {
    resetTodayIfNeeded(readingData)
    var lastBook = readingData.lastBookId ? getBook(readingData.lastBookId) : null
    var goalSeconds = readingData.goalMinutes * 60
    var progress = Math.min(100, Math.round((readingData.todaySeconds / goalSeconds) * 100))
    return '' +
      '<section class="bookstore-dashboard">' +
        '<h1>首页</h1>' +
        '<div class="bookstore-reading-stats">' +
          renderReadingStat('fa-book-open', '总阅读', readBookCount(), '本') +
          renderReadingStat('fa-clock', '阅读时长', readingHours(), '小时') +
        '</div>' +
        '<div class="bookstore-continue">' +
          '<button type="button" data-continue-reading' + (lastBook ? '' : ' disabled') + '><strong>继续阅读</strong><i class="fa fa-angle-right"></i></button>' +
          (lastBook
            ? '<div><span>' + esc(lastBook.title) + '</span><small>当前进度 · ' + esc(lastBook.chapters[readingData.lastChapterIndex] ? lastBook.chapters[readingData.lastChapterIndex].title : lastBook.chapters[0].title) + '</small></div>'
            : '<p>暂无阅读记录</p>') +
        '</div>' +
        '<div class="bookstore-goal-heading">' +
          '<div><h2>阅读目标</h2><p>找到喜欢的故事，设定阅读目标，开始阅读吧！</p></div>' +
          '<div class="bookstore-goal-heading-actions">' +
            '<button type="button" data-goal-settings aria-label="设置阅读目标"><i class="fa-solid fa-toggle-on"></i></button>' +
          '</div>' +
        '</div>' +
        (state.goalPanelOpen ? renderGoalOptions() : '') +
        renderGoalCard(progress) +
      '</section>'
  }

  function renderReadingStat(icon, label, value, unit) {
    return '<div class="bookstore-reading-stat"><i class="fa ' + icon + '"></i><div><span>' + esc(label) + '</span><strong>' + esc(value) + ' <small>' + esc(unit) + '</small></strong></div></div>'
  }

  function renderGoalOptions() {
    return '<div class="bookstore-goal-modal" role="dialog" aria-modal="true" aria-labelledby="bookstore-goal-modal-title">' +
      '<button class="bookstore-goal-modal-backdrop" type="button" data-goal-close aria-label="关闭目标设置"></button>' +
      '<form class="bookstore-goal-modal-panel" data-goal-form>' +
        '<h3 id="bookstore-goal-modal-title">设置每日阅读目标</h3>' +
        '<p>请输入每天计划阅读的分钟数</p>' +
        '<label><input type="number" inputmode="numeric" min="1" max="1440" step="1" value="' + readingData.goalMinutes + '" data-goal-input><span>分钟</span></label>' +
        '<small data-goal-error></small>' +
        '<div><button type="button" class="secondary" data-goal-close>取消</button><button type="submit">保存</button></div>' +
      '</form>' +
    '</div>'
  }

  function renderGoalCard(progress) {
    var compact = readingData.goalView === 'compact'
    return '<div class="bookstore-goal-card ' + (compact ? 'is-compact' : '') + '">' +
      '<div class="bookstore-goal-card-head"><strong>今日目标</strong><div>' +
        '<button type="button" data-goal-view aria-label="切换目标视图"><i class="fa-solid fa-arrow-right-arrow-left"></i></button>' +
      '</div></div>' +
      (compact
        ? '<div class="bookstore-goal-compact"><strong>' + formatClock(readingData.todaySeconds) + '</strong><span>今日已阅读 · 完成 ' + progress + '%</span><div><i style="width:' + progress + '%"></i></div></div>'
        : '<div class="bookstore-goal-progress"><svg viewBox="0 0 280 145" aria-hidden="true" preserveAspectRatio="xMidYMid meet">' +
            '<path class="bookstore-goal-arc-track" d="M 14.4 135 A 125.6 125.6 0 0 1 265.6 135" pathLength="100"></path>' +
            '<path class="bookstore-goal-arc-value" d="M 14.4 135 A 125.6 125.6 0 0 1 265.6 135" pathLength="100" stroke-dasharray="' + progress + ' 100"></path>' +
          '</svg><div><span>今日阅读进度</span><strong>' + formatClock(readingData.todaySeconds) + '</strong><button class="bookstore-goal-target" type="button" data-goal-settings>目标 ' + readingData.goalMinutes + ' 分钟 <i class="fa fa-angle-right"></i></button></div></div>') +
      '<button class="bookstore-start-reading" type="button" data-tab-jump="shelf">开始阅读</button>' +
    '</div>'
  }

  function renderQuick(label, icon) {
    return '<button class="bookstore-quick" type="button" data-tab-jump="statistics"><i class="fa ' + icon + '"></i><span>' + esc(label) + '</span></button>'
  }

  function renderBookCard(book) {
    return '' +
      '<button class="bookstore-book-card" type="button" data-open-book="' + esc(book.id) + '">' +
        '<span class="bookstore-cover">' + BOOK_COVER_SVG + '</span>' +
        '<span class="bookstore-book-copy">' +
          '<strong>' + esc(book.title) + '</strong>' +
          '<em>' + esc(book.author) + ' · ' + esc(book.status) + ' · ' + esc(book.words) + '</em>' +
          '<span>' + esc(book.intro) + '</span>' +
          '<small>' + book.tags.map(esc).join(' / ') + '</small>' +
        '</span>' +
        '<span class="bookstore-heat">' + esc(book.heat) + '</span>' +
      '</button>'
  }

  function renderShelf() {
    var list = shelfBooks()
    var total = BOOKS.length
    return '' +
      '<section class="bookstore-shelf" aria-label="我的书架">' +
        '<div class="bookstore-shelf-heading"><h1>书架</h1><button type="button" data-shelf-menu aria-label="更多操作"><i class="fa-solid fa-ellipsis-vertical"></i></button></div>' +
        '<label class="bookstore-shelf-search"><i class="fa fa-magnifying-glass"></i><input type="search" data-shelf-search value="' + esc(state.shelfQuery) + '" placeholder="搜索书籍" aria-label="搜索书架"></label>' +
        (total === 0
          ? '<div class="bookstore-shelf-empty"><div><strong>书架空空如也</strong><p>导入一本书，开始你的阅读吧～</p><button type="button" data-import-book><i class="fa fa-plus"></i><span>从设备导入</span></button><small>支持 TXT、EPUB 格式</small></div></div>'
          : (list.length
            ? '<div class="bookstore-shelf-grid">' + list.map(renderShelfBook).join('') + '</div><p class="bookstore-shelf-count">共 ' + total + ' 本书</p>'
            : '<div class="bookstore-shelf-no-result">没有找到相关书籍</div>')) +
        '<input type="file" data-book-file accept=".txt,.epub,text/plain,application/epub+zip" hidden>' +
      '</section>'
  }

  function renderShelfBook(book) {
    var progress = bookReadingProgress(book)
    return '<article class="bookstore-shelf-book">' +
      renderBookCover(book, 'button', '', 'type="button" data-read-shelf="' + esc(book.id) + '"') +
      '<div class="bookstore-shelf-book-info"><button type="button" data-read-shelf="' + esc(book.id) + '"><strong>' + esc(book.title) + '</strong><span>' + progress + '%</span></button><button class="bookstore-shelf-more" type="button" data-book-menu="' + esc(book.id) + '" aria-label="' + esc(book.title) + '更多操作"><i class="fa fa-ellipsis"></i></button></div>' +
    '</article>'
  }

  function renderBookCover(book, tagName, extraClass, attrs) {
    var palette = book.coverColor || '#e9e6df'
    var coverImage = String(book.coverImage || '').trim()
    var classes = 'bookstore-shelf-cover' + (extraClass ? ' ' + extraClass : '') + (coverImage ? ' has-image' : '')
    var content = coverImage
      ? '<img src="' + esc(coverImage) + '" alt="' + esc(book.title || '书籍封面') + '">'
      : '<span class="bookstore-shelf-cover-mark">READEN</span><strong>' + esc(book.title) + '</strong><small>' + esc(book.author) + '</small>'
    return '<' + tagName + ' class="' + classes + '" ' + (attrs || '') + ' style="--cover-color:' + esc(palette) + '">' + content + '</' + tagName + '>'
  }

  function bookSystemTags(tags) {
    var existing = Array.isArray(tags) ? tags : []
    var system = existing.filter(function(tag) { return tag === '本地书籍' || tag === '本地导入' })
    if (!system.length) system.push('本地书籍')
    return system.filter(function(tag, index) { return system.indexOf(tag) === index })
  }

  function bookUserTags(tags) {
    return (Array.isArray(tags) ? tags : []).filter(function(tag) {
      return tag && tag !== '本地书籍' && tag !== '本地导入'
    })
  }

  function parseBookUserTags(value) {
    return String(value || '').split(/[\s,，、;；\n]+/).map(function(tag) {
      return tag.trim()
    }).filter(function(tag, index, list) {
      return tag && tag !== '本地书籍' && tag !== '本地导入' && list.indexOf(tag) === index
    })
  }

  function bookReadingProgress(book) {
    if (!readingData.readBooks[book.id]) return 0
    var chapterIndex = readingData.lastBookId === book.id ? readingData.lastChapterIndex : 0
    return Math.max(1, Math.min(100, Math.round((chapterIndex + 1) / Math.max(1, book.chapters.length) * 100)))
  }

  function normalizeImportedText(text) {
    return String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  function normalizeImportedParagraphs(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map(function(line) { return line.trim() })
      .filter(Boolean)
      .join('\n\n')
  }

  function normalizeImportedDescription(text) {
    var value = String(text || '')
    if (/<(?:p|div|section|article|br|li|h[1-6])\b/i.test(value)) value = htmlToParagraphs(value)
    return value
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map(function(line) { return line.trim() })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  function parseTxtMetadata(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n')
    var removed = {}
    var metadata = { author: '', description: '' }
    var scanLimit = Math.min(lines.length, 40)
    var authorPattern = /^\s*(?:作\s*者)\s*[:：]\s*(.*?)\s*$/
    var descriptionPattern = /^\s*(?:内容简介|简介|文案)\s*[:：]\s*(.*?)\s*$/
    var metadataFieldPattern = /^\s*[^\s:：]{1,8}\s*[:：]/

    for (var index = 0; index < scanLimit; index++) {
      var line = lines[index]
      var trimmed = line.trim()
      if (chapterTitleLine(trimmed)) break
      var authorMatch = line.match(authorPattern)
      if (authorMatch) {
        if (!metadata.author) metadata.author = authorMatch[1].trim()
        removed[index] = true
        continue
      }
      var descriptionMatch = line.match(descriptionPattern)
      if (!descriptionMatch || metadata.description) continue
      removed[index] = true
      var descriptionLines = []
      if (descriptionMatch[1].trim()) descriptionLines.push(descriptionMatch[1].trim())
      var next = index + 1
      if (!descriptionLines.length) {
        while (next < scanLimit && !lines[next].trim()) {
          removed[next] = true
          next++
        }
      }
      while (next < scanLimit) {
        var candidate = lines[next].trim()
        if (!candidate || chapterTitleLine(candidate) || authorPattern.test(lines[next]) || descriptionPattern.test(lines[next]) || metadataFieldPattern.test(lines[next])) break
        descriptionLines.push(candidate)
        removed[next] = true
        next++
      }
      metadata.description = normalizeImportedDescription(descriptionLines.join('\n'))
      index = Math.max(index, next - 1)
    }

    return {
      metadata: metadata,
      content: lines.filter(function(_, lineIndex) { return !removed[lineIndex] }).join('\n')
    }
  }

  function parseXml(xml, errorMessage) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml')
    if (doc.querySelector('parsererror')) throw new Error(errorMessage)
    return doc
  }

  function firstElementByLocalName(root, name) {
    var nodes = root.getElementsByTagNameNS('*', name)
    return nodes.length ? nodes[0] : null
  }

  function elementsByLocalName(root, name) {
    return Array.from(root.getElementsByTagNameNS('*', name))
  }

  function dirname(path) {
    var index = path.lastIndexOf('/')
    return index < 0 ? '' : path.slice(0, index + 1)
  }

  function resolveBookPath(baseFile, relativePath) {
    var raw = String(relativePath || '').split('#')[0].split('?')[0]
    try { raw = decodeURIComponent(raw) } catch (error) {}
    var parts = (dirname(baseFile) + raw).split('/')
    var resolved = []
    parts.forEach(function(part) {
      if (!part || part === '.') return
      if (part === '..') resolved.pop()
      else resolved.push(part)
    })
    return resolved.join('/')
  }

  function chapterTitleLine(line) {
    var value = String(line || '').trim()
    if (!value || value.length > 60) return false
    return /^(?:第\s*[0-9０-９零〇一二两三四五六七八九十百千万]+\s*[卷章节回篇部集].*|[卷章节回篇部集]\s*[0-9０-９零〇一二两三四五六七八九十百千万]+.*|正文|序章.*|序言.*|楔子.*|前言.*|引子.*|后记.*|尾声.*|终章.*|番外(?:\s*[0-9０-９零〇一二两三四五六七八九十百千万]+)?.*)$/i.test(value)
  }

  function parseTxtChapters(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n')
    var hasChapterTitles = lines.some(chapterTitleLine)
    if (!hasChapterTitles) {
      var wholeBook = normalizeImportedParagraphs(lines.join('\n'))
      return wholeBook ? [{ title: '正文', body: wholeBook }] : []
    }

    var chapters = []
    var title = '正文'
    var bodyLines = []
    function pushChapter() {
      var body = normalizeImportedParagraphs(bodyLines.join('\n'))
      if (body) chapters.push({ title: title, body: body })
      bodyLines = []
    }
    lines.forEach(function(line) {
      var trimmed = line.trim()
      if (chapterTitleLine(trimmed)) {
        pushChapter()
        title = trimmed
      } else {
        bodyLines.push(line)
      }
    })
    pushChapter()
    return chapters
  }

  function htmlToParagraphs(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html')
    var root = doc.body || doc.documentElement
    if (!root) return ''
    var output = []
    var blockTags = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|DL|DT|DD|FIGCAPTION|FIGURE|FOOTER|H1|H2|H3|H4|H5|H6|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL)$/
    function walk(node) {
      if (node.nodeType === 3) {
        output.push(node.nodeValue || '')
        return
      }
      if (node.nodeType !== 1) return
      var tag = node.tagName.toUpperCase()
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG') return
      if (tag === 'BR') {
        output.push('\n')
        return
      }
      var block = blockTags.test(tag)
      if (block) output.push('\n')
      Array.from(node.childNodes).forEach(walk)
      if (block) output.push('\n')
    }
    walk(root)
    return normalizeImportedParagraphs(output.join(''))
  }

  async function readEpubBook(file) {
    if (!window.JSZip) throw new Error('EPUB 解析组件未加载')
    var zip = await window.JSZip.loadAsync(file)
    var containerEntry = zip.file('META-INF/container.xml')
    if (!containerEntry) throw new Error('EPUB 缺少容器信息')
    var container = parseXml(await containerEntry.async('text'), 'EPUB 容器信息无效')
    var rootfile = firstElementByLocalName(container, 'rootfile')
    var opfPath = rootfile && rootfile.getAttribute('full-path')
    if (!opfPath || !zip.file(opfPath)) throw new Error('EPUB 缺少书籍清单')

    var opf = parseXml(await zip.file(opfPath).async('text'), 'EPUB 书籍清单无效')
    var titleNode = firstElementByLocalName(opf, 'title')
    var creatorNode = firstElementByLocalName(opf, 'creator')
    var descriptionNode = firstElementByLocalName(opf, 'description')
    var description = descriptionNode ? descriptionNode.textContent.trim() : ''
    if (!description) {
      var descriptionMeta = elementsByLocalName(opf, 'meta').find(function(node) {
        return String(node.getAttribute('property') || '').toLowerCase() === 'dcterms:description'
      })
      description = descriptionMeta ? String(descriptionMeta.textContent || descriptionMeta.getAttribute('content') || '').trim() : ''
    }
    var metadata = {
      title: titleNode ? titleNode.textContent.trim() : '',
      author: creatorNode ? creatorNode.textContent.trim() : '',
      description: normalizeImportedDescription(description)
    }
    var manifest = {}
    elementsByLocalName(opf, 'item').forEach(function(item) {
      var id = item.getAttribute('id')
      if (id) manifest[id] = {
        path: resolveBookPath(opfPath, item.getAttribute('href')),
        mediaType: item.getAttribute('media-type') || '',
        properties: item.getAttribute('properties') || ''
      }
    })

    var tocTitles = {}
    var navItem = Object.keys(manifest).map(function(id) { return manifest[id] }).find(function(item) {
      return /(?:^|\s)nav(?:\s|$)/.test(item.properties)
    })
    if (navItem && zip.file(navItem.path)) {
      var navDoc = new DOMParser().parseFromString(await zip.file(navItem.path).async('text'), 'text/html')
      Array.from(navDoc.querySelectorAll('a[href]')).forEach(function(link) {
        var path = resolveBookPath(navItem.path, link.getAttribute('href'))
        var label = link.textContent.trim()
        if (path && label && !tocTitles[path]) tocTitles[path] = label
      })
    } else {
      var spine = firstElementByLocalName(opf, 'spine')
      var ncxId = spine && spine.getAttribute('toc')
      var ncxItem = ncxId && manifest[ncxId]
      if (ncxItem && zip.file(ncxItem.path)) {
        var ncx = parseXml(await zip.file(ncxItem.path).async('text'), 'EPUB 目录无效')
        elementsByLocalName(ncx, 'navPoint').forEach(function(point) {
          var content = firstElementByLocalName(point, 'content')
          var labelNode = firstElementByLocalName(point, 'text')
          var path = content && resolveBookPath(ncxItem.path, content.getAttribute('src'))
          var label = labelNode && labelNode.textContent.trim()
          if (path && label && !tocTitles[path]) tocTitles[path] = label
        })
      }
    }

    var chapters = []
    var itemrefs = elementsByLocalName(opf, 'itemref')
    for (var index = 0; index < itemrefs.length; index++) {
      var item = manifest[itemrefs[index].getAttribute('idref')]
      if (!item || !zip.file(item.path) || !/(?:xhtml|html)/i.test(item.mediaType || item.path)) continue
      var html = await zip.file(item.path).async('text')
      var body = htmlToParagraphs(html)
      if (!body) continue
      var htmlDoc = new DOMParser().parseFromString(html, 'text/html')
      var heading = htmlDoc.querySelector('h1, h2, h3, title')
      var chapterTitle = tocTitles[item.path] || (heading && heading.textContent.trim()) || ('第 ' + (chapters.length + 1) + ' 章')
      var paragraphs = body.split(/\n{2,}/)
      if (paragraphs.length > 1 && paragraphs[0].trim() === chapterTitle.trim()) body = paragraphs.slice(1).join('\n\n')
      if (!body) continue
      chapters.push({
        title: chapterTitle,
        body: body
      })
    }
    if (!chapters.length) throw new Error('EPUB 中没有识别到正文内容')
    return { metadata: metadata, chapters: chapters }
  }

  async function readImportedBookFile(file) {
    var name = String(file.name || '').toLowerCase()
    if (name.endsWith('.txt')) {
      var parsedText = parseTxtMetadata(await file.text())
      return { metadata: parsedText.metadata, chapters: parseTxtChapters(parsedText.content) }
    }
    if (name.endsWith('.epub')) return readEpubBook(file)
    throw new Error('仅支持 TXT、EPUB 文件')
  }

  function makeImportedBook(file, parsed) {
    var chapters = parsed && Array.isArray(parsed.chapters) ? parsed.chapters : []
    if (!chapters.length) throw new Error('文件中没有识别到文字内容')
    var metadata = parsed.metadata || {}
    var title = String(metadata.title || file.name || '未命名书籍').replace(/\.(txt|epub)$/i, '').trim() || '未命名书籍'
    var author = String(metadata.author || '').trim()
    var description = normalizeImportedDescription(metadata.description)
    var clean = chapters.map(function(chapter) { return chapter.body }).join('\n\n')
    var colors = ['#e8e4dc', '#dfe8e8', '#e8e1e6', '#e6e8dc', '#e1e3eb']
    var id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
    return {
      id: id, title: title, author: author, status: '已导入', words: clean.length + ' 字', intro: description,
      tags: ['本地书籍'], category: '', coverImage: '', heat: '', channel: 'local', coverColor: colors[BOOKS.length % colors.length],
      fileSize: file.size,
      bookRoles: [],
      chapters: chapters
    }
  }

  function pad2(value) {
    return String(value).padStart(2, '0')
  }

  function dateKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
  }

  function startOfWeek(date) {
    var result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    var day = result.getDay() || 7
    result.setDate(result.getDate() - day + 1)
    return result
  }

  function statisticsPeriod() {
    var anchor = new Date(state.statisticsDate)
    var range = state.statisticsRange
    var start
    var end
    if (range === 'day') {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
      end = new Date(start)
    } else if (range === 'week') {
      start = startOfWeek(anchor)
      end = new Date(start)
      end.setDate(end.getDate() + 6)
    } else if (range === 'year') {
      start = new Date(anchor.getFullYear(), 0, 1)
      end = new Date(anchor.getFullYear(), 11, 31)
    } else if (range === 'all') {
      var keys = Object.keys(readingData.dailySeconds).sort()
      start = keys.length ? new Date(keys[0] + 'T00:00:00') : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
      end = new Date()
    } else {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    }
    return { start: start, end: end }
  }

  function periodDates(period) {
    var dates = []
    var cursor = new Date(period.start)
    while (cursor <= period.end) {
      dates.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  }

  function statisticsTitle(period) {
    var range = state.statisticsRange
    if (range === 'day') return pad2(period.start.getMonth() + 1) + '.' + pad2(period.start.getDate())
    if (range === 'week') return pad2(period.start.getMonth() + 1) + '.' + pad2(period.start.getDate()) + '-' + pad2(period.end.getMonth() + 1) + '.' + pad2(period.end.getDate())
    if (range === 'year') return String(period.start.getFullYear())
    if (range === 'all') return '全部时间'
    return period.start.getFullYear() + '.' + pad2(period.start.getMonth() + 1)
  }

  function formatDuration(seconds) {
    var minutes = Math.floor((Number(seconds) || 0) / 60)
    if (minutes < 60) return minutes + ' 分钟'
    var hours = Math.floor(minutes / 60)
    var rest = minutes % 60
    return hours + ' 小时' + (rest ? ' ' + rest + ' 分钟' : '')
  }

  function renderStatisticMetric(value, label) {
    return '<div class="bookstore-statistics-metric"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>'
  }

  function renderStatisticsChart(dates, values) {
    var width = 320
    var height = 190
    var max = Math.max.apply(null, values.concat([240]))
    var top = Math.ceil(max / 60) * 60
    var ticks = [top, Math.round(top * .75), Math.round(top * .5), Math.round(top * .25), 0]
    var bars = values.map(function(value, index) {
      if (!value) return ''
      var x = dates.length === 1 ? width / 2 : 28 + (index * (width - 48) / Math.max(1, dates.length - 1))
      var y = 16 + (1 - value / top) * 142
      return '<line x1="' + x.toFixed(1) + '" y1="158" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" />'
    }).join('')
    var labels = []
    var labelCount = Math.min(6, dates.length)
    for (var i = 0; i < labelCount; i++) {
      var idx = Math.round(i * (dates.length - 1) / Math.max(1, labelCount - 1))
      var lx = dates.length === 1 ? width / 2 : 28 + (idx * (width - 48) / Math.max(1, dates.length - 1))
      labels.push('<text x="' + lx.toFixed(1) + '" y="183" text-anchor="middle">' + (state.statisticsRange === 'year' ? (dates[idx].getMonth() + 1) + '月' : dates[idx].getDate()) + '</text>')
    }
    var grid = ticks.map(function(tick, index) {
      var y = 16 + index * 35.5
      return '<g><text x="0" y="' + (y + 4) + '">' + Math.round(tick / 60) + (tick ? 'm' : '') + '</text><line x1="28" y1="' + y + '" x2="300" y2="' + y + '" /></g>'
    }).join('')
    return '<svg class="bookstore-statistics-chart" viewBox="0 0 320 190" aria-label="阅读时长趋势图"><g class="grid">' + grid + '</g><g class="bars">' + bars + '</g><g class="labels">' + labels.join('') + '</g></svg>'
  }

  function renderStatistics() {
    var period = statisticsPeriod()
    var dates = periodDates(period)
    var values = dates.map(function(date) { return Number(readingData.dailySeconds[dateKey(date)]) || 0 })
    var activeDays = values.filter(function(value) { return value > 0 }).length
    if (state.statisticsRange === 'year') {
      var months = Array(12).fill(0)
      dates.forEach(function(date, index) { months[date.getMonth()] += values[index] })
      dates = months.map(function(_, month) { return new Date(period.start.getFullYear(), month, 1) })
      values = months
    }
    var total = values.reduce(function(sum, value) { return sum + value }, 0)
    var ranges = ['day', 'week', 'month', 'year', 'all']
    var rangeIndex = ranges.indexOf(state.statisticsRange)
    var bookIds = BOOKS.filter(function(book) { return readingData.readBooks[book.id] }).map(function(book) { return book.id })
    var ranked = BOOKS.filter(function(book) { return (Number(readingData.bookSeconds[book.id]) || 0) > 0 }).sort(function(a, b) {
      return (Number(readingData.bookSeconds[b.id]) || 0) - (Number(readingData.bookSeconds[a.id]) || 0)
    })
    return '<section class="bookstore-statistics">' +
      '<div class="bookstore-statistics-title"><h1>统计</h1></div>' +
      '<div class="bookstore-statistics-tabs">' + [['day','日'],['week','周'],['month','月'],['year','年'],['all','全部']].map(function(item) {
        return '<button type="button" data-stat-range="' + item[0] + '" class="' + (state.statisticsRange === item[0] ? 'active' : '') + '">' + item[1] + '</button>'
      }).join('') + '</div>' +
      '<div class="bookstore-statistics-period"><button type="button" data-stat-step="-1" aria-label="缩小时间范围"' + (rangeIndex === 0 ? ' disabled' : '') + '><i class="fa fa-angle-left"></i></button><strong>' + statisticsTitle(period) + '</strong><button type="button" data-stat-step="1" aria-label="扩大时间范围"' + (rangeIndex === ranges.length - 1 ? ' disabled' : '') + '><i class="fa fa-angle-right"></i></button></div>' +
      '<div class="bookstore-statistics-summary">' +
        renderStatisticMetric(formatDuration(total), '时长') +
        renderStatisticMetric(activeDays + ' 天', '阅读天数') +
        renderStatisticMetric(bookIds.length + ' 本', '书籍') +
        renderStatisticMetric('0 本', '已读完') +
        renderStatisticMetric(bookIds.length + ' 本', '在读书籍') +
        renderStatisticMetric('0 条', '笔记') +
      '</div>' +
      '<div class="bookstore-statistics-card"><div class="bookstore-statistics-card-head"><h2>阅读时长趋势</h2><div><i class="fa-regular fa-clock"></i></div></div>' + renderStatisticsChart(dates, values) + '</div>' +
      '<div class="bookstore-statistics-card bookstore-time-rank"><h2>阅读时长排行 <i class="fa fa-angle-right"></i></h2>' +
        (ranked.length ? ranked.map(function(book, index) {
          var seconds = Number(readingData.bookSeconds[book.id]) || 0
          var top = Number(readingData.bookSeconds[ranked[0].id]) || 1
          return '<button type="button" data-open-book="' + esc(book.id) + '"><b>' + (index + 1) + '</b><span class="bookstore-rank-cover"><i class="fa fa-book-open"></i></span><span class="bookstore-rank-copy"><strong>' + esc(book.title) + '</strong><em>' + esc(book.author) + '</em><i style="width:' + Math.max(8, seconds / top * 100) + '%"></i></span><span class="bookstore-rank-time">' + formatDuration(seconds) + '</span></button>'
        }).join('') : '<p class="bookstore-statistics-empty">开始阅读后，这里会显示你的阅读时长排行。</p>') + '</div>' +
    '</section>'
  }

  function renderDetail() {
    var book = getBook(state.selectedBookId)
    if (!book) return '<div class="bookstore-empty">暂无可用书籍。</div>'
    var detailTags = bookUserTags(book.tags)
    var tabContent = ''
    if (state.detailTab === 'toc') {
      tabContent = '<div class="bookstore-detail-toc-head"><strong>目录</strong><span>' + book.chapters.length + ' 章</span></div>' +
        '<div class="bookstore-detail-chapters">' + book.chapters.map(function(chapter, index) {
          return '<button type="button" data-read-chapter="' + index + '"><span>' + esc(chapter.title) + '</span><i class="fa fa-angle-right"></i></button>'
        }).join('') + '</div>'
    } else if (state.detailTab === 'info') {
      var introduction = normalizeImportedDescription(book.intro)
      tabContent = '<div class="bookstore-detail-info"><div class="bookstore-detail-info-card"><h3>内容介绍</h3><p class="' + (introduction ? '' : 'is-empty') + '">' + esc(introduction || '暂无内容介绍') + '</p></div>' +
        (book.category ? '<div class="bookstore-detail-category"><span>分类</span><strong>' + esc(book.category) + '</strong></div>' : '') +
        (detailTags.length ? '<div class="bookstore-detail-tags">' + detailTags.map(function(tag) { return '<span>' + esc(tag) + '</span>' }).join('') + '</div>' : '') + '</div>'
    } else if (state.detailTab === 'roles') {
      tabContent = renderBookRolesDetail(book)
    } else if (state.detailTab === 'notes') {
      tabContent = '<div class="bookstore-empty">暂无笔记</div>'
    }
    return '' +
      '<section class="bookstore-detail">' +
        '<div class="bookstore-detail-hero">' +
          renderBookCover(book, 'span', 'bookstore-detail-cover', '') +
          '<div class="bookstore-detail-copy"><div class="bookstore-detail-title-row"><h2>' + esc(book.title) + '</h2><button type="button" data-edit-book="' + esc(book.id) + '" aria-label="编辑书籍信息"><i class="fa-solid fa-pen-to-square"></i></button></div><p>' + esc(book.author) + '</p><em>本地导入 · ' + esc(formatFileSize(book.fileSize)) + '</em></div>' +
        '</div>' +
        '<div class="bookstore-detail-metrics">' +
          '<div><span>Progress</span><strong>' + bookReadingProgress(book) + '%</strong></div>' +
          '<div><span>Word Count</span><strong>' + esc(formatWordCount(book)) + '</strong></div>' +
          '<div><span>Time</span><strong>' + esc(formatDuration(readingData.bookSeconds[book.id] || 0)) + '</strong></div>' +
        '</div>' +
        '<nav class="bookstore-detail-tabs" aria-label="书籍详情分类">' + [['info','信息'],['toc','目录'],['notes','笔记'],['roles','角色']].map(function(tab) {
          return '<button type="button" data-detail-tab="' + tab[0] + '" class="' + (state.detailTab === tab[0] ? 'active' : '') + '">' + tab[1] + '</button>'
        }).join('') + '</nav>' +
        '<div class="bookstore-detail-tab-content" data-active-tab="' + esc(state.detailTab) + '">' + tabContent + '</div>' +
      '</section>'
  }

  function renderBookEdit() {
    var book = getBook(state.selectedBookId)
    if (!book) return '<div class="bookstore-empty">暂无可用书籍。</div>'
    var userTags = bookUserTags(book.tags).join('，')
    return '' +
      '<form class="bookstore-book-edit" data-book-edit-form>' +
        '<div class="bookstore-edit-head">' +
          '<button type="button" data-cancel-book-edit aria-label="返回书籍详情"><i class="fa fa-angle-left"></i></button>' +
          '<h1>编辑书籍信息</h1>' +
          '<button type="submit" class="bookstore-edit-save">保存</button>' +
        '</div>' +
        '<div class="bookstore-edit-cover-row">' +
          renderBookCover(book, 'button', 'bookstore-edit-cover', 'type="button" data-pick-book-cover') +
          '<div><button type="button" data-pick-book-cover><i class="fa fa-image"></i><span>更换封面</span></button><button type="button" data-clear-book-cover><i class="fa fa-rotate-left"></i><span>默认封面</span></button></div>' +
        '</div>' +
        '<input type="hidden" data-book-cover-value value="' + esc(book.coverImage || '') + '">' +
        '<label class="bookstore-edit-field"><span>书名</span><input type="text" data-book-title value="' + esc(book.title || '') + '" placeholder="书名"></label>' +
        '<label class="bookstore-edit-field"><span>作者</span><input type="text" data-book-author value="' + esc(book.author || '') + '" placeholder="作者"></label>' +
        '<label class="bookstore-edit-field"><span>分类</span><input type="text" data-book-category value="' + esc(book.category || '') + '" placeholder="分类"></label>' +
        '<label class="bookstore-edit-field"><span>内容介绍</span><textarea data-book-intro placeholder="介绍这本书的内容">' + esc(book.intro || '') + '</textarea></label>' +
        '<label class="bookstore-edit-field"><span>标签</span><textarea data-book-tags placeholder="用逗号、顿号、空格或换行分隔多个标签">' + esc(userTags) + '</textarea></label>' +
        renderBookRolesEditor(book) +
      '</form>'
  }

  function renderBookRolesDetail(book) {
    var roles = normalizeBookRoles(book.bookRoles)
    if (!roles.length) {
      return '<div class="bookstore-detail-roles-empty"><i class="fa-regular fa-user"></i><strong>暂无角色</strong><p>可以在编辑书籍信息中添加书内角色。</p></div>'
    }
    var roleMap = {}
    roles.forEach(function(role) { roleMap[role.id] = role })
    return '<div class="bookstore-detail-roles">' + roles.map(function(role) {
      var relations = (role.relations || []).filter(function(relation) {
        return roleMap[relation.targetRoleId] && relation.description
      })
      return '<article class="bookstore-detail-role">' +
        '<div class="bookstore-detail-role-head"><span>' + esc(role.name.charAt(0) || '角') + '</span><div><h3>' + esc(role.name) + '</h3><p class="' + (role.description ? '' : 'is-empty') + '">' + esc(role.description || '暂无角色介绍') + '</p></div></div>' +
        (relations.length ? '<div class="bookstore-detail-role-relations">' + relations.map(function(relation) {
          return '<div><strong>' + esc(roleMap[relation.targetRoleId].name) + '</strong><p>' + esc(relation.description) + '</p></div>'
        }).join('') + '</div>' : '<p class="bookstore-detail-role-no-relations">暂无角色关系</p>') +
      '</article>'
    }).join('') + '</div>'
  }

  function renderBookRolesEditor(book) {
    var roles = normalizeBookRoles(book.bookRoles)
    return '<section class="bookstore-edit-roles">' +
      '<div class="bookstore-edit-section-head"><div><strong>角色</strong></div><button type="button" data-add-book-role><i class="fa fa-plus"></i><span>添加角色</span></button></div>' +
      '<div class="bookstore-edit-role-list" data-book-role-list>' +
        (roles.length ? roles.map(function(role) { return renderBookRoleEditorCard(role, roles) }).join('') : '<div class="bookstore-edit-role-empty" data-book-role-empty>暂无角色</div>') +
      '</div>' +
    '</section>'
  }

  function renderBookRoleEditorCard(role, roles) {
    return '<article class="bookstore-edit-role-card" data-book-role-card data-role-id="' + esc(role.id) + '" data-role-name="' + esc(role.name) + '" data-role-description="' + esc(role.description || '') + '">' +
      '<div class="bookstore-edit-role-main">' +
        '<span class="bookstore-edit-role-avatar">' + esc(role.name.charAt(0) || '角') + '</span>' +
        '<div><h3>' + esc(role.name) + '</h3><p class="' + (role.description ? '' : 'is-empty') + '">' + esc(role.description || '暂无角色介绍') + '</p></div>' +
      '</div>' +
      '<div class="bookstore-edit-role-actions">' +
        '<button type="button" data-edit-book-role><i class="fa fa-pencil"></i><span>编辑</span></button>' +
        '<button type="button" data-add-book-role-relation><i class="fa fa-link"></i><span>关系</span></button>' +
        '<button type="button" data-delete-book-role><i class="fa fa-trash"></i><span>删除</span></button>' +
      '</div>' +
      '<div class="bookstore-edit-role-relations" data-book-role-relations>' + renderBookRoleRelationRows(role, roles) + '</div>' +
    '</article>'
  }

  function renderBookRoleRelationRows(role, roles) {
    var roleMap = {}
    roles.forEach(function(item) { roleMap[item.id] = item })
    var rows = (role.relations || []).filter(function(relation) {
      return roleMap[relation.targetRoleId] && relation.description
    })
    if (!rows.length) return '<div class="bookstore-edit-role-relation-empty" data-relation-empty>暂无关系</div>'
    return rows.map(function(relation) {
      return renderBookRoleRelationRow(roleMap[relation.targetRoleId], relation.description)
    }).join('')
  }

  function renderBookRoleRelationRow(targetRole, description) {
    return '<div class="bookstore-edit-role-relation" data-role-relation data-target-role-id="' + esc(targetRole.id) + '" data-relation-description="' + esc(description || '') + '">' +
      '<span>' + esc(targetRole.name) + '</span><p>' + esc(description || '') + '</p>' +
    '</div>'
  }

  function collectBookRolesFromEdit(form) {
    var cards = Array.from(form.querySelectorAll('[data-book-role-card]'))
    return normalizeBookRoles(cards.map(function(card) {
      return {
        id: card.dataset.roleId || makeBookRoleId(),
        name: card.dataset.roleName || '',
        description: card.dataset.roleDescription || '',
        relations: Array.from(card.querySelectorAll('[data-role-relation]')).map(function(row) {
          return {
            targetRoleId: row.dataset.targetRoleId || '',
            description: row.dataset.relationDescription || ''
          }
        })
      }
    }))
  }

  function getBookRoleEditorRoles(shell) {
    var form = shell.querySelector('[data-book-edit-form]')
    return form ? collectBookRolesFromEdit(form) : []
  }

  function refreshBookRoleEditor(shell, roles) {
    var list = shell.querySelector('[data-book-role-list]')
    if (!list) return
    var normalized = normalizeBookRoles(roles)
    list.innerHTML = normalized.length ? normalized.map(function(role) {
      return renderBookRoleEditorCard(role, normalized)
    }).join('') : '<div class="bookstore-edit-role-empty" data-book-role-empty>暂无角色</div>'
    bindBookRoleEditorEvents(shell)
  }

  function bindBookRoleEditorEvents(shell) {
    var addButton = shell.querySelector('[data-add-book-role]')
    if (addButton && !addButton.dataset.bound) {
      addButton.dataset.bound = 'true'
      addButton.addEventListener('click', function() { openBookRoleSourceDialog(shell) })
    }
    shell.querySelectorAll('[data-edit-book-role]').forEach(function(button) {
      if (button.dataset.bound) return
      button.dataset.bound = 'true'
      button.addEventListener('click', function() {
        openBookRoleDialog(shell, button.closest('[data-book-role-card]'))
      })
    })
    shell.querySelectorAll('[data-delete-book-role]').forEach(function(button) {
      if (button.dataset.bound) return
      button.dataset.bound = 'true'
      button.addEventListener('click', function() {
        var card = button.closest('[data-book-role-card]')
        if (!card) return
        var roleId = card.dataset.roleId
        var roles = getBookRoleEditorRoles(shell).filter(function(role) {
          return role.id !== roleId
        }).map(function(role) {
          role.relations = (role.relations || []).filter(function(relation) {
            return relation.targetRoleId !== roleId
          })
          return role
        })
        refreshBookRoleEditor(shell, roles)
      })
    })
    shell.querySelectorAll('[data-add-book-role-relation]').forEach(function(button) {
      if (button.dataset.bound) return
      button.dataset.bound = 'true'
      button.addEventListener('click', function() {
        openBookRoleRelationDialog(shell, button.closest('[data-book-role-card]'))
      })
    })
  }

  function openBookstoreEditDialog(html, onClose) {
    var page = document.getElementById('bookstore-page')
    if (!page) return null
    var layer = document.createElement('div')
    layer.className = 'bookstore-edit-dialog-layer'
    layer.innerHTML = '<button class="bookstore-edit-dialog-backdrop" type="button" data-dialog-close aria-label="关闭"></button>' +
      '<section class="bookstore-edit-dialog" role="dialog" aria-modal="true">' + html + '</section>'
    page.appendChild(layer)
    var close = function() {
      layer.remove()
      if (onClose) onClose()
    }
    layer.querySelectorAll('[data-dialog-close]').forEach(function(button) {
      button.addEventListener('click', close)
    })
    return { layer: layer, panel: layer.querySelector('.bookstore-edit-dialog'), close: close }
  }

  function openBookRoleSourceDialog(shell) {
    var dialog = openBookstoreEditDialog(
      '<div class="bookstore-edit-dialog-head"><h2>添加角色</h2><button type="button" data-dialog-close aria-label="关闭"><i class="fa fa-times"></i></button></div>' +
      '<div class="bookstore-role-source">' +
        '<button type="button" data-role-source-create><i class="fa fa-user-plus"></i><span><strong>创建角色</strong><small>手动填写书内角色介绍</small></span></button>' +
        '<button type="button" data-role-source-import><i class="fa fa-file-import"></i><span><strong>导入角色档案</strong><small>读取性别、身份和人物设定</small></span></button>' +
      '</div>'
    )
    if (!dialog) return
    dialog.panel.querySelector('[data-role-source-create]').addEventListener('click', function() {
      dialog.close()
      openBookRoleDialog(shell, null)
    })
    dialog.panel.querySelector('[data-role-source-import]').addEventListener('click', function() {
      dialog.close()
      openCharacterImportRoleDialog(shell)
    })
  }

  async function openCharacterImportRoleDialog(shell) {
    var chars = []
    try {
      chars = (await db.characters.toArray()).filter(function(char) { return char && char.type !== 'user' })
    } catch (error) {}
    if (!chars.length) {
      window.toast('暂无可导入角色档案')
      return
    }
    var dialog = openBookstoreEditDialog(
      '<div class="bookstore-edit-dialog-head"><h2>导入角色档案</h2><button type="button" data-dialog-close aria-label="关闭"><i class="fa fa-times"></i></button></div>' +
      '<div class="bookstore-character-import-list">' + chars.map(function(char) {
        return '<button type="button" data-import-character-role="' + esc(char.id) + '">' +
          '<span>' + esc((char.name || '?').charAt(0)) + '</span><div><strong>' + esc(char.name || '未命名') + '</strong><small>' + esc([char.gender, char.role, char.identity && char.identity.occupation].filter(Boolean).join(' · ') || '角色档案') + '</small></div>' +
        '</button>'
      }).join('') + '</div>'
    )
    if (!dialog) return
    dialog.panel.querySelectorAll('[data-import-character-role]').forEach(function(button) {
      button.addEventListener('click', async function() {
        var char = await db.characters.get(Number(button.dataset.importCharacterRole))
        if (!char) return
        var roles = getBookRoleEditorRoles(shell)
        roles.push({
          id: makeBookRoleId(),
          name: char.name || '未命名角色',
          description: characterProfileText(char),
          relations: []
        })
        refreshBookRoleEditor(shell, roles)
        dialog.close()
      })
    })
  }

  function characterProfileText(char) {
    if (!char) return ''
    var identity = char.identity || {}
    var identityLines = Object.keys(identity).filter(function(key) {
      return identity[key] && key !== 'password' && key !== 'bankPass'
    }).map(function(key) {
      return key + '：' + identity[key]
    })
    return [
      char.gender ? '性别：' + char.gender : '',
      char.role ? '身份：' + char.role : '',
      identityLines.length ? '身份信息：\n' + identityLines.join('\n') : '',
      char.description ? '人物设定：\n' + char.description : ''
    ].filter(Boolean).join('\n')
  }

  function openBookRoleDialog(shell, card) {
    var role = card ? {
      id: card.dataset.roleId,
      name: card.dataset.roleName || '',
      description: card.dataset.roleDescription || ''
    } : { id: makeBookRoleId(), name: '', description: '' }
    var dialog = openBookstoreEditDialog(
      '<form data-book-role-dialog-form>' +
        '<div class="bookstore-edit-dialog-head"><h2>' + (card ? '编辑角色' : '添加角色') + '</h2><button type="button" data-dialog-close aria-label="关闭"><i class="fa fa-times"></i></button></div>' +
        '<label class="bookstore-edit-field"><span>角色姓名</span><input type="text" data-dialog-role-name value="' + esc(role.name) + '" placeholder="角色姓名"></label>' +
        '<label class="bookstore-edit-field"><span>角色介绍</span><textarea data-dialog-role-description placeholder="描述角色设定、性格或出场信息">' + esc(role.description || '') + '</textarea></label>' +
        '<button class="bookstore-edit-dialog-save" type="submit">保存</button>' +
      '</form>'
    )
    if (!dialog) return
    var form = dialog.panel.querySelector('[data-book-role-dialog-form]')
    var nameInput = form.querySelector('[data-dialog-role-name]')
    nameInput.focus()
    form.addEventListener('submit', function(event) {
      event.preventDefault()
      var name = nameInput.value.trim()
      if (!name) {
        window.toast('请填写角色姓名')
        return
      }
      var roles = getBookRoleEditorRoles(shell)
      var description = form.querySelector('[data-dialog-role-description]').value.trim()
      if (card) {
        roles = roles.map(function(item) {
          if (item.id !== role.id) return item
          item.name = name
          item.description = description
          return item
        })
      } else {
        roles.push({ id: role.id, name: name, description: description, relations: [] })
      }
      refreshBookRoleEditor(shell, roles)
      dialog.close()
    })
  }

  function openBookRoleRelationDialog(shell, card) {
    if (!card) return
    var sourceRoleId = card.dataset.roleId
    var roles = getBookRoleEditorRoles(shell)
    var sourceRole = roles.find(function(role) { return role.id === sourceRoleId })
    if (!sourceRole) return
    var targets = roles.filter(function(role) { return role.id !== sourceRoleId })
    if (!targets.length) {
      window.toast('请先添加其他角色')
      return
    }
    var existingIds = {}
    ;(sourceRole.relations || []).forEach(function(relation) {
      if (relation.targetRoleId) existingIds[relation.targetRoleId] = true
    })
    var dialog = openBookstoreEditDialog(
      '<form data-book-role-relation-form>' +
        '<div class="bookstore-edit-dialog-head"><h2>添加关系</h2><button type="button" data-dialog-close aria-label="关闭"><i class="fa fa-times"></i></button></div>' +
        '<label class="bookstore-edit-field"><span>关联角色</span><select data-relation-target>' + targets.map(function(role) {
          return '<option value="' + esc(role.id) + '">' + esc(role.name) + (existingIds[role.id] ? '（更新已有关系）' : '') + '</option>'
        }).join('') + '</select></label>' +
        '<label class="bookstore-edit-field"><span>关系描述</span><textarea data-relation-description placeholder="描述 ' + esc(sourceRole.name) + ' 和对方的关系"></textarea></label>' +
        '<label class="bookstore-edit-reverse-check"><input type="checkbox" data-relation-reverse checked><span>添加反向关系</span></label>' +
        '<label class="bookstore-edit-field" data-reverse-field><span>反向关系描述</span><textarea data-reverse-description placeholder="对方视角的关系描述"></textarea></label>' +
        '<button class="bookstore-edit-dialog-save" type="submit">保存关系</button>' +
      '</form>'
    )
    if (!dialog) return
    var form = dialog.panel.querySelector('[data-book-role-relation-form]')
    var descInput = form.querySelector('[data-relation-description]')
    var reverseInput = form.querySelector('[data-reverse-description]')
    var reverseCheck = form.querySelector('[data-relation-reverse]')
    var reverseDirty = false
    descInput.addEventListener('input', function() {
      if (!reverseDirty) reverseInput.value = descInput.value
    })
    reverseInput.addEventListener('input', function() { reverseDirty = true })
    reverseCheck.addEventListener('change', function() {
      form.querySelector('[data-reverse-field]').style.display = reverseCheck.checked ? '' : 'none'
    })
    descInput.focus()
    form.addEventListener('submit', function(event) {
      event.preventDefault()
      var targetRoleId = form.querySelector('[data-relation-target]').value
      var description = descInput.value.trim()
      if (!targetRoleId || !description) {
        window.toast('请选择角色并填写关系描述')
        return
      }
      var nextRoles = getBookRoleEditorRoles(shell)
      upsertBookRoleRelation(nextRoles, sourceRoleId, targetRoleId, description)
      if (reverseCheck.checked) {
        upsertBookRoleRelation(nextRoles, targetRoleId, sourceRoleId, reverseInput.value.trim() || description)
      }
      refreshBookRoleEditor(shell, nextRoles)
      dialog.close()
    })
  }

  function upsertBookRoleRelation(roles, sourceRoleId, targetRoleId, description) {
    var source = roles.find(function(role) { return role.id === sourceRoleId })
    if (!source || !targetRoleId || !description) return
    source.relations = (source.relations || []).filter(function(relation) {
      return relation.targetRoleId !== targetRoleId
    })
    source.relations.push({ targetRoleId: targetRoleId, description: description })
  }

  function updateBookEditCoverPreview(shell, imageUrl) {
    var book = shell.querySelector('[data-create-work-form]') ? null : getBook(state.selectedBookId)
    if (!book) {
      var titleInput = shell.querySelector('[data-book-title]')
      var authorInput = shell.querySelector('[data-book-author]')
      book = { title: titleInput && titleInput.value || '新作品', author: authorInput && authorInput.value || 'Readen', coverColor: '#e8e4dc' }
    }
    var previewBook = Object.assign({}, book, { coverImage: imageUrl || '' })
    shell.querySelectorAll('.bookstore-edit-cover').forEach(function(cover) {
      var next = document.createElement('div')
      next.innerHTML = renderBookCover(previewBook, 'button', 'bookstore-edit-cover', 'type="button" data-pick-book-cover')
      var nextCover = next.firstChild
      nextCover.addEventListener('click', function() {
        var pickButton = shell.querySelector('.bookstore-edit-cover-row [data-pick-book-cover]:not(.bookstore-edit-cover)')
        if (pickButton) pickButton.click()
      })
      cover.replaceWith(nextCover)
    })
  }

  function renderReader() {
    var book = getBook(state.selectedBookId)
    if (!book) return '<div class="bookstore-empty">暂无可用书籍。</div>'
    var pages = cachedReaderPages(book)
    if (!pages.length) return '<div class="bookstore-empty">正在导入，请稍后…</div>'
    state.readerPageIndex = Math.max(0, Math.min(state.readerPageIndex, pages.length - 1))
    var now = new Date()
    var clock = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
    return '' +
      '<article class="bookstore-reader theme-' + esc(state.readerTheme) + (state.readerMenuOpen ? ' menu-open' : '') + '">' +
        '<div class="bookstore-reader-pages" data-reader-pages>' + pages.map(function(page, index) {
          var hydrated = Math.abs(index - state.readerPageIndex) <= PAGINATION_WINDOW
          return '<section class="bookstore-reader-page' + (page.isChapterStart ? ' is-chapter-start' : '') + '" data-reader-page="' + index + '" data-hydrated="' + (hydrated ? 'true' : 'false') + '">' + (hydrated ? readerPageContent(book, page) : '') + '</section>'
        }).join('') + '</div>' +
        '<div class="bookstore-reader-foot"><span>' + clock + '</span><span data-reader-page-count>' + (state.readerPageIndex + 1) + ' / ' + pages.length + '</span></div>' +
        renderReaderMenu(book, pages.length) +
      '</article>'
  }

  function readerLayout() {
    var page = document.getElementById('bookstore-page')
    return {
      width: Math.max(1, Math.round((page && page.clientWidth) || window.innerWidth || 375)),
      height: Math.max(1, Math.round((page && page.clientHeight) || window.innerHeight || 667))
    }
  }

  function paginationLayoutKey() {
    var layout = readerLayout()
    return layout.width + 'x' + layout.height
  }

  function hasValidPagination(book) {
    var pagination = book && book.pagination
    return !!(pagination && pagination.layoutKey === paginationLayoutKey() && Array.isArray(pagination.pages) && pagination.pages.length)
  }

  function cachedReaderPages(book) {
    return hasValidPagination(book) ? book.pagination.pages : []
  }

  function readerPageContent(book, page) {
    var chapter = book.chapters[page.chapterIndex]
    if (!chapter) return ''
    var body = String(chapter.body || '').slice(page.start, page.end)
    var paragraphs = body.split(/\n{2,}/).filter(Boolean)
    var bodyHtml = paragraphs.map(function(paragraph, index) {
      var classes = []
      if (index === 0 && page.startsMidParagraph) classes.push('is-continuation')
      if (index === paragraphs.length - 1 && page.endsMidParagraph) classes.push('continues-next')
      return '<p' + (classes.length ? ' class="' + classes.join(' ') + '"' : '') + '>' + esc(paragraph) + '</p>'
    }).join('')
    return '<small>' + esc(chapter.title) + '</small>' + (page.isChapterStart ? '<h2>' + esc(chapter.title) + '</h2>' : '') + '<div>' + bodyHtml + '</div>'
  }

  function hydrateReaderWindow(shell, book, centerIndex) {
    var pages = cachedReaderPages(book)
    if (!pages.length) return
    var min = Math.max(0, centerIndex - PAGINATION_WINDOW)
    var max = Math.min(pages.length - 1, centerIndex + PAGINATION_WINDOW)
    shell.querySelectorAll('[data-reader-page][data-hydrated="true"]').forEach(function(pageEl) {
      var index = parseInt(pageEl.dataset.readerPage, 10)
      if (index < min || index > max) {
        pageEl.innerHTML = ''
        pageEl.dataset.hydrated = 'false'
      }
    })
    for (var index = min; index <= max; index++) {
      var pageEl = shell.querySelector('[data-reader-page="' + index + '"]')
      if (pageEl && pageEl.dataset.hydrated !== 'true') {
        pageEl.innerHTML = readerPageContent(book, pages[index])
        pageEl.dataset.hydrated = 'true'
      }
    }
  }

  function paragraphSpans(text) {
    var spans = []
    var matcher = /\S(?:[\s\S]*?\S)?(?=\n{2,}|$)/g
    var match
    while ((match = matcher.exec(text))) spans.push({ start: match.index, end: match.index + match[0].length })
    return spans
  }

  function yieldPaginationWork() {
    return new Promise(function(resolve) { window.requestAnimationFrame(function() { resolve() }) })
  }

  async function buildBookPagination(book, onProgress) {
    var layout = readerLayout()
    var pages = []
    var bookstorePage = document.getElementById('bookstore-page')
    var measurePage = document.createElement('section')
    measurePage.className = 'bookstore-reader-page'
    measurePage.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;height:auto;min-width:0;overflow:visible;width:' + layout.width + 'px;'
    if (bookstorePage) measurePage.style.fontFamily = window.getComputedStyle(bookstorePage).fontFamily
    var measureLabel = document.createElement('small')
    var measureTitle = document.createElement('h2')
    var measureBody = document.createElement('div')
    measurePage.appendChild(measureLabel)
    measurePage.appendChild(measureTitle)
    measurePage.appendChild(measureBody)
    document.body.appendChild(measurePage)

    function resetMeasure(chapterTitle, isChapterStart) {
      measureLabel.textContent = chapterTitle
      measureTitle.textContent = chapterTitle
      measureTitle.style.display = isChapterStart ? '' : 'none'
      measureBody.innerHTML = ''
    }

    function fits() {
      return measurePage.scrollHeight <= layout.height - 4
    }

    var totalChapters = Math.max(1, book.chapters.length)
    try {
      for (var chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex++) {
        var chapter = book.chapters[chapterIndex]
        chapter.body = normalizeImportedText(chapter.body || chapter.content || '')
        var text = chapter.body
        var spans = paragraphSpans(text)
        var isFirstPage = true
        var pageStart = null
        var pageEnd = null
        var pageStartsMidParagraph = false
        resetMeasure(chapter.title, isFirstPage)

        function commitPage(start, end, startsMidParagraph, endsMidParagraph) {
          pages.push({
            chapterIndex: chapterIndex,
            start: start,
            end: end,
            isChapterStart: isFirstPage,
            startsMidParagraph: !!startsMidParagraph,
            endsMidParagraph: !!endsMidParagraph
          })
          isFirstPage = false
          resetMeasure(chapter.title, false)
        }

        for (var spanIndex = 0; spanIndex < spans.length; spanIndex++) {
          var span = spans[spanIndex]
          var cursor = span.start
          while (cursor < span.end) {
            var paragraph = document.createElement('p')
            if (cursor > span.start) paragraph.className = 'is-continuation'
            paragraph.textContent = text.slice(cursor, span.end)
            measureBody.appendChild(paragraph)
            if (fits()) {
              if (pageStart == null) {
                pageStart = cursor
                pageStartsMidParagraph = cursor > span.start
              }
              pageEnd = span.end
              cursor = span.end
              continue
            }
            paragraph.remove()
            measureBody.appendChild(paragraph)
            var low = 1
            var high = span.end - cursor
            var fitLength = 0
            while (low <= high) {
              var middle = Math.floor((low + high) / 2)
              paragraph.textContent = text.slice(cursor, cursor + middle)
              if (fits()) {
                fitLength = middle
                low = middle + 1
              } else {
                high = middle - 1
              }
            }
            paragraph.remove()

            if (fitLength > 0) {
              if (pageStart == null) {
                pageStart = cursor
                pageStartsMidParagraph = cursor > span.start
              }
              pageEnd = cursor + fitLength
              commitPage(pageStart, pageEnd, pageStartsMidParagraph, pageEnd < span.end)
              cursor = pageEnd
              pageStart = null
              pageEnd = null
              pageStartsMidParagraph = false
            } else if (pageStart != null) {
              commitPage(pageStart, pageEnd, pageStartsMidParagraph, false)
              pageStart = null
              pageEnd = null
              pageStartsMidParagraph = false
            } else {
              commitPage(cursor, cursor + 1, cursor > span.start, cursor + 1 < span.end)
              cursor += 1
            }
            if (pages.length % 12 === 0) await yieldPaginationWork()
          }
        }
        if (pageStart != null) commitPage(pageStart, pageEnd, pageStartsMidParagraph, false)
        if (!spans.length) commitPage(0, 0, false, false)
        if (onProgress) onProgress(Math.round((chapterIndex + 1) / totalChapters * 100))
        await yieldPaginationWork()
      }
    } finally {
      measurePage.remove()
    }
    book.pagination = {
      layoutKey: paginationLayoutKey(),
      pages: pages.length ? pages : [{ chapterIndex: 0, start: 0, end: 0, isChapterStart: true, startsMidParagraph: false, endsMidParagraph: false }]
    }
    return book.pagination.pages
  }

  function ensureBookPagination(book, onProgress) {
    if (hasValidPagination(book)) return Promise.resolve(book.pagination.pages)
    if (paginationJobs[book.id]) return paginationJobs[book.id]
    paginationJobs[book.id] = buildBookPagination(book, onProgress).then(function(pages) {
      saveImportedBooks()
      return pages
    }).finally(function() {
      delete paginationJobs[book.id]
    })
    return paginationJobs[book.id]
  }

  function firstPageForChapter(book, chapterIndex) {
    var pages = cachedReaderPages(book)
    for (var index = 0; index < pages.length; index++) if (pages[index].chapterIndex === chapterIndex) return index
    return 0
  }

  async function enterReader(book, chapterIndex, trigger) {
    if (!book) return
    var needsPagination = !hasValidPagination(book)
    if (trigger) trigger.disabled = true
    if (needsPagination) window.toast('正在排版《' + book.title + '》…')
    try {
      await ensureBookPagination(book)
      state.selectedBookId = book.id
      state.chapterIndex = Math.max(0, Number(chapterIndex) || 0)
      state.readerPageIndex = firstPageForChapter(book, state.chapterIndex)
      state.readerMenuOpen = false
      state.readerTocOpen = false
      markReadingPosition(book.id, state.chapterIndex)
      state.view = 'reader'
      render()
      scrollReaderToTop()
    } catch (error) {
      window.toast('排版失败：' + (error.message || '无法生成阅读页面'))
      if (trigger) trigger.disabled = false
    }
  }

  function schedulePaginationMigration() {
    var queue = BOOKS.filter(function(book) { return !hasValidPagination(book) })
    function next() {
      var book = queue.shift()
      if (!book) return
      ensureBookPagination(book).catch(function() {}).then(function() {
        if (window.requestIdleCallback) window.requestIdleCallback(next, { timeout: 1200 })
        else window.setTimeout(next, 80)
      })
    }
    if (window.requestIdleCallback) window.requestIdleCallback(next, { timeout: 1200 })
    else window.setTimeout(next, 250)
  }

  function renderReaderMenu(book, pageCount) {
    var progress = Math.round((state.readerPageIndex + 1) / Math.max(1, pageCount) * 100)
    var bookMinutes = Math.floor((Number(readingData.bookSeconds[book.id]) || 0) / 60)
    var chapterList = book.chapters.map(function(chapter, index) {
      var active = index === state.chapterIndex
      return '<button type="button" data-reader-chapter="' + index + '" class="' + (active ? 'active' : '') + '"' + (active ? ' aria-current="true"' : '') + '><span>' + esc(chapter.title) + '</span>' + (active ? '<i>当前</i>' : '') + '</button>'
    }).join('')
    return '<div class="bookstore-reader-menu' + (state.readerTocOpen ? ' toc-open' : '') + '" data-reader-menu>' +
      '<header><button type="button" data-reader-back aria-label="返回书架"><i class="fa-solid fa-arrow-left"></i></button><div><button type="button" data-reader-toast="书签已添加" aria-label="添加书签"><i class="fa-regular fa-bookmark"></i></button><button type="button" data-back-detail aria-label="更多"><i class="fa-solid fa-bars"></i></button></div></header>' +
      '<div class="bookstore-reader-float"><button type="button" data-reader-toast="智能助手待开发"><i class="fa-solid fa-wand-magic-sparkles"></i></button><button type="button" data-back-detail><i class="fa-solid fa-book-open"></i></button><button type="button" data-reader-toast="听书功能待开发"><i class="fa-solid fa-headphones"></i></button></div>' +
      '<div class="bookstore-reader-menu-bottom">' +
        '<section class="bookstore-reader-toc" role="dialog" aria-modal="false" aria-labelledby="bookstore-reader-toc-title">' +
          '<div class="bookstore-reader-toc-head"><strong id="bookstore-reader-toc-title">目录</strong><span>' + book.chapters.length + ' 章</span></div>' +
          '<div class="bookstore-reader-toc-list" data-reader-toc-list>' + chapterList + '</div>' +
        '</section>' +
        '<footer><div class="bookstore-reader-metrics"><div><strong>' + bookMinutes + ' min</strong><span>Time</span></div><div><strong data-reader-progress>' + progress + '%</strong><span>Progress</span></div><div><strong>0 notes</strong><span>Notes</span></div></div>' +
        '<div class="bookstore-reader-progress"><i style="width:' + progress + '%" data-reader-progress-bar></i></div>' +
        '<nav><button type="button" data-reader-toc aria-expanded="' + (state.readerTocOpen ? 'true' : 'false') + '">' + READER_TOC_SVG + '<span>目录</span></button><button type="button" data-reader-toast="笔记功能待开发">' + READER_NOTES_SVG + '<span>笔记</span></button><button type="button" data-reader-theme="' + (state.readerTheme === 'night' ? 'paper' : 'night') + '">' + (state.readerTheme === 'night' ? READER_DAY_SVG : READER_NIGHT_SVG) + '<span>' + (state.readerTheme === 'night' ? '日间' : '夜间') + '</span></button><button type="button" data-reader-toast="设置功能待开发">' + READER_SETTINGS_SVG + '<span>设置</span></button></nav></footer>' +
      '</div>' +
    '</div>'
  }

  function scrollReaderToTop() {
    var shell = document.querySelector('#bookstore-page #bookstore-shell')
    if (shell) shell.scrollTop = 0
  }

  function renderAuthor() {
    return '' +
      '<section class="bookstore-author-profile" aria-labelledby="bookstore-author-title">' +
        '<h1 id="bookstore-author-title">作者资料</h1>' +
        '<div class="bookstore-author-identity">' +
          '<span class="bookstore-author-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></span>' +
          '<strong>Readen</strong>' +
        '</div>' +
        '<div class="bookstore-author-shortcuts">' +
          renderAuthorShortcut('system-notifications', 'fa-bell', '系统通知', '暂无通知') +
          renderAuthorShortcut('notes', 'fa-note-sticky', '笔记', '0 条笔记') +
        '</div>' +
        renderAuthorMenuGroup('数据', [
          ['reading-progress', 'fa-chart-line', '阅读进度'],
          ['tag-management', 'fa-tags', '标签管理']
        ]) +
        renderAuthorMenuGroup('工具', [
          ['text-to-speech', 'fa-headphones', '文本转语音'],
          ['translation', 'fa-language', '翻译'],
          ['writing-style-preset', 'fa-pen-fancy', '文风预设']
        ]) +
        renderAuthorMenuGroup('写作', [
          ['create-work', 'fa-pen-nib', '创建作品'],
          ['create-chapter', 'fa-feather-pointed', '创建章节'],
          ['edit-history', 'fa-clock-rotate-left', '修改历史作品']
        ]) +
      '</section>' +
      ''
  }

  function renderAuthorShortcut(action, icon, label, detail) {
    return '<button class="bookstore-author-shortcut" type="button" data-author-action="' + action + '">' +
      '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' +
      '<span><strong>' + label + '</strong><small>' + detail + '</small></span>' +
    '</button>'
  }

  function renderAuthorMenuGroup(title, items) {
    return '<section class="bookstore-author-group">' +
      '<h2>' + title + '</h2>' +
      '<div class="bookstore-author-menu">' + items.map(function(item) {
        return '<button type="button" data-author-action="' + item[0] + '">' +
          '<i class="fa-solid ' + item[1] + '" aria-hidden="true"></i>' +
          '<span>' + item[2] + '</span>' +
          '<i class="fa-solid fa-angle-right bookstore-author-chevron" aria-hidden="true"></i>' +
        '</button>'
      }).join('') + '</div>' +
    '</section>'
  }

  function renderAuthorSubHead(title, backView) {
    return '<div class="bookstore-author-subhead">' +
      '<button type="button" data-author-back="' + esc(backView || 'author') + '" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
      '<h1>' + esc(title) + '</h1>' +
    '</div>'
  }

  function renderWritingStyles() {
    var styles = ensureWritingStyles()
    return '<section class="bookstore-author-tool">' +
      renderAuthorSubHead('文风预设') +
      '<div class="bookstore-style-list">' + styles.map(function(style) {
        return '<article class="bookstore-style-card" data-style-id="' + esc(style.id) + '">' +
          '<div><h2>' + esc(style.title) + '</h2><p>' + esc(writingStyleTag(style)) + '</p></div>' +
          '<button type="button" data-delete-writing-style="' + esc(style.id) + '" aria-label="删除"><i class="fa fa-trash"></i></button>' +
        '</article>'
      }).join('') + '</div>' +
      '<form class="bookstore-author-form" data-writing-style-form>' +
        '<label class="bookstore-edit-field"><span>标题</span><input type="text" data-style-title placeholder="如：冷峻悬疑"></label>' +
        '<label class="bookstore-edit-field"><span>文风描述</span><textarea data-style-description placeholder="填写文风规则、节奏、避免事项等"></textarea></label>' +
        '<button class="bookstore-primary-action" type="submit"><i class="fa fa-plus"></i><span>添加文风</span></button>' +
      '</form>' +
    '</section>'
  }

  function renderCreateWork() {
    return '<section class="bookstore-author-tool">' +
      renderAuthorSubHead('创建作品') +
      '<form class="bookstore-book-edit" data-create-work-form>' +
        '<div class="bookstore-edit-cover-row">' +
          renderBookCover({ title: '新作品', author: 'Readen', coverColor: '#e8e4dc' }, 'button', 'bookstore-edit-cover', 'type="button" data-pick-book-cover') +
          '<div><button type="button" data-pick-book-cover><i class="fa fa-image"></i><span>选择封面</span></button><button type="button" data-clear-book-cover><i class="fa fa-rotate-left"></i><span>默认封面</span></button></div>' +
        '</div>' +
        '<input type="hidden" data-book-cover-value value="">' +
        '<label class="bookstore-edit-field"><span>书名</span><input type="text" data-book-title placeholder="书名"></label>' +
        '<label class="bookstore-edit-field"><span>作者</span><input type="text" data-book-author placeholder="作者"></label>' +
        '<label class="bookstore-edit-field"><span>分类</span><input type="text" data-book-category placeholder="分类"></label>' +
        '<label class="bookstore-edit-field"><span>内容介绍</span><textarea data-book-intro placeholder="介绍这本作品"></textarea></label>' +
        '<label class="bookstore-edit-field"><span>标签</span><textarea data-book-tags placeholder="用逗号、顿号、空格或换行分隔多个标签"></textarea></label>' +
        renderBookRolesEditor({ bookRoles: [] }) +
        '<button class="bookstore-primary-action" type="submit"><i class="fa fa-floppy-disk"></i><span>保存作品</span></button>' +
      '</form>' +
    '</section>'
  }

  function renderCreateChapter() {
    var styles = ensureWritingStyles()
    var books = BOOKS.filter(function(book) { return book && book.id })
    var draft = state.chapterDraft || {}
    var bookId = draft.bookId || (books[0] && books[0].id) || ''
    var styleId = draft.styleId || (styles[0] && styles[0].id) || ''
    return '<section class="bookstore-author-tool">' +
      renderAuthorSubHead('创建章节') +
      '<form class="bookstore-author-form" data-create-chapter-form>' +
        '<label class="bookstore-edit-field"><span>作品</span><select data-chapter-book>' + books.map(function(book) {
          return '<option value="' + esc(book.id) + '"' + (book.id === bookId ? ' selected' : '') + '>' + esc(book.title) + '</option>'
        }).join('') + '</select></label>' +
        '<label class="bookstore-edit-field"><span>文风</span><select data-chapter-style>' + styles.map(function(style) {
          return '<option value="' + esc(style.id) + '"' + (style.id === styleId ? ' selected' : '') + '>' + esc(style.title) + '</option>'
        }).join('') + '</select></label>' +
        '<div class="bookstore-range-row"><label class="bookstore-edit-field"><span>章节数下限</span><input type="number" min="1" max="200" data-count-min value="' + esc(draft.countMin || 3) + '"></label><label class="bookstore-edit-field"><span>章节数上限</span><input type="number" min="1" max="200" data-count-max value="' + esc(draft.countMax || 5) + '"></label></div>' +
        '<div class="bookstore-range-row"><label class="bookstore-edit-field"><span>单章字数下限</span><input type="number" min="100" step="100" data-word-min value="' + esc(draft.wordMin || 4500) + '"></label><label class="bookstore-edit-field"><span>单章字数上限</span><input type="number" min="100" step="100" data-word-max value="' + esc(draft.wordMax || 6500) + '"></label></div>' +
        '<label class="bookstore-edit-field"><span>故事情节</span><textarea data-story-outline placeholder="填写故事走向，或点击自动生成">' + esc(draft.storyOutline || '') + '</textarea></label>' +
        '<label class="bookstore-edit-field"><span>用户补充</span><textarea data-user-direction placeholder="补充想要的发展、禁忌或重点">' + esc(draft.userDirection || '') + '</textarea></label>' +
        '<div class="bookstore-action-row"><button type="button" data-generate-story-outline><i class="fa fa-wand-magic-sparkles"></i><span>生成故事情节</span></button><button type="submit"><i class="fa fa-arrow-right"></i><span>进入章节规划</span></button></div>' +
      '</form>' +
    '</section>'
  }

  function renderChapterPlan() {
    var draft = state.chapterDraft || {}
    if (!draft.bookId) return '<section class="bookstore-author-tool">' + renderAuthorSubHead('章节规划') + '<div class="bookstore-empty">请先选择作品并生成故事情节。</div></section>'
    var plans = ensureDraftChapterPlans(draft)
    return '<section class="bookstore-author-tool">' +
      renderAuthorSubHead('章节规划', 'create-chapter') +
      '<form class="bookstore-author-form" data-chapter-plan-form>' +
        '<label class="bookstore-edit-field"><span>整体故事走向</span><textarea data-plan-story readonly>' + esc(draft.storyOutline || '') + '</textarea></label>' +
        '<div class="bookstore-chapter-plan-head"><strong>章节 Prompt</strong><span>' + plans.length + ' / ' + draft.countMax + '</span></div>' +
        '<div class="bookstore-chapter-plan-list" data-chapter-plan-list>' + renderChapterPlanCards(plans, draft) + '</div>' +
        '<label class="bookstore-edit-field"><span>原文直注上限</span><input type="number" min="1000" step="500" data-raw-context-limit value="' + esc(draft.rawContextLimit || DEFAULT_RAW_CONTEXT_LIMIT) + '"></label>' +
        '<div class="bookstore-action-row"><button type="button" data-generate-chapter-plan><i class="fa fa-list-check"></i><span>自动生成章节规划</span></button><button type="button" data-add-chapter-plan' + (plans.length >= draft.countMax ? ' disabled' : '') + '><i class="fa fa-plus"></i><span>添加章节</span></button></div>' +
        '<button class="bookstore-primary-action" type="submit"><i class="fa fa-feather-pointed"></i><span>编写小说</span></button>' +
      '</form>' +
    '</section>'
  }

  function renderEditHistory() {
    var authored = BOOKS.filter(function(book) { return book.channel === 'created' || book.createdByReaden })
    return '<section class="bookstore-author-tool">' +
      renderAuthorSubHead('修改历史作品') +
      (authored.length ? '<div class="bookstore-history-list">' + authored.map(function(book) {
        return '<button type="button" data-open-book="' + esc(book.id) + '"><strong>' + esc(book.title) + '</strong><span>' + esc(book.chapters.length) + ' 章 · ' + esc(formatWordCount(book)) + '字</span></button>'
      }).join('') + '</div>' : '<div class="bookstore-empty">暂无创作作品。</div>') +
    '</section>'
  }

  function writingStyleTag(style) {
    if (!style) return ''
    return '<writing_style:' + style.title + '>\n' + style.description + '\n</writing_style:' + style.title + '>'
  }

  function selectedWritingStyle(id) {
    return ensureWritingStyles().find(function(style) { return style.id === id }) || ensureWritingStyles()[0]
  }

  function characterRelationText(book) {
    var roles = normalizeBookRoles(book && book.bookRoles)
    if (!roles.length) return '无'
    var roleMap = {}
    roles.forEach(function(role) { roleMap[role.id] = role })
    var blocks = roles.map(function(role) {
      var text = '【' + role.name + '】\n' + (role.description || '暂无人物设定')
      var relations = (role.relations || []).filter(function(relation) {
        return roleMap[relation.targetRoleId] && relation.description
      })
      if (relations.length) {
        text += '\n关系：\n' + relations.map(function(relation) {
          return '- 与' + roleMap[relation.targetRoleId].name + '：' + relation.description
        }).join('\n')
      }
      return text
    })
    return blocks.join('\n\n')
  }

  function chapterRangeText(draft) {
    return (draft.countMin || 1) + '-' + (draft.countMax || draft.countMin || 1) + '章，每章' + (draft.wordMin || 1000) + '-' + (draft.wordMax || draft.wordMin || 1000) + '字'
  }

  function getDraftFromCreateChapterForm(form) {
    return {
      bookId: form.querySelector('[data-chapter-book]').value,
      styleId: form.querySelector('[data-chapter-style]').value,
      countMin: Math.max(1, parseInt(form.querySelector('[data-count-min]').value, 10) || 1),
      countMax: Math.max(1, parseInt(form.querySelector('[data-count-max]').value, 10) || 1),
      wordMin: Math.max(100, parseInt(form.querySelector('[data-word-min]').value, 10) || 1000),
      wordMax: Math.max(100, parseInt(form.querySelector('[data-word-max]').value, 10) || 1000),
      storyOutline: form.querySelector('[data-story-outline]').value.trim(),
      userDirection: form.querySelector('[data-user-direction]').value.trim()
    }
  }

  function normalizeDraftRanges(draft) {
    if (draft.countMin > draft.countMax) {
      var count = draft.countMin
      draft.countMin = draft.countMax
      draft.countMax = count
    }
    if (draft.wordMin > draft.wordMax) {
      var words = draft.wordMin
      draft.wordMin = draft.wordMax
      draft.wordMax = words
    }
    return draft
  }

  function blankChapterPlan(index, draft) {
    return '第' + (index + 1) + '章\n- 承接：\n- 本章核心事件：\n- 出场角色：\n- 结尾钩子：\n- 字数目标：' + (draft.wordMin || 4500) + '-' + (draft.wordMax || 6500) + '字'
  }

  function ensureDraftChapterPlans(draft) {
    var min = Math.max(1, Number(draft.countMin) || 1)
    var max = Math.max(min, Number(draft.countMax) || min)
    var plans = Array.isArray(draft.chapterPlans) ? draft.chapterPlans.slice(0, max) : parseChapterPlanOutput(draft.chapterPlan || '', draft).slice(0, max)
    while (plans.length < min) plans.push(blankChapterPlan(plans.length, draft))
    draft.chapterPlans = plans
    return plans
  }

  function renderChapterPlanCards(plans, draft) {
    var min = Math.max(1, Number(draft.countMin) || 1)
    return plans.map(function(plan, index) {
      return '<article class="bookstore-chapter-plan-card" data-chapter-plan-card>' +
        '<div class="bookstore-chapter-plan-card-head"><strong>第 ' + (index + 1) + ' 章</strong>' +
          (plans.length > min ? '<button type="button" data-remove-chapter-plan="' + index + '" aria-label="删除章节"><i class="fa fa-trash"></i></button>' : '') +
        '</div>' +
        '<textarea data-chapter-plan-prompt placeholder="填写本章 prompt">' + esc(plan) + '</textarea>' +
      '</article>'
    }).join('')
  }

  function collectChapterPlanPrompts(form) {
    return Array.from(form.querySelectorAll('[data-chapter-plan-prompt]')).map(function(textarea, index) {
      return textarea.value.trim() || blankChapterPlan(index, state.chapterDraft || {})
    })
  }

  function buildStoryOutlinePrompt(book, draft) {
    return '<role>\n你是小说策划助手。\n</role>\n\n<task>\n根据用户给出的书籍信息、内容介绍、绑定角色和角色关系描述，生成可用于后续分章写作的故事走向。\n</task>\n\n<rules>\n1. 只输出中文。\n2. 不要替用户新增未出现的核心角色，除非剧情发展确有必要；若新增，须说明理由。\n3. 必须严格尊重角色档案中的人物设定和关系描述；冲突时优先调整剧情，而非违背角色设定。\n4. 剧情走向应符合分类与标签所代表的题材惯例。\n5. 故事走向需包含开端、推进、转折、高潮、收束，并大致对应目标篇幅。\n6. 不要写成正文，只写创作规划；不涉及具体文风，文风将在后续阶段单独应用。\n</rules>\n\n<input>\n- 书名：' + (book.title || '') + '\n- 作者：' + (book.author || '') + '\n- 分类：' + (book.category || '') + '\n- 标签：' + bookUserTags(book.tags).join('、') + '\n- 内容介绍：' + (book.intro || '') + '\n- 绑定角色：' + characterRelationText(book) + '\n- 目标篇幅：' + chapterRangeText(draft) + '\n- 用户补充：' + (draft.userDirection || '无') + '\n</input>\n\n<output_format>\n【故事核心】...\n【主要矛盾】...\n【剧情走向】\n1. ... \n2. ... \n3. ...（按目标篇幅给出节点数量及对应章节范围）\n【结尾方向】...\n【备注】（新增角色说明或"无"）\n</output_format>'
  }

  function buildChapterPlanPrompt(book, draft) {
    return '<role>\n你是小说分章策划助手。\n</role>\n\n<task>\n根据已生成的整体故事走向（剧情核心、主要矛盾、剧情走向、结尾方向），结合用户指定的章节数量范围与单章字数范围，将故事拆解为逐章的写作蓝图，供后续逐章写正文时使用。\n</task>\n\n<rules>\n1. 只输出中文。\n2. 章节总数必须落在用户给定的范围内；每章字数目标必须落在用户给定的范围内，且各章字数目标总和应大致匹配整体篇幅预期。\n3. 每一章必须明确：本章承接上一章的什么状态、本章核心事件、本章结尾悬念或情绪落点（钩子），确保章与章之间衔接不断裂。\n4. 严格遵守已确定的角色设定与关系，不得提前透支本应在后续转折/高潮章节才揭示的信息。\n5. 开端、推进、转折、高潮、收束五个阶段必须能映射到具体章节区间，不能模糊带过。\n6. 不写正文，只写章节蓝图；不涉及具体文风。\n</rules>\n\n<input>\n- 整体故事走向：' + (draft.storyOutline || '') + '\n- 绑定角色与关系：' + characterRelationText(book) + '\n- 章节数量范围：' + draft.countMin + '-' + draft.countMax + '章\n- 单章字数范围：' + draft.wordMin + '-' + draft.wordMax + '字\n- 用户补充：' + (draft.userDirection || '无') + '\n</input>\n\n<output_format>\n优先输出 JSON 数组，不要使用 Markdown 代码块，不要输出解释文字。\n\n[\n  {\n    "chapter_number": 1,\n    "continuity": "开篇，无上一章状态",\n    "core_event": "...",\n    "characters": ["角色A", "角色B"],\n    "hook": "...",\n    "word_target": "' + draft.wordMin + '-' + draft.wordMax + '字",\n    "prompt": "第1章\\n- 承接：...\\n- 本章核心事件：...\\n- 出场角色：角色A、角色B\\n- 结尾钩子：...\\n- 字数目标：' + draft.wordMin + '-' + draft.wordMax + '字"\n  }\n]\n\n如果无法输出 JSON，则输出 Markdown，每章必须以“第X章”或“第 X 章”开头。\n</output_format>'
  }

  function buildSummaryPrompt(previousSummary, newText, prevEnd, start, end) {
    return '<role>\n你是小说剧情总结助手。\n</role>\n\n<task>\n将"已有剧情总结"与"新增章节原文"合并，生成更新后的剧情总结，用于后续章节写作时的上下文记忆，替代原始正文进行注入。\n</task>\n\n<rules>\n1. 只输出中文。\n2. 必须保留：当前各角色的状态/位置/情绪走向、未解决的悬念与矛盾、角色之间关系的最新变化、对后续剧情有影响的关键事件细节。\n3. 可以压缩或省略：环境描写、心理活动的细节展开、与后续无关的过场对话。\n4. 如果"已有剧情总结"长度已经较长，本次需在合并基础上进一步精简旧内容的表达，但不能删除规则2中要求保留的信息点。\n5. 不写成正文，只写信息密度高的总结性文字。\n6. 不要输出与总结无关的说明文字。\n</rules>\n\n<input>\n- 已有剧情总结（覆盖第1章-第' + prevEnd + '章，可能为空）：' + (previousSummary || '') + '\n- 新增章节原文（第' + start + '章-第' + end + '章）：' + newText + '\n</input>\n\n<output_format>\n（直接输出合并后的新总结正文，不加标题、不加章节列表）\n</output_format>'
  }

  function buildChapterBodyPrompt(book, draft, chapterPlan, previousContext) {
    return '<role>\n你是小说正文写作助手，需要严格按照指定文风进行创作。\n</role>\n\n<task>\n根据本章写作蓝图、角色档案、上一章结尾状态，以指定文风写出本章正文。\n</task>\n\n<rules>\n1. 严格套用{{writing_style}}标签中的文风规则（句式节奏、感官选择、潜台词处理、避免事项等），不得混用其他文风习惯。\n2. 字数需落在{{chapter_word_range_single}}范围内。\n3. 必须承接"上一章结尾状态"，不能与上一章内容矛盾或重复已写过的信息。\n4. 必须完成本章蓝图中规定的核心事件，并在结尾落到指定的钩子上；不得提前写出后续章节才该揭示的剧情。\n5. 角色言行必须符合角色档案中的人物设定与关系逻辑，不得擅自改变人物性格基调。\n6. 只输出正文本身，不要输出蓝图复述、不要输出说明性文字、不要加章节以外的旁注。\n</rules>\n\n<input>\n- 文风：' + writingStyleTag(selectedWritingStyle(draft.styleId)) + '\n- 本章蓝图：' + chapterPlan + '\n- 上一章结尾状态摘要：' + (previousContext || '无，当前为开篇。') + '\n- 角色档案（含出场角色的性别、身份、人物设定）：' + characterRelationText(book) + '\n- 角色关系：' + characterRelationText(book) + '\n- 单章字数范围：' + draft.wordMin + '-' + draft.wordMax + '字\n</input>\n\n<output_format>\n（直接输出本章正文，不加任何标题前缀或说明）\n</output_format>'
  }

  async function callBookstoreAI(prompt) {
    if (typeof window.callAI !== 'function') throw new Error('请先在设置里配置 API')
    var text = await window.callAI([{ role: 'user', content: prompt }], { temperature: await window.getAITemperaturePreset('readenNovel') })
    text = String(text || '').trim()
    if (!text) throw new Error('AI 返回为空')
    return text
  }

  function normalizeChapterPlans(plans, draft) {
    var min = Math.max(1, Number(draft.countMin) || 1)
    var max = Math.max(min, Number(draft.countMax) || min)
    var normalized = (Array.isArray(plans) ? plans : []).map(function(plan) {
      return String(plan || '').trim()
    }).filter(Boolean).slice(0, max)
    while (normalized.length < min) normalized.push(blankChapterPlan(normalized.length, draft))
    return normalized
  }

  function stripPlanCodeFence(text) {
    var raw = String(text || '').trim()
    var fence = raw.match(/^```(?:json|JSON|text|markdown)?\s*([\s\S]*?)\s*```$/)
    return fence ? fence[1].trim() : raw
  }

  function tryParseChapterPlanJson(text) {
    var clean = stripPlanCodeFence(text)
    var candidates = [clean]
    var arrayStart = clean.indexOf('[')
    var arrayEnd = clean.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(clean.slice(arrayStart, arrayEnd + 1))
    var objectStart = clean.indexOf('{')
    var objectEnd = clean.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(clean.slice(objectStart, objectEnd + 1))
    for (var i = 0; i < candidates.length; i++) {
      try {
        return JSON.parse(candidates[i])
      } catch (error) {}
    }
    return null
  }

  function chapterObjectToPrompt(item, index, draft) {
    if (!item || typeof item !== 'object') return ''
    var prompt = String(item.prompt || '').trim()
    if (prompt) return prompt
    var number = item.chapter_number || item.chapterNumber || (index + 1)
    var characters = Array.isArray(item.characters) ? item.characters.join('、') : String(item.characters || '')
    var wordTarget = item.word_target || item.wordTarget || ((draft.wordMin || 4500) + '-' + (draft.wordMax || 6500) + '字')
    return '第' + number + '章\n' +
      '- 承接：' + String(item.continuity || '') + '\n' +
      '- 本章核心事件：' + String(item.core_event || item.coreEvent || '') + '\n' +
      '- 出场角色：' + characters + '\n' +
      '- 结尾钩子：' + String(item.hook || '') + '\n' +
      '- 字数目标：' + String(wordTarget || '')
  }

  function jsonChapterPlans(raw, draft) {
    var data = tryParseChapterPlanJson(raw)
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.chapters) ? data.chapters : null)
    if (!list) return []
    return list.map(function(item, index) {
      if (typeof item === 'string') return item.trim()
      return chapterObjectToPrompt(item, index, draft)
    }).filter(Boolean)
  }

  function markdownChapterPlans(planText) {
    var text = stripPlanCodeFence(planText)
    var matches = Array.from(text.matchAll(/(?:^|\n)\s*(?:#{1,6}\s*)?(第\s*[0-9０-９零〇一二两三四五六七八九十百千万]+\s*章[\s\S]*?)(?=\n\s*(?:#{1,6}\s*)?第\s*[0-9０-９零〇一二两三四五六七八九十百千万]+\s*章|$)/g))
    return matches.map(function(match) { return match[1].trim() }).filter(Boolean)
  }

  function parseChapterPlanOutput(raw, draft) {
    var text = String(raw || '').trim()
    var plans = jsonChapterPlans(text, draft)
    if (!plans.length) plans = markdownChapterPlans(text)
    if (!plans.length && text) plans = [text]
    return normalizeChapterPlans(plans, draft)
  }

  function extractChapterPlans(planText, fallbackCount) {
    var plans = markdownChapterPlans(planText)
    if (plans.length) return plans
    var count = Math.max(1, fallbackCount || 1)
    return Array.from({ length: count }).map(function(_, index) {
      return '第' + (index + 1) + '章\n- 承接：按照整体故事走向推进\n- 本章核心事件：完成本章节点\n- 出场角色：按剧情需要\n- 结尾钩子：留下下一章衔接点\n- 字数目标：按用户范围'
    })
  }

  function chapterTitleFromPlan(plan, index) {
    var first = String(plan || '').split('\n')[0].trim()
    return first && /^第/.test(first) ? first : '第' + (index + 1) + '章'
  }

  async function previousChapterContext(book, nextChapterIndex, rawLimit) {
    var summary = book.plot_summary || { summary_text: '', covered_end: 0, covered_range: '' }
    var coveredEnd = Math.max(0, Number(summary.covered_end) || parseCoveredEnd(summary.covered_range))
    var startIndex = coveredEnd
    var existing = (book.chapters || []).slice(startIndex, nextChapterIndex)
    var raw = existing.map(function(chapter, index) {
      return '第' + (startIndex + index + 1) + '章 ' + (chapter.title || '') + '\n' + (chapter.body || '')
    }).join('\n\n')
    if (raw.length <= rawLimit) return [summary.summary_text || '', raw].filter(Boolean).join('\n\n')
    var newSummary = await callBookstoreAI(buildSummaryPrompt(summary.summary_text || '', raw, coveredEnd, startIndex + 1, nextChapterIndex))
    if (newSummary.length > DEFAULT_SUMMARY_LIMIT) {
      newSummary = await callBookstoreAI(buildSummaryPrompt('', newSummary, 0, 1, nextChapterIndex))
    }
    book.plot_summary = {
      summary_text: newSummary,
      covered_range: '第1章-第' + nextChapterIndex + '章',
      covered_end: nextChapterIndex,
      updated_at: Date.now()
    }
    saveImportedBooks()
    return newSummary
  }

  function parseCoveredEnd(range) {
    var match = String(range || '').match(/第\s*([0-9]+)\s*章\s*$/)
    return match ? Number(match[1]) || 0 : 0
  }

  async function withButtonBusy(btn, label, task) {
    var oldHtml = btn ? btn.innerHTML : ''
    if (btn) {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i><span>' + esc(label || '处理中…') + '</span>'
    }
    try {
      return await task()
    } catch (error) {
      window.toast('生成失败：' + (error.message || error))
      throw error
    } finally {
      if (btn) {
        btn.disabled = false
        btn.innerHTML = oldHtml
      }
    }
  }

  async function writeNovelChapters(draft) {
    var book = getBook(draft.bookId)
    if (!book) throw new Error('作品不存在')
    var plans = Array.isArray(draft.chapterPlans) && draft.chapterPlans.length
      ? draft.chapterPlans.slice(0, draft.countMax)
      : extractChapterPlans(draft.chapterPlan, draft.countMin).slice(0, draft.countMax)
    while (plans.length < draft.countMin) plans.push(blankChapterPlan(plans.length, draft))
    var startLength = book.chapters.length
    for (var index = 0; index < plans.length; index++) {
      window.toast('正在编写第 ' + (index + 1) + ' / ' + plans.length + ' 章')
      var nextChapterIndex = book.chapters.length
      var previousContext = await previousChapterContext(book, nextChapterIndex, draft.rawContextLimit || DEFAULT_RAW_CONTEXT_LIMIT)
      var body = await callBookstoreAI(buildChapterBodyPrompt(book, draft, plans[index], previousContext))
      book.chapters.push({
        title: chapterTitleFromPlan(plans[index], startLength + index),
        body: normalizeImportedParagraphs(body)
      })
      book.words = book.chapters.map(function(chapter) { return chapter.body || '' }).join('').length + ' 字'
      book.fileSize = book.chapters.map(function(chapter) { return (chapter.title || '') + (chapter.body || '') }).join('\n').length
      book.status = '创作中'
      book.updatedAt = Date.now()
      delete book.pagination
      saveImportedBooks()
    }
    await buildBookPagination(book)
    saveImportedBooks()
    state.chapterDraft = null
    state.selectedBookId = book.id
    state.detailTab = 'toc'
    state.view = 'detail'
    render()
    window.toast('章节已写入《' + book.title + '》')
  }

  function removeImportedBook(book) {
    if (!book) return
    BOOKS = BOOKS.filter(function(item) { return item.id !== book.id })
    delete readingData.bookSeconds[book.id]
    delete readingData.readBooks[book.id]
    saveImportedBooks()
    saveReadingData()
    render()
    window.toast('已从书架删除')
  }

  function closeShelfBookMenu() {
    var layer = document.querySelector('#bookstore-page .bookstore-shelf-menu-layer')
    if (layer) layer.remove()
  }

  function openRemoveBookDialog(book) {
    var page = document.getElementById('bookstore-page')
    if (!page || !book) return
    var existing = page.querySelector('.bookstore-remove-dialog-layer')
    if (existing) existing.remove()
    var layer = document.createElement('div')
    layer.className = 'bookstore-remove-dialog-layer'
    layer.innerHTML = '<button class="bookstore-remove-dialog-backdrop" type="button" data-remove-cancel aria-label="取消删除"></button>' +
      '<section class="bookstore-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="bookstore-remove-title">' +
        '<h2 id="bookstore-remove-title">移除书籍</h2>' +
        '<p>确定要移除《' + esc(book.title) + '》吗？</p>' +
        '<div><button type="button" class="secondary" data-remove-cancel>取消</button><button type="button" class="danger" data-remove-confirm>移除</button></div>' +
      '</section>'
    page.appendChild(layer)
    window.requestAnimationFrame(function() { layer.classList.add('show') })
    layer.querySelectorAll('[data-remove-cancel]').forEach(function(button) {
      button.addEventListener('click', function() { layer.remove() })
    })
    layer.querySelector('[data-remove-confirm]').addEventListener('click', function() {
      layer.remove()
      removeImportedBook(book)
    })
  }

  function openShelfBookMenu(book, trigger) {
    var page = document.getElementById('bookstore-page')
    if (!page || !book || !trigger) return
    closeShelfBookMenu()
    var layer = document.createElement('div')
    layer.className = 'bookstore-shelf-menu-layer'
    layer.innerHTML = '<button class="bookstore-shelf-menu-backdrop" type="button" data-book-menu-close aria-label="关闭菜单"></button>' +
      '<div class="bookstore-shelf-book-menu" role="menu" aria-label="' + esc(book.title) + '操作">' +
        '<div class="bookstore-shelf-menu-group">' +
          '<button type="button" role="menuitem" data-book-info><i class="fa-solid fa-circle-info"></i><span>信息</span></button>' +
          '<button type="button" role="menuitem" data-book-menu-placeholder><i class="fa-solid fa-thumbtack"></i><span>置顶</span></button>' +
          '<button type="button" role="menuitem" data-book-menu-placeholder><i class="fa-solid fa-hashtag"></i><span>标签</span></button>' +
          '<button type="button" role="menuitem" data-book-menu-placeholder><i class="fa-solid fa-share-nodes"></i><span>分享</span></button>' +
        '</div>' +
        '<div class="bookstore-shelf-menu-group danger"><button type="button" role="menuitem" data-book-remove><i class="fa-regular fa-trash-can"></i><span>移除</span></button></div>' +
      '</div>'
    page.appendChild(layer)
    var panel = layer.querySelector('.bookstore-shelf-book-menu')
    var pageRect = page.getBoundingClientRect()
    var triggerRect = trigger.getBoundingClientRect()
    var scaleX = pageRect.width / Math.max(1, page.offsetWidth)
    var scaleY = pageRect.height / Math.max(1, page.offsetHeight)
    var left = (triggerRect.right - pageRect.left) / Math.max(.01, scaleX) - panel.offsetWidth
    var top = (triggerRect.bottom - pageRect.top) / Math.max(.01, scaleY) + 6
    left = Math.max(12, Math.min(left, page.offsetWidth - panel.offsetWidth - 12))
    if (top + panel.offsetHeight > page.offsetHeight - 72) top = (triggerRect.top - pageRect.top) / Math.max(.01, scaleY) - panel.offsetHeight - 6
    panel.style.left = left + 'px'
    panel.style.top = Math.max(58, top) + 'px'
    layer.querySelector('[data-book-menu-close]').addEventListener('click', closeShelfBookMenu)
    layer.querySelector('[data-book-info]').addEventListener('click', function() {
      closeShelfBookMenu()
      state.selectedBookId = book.id
      state.detailTab = 'info'
      state.view = 'detail'
      render()
    })
    layer.querySelectorAll('[data-book-menu-placeholder]').forEach(function(button) {
      button.addEventListener('click', closeShelfBookMenu)
    })
    layer.querySelector('[data-book-remove]').addEventListener('click', function() {
      closeShelfBookMenu()
      openRemoveBookDialog(book)
    })
  }

  function bindContentEvents(shell) {
    var shelfMenu = shell.querySelector('[data-shelf-menu]')
    if (shelfMenu) shelfMenu.addEventListener('click', function() {
      var input = shell.querySelector('[data-book-file]')
      if (input) input.click()
    })
    var shelfSearch = shell.querySelector('[data-shelf-search]')
    if (shelfSearch) {
      shelfSearch.addEventListener('input', function() {
        state.shelfQuery = shelfSearch.value
        render()
        var nextSearch = document.querySelector('#bookstore-page [data-shelf-search]')
        if (nextSearch) {
          nextSearch.focus()
          nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length)
        }
      })
    }
    var importButton = shell.querySelector('[data-import-book]')
    var bookFileInput = shell.querySelector('[data-book-file]')
    if (importButton && bookFileInput) importButton.addEventListener('click', function() { bookFileInput.click() })
    if (bookFileInput) bookFileInput.addEventListener('change', async function() {
      var file = bookFileInput.files && bookFileInput.files[0]
      if (!file) return
      bookFileInput.disabled = true
      if (shelfMenu) shelfMenu.disabled = true
      window.toast('正在导入，请稍后…')
      if (importButton) {
        importButton.disabled = true
        importButton.dataset.originalText = importButton.innerHTML
        importButton.textContent = '正在导入…'
      }
      try {
        var parsed = await readImportedBookFile(file)
        var book = makeImportedBook(file, parsed)
        if (importButton) importButton.textContent = '正在导入…'
        await buildBookPagination(book, function(progress) {
          if (importButton) importButton.textContent = '正在导入…'
        })
        BOOKS.unshift(book)
        state.shelfQuery = ''
        saveImportedBooks()
        render()
        window.toast('《' + book.title + '》已导入书架')
      } catch (error) {
        bookFileInput.disabled = false
        if (shelfMenu) {
          shelfMenu.disabled = false
          shelfMenu.setAttribute('aria-label', '更多操作')
        }
        if (importButton) {
          importButton.disabled = false
          importButton.innerHTML = importButton.dataset.originalText || '从设备导入'
        }
        window.toast('导入失败：' + (error.message || '无法读取文件'))
      }
    })
    shell.querySelectorAll('[data-book-menu]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openShelfBookMenu(getBook(btn.dataset.bookMenu), btn)
      })
    })
    shell.querySelectorAll('[data-stat-range]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.statisticsRange = btn.dataset.statRange
        state.statisticsDate = new Date()
        render()
      })
    })
    shell.querySelectorAll('[data-stat-step]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var direction = Number(btn.dataset.statStep) || 0
        var ranges = ['day', 'week', 'month', 'year', 'all']
        var current = ranges.indexOf(state.statisticsRange)
        var next = Math.max(0, Math.min(ranges.length - 1, current + direction))
        state.statisticsRange = ranges[next]
        state.statisticsDate = new Date()
        render()
      })
    })
    shell.querySelectorAll('[data-continue-reading]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!readingData.lastBookId) return
        await enterReader(getBook(readingData.lastBookId), readingData.lastChapterIndex, btn)
      })
    })
    shell.querySelectorAll('[data-goal-settings]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.goalPanelOpen = !state.goalPanelOpen
        render()
      })
    })
    shell.querySelectorAll('[data-goal-close]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.goalPanelOpen = false
        render()
      })
    })
    var goalForm = shell.querySelector('[data-goal-form]')
    if (goalForm) {
      var goalInput = goalForm.querySelector('[data-goal-input]')
      window.setTimeout(function() { if (goalInput) { goalInput.focus(); goalInput.select() } }, 0)
      goalForm.addEventListener('submit', function(event) {
        event.preventDefault()
        var minutes = Math.round(Number(goalInput.value))
        var error = goalForm.querySelector('[data-goal-error]')
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
          error.textContent = '请输入 1–1440 之间的整数分钟数'
          return
        }
        readingData.goalMinutes = minutes
        state.goalPanelOpen = false
        saveReadingData()
        render()
        window.toast('每日目标已设置为 ' + minutes + ' 分钟')
      })
    }
    shell.querySelectorAll('[data-goal-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        readingData.goalView = readingData.goalView === 'arc' ? 'compact' : 'arc'
        saveReadingData()
        render()
      })
    })
    shell.querySelectorAll('[data-channel]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.channel = btn.dataset.channel
        render()
      })
    })
    shell.querySelectorAll('[data-open-book]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.selectedBookId = btn.dataset.openBook
        state.detailTab = 'info'
        state.view = 'detail'
        render()
      })
    })
    shell.querySelectorAll('[data-detail-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.detailTab = btn.dataset.detailTab
        render()
      })
    })
    shell.querySelectorAll('[data-edit-book]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.selectedBookId = btn.dataset.editBook
        state.view = 'edit'
        render()
      })
    })
    shell.querySelectorAll('[data-cancel-book-edit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.view = 'detail'
        render()
      })
    })
    shell.querySelectorAll('[data-pick-book-cover]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!window.showImagePicker) {
          window.toast('当前环境不支持选择图片')
          return
        }
        window.showImagePicker(function(imageUrl) {
          var input = shell.querySelector('[data-book-cover-value]')
          if (input) input.value = imageUrl || ''
          updateBookEditCoverPreview(shell, imageUrl || '')
        })
      })
    })
    shell.querySelectorAll('[data-clear-book-cover]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var input = shell.querySelector('[data-book-cover-value]')
        if (input) input.value = ''
        updateBookEditCoverPreview(shell, '')
      })
    })
    var bookEditForm = shell.querySelector('[data-book-edit-form]')
    if (bookEditForm) {
      bindBookRoleEditorEvents(shell)
      bookEditForm.addEventListener('submit', function(event) {
        event.preventDefault()
        var book = getBook(state.selectedBookId)
        if (!book) return
        var title = bookEditForm.querySelector('[data-book-title]').value.trim()
        if (!title) {
          window.toast('请填写书名')
          return
        }
        var previousRoles = JSON.stringify(normalizeBookRoles(book.bookRoles))
        var nextRoles = collectBookRolesFromEdit(bookEditForm)
        book.title = title
        book.author = bookEditForm.querySelector('[data-book-author]').value.trim()
        book.category = bookEditForm.querySelector('[data-book-category]').value.trim()
        book.coverImage = bookEditForm.querySelector('[data-book-cover-value]').value.trim()
        book.intro = normalizeImportedDescription(bookEditForm.querySelector('[data-book-intro]').value)
        book.tags = bookSystemTags(book.tags).concat(parseBookUserTags(bookEditForm.querySelector('[data-book-tags]').value))
        book.bookRoles = nextRoles
        saveImportedBooks()
        state.detailTab = JSON.stringify(nextRoles) !== previousRoles ? 'roles' : 'info'
        state.view = 'detail'
        render()
        window.toast('书籍信息已保存')
      })
    }
    var styleForm = shell.querySelector('[data-writing-style-form]')
    if (styleForm) {
      styleForm.addEventListener('submit', function(event) {
        event.preventDefault()
        var title = styleForm.querySelector('[data-style-title]').value.trim()
        var description = styleForm.querySelector('[data-style-description]').value.trim()
        if (!title || !description) {
          window.toast('请填写标题和文风描述')
          return
        }
        writingStyles.push({ id: makeWritingStyleId(), title: title, description: description })
        saveWritingStyles()
        render()
        window.toast('文风已添加')
      })
    }
    shell.querySelectorAll('[data-delete-writing-style]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (writingStyles.length <= 1) {
          window.toast('至少保留一个文风')
          return
        }
        writingStyles = writingStyles.filter(function(style) { return style.id !== btn.dataset.deleteWritingStyle })
        saveWritingStyles()
        render()
      })
    })
    var createWorkForm = shell.querySelector('[data-create-work-form]')
    if (createWorkForm) {
      bindBookRoleEditorEvents(shell)
      createWorkForm.addEventListener('submit', async function(event) {
        event.preventDefault()
        var title = createWorkForm.querySelector('[data-book-title]').value.trim()
        if (!title) {
          window.toast('请填写书名')
          return
        }
        var intro = normalizeImportedDescription(createWorkForm.querySelector('[data-book-intro]').value)
        var book = {
          id: 'created-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          title: title,
          author: createWorkForm.querySelector('[data-book-author]').value.trim(),
          status: '创作中',
          words: '0 字',
          intro: intro,
          tags: ['本地书籍'].concat(parseBookUserTags(createWorkForm.querySelector('[data-book-tags]').value)),
          category: createWorkForm.querySelector('[data-book-category]').value.trim(),
          coverImage: createWorkForm.querySelector('[data-book-cover-value]').value.trim(),
          heat: '',
          channel: 'created',
          coverColor: '#e8e4dc',
          fileSize: 0,
          createdByReaden: true,
          bookRoles: collectBookRolesFromEdit(createWorkForm),
          chapters: [],
          plot_summary: { summary_text: '', covered_range: '', covered_end: 0, updated_at: Date.now() }
        }
        await buildBookPagination(book)
        BOOKS.unshift(book)
        saveImportedBooks()
        state.selectedBookId = book.id
        state.detailTab = 'info'
        state.view = 'detail'
        render()
        window.toast('作品已创建')
      })
    }
    var createChapterForm = shell.querySelector('[data-create-chapter-form]')
    if (createChapterForm) {
      createChapterForm.addEventListener('submit', function(event) {
        event.preventDefault()
        var draft = normalizeDraftRanges(getDraftFromCreateChapterForm(createChapterForm))
        if (!draft.bookId) {
          window.toast('请先创建作品')
          return
        }
        if (!draft.storyOutline) {
          window.toast('请填写或生成故事情节')
          return
        }
        ensureDraftChapterPlans(draft)
        state.chapterDraft = Object.assign({}, state.chapterDraft || {}, draft)
        state.view = 'chapter-plan'
        render()
      })
    }
    shell.querySelectorAll('[data-generate-story-outline]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var form = btn.closest('[data-create-chapter-form]')
        var draft = normalizeDraftRanges(getDraftFromCreateChapterForm(form))
        var book = getBook(draft.bookId)
        if (!book) {
          window.toast('请先选择作品')
          return
        }
        await withButtonBusy(btn, '生成中…', async function() {
          var outline = await callBookstoreAI(buildStoryOutlinePrompt(book, draft))
          form.querySelector('[data-story-outline]').value = outline
          state.chapterDraft = Object.assign({}, state.chapterDraft || {}, draft, { storyOutline: outline })
        })
      })
    })
    var chapterPlanForm = shell.querySelector('[data-chapter-plan-form]')
    if (chapterPlanForm) {
      chapterPlanForm.addEventListener('submit', async function(event) {
        event.preventDefault()
        var draft = Object.assign({}, state.chapterDraft || {})
        draft.chapterPlans = collectChapterPlanPrompts(chapterPlanForm)
        draft.chapterPlan = draft.chapterPlans.join('\n\n')
        draft.rawContextLimit = Math.max(1000, parseInt(chapterPlanForm.querySelector('[data-raw-context-limit]').value, 10) || DEFAULT_RAW_CONTEXT_LIMIT)
        if (!draft.chapterPlans.length) {
          window.toast('请先生成或填写章节规划')
          return
        }
        var btn = chapterPlanForm.querySelector('[type="submit"]')
        await withButtonBusy(btn, '编写中…', async function() {
          await writeNovelChapters(draft)
        })
      })
    }
    shell.querySelectorAll('[data-add-chapter-plan]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var draft = Object.assign({}, state.chapterDraft || {})
        draft.chapterPlans = collectChapterPlanPrompts(shell)
        if (draft.chapterPlans.length >= draft.countMax) {
          window.toast('已达到章节数上限')
          return
        }
        draft.chapterPlans.push(blankChapterPlan(draft.chapterPlans.length, draft))
        draft.chapterPlan = draft.chapterPlans.join('\n\n')
        state.chapterDraft = draft
        render()
      })
    })
    shell.querySelectorAll('[data-remove-chapter-plan]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var draft = Object.assign({}, state.chapterDraft || {})
        draft.chapterPlans = collectChapterPlanPrompts(shell)
        if (draft.chapterPlans.length <= draft.countMin) {
          window.toast('不能少于章节数下限')
          return
        }
        draft.chapterPlans.splice(Number(btn.dataset.removeChapterPlan) || 0, 1)
        draft.chapterPlan = draft.chapterPlans.join('\n\n')
        state.chapterDraft = draft
        render()
      })
    })
    shell.querySelectorAll('[data-generate-chapter-plan]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var draft = Object.assign({}, state.chapterDraft || {})
        var book = getBook(draft.bookId)
        if (!book || !draft.storyOutline) {
          window.toast('请先完成故事情节')
          return
        }
        await withButtonBusy(btn, '规划中…', async function() {
          var plan = await callBookstoreAI(buildChapterPlanPrompt(book, draft))
          var plans = parseChapterPlanOutput(plan, draft)
          state.chapterDraft = Object.assign({}, draft, { chapterPlan: plan, chapterPlans: plans })
          render()
        })
      })
    })
    shell.querySelectorAll('[data-author-back]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.view = btn.dataset.authorBack || 'author'
        state.tab = 'author'
        render()
      })
    })
    shell.querySelectorAll('[data-read-shelf]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var book = getBook(btn.dataset.readShelf)
        var chapterIndex = readingData.lastBookId === book.id ? readingData.lastChapterIndex : 0
        await enterReader(book, chapterIndex, btn)
      })
    })
    shell.querySelectorAll('[data-tab-jump]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.tab = btn.dataset.tabJump
        state.view = btn.dataset.tabJump
        render()
      })
    })
    shell.querySelectorAll('[data-category]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.channel = btn.dataset.category
        state.tab = 'home'
        state.view = 'home'
        render()
      })
    })
    shell.querySelectorAll('[data-toggle-shelf]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.toggleShelf
        state.shelf[id] = !state.shelf[id]
        window.toast(state.shelf[id] ? '已加入书架' : '已移出书架')
        render()
      })
    })
    shell.querySelectorAll('[data-read-book]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await enterReader(getBook(btn.dataset.readBook), 0, btn)
      })
    })
    shell.querySelectorAll('[data-read-chapter]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await enterReader(getBook(state.selectedBookId), parseInt(btn.dataset.readChapter, 10) || 0, btn)
      })
    })
    shell.querySelectorAll('[data-reader-theme]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.readerTheme = btn.dataset.readerTheme
        var reader = shell.querySelector('.bookstore-reader')
        if (reader) {
          reader.classList.toggle('theme-night', state.readerTheme === 'night')
          reader.classList.toggle('theme-paper', state.readerTheme !== 'night')
        }
        btn.dataset.readerTheme = state.readerTheme === 'night' ? 'paper' : 'night'
        btn.innerHTML = (state.readerTheme === 'night' ? READER_DAY_SVG : READER_NIGHT_SVG) + '<span>' + (state.readerTheme === 'night' ? '日间' : '夜间') + '</span>'
      })
    })
    shell.querySelectorAll('[data-reader-toc]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.readerTocOpen = !state.readerTocOpen
        var menu = shell.querySelector('[data-reader-menu]')
        if (menu) menu.classList.toggle('toc-open', state.readerTocOpen)
        btn.setAttribute('aria-expanded', state.readerTocOpen ? 'true' : 'false')
        if (state.readerTocOpen) window.requestAnimationFrame(function() {
          var activeChapter = shell.querySelector('[data-reader-chapter].active')
          if (activeChapter) activeChapter.scrollIntoView({ block: 'center' })
        })
      })
    })
    shell.querySelectorAll('[data-reader-chapter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var book = getBook(state.selectedBookId)
        var chapterIndex = parseInt(btn.dataset.readerChapter, 10) || 0
        state.chapterIndex = chapterIndex
        state.readerPageIndex = firstPageForChapter(book, chapterIndex)
        state.readerTocOpen = false
        state.readerMenuOpen = false
        markReadingPosition(book.id, chapterIndex)
        render()
        scrollReaderToTop()
      })
    })
    shell.querySelectorAll('[data-back-detail]').forEach(function(btn) {
      btn.addEventListener('click', function() { state.readerMenuOpen = false; state.readerTocOpen = false; state.detailTab = 'info'; state.view = 'detail'; render() })
    })
    shell.querySelectorAll('[data-reader-back]').forEach(function(btn) {
      btn.addEventListener('click', function() { state.readerMenuOpen = false; state.readerTocOpen = false; state.tab = 'shelf'; state.view = 'shelf'; render() })
    })
    shell.querySelectorAll('[data-reader-toast]').forEach(function(btn) {
      btn.addEventListener('click', function() { window.toast(btn.dataset.readerToast) })
    })
    var readerPagesEl = shell.querySelector('[data-reader-pages]')
    var readerMenuEl = shell.querySelector('[data-reader-menu]')
    if (readerMenuEl) readerMenuEl.addEventListener('click', function(event) {
      if (event.target !== readerMenuEl) return
      if (state.readerTocOpen) {
        state.readerTocOpen = false
        readerMenuEl.classList.remove('toc-open')
        var tocButton = readerMenuEl.querySelector('[data-reader-toc]')
        if (tocButton) tocButton.setAttribute('aria-expanded', 'false')
        return
      }
      state.readerMenuOpen = false
      var reader = shell.querySelector('.bookstore-reader')
      if (reader) reader.classList.remove('menu-open')
    })
    if (readerPagesEl) {
      window.requestAnimationFrame(function() { readerPagesEl.scrollLeft = state.readerPageIndex * readerPagesEl.clientWidth })
      readerPagesEl.addEventListener('click', function() {
        state.readerMenuOpen = !state.readerMenuOpen
        if (!state.readerMenuOpen) state.readerTocOpen = false
        var reader = shell.querySelector('.bookstore-reader')
        if (reader) reader.classList.toggle('menu-open', state.readerMenuOpen)
      })
      var scrollFrame = null
      readerPagesEl.addEventListener('scroll', function() {
        if (scrollFrame) return
        scrollFrame = window.requestAnimationFrame(function() {
          scrollFrame = null
          var pages = cachedReaderPages(getBook(state.selectedBookId))
          var index = Math.round(readerPagesEl.scrollLeft / Math.max(1, readerPagesEl.clientWidth))
          index = Math.max(0, Math.min(index, pages.length - 1))
          hydrateReaderWindow(shell, getBook(state.selectedBookId), index)
          if (index === state.readerPageIndex) return
          state.readerPageIndex = index
          state.chapterIndex = pages[index].chapterIndex
          markReadingPosition(state.selectedBookId, state.chapterIndex)
          var count = shell.querySelector('[data-reader-page-count]')
          var progressText = shell.querySelector('[data-reader-progress]')
          var progressBar = shell.querySelector('[data-reader-progress-bar]')
          var progress = Math.round((index + 1) / pages.length * 100)
          if (count) count.textContent = (index + 1) + ' / ' + pages.length
          if (progressText) progressText.textContent = progress + '%'
          if (progressBar) progressBar.style.width = progress + '%'
        })
      })
    }
    shell.querySelectorAll('[data-author-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = btn.dataset.authorAction
        if (action === 'writing-style-preset') state.view = 'writing-styles'
        else if (action === 'create-work') state.view = 'create-work'
        else if (action === 'create-chapter') state.view = 'create-chapter'
        else if (action === 'edit-history') state.view = 'edit-history'
        else {
          window.toast('功能待开发')
          return
        }
        state.tab = 'author'
        render()
      })
    })
    shell.querySelectorAll('[data-toast]').forEach(function(btn) {
      btn.addEventListener('click', function() { window.toast(btn.dataset.toast) })
    })
  }

  window.showBookstorePage = function() {
    var existing = document.getElementById('bookstore-page')
    if (existing) existing.remove()
    state.tab = state.tab || 'home'
    state.view = state.tab || 'home'
    var page = createBookstorePage()
    if (window.openPage) window.openPage(page)
    else (document.getElementById('app') || document.body).appendChild(page)
    render()
    ensureReadingTimer()
    schedulePaginationMigration()
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') saveReadingData()
  })
  window.addEventListener('beforeunload', saveReadingData)
})()
