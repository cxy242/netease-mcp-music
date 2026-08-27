// ins-page.js — Instagram 页面兼容入口 + Reels 标签页

window.showInsPage = function() {
  if (window.showIGPage) return window.showIGPage()
}

// ===== Reels 标签页（与首页/个人页一样，点击底栏切换，渲染进 .ig-main）=====
// 模拟视频数据（情侣向，自定内容，默认时长 18s）
var IG_REELS_VIDEO = {
  // 发帖人参考 ins-page 初始帖子的发帖人
  username: 'YYYYoo',
  avatar: 'img/soc_01.jpg',
  caption: '记录我们的第 365 天 🤍 异地一年，终于又抱到你了',
  hashtags: '#情侣日常 #双向奔赴 #把每一天都过成纪念日',
  duration: 18,
  likes: 9188,
  comments: 31,
  shares: 722,
  // 分镜：随进度切换，让黑色屏幕上的文字像视频一样播放
  scenes: [
    { at: 0, text: '清晨的阳光落在十指相扣的两只手上' },
    { at: 4, text: '她笑着把头轻轻靠在他的肩膀' },
    { at: 8, text: '傍晚的海边，两个人并肩慢慢走着' },
    { at: 12, text: '他俯身在她耳边说了句悄悄话' },
    { at: 15, text: '镜头拉远，只剩下相拥的剪影' }
  ]
}

window.buildIGReelsHTML = function(user, video) {
  video = video || IG_REELS_VIDEO
  var esc = window.igEscape || function(s) { return String(s == null ? '' : s) }

  return '<div class="igr-tab">' +
    '<div class="igr-stage" role="button" aria-label="播放/暂停">' +
      '<div class="igr-watermark">@' + esc(video.username) + '</div>' +
      '<div class="igr-caption-text"></div>' +
      '<div class="igr-play-overlay"><i class="fa-solid fa-play"></i></div>' +
    '</div>' +

    '<div class="igr-rail">' +
      '<div class="igr-rail-item">' +
        '<button class="igr-action igr-like" type="button" data-liked="0" data-count="' + video.likes + '">' + window.getIGHeartSvg(false) + '</button>' +
        '<span class="igr-action-count igr-like-count">' + igrFormatCount(video.likes) + '</span>' +
      '</div>' +
      '<div class="igr-rail-item">' +
        '<button class="igr-action" type="button" aria-label="评论">' + window.getIGCommentSvg() + '</button>' +
        '<span class="igr-action-count">' + igrFormatCount(video.comments) + '</span>' +
      '</div>' +
      '<div class="igr-rail-item">' +
        '<button class="igr-action" type="button" aria-label="转发">' + window.getIGRepostSvg() + '</button>' +
      '</div>' +
      '<div class="igr-rail-item">' +
        '<button class="igr-action" type="button" aria-label="分享">' + window.getIGSendSvg() + '</button>' +
        '<span class="igr-action-count">' + igrFormatCount(video.shares) + '</span>' +
      '</div>' +
      '<div class="igr-rail-item">' +
        '<button class="igr-action igr-more" type="button" aria-label="更多">' +
          '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="igr-rail-disc">' +
        '<img src="' + esc(video.avatar) + '" alt="">' +
      '</div>' +
    '</div>' +

    '<div class="igr-footer">' +
      '<div class="igr-author">' +
        '<div class="igr-author-avatar"><img src="' + esc(video.avatar) + '" alt=""></div>' +
        '<span class="igr-author-name">' + esc(video.username) + '</span>' +
        '<button class="igr-follow" type="button">Follow</button>' +
      '</div>' +
      '<div class="igr-caption">' + esc(video.caption) +
        (video.hashtags ? ' <span class="igr-hashtag">' + esc(video.hashtags) + '</span>' : '') +
      '</div>' +
    '</div>' +

    '<div class="igr-progress"><div class="igr-progress-fill"></div></div>' +
  '</div>'
}

function igrFormatCount(n) {
  n = Number(n) || 0
  return n.toLocaleString('en-US')
}

window.bindIGReelsContent = function(page, video) {
  video = video || IG_REELS_VIDEO
  var tab = page.querySelector('.igr-tab')
  if (!tab) return
  var stage = page.querySelector('.igr-stage')
  var captionEl = page.querySelector('.igr-caption-text')
  var fill = page.querySelector('.igr-progress-fill')
  var disc = page.querySelector('.igr-rail-disc')

  // ---- 播放进度（rAF 驱动，支持暂停/循环）----
  var durationMs = (video.duration || 18) * 1000
  var elapsed = 0
  var lastTs = 0
  var paused = false
  var rafId = 0
  var currentSceneIndex = -1

  function updateScene(seconds) {
    var scenes = video.scenes || []
    var idx = 0
    for (var i = 0; i < scenes.length; i++) {
      if (seconds >= scenes[i].at) idx = i
    }
    if (idx !== currentSceneIndex) {
      currentSceneIndex = idx
      captionEl.classList.remove('show')
      void captionEl.offsetWidth // 触发淡入动画
      captionEl.textContent = scenes[idx] ? scenes[idx].text : ''
      captionEl.classList.add('show')
    }
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts
    var dt = ts - lastTs
    lastTs = ts
    if (!paused) {
      elapsed += dt
      if (elapsed >= durationMs) {
        elapsed = elapsed % durationMs
        currentSceneIndex = -1
      }
      fill.style.width = (elapsed / durationMs * 100) + '%'
      updateScene(elapsed / 1000)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  // ---- 背景音（mp3 / mp4 在线链接，首次点击后出声）----
  var audioEl = null
  var audioStarted = false
  if (video.audio && video.audio.url) {
    audioEl = new Audio(video.audio.url)
    audioEl.loop = true
    page._igrAudio = audioEl
  }

  page._igrStop = function() {
    if (rafId) cancelAnimationFrame(rafId); rafId = 0
    if (audioEl) { try { audioEl.pause() } catch (e) {} }
  }

  // ---- 点击舞台：暂停/播放 ----
  stage.addEventListener('click', function() {
    // 有背景音时，首次点击只用于「出声」（视频继续播放，不暂停）
    if (audioEl && !audioStarted) {
      audioStarted = true
      try { audioEl.play() } catch (e) {}
      return
    }
    paused = !paused
    lastTs = 0
    tab.classList.toggle('is-paused', paused)
    if (disc) disc.classList.toggle('is-paused', paused)
    if (audioEl) {
      if (paused) { try { audioEl.pause() } catch (e) {} }
      else { try { audioEl.play() } catch (e) {} }
    }
  })

  // ---- 点赞 ----
  var likeBtn = page.querySelector('.igr-like')
  var likeCountEl = page.querySelector('.igr-like-count')
  if (likeBtn) {
    likeBtn.addEventListener('click', function(e) {
      e.stopPropagation()
      var liked = likeBtn.dataset.liked === '1'
      var count = parseInt(likeBtn.dataset.count) || 0
      var next = liked ? count - 1 : count + 1
      likeBtn.dataset.liked = liked ? '0' : '1'
      likeBtn.dataset.count = next
      likeBtn.classList.toggle('liked', !liked)
      likeBtn.innerHTML = window.getIGHeartSvg(!liked)
      if (likeCountEl) likeCountEl.textContent = igrFormatCount(next)
    })
  }

  // ---- 关注 ----
  var followBtn = page.querySelector('.igr-follow')
  if (followBtn) {
    followBtn.addEventListener('click', function(e) {
      e.stopPropagation()
      var following = followBtn.classList.toggle('is-following')
      followBtn.textContent = following ? 'Following' : 'Follow'
    })
  }

  // ---- 右栏按钮不触发暂停 ----
  page.querySelectorAll('.igr-rail .igr-action').forEach(function(btn) {
    btn.addEventListener('click', function(e) { e.stopPropagation() })
  })
}

// ===== Reels 标签页：竖向滑动 feed（已发布 reels 最新在前 + 末尾示例）=====
window.buildIGReelsFeedHTML = function(page, user) {
  var reels = (window.loadIGReels ? window.loadIGReels(user) : []).filter(function(r) {
    return r && user && String(r.authorId) === String(user.id)
  })
  var videos = reels.concat([IG_REELS_VIDEO])
  if (page) page._igrFeedVideos = videos
  return '<div class="igr-feed">' + videos.map(function(v, i) {
    return '<div class="igr-slide" data-reel-index="' + i + '">' + window.buildIGReelsHTML(user, v) + '</div>'
  }).join('') + '</div>'
}

window.bindIGReelsFeed = function(page, user) {
  var feed = page.querySelector('.igr-feed')
  if (!feed) return
  var videos = page._igrFeedVideos || []
  var slides = Array.prototype.slice.call(feed.querySelectorAll('.igr-slide'))
  var activeSlide = null

  // 同一时刻只运行一条 reel 的播放引擎；切到某条时重建该条 HTML 再绑定（清掉旧监听、从头播放）
  function activate(slide) {
    if (!slide || slide === activeSlide) return
    if (activeSlide && activeSlide._igrStop) { activeSlide._igrStop(); activeSlide._igrStop = null }
    activeSlide = slide
    var idx = parseInt(slide.dataset.reelIndex, 10) || 0
    var video = videos[idx] || videos[0]
    slide.innerHTML = window.buildIGReelsHTML(user, video)
    window.bindIGReelsContent(slide, video)
  }

  var io = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(function(entries) {
      var best = null, bestRatio = 0
      entries.forEach(function(e) {
        if (e.intersectionRatio > bestRatio) { bestRatio = e.intersectionRatio; best = e.target }
      })
      if (best && bestRatio >= 0.6) activate(best)
    }, { root: feed, threshold: [0.25, 0.6, 0.9] })
    slides.forEach(function(s) { io.observe(s) })
  }

  if (slides[0]) activate(slides[0])

  page._igrStop = function() {
    if (activeSlide && activeSlide._igrStop) { activeSlide._igrStop(); activeSlide._igrStop = null }
    if (io) io.disconnect()
  }
}

// ===== 已发布 Reels 存储（localStorage + 内存缓存，参照生成帖子）=====
var IG_REELS_PREFIX = 'ig_reels_'
var igReelsMemory = {}

function igrEscape(s) {
  return (window.igEscape || function(v) { return String(v == null ? '' : v) })(s)
}

function getIGReelsKey(user) {
  return IG_REELS_PREFIX + (user && user.id ? user.id : 'default')
}

window.loadIGReels = function(user) {
  var key = getIGReelsKey(user)
  if (Array.isArray(igReelsMemory[key])) return igReelsMemory[key]
  try {
    var raw = localStorage.getItem(key)
    var parsed = raw ? JSON.parse(raw) : []
    igReelsMemory[key] = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    igReelsMemory[key] = []
  }
  return igReelsMemory[key]
}

window.saveIGReels = function(user, list) {
  var key = getIGReelsKey(user)
  var safe = Array.isArray(list) ? list : []
  igReelsMemory[key] = safe
  try { localStorage.setItem(key, JSON.stringify(safe)) } catch (e) {}
}

// ===== 发布 Reels 页面（模仿发布帖子单页表单）=====
window.showIGReelsComposePage = function() {
  var existing = document.getElementById('ig-reels-compose-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-reels-compose-page'
  page.className = 'full-page'
  page.innerHTML =
    '<div class="igc-topbar">' +
      '<div class="igc-topbar-inner">' +
        '<button class="igc-topbar-btn igrc-back" type="button" aria-label="返回">' +
          '<i class="fa fa-angle-left"></i>' +
        '</button>' +
        '<div class="igc-topbar-title">新 Reels</div>' +
        '<button class="igc-publish igrc-publish" type="button">发布</button>' +
      '</div>' +
    '</div>' +
    '<div class="igc-scroll">' +
      '<div class="igc-field">' +
        '<span class="igc-field-label">分镜字幕</span>' +
        '<div class="igrc-scenes"></div>' +
        '<button class="igrc-add-scene" type="button"><i class="fa-solid fa-plus"></i><span>添加分镜</span></button>' +
      '</div>' +
      '<label class="igc-field">' +
        '<span class="igc-field-label">时长（秒）</span>' +
        '<div class="igc-input-wrap">' +
          '<i class="fa-solid fa-clock"></i>' +
          '<input class="igc-input igrc-duration" type="number" min="3" max="120" value="18">' +
        '</div>' +
      '</label>' +
      '<label class="igc-field igc-field-story">' +
        '<span class="igc-field-label">文案</span>' +
        '<div class="igc-textarea-wrap">' +
          '<textarea class="igc-textarea igrc-caption" placeholder="写下你的 Reels 文案..." rows="3"></textarea>' +
        '</div>' +
      '</label>' +
      '<label class="igc-field">' +
        '<span class="igc-field-label">Hashtag</span>' +
        '<div class="igc-input-wrap">' +
          '<i class="fa-solid fa-hashtag"></i>' +
          '<input class="igc-input igrc-hashtags" type="text" placeholder="输入话题标签">' +
        '</div>' +
      '</label>' +
      '<label class="igc-field">' +
        '<span class="igc-field-label">背景音（mp3 / mp4 链接，可选）</span>' +
        '<div class="igc-input-wrap">' +
          '<i class="fa-solid fa-music"></i>' +
          '<input class="igc-input igrc-audio" type="text" placeholder="粘贴 mp3 / mp4 链接">' +
        '</div>' +
      '</label>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindIGReelsComposePage(page)
}

function igrAddSceneRow(scenesWrap, value) {
  var row = document.createElement('div')
  row.className = 'igrc-scene-row'
  row.innerHTML =
    '<textarea class="igrc-scene-input" rows="2" placeholder="这一幕的画面描述..."></textarea>' +
    '<button class="igrc-scene-remove" type="button" aria-label="删除分镜"><i class="fa-solid fa-trash"></i></button>'
  if (value) row.querySelector('.igrc-scene-input').value = value
  row.querySelector('.igrc-scene-remove').addEventListener('click', function() {
    if (scenesWrap.querySelectorAll('.igrc-scene-row').length <= 1) {
      window.toast && window.toast('至少保留一个分镜')
      return
    }
    row.remove()
  })
  scenesWrap.appendChild(row)
}

function bindIGReelsComposePage(page) {
  var scenesWrap = page.querySelector('.igrc-scenes')
  igrAddSceneRow(scenesWrap)

  var backBtn = page.querySelector('.igrc-back')
  if (backBtn) backBtn.addEventListener('click', closeIGReelsComposePage)

  var addBtn = page.querySelector('.igrc-add-scene')
  if (addBtn) addBtn.addEventListener('click', function() { igrAddSceneRow(scenesWrap) })

  var publishBtn = page.querySelector('.igrc-publish')
  if (publishBtn) publishBtn.addEventListener('click', function() { publishIGReelsCompose(page) })
}

function closeIGReelsComposePage() {
  var page = document.getElementById('ig-reels-compose-page')
  if (!page) return
  if (window.closePage) window.closePage('ig-reels-compose-page')
  else page.remove()
}

function igrInferAudioType(url) {
  return /\.mp4(\?|#|$)/i.test(url) ? 'mp4' : 'mp3'
}

async function publishIGReelsCompose(page) {
  if (!page || page.dataset.publishing === '1') return
  var sceneTexts = Array.prototype.map.call(
    page.querySelectorAll('.igrc-scene-input'),
    function(t) { return t.value.trim() }
  ).filter(Boolean)
  if (!sceneTexts.length) {
    window.toast && window.toast('请至少填写一个分镜')
    return
  }

  var duration = parseInt(page.querySelector('.igrc-duration').value, 10)
  if (!Number.isFinite(duration) || duration < 3) duration = 3
  if (duration > 120) duration = 120

  var caption = page.querySelector('.igrc-caption').value.trim()
  var hashtagRaw = page.querySelector('.igrc-hashtags').value.trim()
  var hashtags = hashtagRaw
    ? hashtagRaw.split(/[\s,，#]+/).map(function(tag) {
        tag = tag.trim().replace(/^#/, '')
        return tag ? '#' + tag : ''
      }).filter(Boolean).join(' ')
    : ''
  var audioUrl = page.querySelector('.igrc-audio').value.trim()

  var user = await getIGSessionUser()
  if (!user) { window.toast && window.toast('请先登录'); return }
  var profile = (typeof getIGProfileSync === 'function') ? getIGProfileSync(user) : {}

  // 分镜按时长平均分配 at 时间点
  var n = sceneTexts.length
  var scenes = sceneTexts.map(function(text, i) {
    return { at: Math.round(i * duration / n), text: text }
  })

  page.dataset.publishing = '1'
  try {
    var reel = {
      id: 'reel-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      authorId: user.id,
      createdAt: Date.now(),
      time: 'now',
      duration: duration,
      caption: caption,
      hashtags: hashtags,
      username: (profile && profile.account) || (profile && profile.name) || user.name || 'me',
      avatar: (profile && profile.avatar) || 'img/soc_01.jpg',
      likes: 0,
      comments: 0,
      shares: 0,
      scenes: scenes,
      audio: audioUrl ? { url: audioUrl, type: igrInferAudioType(audioUrl) } : null
    }
    window.saveIGReels(user, [reel].concat(window.loadIGReels(user)).slice(0, 60))
    closeIGReelsComposePage()
    var igPage = document.getElementById('ig-page')
    if (igPage) {
      igPage._igUser = user
      var activeItem = igPage.querySelector('.ig-bottombar-item.active')
      var activeTab = activeItem ? activeItem.dataset.tab : null
      if (activeTab === 'reels') {
        // 当前在 Reels 标签：重建竖向 feed，让新发布的 reel 出现在最前
        if (igPage._igrStop) { igPage._igrStop(); igPage._igrStop = null }
        var main = igPage.querySelector('.ig-main')
        if (main) main.innerHTML = window.buildIGReelsFeedHTML(igPage, user)
        window.bindIGReelsFeed(igPage, user)
      } else if (typeof renderIGGeneratedFeed === 'function') {
        renderIGGeneratedFeed(igPage, user)
      }
    }
    window.toast && window.toast('已发布')
  } catch (e) {
    console.error('发布 Reels 失败：', e)
    window.toast && window.toast('发布失败')
  } finally {
    page.dataset.publishing = '0'
  }
}

// ===== 个人页 Reels 九宫格 =====
window.buildIGProfileReelsHTML = function(user) {
  var reels = (window.loadIGReels ? window.loadIGReels(user) : []).filter(function(r) {
    return r && user && String(r.authorId) === String(user.id)
  })
  if (!reels.length) {
    return '<div class="ig-profile-empty">' +
      '<div class="ig-profile-empty-icon"><i class="fa-solid fa-clapperboard"></i></div>' +
      '<div class="ig-profile-empty-title">No Reels Yet</div>' +
    '</div>'
  }
  return '<div class="ig-profile-reels-grid">' + reels.map(function(reel) {
    var first = (reel.scenes && reel.scenes[0] && reel.scenes[0].text) || reel.caption || ''
    return '<button class="ig-profile-reel-thumb" type="button" data-reel-id="' + igrEscape(reel.id) + '" aria-label="打开 Reels">' +
      '<span class="ig-profile-reel-text">' + igrEscape(first) + '</span>' +
      '<i class="fa-solid fa-play ig-profile-reel-play"></i>' +
    '</button>'
  }).join('') + '</div>'
}

window.openIGReelPlayer = async function(reel) {
  if (!reel) return
  var user = await getIGSessionUser()
  var existing = document.getElementById('ig-reel-player-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-reel-player-page'
  page.className = 'full-page igr-mode igr-player'
  page.innerHTML =
    '<button class="igr-player-back" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
    (window.buildIGReelsHTML ? window.buildIGReelsHTML(user, reel) : '')

  if (window.openPage) window.openPage(page)
  else (document.getElementById('app') || document.body).appendChild(page)

  if (window.bindIGReelsContent) window.bindIGReelsContent(page, reel)

  page.querySelector('.igr-player-back').addEventListener('click', function() {
    if (page._igrStop) page._igrStop()
    if (window.closePage) window.closePage('ig-reel-player-page')
    else page.remove()
  })
}
