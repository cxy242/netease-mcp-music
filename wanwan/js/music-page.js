// music-page.js — 网易云音乐个人页UI + 搜索播放 + 全屏播放页
// 依赖：main.js

(function() {
  var MUSIC_API = 'https://music-api.gdstudio.xyz/api.php'
  var METING_APIS = [
    'https://api.qijieya.cn/meting/',
    'https://service.onlyzyx.com/meting-api/',
    'https://api.moeyao.cn/meting/',
    'https://api.injahow.cn/meting/'
  ]
  var _audio = null
  var _currentSong = null
  var _isPlaying = false
  var _searchLoading = false
  var _musicProfile = null
  var _progressTimer = null
  var _repeatMode = 'list' // 'list' | 'one'
  var _playQueue = []
  var _playQueueIndex = -1
  var _playQueueSource = '' // playlist name or '心动电台'
  var _metingFallbackUrls = []
  var _metingFallbackIndex = 0
  var _togetherActive = false
  var _togetherFriend = null // {id, name, avatar}
  var _togetherStartTime = 0
  var _togetherTimer = null
  var _lyricCache = {} // source + ':' + songId → [{t, text}] 或 null（获取失败）

  var DEFAULT_MUSIC_PROFILE = {
    avatar: 'img/ava-00.jpg',
    backgroundImage: '',
    nickname: '用户1206',
    vipLevel: 'VIP·柒',
    following: '52',
    followers: '12',
    level: 'Lv.8',
    listenHours: '1084',
    cards: [
      { img: 'img/blank_img1.jpg', label: '사' },
      { img: 'img/blank_img2.jpg', label: '랑' },
      { img: 'img/blank_img3.jpg', label: '해' },
      { img: 'img/blank_img4.jpg', label: '听歌排行' }
    ]
  }

  var PLAYLIST_DETAIL_SONGS = []
  var _likedSongsLoaded = false

  async function loadLikedSongs() {
    if (_likedSongsLoaded) return
    _likedSongsLoaded = true
    if (!window.db || !db.config) return
    try {
      var record = await db.config.get('likedSongs')
      if (record && Array.isArray(record.value)) {
        PLAYLIST_DETAIL_SONGS.length = 0
        for (var i = 0; i < record.value.length; i++) {
          PLAYLIST_DETAIL_SONGS.push(record.value[i])
        }
      }
    } catch (e) {}
  }

  async function saveLikedSongs() {
    if (!window.db || !db.config) return
    try {
      await db.config.put({ key: 'likedSongs', value: PLAYLIST_DETAIL_SONGS.slice() })
    } catch (e) {}
  }

  var _playlistSettings = null
  var DEFAULT_PLAYLIST_SETTINGS = {
    cover: 'img/music_blank.jpg',
    name: '我喜欢的音乐',
    playCount: 1082
  }

  async function getPlaylistSettings() {
    if (_playlistSettings) return { cover: _playlistSettings.cover, name: _playlistSettings.name, playCount: _playlistSettings.playCount }
    if (!window.db || !db.config) {
      _playlistSettings = { cover: DEFAULT_PLAYLIST_SETTINGS.cover, name: DEFAULT_PLAYLIST_SETTINGS.name, playCount: DEFAULT_PLAYLIST_SETTINGS.playCount }
      return { cover: _playlistSettings.cover, name: _playlistSettings.name, playCount: _playlistSettings.playCount }
    }
    try {
      var record = await db.config.get('playlistSettings')
      var val = record && record.value
      _playlistSettings = {
        cover: (val && val.cover) || DEFAULT_PLAYLIST_SETTINGS.cover,
        name: (val && val.name) || DEFAULT_PLAYLIST_SETTINGS.name,
        playCount: (val && val.playCount !== undefined) ? val.playCount : DEFAULT_PLAYLIST_SETTINGS.playCount
      }
    } catch (e) {
      _playlistSettings = { cover: DEFAULT_PLAYLIST_SETTINGS.cover, name: DEFAULT_PLAYLIST_SETTINGS.name, playCount: DEFAULT_PLAYLIST_SETTINGS.playCount }
    }
    return { cover: _playlistSettings.cover, name: _playlistSettings.name, playCount: _playlistSettings.playCount }
  }

  async function savePlaylistSettings(settings) {
    _playlistSettings = {
      cover: settings.cover || DEFAULT_PLAYLIST_SETTINGS.cover,
      name: settings.name || DEFAULT_PLAYLIST_SETTINGS.name,
      playCount: settings.playCount !== undefined ? settings.playCount : DEFAULT_PLAYLIST_SETTINGS.playCount
    }
    if (window.db && db.config) {
      await db.config.put({ key: 'playlistSettings', value: _playlistSettings })
    }
  }

  var _userPlaylists = null
  var _userPlaylistSongsCache = {}

  async function getUserPlaylists() {
    if (_userPlaylists !== null) return _userPlaylists.slice()
    if (!window.db || !db.config) {
      _userPlaylists = []
      return []
    }
    try {
      var record = await db.config.get('userPlaylists')
      _userPlaylists = (record && Array.isArray(record.value)) ? record.value : []
    } catch (e) {
      _userPlaylists = []
    }
    return _userPlaylists.slice()
  }

  async function saveUserPlaylists(playlists) {
    _userPlaylists = playlists || []
    if (window.db && db.config) {
      await db.config.put({ key: 'userPlaylists', value: _userPlaylists })
    }
  }

  async function getUserPlaylistSongs(playlistId) {
    var key = 'userPlaylistSongs_' + playlistId
    if (_userPlaylistSongsCache[playlistId]) return _userPlaylistSongsCache[playlistId].slice()
    if (!window.db || !db.config) {
      _userPlaylistSongsCache[playlistId] = []
      return []
    }
    try {
      var record = await db.config.get(key)
      _userPlaylistSongsCache[playlistId] = (record && Array.isArray(record.value)) ? record.value : []
    } catch (e) {
      _userPlaylistSongsCache[playlistId] = []
    }
    return _userPlaylistSongsCache[playlistId].slice()
  }

  async function saveUserPlaylistSongs(playlistId, songs) {
    _userPlaylistSongsCache[playlistId] = songs || []
    if (window.db && db.config) {
      await db.config.put({ key: 'userPlaylistSongs_' + playlistId, value: songs || [] })
    }
    var playlists = await getUserPlaylists()
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === playlistId) {
        playlists[i].songCount = (songs || []).length
        break
      }
    }
    await saveUserPlaylists(playlists)
  }

  function esc(str) {
    if (str === null || str === undefined) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function buildMetingUrl(baseUrl, type, params) {
    var query = ['server=netease', 'type=' + encodeURIComponent(type)]
    params = params || {}
    Object.keys(params).forEach(function(key) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
      }
    })
    return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + query.join('&')
  }

  function getMetingMediaUrl(type, id, extra) {
    return buildMetingUrl(METING_APIS[0], type, Object.assign({ id: id }, extra || {}))
  }

  function getMetingMediaUrls(type, id, extra) {
    return METING_APIS.map(function(baseUrl) {
      return buildMetingUrl(baseUrl, type, Object.assign({ id: id }, extra || {}))
    })
  }

  function fetchMetingJson(type, params) {
    var index = 0
    function next() {
      if (index >= METING_APIS.length) return Promise.reject(new Error('meting failed'))
      var url = buildMetingUrl(METING_APIS[index++], type, params)
      return fetch(url)
        .then(function(res) { return res.json() })
        .then(function(data) {
          if (!Array.isArray(data) || !data.length) throw new Error('meting empty')
          return data
        })
        .catch(function() { return next() })
    }
    return next()
  }

  function extractMetingId(url) {
    if (!url) return ''
    var match = String(url).match(/[?&]id=([^&]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  }

  function parseLrc(text) {
    var lines = String(text || '').split(/\r?\n/)
    var result = []
    var timeTag = /\[(\d+):(\d+(?:\.\d+)?)\]/g
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      var content = line.replace(timeTag, '').trim()
      if (!content) continue
      if (/^(作词|作曲|编曲|制作人?|监制|混音|录音|母带|和声|吉他|贝斯|键盘|鼓|弦乐|出品|发行|企划|统筹|OP|SP)\s*[:：]/i.test(content)) continue
      var match
      timeTag.lastIndex = 0
      while ((match = timeTag.exec(line)) !== null) {
        result.push({ t: parseInt(match[1]) * 60 + parseFloat(match[2]), text: content })
      }
    }
    result.sort(function(a, b) { return a.t - b.t })
    return result.length ? result : null
  }

  function fetchCurrentSongLyric() {
    var song = _currentSong
    if (!song || !song.id) return Promise.resolve(null)
    var cacheKey = (song.source || 'netease') + ':' + song.id
    if (cacheKey in _lyricCache) return Promise.resolve(_lyricCache[cacheKey])

    var lyricUrl = MUSIC_API + '?types=lyric&source=' + encodeURIComponent(song.source || 'netease') + '&id=' + encodeURIComponent(song.id)
    return fetch(lyricUrl)
      .then(function(res) { return res.json() })
      .then(function(data) {
        var parsed = parseLrc(data && data.lyric)
        if (parsed) return parsed
        throw new Error('no lyric')
      })
      .catch(function() {
        var lrcUrl = song.metingLrc || getMetingMediaUrl('lrc', song.id)
        return fetch(lrcUrl)
          .then(function(res) { return res.text() })
          .then(function(text) {
            var raw = text
            try {
              var json = JSON.parse(text)
              raw = (json && (json.lyric || json.lrc)) || text
            } catch (e) {}
            return parseLrc(raw)
          })
          .catch(function() { return null })
      })
      .then(function(parsed) {
        _lyricCache[cacheKey] = parsed
        return parsed
      })
  }

  function getCurrentLyricLine(parsed) {
    if (!parsed || !parsed.length || !_audio) return ''
    var time = _audio.currentTime || 0
    var line = ''
    for (var i = 0; i < parsed.length; i++) {
      if (parsed[i].t > time) break
      line = parsed[i].text
    }
    return line
  }

  function normalizeMetingSong(song) {
    song = song || {}
    var songId = song.id || extractMetingId(song.url) || extractMetingId(song.lrc)
    var picId = song.pic_id || extractMetingId(song.pic)
    return {
      id: songId || '',
      name: song.name || '',
      artist: song.artist || '未知',
      album: song.album || '',
      cover: song.cover || song.pic || 'img/ava-00.jpg',
      pic: song.pic || song.cover || '',
      pic_id: picId || '',
      source: 'netease',
      metingUrl: song.url || '',
      metingLrc: song.lrc || ''
    }
  }

  function normalizeMetingSongs(songs) {
    return (songs || []).map(normalizeMetingSong).filter(function(song) {
      return song.name && song.id
    })
  }

  function normalizeMusicApiPlaylistTrack(track) {
    track = track || {}
    var artists = track.ar || track.artists || []
    var album = track.al || track.album || {}
    return {
      id: track.id || '',
      name: track.name || '',
      artist: Array.isArray(artists) ? artists.map(function(artist) { return artist.name || '' }).filter(Boolean).join(', ') : '',
      album: (typeof album === 'object' ? album.name : album) || '',
      cover: (typeof album === 'object' && album.picUrl) ? album.picUrl : 'img/ava-00.jpg',
      pic: (typeof album === 'object' && album.picUrl) ? album.picUrl : '',
      pic_id: (typeof album === 'object' ? (album.pic_str || album.pic || '') : '') || '',
      source: 'netease',
      metingUrl: ''
    }
  }

  function normalizeMusicApiPlaylistTracks(tracks) {
    return (tracks || []).map(normalizeMusicApiPlaylistTrack).filter(function(song) {
      return song.name && song.id
    })
  }

  function fetchMusicApiPlaylist(playlistId, requireTracks) {
    var url = MUSIC_API + '?types=playlist&source=netease&id=' + encodeURIComponent(playlistId)
    return fetch(url)
      .then(function(res) { return res.json() })
      .then(function(data) {
        var playlist = data && data.code === 200 && data.playlist
        if (!playlist) throw new Error('playlist empty')
        var tracks = normalizeMusicApiPlaylistTracks(playlist.tracks || [])
        if (requireTracks && !tracks.length) throw new Error('tracks empty')
        if (!playlist.name || !playlist.coverImgUrl) throw new Error('playlist meta empty')
        return {
          id: playlist.id || playlistId,
          name: playlist.name,
          coverImgUrl: playlist.coverImgUrl,
          picUrl: playlist.picUrl || playlist.coverImgUrl,
          tracks: tracks
        }
      })
  }

  function fetchMusicApiPlaylistMetaWithRetry(playlistId, maxAttempts) {
    var attempts = 0
    function next() {
      attempts++
      return fetchMusicApiPlaylist(playlistId, false).catch(function(err) {
        if (attempts >= maxAttempts) throw err
        return next()
      })
    }
    return next()
  }

  function searchMeting(keyword, count) {
    return fetchMetingJson('search', { id: keyword, limit: count || 20 })
      .then(function(data) { return normalizeMetingSongs(data) })
  }

  function fetchSearchWithFallback(keyword, count) {
    var url = MUSIC_API + '?types=search&source=netease&name=' + encodeURIComponent(keyword) + '&count=' + encodeURIComponent(count || 20) + '&pages=1'
    return fetch(url)
      .then(function(res) { return res.json() })
      .then(function(data) {
        if (data && data.length) return data
        return searchMeting(keyword, count)
      })
      .catch(function() { return searchMeting(keyword, count) })
  }

  function fetchPicWithFallback(song, size) {
    song = song || {}
    if (!song.pic_id) return Promise.resolve(song.pic || song.cover || '')
    var picUrl = MUSIC_API + '?types=pic&source=' + encodeURIComponent(song.source || 'netease') + '&id=' + encodeURIComponent(song.pic_id) + '&size=' + encodeURIComponent(size || 300)
    return fetch(picUrl)
      .then(function(res) { return res.json() })
      .then(function(data) {
        if (data && data.url) return data.url
        return song.pic || song.cover || getMetingMediaUrl('pic', song.pic_id, { cover: size || 300 })
      })
      .catch(function() {
        return song.pic || song.cover || getMetingMediaUrl('pic', song.pic_id, { cover: size || 300 })
      })
  }

  function cloneDefaultProfile() {
    return {
      avatar: DEFAULT_MUSIC_PROFILE.avatar,
      backgroundImage: DEFAULT_MUSIC_PROFILE.backgroundImage,
      nickname: DEFAULT_MUSIC_PROFILE.nickname,
      vipLevel: DEFAULT_MUSIC_PROFILE.vipLevel,
      following: DEFAULT_MUSIC_PROFILE.following,
      followers: DEFAULT_MUSIC_PROFILE.followers,
      level: DEFAULT_MUSIC_PROFILE.level,
      listenHours: DEFAULT_MUSIC_PROFILE.listenHours,
      cards: DEFAULT_MUSIC_PROFILE.cards.map(function(card) {
        return { img: card.img, label: card.label }
      })
    }
  }

  function normalizeMusicProfile(profile) {
    var base = cloneDefaultProfile()
    if (!profile || typeof profile !== 'object') return base
    base.avatar = profile.avatar || base.avatar
    base.backgroundImage = profile.backgroundImage || base.backgroundImage
    base.nickname = profile.nickname || base.nickname
    base.vipLevel = profile.vipLevel || base.vipLevel
    base.following = profile.following !== undefined ? String(profile.following) : base.following
    base.followers = profile.followers !== undefined ? String(profile.followers) : base.followers
    base.level = profile.level || base.level
    base.listenHours = profile.listenHours !== undefined ? String(profile.listenHours) : base.listenHours
    if (Array.isArray(profile.cards)) {
      for (var i = 0; i < base.cards.length; i++) {
        if (profile.cards[i]) {
          base.cards[i].img = profile.cards[i].img || base.cards[i].img
          base.cards[i].label = profile.cards[i].label !== undefined ? String(profile.cards[i].label) : base.cards[i].label
        }
      }
    }
    return base
  }

  async function getMusicProfile() {
    if (_musicProfile) return normalizeMusicProfile(_musicProfile)
    if (!window.db || !db.config) {
      _musicProfile = cloneDefaultProfile()
      return normalizeMusicProfile(_musicProfile)
    }
    try {
      var record = await db.config.get('musicProfile')
      _musicProfile = normalizeMusicProfile(record && record.value)
    } catch (e) {
      _musicProfile = cloneDefaultProfile()
    }
    return normalizeMusicProfile(_musicProfile)
  }

  async function saveMusicProfile(profile) {
    _musicProfile = normalizeMusicProfile(profile)
    if (window.db && db.config) {
      await db.config.put({ key: 'musicProfile', value: _musicProfile })
    }
  }

  var _retryCount = 0

  function getAudio() {
    if (!_audio) {
      _audio = new Audio()
      _audio.addEventListener('ended', function() {
        if (_repeatMode === 'one') {
          _audio.currentTime = 0
          _audio.play().catch(function() {})
          return
        }
        playNextInQueue()
      })
      _audio.addEventListener('error', function() {
        if (_metingFallbackIndex < _metingFallbackUrls.length) {
          var nextUrl = _metingFallbackUrls[_metingFallbackIndex++]
          _audio.src = nextUrl
          _audio.play().then(function() {
            _isPlaying = true
            updatePlayerBarUI()
            updateNowPlayingUI()
            startProgressTimer()
          }).catch(function() {})
          return
        }
        _isPlaying = false
        updatePlayerBarUI()
        updateNowPlayingUI()
        if (_retryCount === 0) {
          _retryCount = 1
          window.toast && window.toast('加载失败，5秒后重试...')
          setTimeout(function() {
            if (_currentSong && _audio) {
              var src = _audio.src
              _audio.src = ''
              _audio.src = src
              _audio.play().then(function() {
                _isPlaying = true
                _retryCount = 0
                updatePlayerBarUI()
                updateNowPlayingUI()
                startProgressTimer()
              }).catch(function() {
                _retryCount = 0
                window.toast && window.toast('重试失败，跳到下一首')
                playNextInQueue()
              })
            }
          }, 5000)
        } else {
          _retryCount = 0
          window.toast && window.toast('播放失败，跳到下一首')
          playNextInQueue()
        }
      })
    }
    return _audio
  }

  function playNextInQueue() {
    if (_playQueue.length === 0) {
      _isPlaying = false
      updatePlayerBarUI()
      updateNowPlayingUI()
      return
    }
    var nextIdx = _playQueueIndex + 1
    if (nextIdx >= _playQueue.length) {
      nextIdx = 0
    }
    _playQueueIndex = nextIdx
    var nextSong = _playQueue[nextIdx]
    if (nextSong) {
      playFromQueueItem(nextSong)
    } else {
      _isPlaying = false
      updatePlayerBarUI()
      updateNowPlayingUI()
    }
  }

  function playPrevInQueue() {
    if (_playQueue.length === 0) {
      if (_audio) {
        _audio.currentTime = 0
        updateNowPlayingProgress()
      }
      return
    }
    var prevIdx = _playQueueIndex - 1
    if (prevIdx < 0) {
      prevIdx = _playQueue.length - 1
    }
    _playQueueIndex = prevIdx
    var prevSong = _playQueue[prevIdx]
    if (prevSong) {
      playFromQueueItem(prevSong)
    }
  }

  function playFromQueueItem(song) {
    _retryCount = 0

    if (song.songId) {
      var directSong = {
        id: song.songId,
        name: song.title || song.search || '',
        artist: song.artist || '',
        album: song.album || '',
        pic_id: song.pic_id || '',
        source: song.source || 'netease',
        cover: song.cover || '',
        pic: song.cover || '',
        metingUrl: song.metingUrl || ''
      }
      playSong(directSong, null)
      return
    }

    var keyword = song.search || song.title
    window.toast && window.toast('加载中...')

    fetchSearchWithFallback(keyword, 5)
      .then(function(data) {
        if (!data || !data.length) {
          window.toast && window.toast('未找到该歌曲，跳到下一首')
          setTimeout(function() { playNextInQueue() }, 1000)
          return
        }
        playSong(data[0], null)
      })
      .catch(function() {
        window.toast && window.toast('搜索失败，跳到下一首')
        setTimeout(function() { playNextInQueue() }, 1000)
      })
  }

  window.getMusicTogetherContext = async function() {
    if (!_togetherActive || !_togetherFriend || !_currentSong) return null
    var lyricLine = ''
    try {
      var parsed = await Promise.race([
        fetchCurrentSongLyric(),
        new Promise(function(resolve) { setTimeout(function() { resolve(null) }, 2500) })
      ])
      if (parsed) lyricLine = getCurrentLyricLine(parsed)
    } catch (e) {}
    return {
      friendId: _togetherFriend.id,
      friendName: _togetherFriend.name,
      songName: _currentSong.name || '',
      artist: _currentSong.artist || '',
      lyricLine: lyricLine
    }
  }

  window.showMusicPage = async function() {
    var profile = await getMusicProfile()
    await getPlaylistSettings()
    await getUserPlaylists()
    await loadLikedSongs()
    var page = document.createElement('div')
    page.id = 'music-page'
    page.className = 'full-page music-app'
    applyMusicPageBackground(page, profile)
    page.innerHTML = buildMusicPageHTML(profile)
    window.openPage(page)
    bindMusicPageEvents(page)
    extractCardColors(page)
  }

  function applyMusicPageBackground(page, profile) {
    if (!page) return
    var bg = profile && profile.backgroundImage ? profile.backgroundImage : ''
    if (bg) {
      page.style.setProperty('--music-page-bg', 'url("' + bg.replace(/"/g, '\\"') + '")')
      page.classList.add('music-has-page-bg')
    } else {
      page.style.removeProperty('--music-page-bg')
      page.classList.remove('music-has-page-bg')
    }
  }

  function buildMusicPageHTML(profile) {
    return '' +
      '<div class="music-app-bg">' +
        '<div class="music-app-deco deco-1">&#10045;</div>' +
        '<div class="music-app-deco deco-2">&#10045;</div>' +
        '<div class="music-app-deco deco-3">&#10045;</div>' +
        '<div class="music-app-deco deco-4">&#10045;</div>' +
        '<div class="music-app-deco deco-star s1">&#10022;</div>' +
        '<div class="music-app-deco deco-star s2">&#10022;</div>' +
        '<div class="music-app-deco deco-star s3">&#10022;</div>' +
        '<div class="music-app-deco deco-star s4">&#10022;</div>' +
      '</div>' +

      buildTopBar() +

      '<div class="music-scroll">' +
        buildProfile(profile) +
        buildStatsRow(profile) +
        buildQuickTabs() +
        buildPhotoCards(profile) +
        buildSvipBanner() +
        buildContentTabs() +
        '<div class="music-content-divider"></div>' +
        buildSubTabs() +
        buildPlaylistList() +
      '</div>' +

      buildPlayerBar('music-player-bar') +
      buildBottomNav() +
      buildSearchOverlay()
  }

  function buildTopBar() {
    return '' +
      '<div class="music-topbar">' +
        '<div class="music-topbar-left">' +
          '<button class="music-topbar-btn" id="music-back">' +
            '<i class="fa-solid fa-bars"></i>' +
          '</button>' +
        '</div>' +
        '<div class="music-topbar-center">' +
          '<span class="music-topbar-status">' +
            '<i class="fa-solid fa-plus"></i> 添加状态' +
          '</span>' +
        '</div>' +
        '<div class="music-topbar-right">' +
          '<button class="music-topbar-btn" id="music-search-btn"><i class="fa-solid fa-magnifying-glass"></i></button>' +
          '<button class="music-topbar-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>' +
      '</div>'
  }

  function buildProfile(profile) {
    return '' +
      '<div class="music-profile">' +
        '<div class="music-avatar-wrap">' +
          '<img src="' + esc(profile.avatar) + '" alt="">' +
        '</div>' +
        '<div class="music-username-row">' +
          '<span class="music-username">' + esc(profile.nickname) + '</span>' +
          '<span class="music-vip-badge">' +
            esc(profile.vipLevel) +
          '</span>' +
        '</div>' +
      '</div>'
  }

  function buildStatsRow(profile) {
    return '' +
      '<div class="music-stats-row">' +
        '<div class="music-stat-item">' +
          '<span class="music-stat-num">' + esc(profile.following) + '</span>' +
          '<span class="music-stat-label">关注</span>' +
        '</div>' +
        '<div class="music-stat-item">' +
          '<span class="music-stat-num">' + esc(profile.followers) + '</span>' +
          '<span class="music-stat-label">粉丝</span>' +
        '</div>' +
        '<div class="music-stat-item">' +
          '<span class="music-stat-num">' + esc(profile.level) + '</span>' +
        '</div>' +
        '<div class="music-stat-item">' +
          '<span class="music-stat-num">' + esc(profile.listenHours) + '</span>' +
          '<span class="music-stat-label">小时</span>' +
        '</div>' +
      '</div>'
  }

  function buildQuickTabs() {
    var tabs = [
      { icon: 'fa-solid fa-clock', label: '最近' },
      { icon: 'fa-solid fa-folder-open', label: '本地' },
      { icon: 'fa-solid fa-cloud-arrow-down', label: '网盘' },
      { icon: 'fa-solid fa-shirt', label: '装扮' }
    ]
    var items = tabs.map(function(tab) {
      var action = tab.label === '装扮' ? ' data-action="dressup"' : ''
      return '<button class="music-quick-tab"' + action + '>' +
        '<i class="' + tab.icon + '"></i>' +
        '<span>' + esc(tab.label) + '</span>' +
      '</button>'
    }).join('')
    return '<div class="music-quick-tabs">' + items + '</div>'
  }

  function buildPhotoCards(profile) {
    var items = profile.cards.map(function(card) {
      return '<div class="music-photo-card">' +
        '<div class="music-photo-card-img">' +
          '<img src="' + esc(card.img) + '" alt="" crossorigin="anonymous">' +
        '</div>' +
        '<div class="music-photo-card-label"><span>' + esc(card.label) + '</span></div>' +
      '</div>'
    }).join('')
    return '<div class="music-photo-cards">' + items + '</div>'
  }

  function applyCardColor(card) {
    var img = card.querySelector('.music-photo-card-img img')
    var label = card.querySelector('.music-photo-card-label')
    if (!img || !label) return

    function extractAndApply() {
      try {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        var w = 50, h = 50
        canvas.width = w
        canvas.height = h
        ctx.drawImage(img, 0, 0, w, h)
        var data = ctx.getImageData(0, 0, w, h).data
        var cx = Math.floor(w / 2)
        var cy = Math.floor(h / 2)
        var idx = (cy * w + cx) * 4
        var r = Math.round(data[idx] * 0.72)
        var g = Math.round(data[idx + 1] * 0.72)
        var b = Math.round(data[idx + 2] * 0.72)
        var solid = 'rgb(' + r + ',' + g + ',' + b + ')'
        label.style.background = 'linear-gradient(to bottom, transparent 50%, rgba(255,255,255,0.15) 100%), ' + solid
      } catch (e) {}
    }

    if (img.complete && img.naturalWidth > 0) {
      extractAndApply()
    } else {
      img.addEventListener('load', extractAndApply)
    }
  }

  function extractCardColors(page) {
    var cards = page.querySelectorAll('.music-photo-card')
    for (var i = 0; i < cards.length; i++) {
      applyCardColor(cards[i])
    }
  }

  function buildSvipBanner() {
    return ''
  }

  function buildContentTabs() {
    return '' +
      '<div class="music-content-tabs">' +
        '<button class="music-content-tab active">音乐</button>' +
        '<button class="music-content-tab">播客</button>' +
        '<button class="music-content-tab">笔记</button>' +
      '</div>'
  }

  function buildSubTabs() {
    return '' +
      '<div class="music-sub-tabs">' +
        '<span class="music-sub-lock"><i class="fa-solid fa-lock"></i></span>' +
        '<button class="music-sub-tab active">近期</button>' +
        '<button class="music-sub-tab">创建<span class="music-sub-tab-sup">5</span></button>' +
        '<button class="music-sub-tab">收藏<span class="music-sub-tab-sup">3</span></button>' +
        '<div class="music-sub-tab-right">' +
          '<button class="music-sub-tab-icon"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>' +
          '<button class="music-sub-tab-icon" id="music-playlist-menu-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>' +
      '</div>'
  }

  function buildPlaylistList() {
    var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    var userPls = _userPlaylists || []

    var likedHTML = '' +
      '<div class="music-playlist-item" data-open-detail="true">' +
        '<div class="music-playlist-cover"><img src="' + esc(settings.cover) + '" alt=""></div>' +
        '<div class="music-playlist-info">' +
          '<div class="music-playlist-title">' + esc(settings.name) + '</div>' +
          '<div class="music-playlist-sub">' + PLAYLIST_DETAIL_SONGS.length + '首·' + settings.playCount + '次播放</div>' +
        '</div>' +
        '<button class="music-playlist-action"><i class="fa-solid fa-heart-pulse"></i> 心动模式</button>' +
        '<button class="music-playlist-more"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
      '</div>'

    var userHTML = userPls.map(function(pl) {
      var songCount = pl.songCount || 0
      var playCount = pl.playCount || 0
      return '' +
        '<div class="music-playlist-item" data-user-playlist-id="' + pl.id + '">' +
          '<div class="music-playlist-cover"><img src="' + esc(pl.cover || 'img/music_blank.jpg') + '" alt=""></div>' +
          '<div class="music-playlist-info">' +
            '<div class="music-playlist-title">' + esc(pl.name) + '</div>' +
            '<div class="music-playlist-sub">歌单·' + songCount + '首·' + playCount + '次播放</div>' +
          '</div>' +
          '<button class="music-playlist-more"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>'
    }).join('')

    return '<div class="music-playlist-list">' + likedHTML + userHTML + '</div>'
  }

  function buildPlayerBar(barId) {
    var hidden = !_currentSong ? ' style="display:none"' : ''
    var idAttr = barId ? ' id="' + barId + '"' : ''
    var songName = _currentSong ? esc(_currentSong.name) : ''
    var songArtist = _currentSong ? esc(_currentSong.artist) : ''
    var songPic = _currentSong && _currentSong.pic ? _currentSong.pic : 'img/ava-00.jpg'
    var playIcon = _isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'

    return '' +
      '<div class="music-player-bar"' + idAttr + hidden + '>' +
        '<div class="music-player-avatar">' +
          '<img src="' + esc(songPic) + '" alt="">' +
        '</div>' +
        '<div class="music-player-info">' +
          songName + ' <span class="song-artist">- ' + songArtist + '</span>' +
        '</div>' +
        '<div class="music-player-controls">' +
          '<button class="music-player-btn prev-btn"><i class="fa-solid fa-backward-step"></i></button>' +
          '<button class="music-player-btn play-btn"><i class="' + playIcon + '"></i></button>' +
          '<button class="music-player-btn next-btn"><i class="fa-solid fa-forward-step"></i></button>' +
        '</div>' +
      '</div>'
  }

  function buildBottomNav() {
    return ''
  }

  function buildSearchOverlay() {
    return '' +
      '<div class="music-search-overlay" id="music-search-overlay">' +
        '<div class="music-search-header">' +
          '<button class="music-search-back" id="music-search-back">' +
            '<i class="fa-solid fa-chevron-left"></i>' +
          '</button>' +
          '<div class="music-search-input-wrap">' +
            '<i class="fa-solid fa-magnifying-glass music-search-icon"></i>' +
            '<input type="text" class="music-search-input" id="music-search-input" placeholder="搜索歌曲、歌手">' +
          '</div>' +
          '<button class="music-search-submit" id="music-search-submit">搜索</button>' +
        '</div>' +
        '<div class="music-search-results" id="music-search-results">' +
          '<div class="music-search-empty">搜索你想听的歌曲</div>' +
        '</div>' +
      '</div>'
  }

  function bindMusicPageEvents(page) {
    var backBtn = page.querySelector('#music-back')
    var searchBtn = page.querySelector('#music-search-btn')
    var searchOverlay = page.querySelector('#music-search-overlay')
    var searchBack = page.querySelector('#music-search-back')
    var searchInput = page.querySelector('#music-search-input')
    var searchSubmit = page.querySelector('#music-search-submit')
    var playBtn = page.querySelector('.music-player-bar .play-btn')

    if (backBtn) {
      backBtn.addEventListener('click', function() {
        window.closePage && window.closePage('music-page')
      })
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', function() {
        searchOverlay.classList.add('show')
        setTimeout(function() { searchInput.focus() }, 300)
      })
    }

    if (searchBack) {
      searchBack.addEventListener('click', function() {
        searchOverlay.classList.remove('show')
      })
    }

    if (searchSubmit) {
      searchSubmit.addEventListener('click', function() {
        doSearch(searchInput.value.trim(), page)
      })
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          doSearch(searchInput.value.trim(), page)
        }
      })
    }

    if (playBtn) {
      playBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        togglePlay()
      })
    }

    var playerBar = page.querySelector('.music-player-bar')
    if (playerBar) {
      playerBar.addEventListener('click', function() {
        openNowPlayingPage()
      })
      bindPlayerBarPrevNext(playerBar)
    }

    page.querySelectorAll('.music-playlist-item[data-open-detail]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.music-playlist-action') || e.target.closest('.music-playlist-more')) return
        openPlaylistDetailPage()
      })
    })

    bindUserPlaylistClicks(page)

    var playlistMenuBtn = page.querySelector('#music-playlist-menu-btn')
    if (playlistMenuBtn) {
      playlistMenuBtn.addEventListener('click', function() {
        showPlaylistMenu(playlistMenuBtn)
      })
    }

    bindMusicDressupButtons(page)
  }

  function bindMusicDressupButtons(page) {
    page.querySelectorAll('[data-action="dressup"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        openMusicDressupPage()
      })
    })
  }

  async function refreshMusicProfilePage() {
    var page = document.getElementById('music-page')
    if (!page) return
    var profile = await getMusicProfile()
    await getPlaylistSettings()
    await getUserPlaylists()
    var scroll = page.querySelector('.music-scroll')
    if (!scroll) return
    applyMusicPageBackground(page, profile)
    scroll.innerHTML =
      buildProfile(profile) +
      buildStatsRow(profile) +
      buildQuickTabs() +
      buildPhotoCards(profile) +
      buildSvipBanner() +
      buildContentTabs() +
      '<div class="music-content-divider"></div>' +
      buildSubTabs() +
      buildPlaylistList()
    bindMusicDressupButtons(page)
    extractCardColors(page)
    page.querySelectorAll('.music-playlist-item[data-open-detail]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.music-playlist-action') || e.target.closest('.music-playlist-more')) return
        openPlaylistDetailPage()
      })
    })
    bindUserPlaylistClicks(page)
    var playlistMenuBtn = page.querySelector('#music-playlist-menu-btn')
    if (playlistMenuBtn) {
      playlistMenuBtn.addEventListener('click', function() {
        showPlaylistMenu(playlistMenuBtn)
      })
    }
  }

  async function openMusicDressupPage() {
    var profile = await getMusicProfile()
    var page = document.createElement('div')
    page.id = 'music-dressup-page'
    page.className = 'full-page music-app music-dressup-page'
    applyMusicPageBackground(page, profile)
    page.innerHTML = buildMusicDressupHTML(profile)
    window.openPage(page)
    bindMusicDressupEvents(page)
  }

  function buildMusicDressupHTML(profile) {
    var cards = profile.cards.map(function(card, index) {
      return '' +
        '<div class="music-dress-card-editor" data-card-index="' + index + '">' +
          '<button class="music-dress-card-image" type="button" data-card-image="' + index + '">' +
            '<img src="' + esc(card.img) + '" alt="">' +
            '<span><i class="fa-solid fa-image"></i></span>' +
          '</button>' +
          '<input type="hidden" id="music-card-img-' + index + '" value="' + esc(card.img) + '">' +
          '<label class="music-dress-field">' +
            '<span>卡片文字 ' + (index + 1) + '</span>' +
            '<input class="input-field" id="music-card-label-' + index + '" value="' + esc(card.label) + '" placeholder="输入卡片文字">' +
          '</label>' +
        '</div>'
    }).join('')

    return '' +
      '<div class="music-dress-header">' +
        '<button class="music-dress-back" id="music-dress-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>' +
        '<div class="music-dress-title">编辑资料</div>' +
        '<button class="music-dress-save" id="music-dress-save" type="button">保存</button>' +
      '</div>' +
      '<div class="music-dress-scroll">' +
        '<section class="music-dress-section">' +
          '<button class="music-dress-avatar" id="music-dress-avatar" type="button">' +
            '<img src="' + esc(profile.avatar) + '" alt="">' +
            '<span><i class="fa-solid fa-camera"></i></span>' +
          '</button>' +
          '<input type="hidden" id="music-avatar-input" value="' + esc(profile.avatar) + '">' +
          '<label class="music-dress-field">' +
            '<span>昵称</span>' +
            '<input class="input-field" id="music-nickname-input" value="' + esc(profile.nickname) + '" placeholder="昵称">' +
          '</label>' +
          '<label class="music-dress-field">' +
            '<span>会员等级</span>' +
            '<input class="input-field" id="music-vip-input" value="' + esc(profile.vipLevel) + '" placeholder="VIP·柒">' +
          '</label>' +
          '<div class="music-bg-editor">' +
            '<button class="music-bg-picker" id="music-bg-picker" type="button">' +
              '<span class="music-bg-preview" id="music-bg-preview"' + (profile.backgroundImage ? ' style="background-image:url(' + esc(profile.backgroundImage) + ')"' : '') + '></span>' +
              '<span>页面背景</span>' +
              '<i class="fa-solid fa-chevron-right"></i>' +
            '</button>' +
            '<input type="hidden" id="music-bg-input" value="' + esc(profile.backgroundImage) + '">' +
          '</div>' +
        '</section>' +
        '<section class="music-dress-section music-dress-grid">' +
          '<label class="music-dress-field">' +
            '<span>关注</span>' +
            '<input class="input-field" id="music-following-input" value="' + esc(profile.following) + '" inputmode="numeric">' +
          '</label>' +
          '<label class="music-dress-field">' +
            '<span>粉丝</span>' +
            '<input class="input-field" id="music-followers-input" value="' + esc(profile.followers) + '" inputmode="numeric">' +
          '</label>' +
          '<label class="music-dress-field">' +
            '<span>等级</span>' +
            '<input class="input-field" id="music-level-input" value="' + esc(profile.level) + '" placeholder="Lv.8">' +
          '</label>' +
          '<label class="music-dress-field">' +
            '<span>听歌时长</span>' +
            '<input class="input-field" id="music-hours-input" value="' + esc(profile.listenHours) + '" inputmode="numeric">' +
          '</label>' +
        '</section>' +
        '<section class="music-dress-section">' +
          '<div class="music-dress-section-title">主页卡片</div>' +
          cards +
        '</section>' +
      '</div>'
  }

  function bindMusicDressupEvents(page) {
    page.querySelector('#music-dress-back').addEventListener('click', function() {
      window.closePage('music-dressup-page')
    })

    page.querySelector('#music-dress-avatar').addEventListener('click', function() {
      window.showImagePicker(function(imageUrl) {
        if (!imageUrl) return
        page.querySelector('#music-avatar-input').value = imageUrl
        page.querySelector('#music-dress-avatar img').src = imageUrl
      })
    })

    page.querySelector('#music-bg-picker').addEventListener('click', function() {
      window.showImagePicker(function(imageUrl) {
        if (!imageUrl) return
        page.querySelector('#music-bg-input').value = imageUrl
        page.querySelector('#music-bg-preview').style.backgroundImage = 'url(' + imageUrl + ')'
        var currentProfile = normalizeMusicProfile({
          avatar: page.querySelector('#music-avatar-input').value,
          backgroundImage: imageUrl
        })
        applyMusicPageBackground(page, currentProfile)
      })
    })

    page.querySelectorAll('[data-card-image]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var index = btn.getAttribute('data-card-image')
        window.showImagePicker(function(imageUrl) {
          if (!imageUrl) return
          page.querySelector('#music-card-img-' + index).value = imageUrl
          btn.querySelector('img').src = imageUrl
        })
      })
    })

    page.querySelector('#music-dress-save').addEventListener('click', async function() {
      var nextProfile = {
        avatar: page.querySelector('#music-avatar-input').value || DEFAULT_MUSIC_PROFILE.avatar,
        backgroundImage: page.querySelector('#music-bg-input').value.trim(),
        nickname: page.querySelector('#music-nickname-input').value.trim() || DEFAULT_MUSIC_PROFILE.nickname,
        vipLevel: page.querySelector('#music-vip-input').value.trim() || DEFAULT_MUSIC_PROFILE.vipLevel,
        following: page.querySelector('#music-following-input').value.trim() || DEFAULT_MUSIC_PROFILE.following,
        followers: page.querySelector('#music-followers-input').value.trim() || DEFAULT_MUSIC_PROFILE.followers,
        level: page.querySelector('#music-level-input').value.trim() || DEFAULT_MUSIC_PROFILE.level,
        listenHours: page.querySelector('#music-hours-input').value.trim() || DEFAULT_MUSIC_PROFILE.listenHours,
        cards: []
      }
      for (var i = 0; i < DEFAULT_MUSIC_PROFILE.cards.length; i++) {
        nextProfile.cards.push({
          img: page.querySelector('#music-card-img-' + i).value || DEFAULT_MUSIC_PROFILE.cards[i].img,
          label: page.querySelector('#music-card-label-' + i).value.trim() || DEFAULT_MUSIC_PROFILE.cards[i].label
        })
      }
      await saveMusicProfile(nextProfile)
      await refreshMusicProfilePage()
      window.closePage('music-dressup-page')
      window.toast && window.toast('装扮已保存')
    })
  }

  function doSearch(keyword, page) {
    if (!keyword) {
      window.toast && window.toast('请输入搜索内容')
      return
    }
    if (_searchLoading) return
    _searchLoading = true

    var resultsContainer = page.querySelector('#music-search-results')
    resultsContainer.innerHTML = '<div class="music-search-loading"><i class="fa-solid fa-spinner fa-spin"></i> 搜索中...</div>'

    fetchSearchWithFallback(keyword, 20)
      .then(function(data) {
        _searchLoading = false
        if (!data || !data.length) {
          resultsContainer.innerHTML = '<div class="music-search-empty">未找到相关歌曲</div>'
          return
        }
        renderSearchResults(data, resultsContainer, page)
      })
      .catch(function() {
        _searchLoading = false
        resultsContainer.innerHTML = '<div class="music-search-empty">搜索失败，请重试</div>'
      })
  }

  function seedRandom(index) {
    var x = Math.sin(index * 9301 + 49297) * 233280
    return x - Math.floor(x)
  }

  function renderSearchResults(songs, container, page) {
    var html = songs.map(function(song, index) {
      var artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知')
      var hasSQ = seedRandom(index * 2) < 0.95
      var hasVIP = seedRandom(index * 2 + 1) < 0.70
      song._hasSQ = hasSQ
      song._hasVIP = hasVIP
      var badgesHTML = ''
      if (hasSQ) badgesHTML += '<span class="pd-badge pd-badge-sq">超清母带</span>'
      if (hasVIP) badgesHTML += '<span class="pd-badge pd-badge-vip">VIP</span>'
      return '' +
        '<div class="music-search-item" data-index="' + index + '">' +
          '<div class="music-search-item-index">' + (index + 1) + '</div>' +
          '<div class="music-search-item-info">' +
            '<div class="music-search-item-name">' + esc(song.name) + '</div>' +
            '<div class="music-search-item-artist">' +
              badgesHTML +
              '<span>' + esc(artist) + (song.album ? ' - ' + esc(song.album) : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="music-search-item-more" data-more-index="' + index + '"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>'
    }).join('')

    container.innerHTML = html

    container.querySelectorAll('.music-search-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.music-search-item-more')) return
        var idx = parseInt(item.getAttribute('data-index'))
        _playQueue = []
        _playQueueIndex = -1
        _playQueueSource = '心动电台'
        playSong(songs[idx], page)
      })
    })

    container.querySelectorAll('.music-search-item-more').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var idx = parseInt(btn.getAttribute('data-more-index'))
        showSearchItemMenu(songs[idx], btn)
      })
    })
  }

  function showSearchItemMenu(song, anchorBtn) {
    var existing = document.querySelector('.music-search-menu-popup')
    if (existing) existing.remove()

    var overlay = document.createElement('div')
    overlay.className = 'music-search-menu-overlay'

    var menu = document.createElement('div')
    menu.className = 'music-search-menu-popup'

    menu.innerHTML =
      '<button class="music-search-menu-item" id="menu-add-like">' +
        '<i class="fa-solid fa-headphones"></i>' +
        '<span>添加到喜欢</span>' +
      '</button>' +
      '<button class="music-search-menu-item" id="menu-add-to-playlist">' +
        '<i class="fa-solid fa-folder-plus"></i>' +
        '<span>添加到歌单</span>' +
      '</button>'

    document.body.appendChild(overlay)
    document.body.appendChild(menu)

    var rect = anchorBtn.getBoundingClientRect()
    menu.style.top = (rect.bottom + 4) + 'px'
    menu.style.right = (window.innerWidth - rect.right) + 'px'

    if (menu.getBoundingClientRect().bottom > window.innerHeight - 10) {
      menu.style.top = ''
      menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    }

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      menu.classList.add('show')
    })

    function closeMenu() {
      overlay.classList.remove('show')
      menu.classList.remove('show')
      setTimeout(function() { overlay.remove(); menu.remove() }, 200)
    }

    overlay.addEventListener('click', closeMenu)

    menu.querySelector('#menu-add-like').addEventListener('click', function() {
      addSongToLiked(song)
      closeMenu()
    })

    menu.querySelector('#menu-add-to-playlist').addEventListener('click', function() {
      closeMenu()
      setTimeout(function() { showPlaylistPickerForSong(song) }, 220)
    })
  }

  function showPlaylistPickerForSong(song) {
    var userPls = _userPlaylists || []
    if (!userPls.length) {
      window.toast && window.toast('暂无自建歌单，请先创建歌单')
      return
    }

    var overlay = document.createElement('div')
    overlay.className = 'cp-dialog-overlay'

    var dialog = document.createElement('div')
    dialog.className = 'cp-dialog playlist-picker-dialog'

    var plsHTML = userPls.map(function(pl) {
      return '<button class="playlist-picker-item" data-picker-pl-id="' + pl.id + '">' +
        '<div class="playlist-picker-cover"><img src="' + esc(pl.cover || 'img/music_blank.jpg') + '" alt=""></div>' +
        '<div class="playlist-picker-info">' +
          '<div class="playlist-picker-name">' + esc(pl.name) + '</div>' +
          '<div class="playlist-picker-count">' + (pl.songCount || 0) + '首</div>' +
        '</div>' +
      '</button>'
    }).join('')

    dialog.innerHTML =
      '<div class="cp-dialog-title">添加到歌单</div>' +
      '<div class="playlist-picker-list">' + plsHTML + '</div>'

    document.body.appendChild(overlay)
    document.body.appendChild(dialog)

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      dialog.classList.add('show')
    })

    function closeDialog() {
      overlay.classList.remove('show')
      dialog.classList.remove('show')
      setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
    }

    overlay.addEventListener('click', closeDialog)

    dialog.querySelectorAll('[data-picker-pl-id]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var plId = parseInt(btn.getAttribute('data-picker-pl-id'))
        closeDialog()
        if (!isNaN(plId)) {
          addSongToUserPlaylist(song, plId, null)
        }
      })
    })
  }

  function addSongToLiked(song) {
    var artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知')
    var album = song.album || ''

    for (var i = 0; i < PLAYLIST_DETAIL_SONGS.length; i++) {
      if (PLAYLIST_DETAIL_SONGS[i].title === (song.name || '') && PLAYLIST_DETAIL_SONGS[i].artist === artist) {
        window.toast && window.toast('该歌曲已在喜欢列表中')
        return
      }
    }

    var newSong = {
      title: song.name || '',
      search: song.name || '',
      artist: artist,
      album: album,
      cover: song.cover || song.pic || 'img/ava-00.jpg',
      badges: song._hasSQ ? ['超清母带'] : [],
      vip: !!song._hasVIP,
      songId: song.id,
      source: song.source || 'netease',
      pic_id: song.pic_id,
      metingUrl: song.metingUrl || ''
    }

    PLAYLIST_DETAIL_SONGS.push(newSong)
    window.toast && window.toast('已添加到我喜欢的音乐')
    refreshLikedUI()
    saveLikedSongs()

    if (song.pic_id) {
      fetchPicWithFallback(song, 300).then(function(picUrl) {
        if (picUrl) {
          newSong.cover = picUrl
          refreshLikedUI()
          saveLikedSongs()
        }
      }).catch(function() {})
    }
  }

  function refreshLikedUI() {
    var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    var mainPlaylist = document.querySelector('.music-playlist-item[data-open-detail] .music-playlist-sub')
    if (mainPlaylist) mainPlaylist.textContent = PLAYLIST_DETAIL_SONGS.length + '首·' + settings.playCount + '次播放'

    var detailPage = document.getElementById('playlist-detail-page')
    if (detailPage) {
      var songList = detailPage.querySelector('.pd-song-list')
      if (songList) {
        songList.innerHTML = buildPDSongListInner()
        rebindPDSongEvents(detailPage)
      }
      updatePDSongCount(detailPage)
    }
  }

  function buildPDSongListInner() {
    return PLAYLIST_DETAIL_SONGS.map(function(song, index) {
      var badgesHTML = ''
      if (song.vip) badgesHTML += '<span class="pd-badge pd-badge-vip">VIP</span>'
      for (var i = 0; i < song.badges.length; i++) {
        badgesHTML += '<span class="pd-badge pd-badge-sq">' + esc(song.badges[i]) + '</span>'
      }
      var artistText = esc(song.artist)
      if (song.album) artistText += ' - ' + esc(song.album)
      return '' +
        '<div class="pd-song-item" data-song-idx="' + index + '">' +
          '<div class="pd-song-cover"><img src="' + esc(song.cover) + '" alt=""></div>' +
          '<div class="pd-song-info">' +
            '<div class="pd-song-title">' + esc(song.title) + '</div>' +
            '<div class="pd-song-sub">' +
              badgesHTML +
              '<span class="pd-song-artist">' + artistText + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="pd-song-more" data-pd-remove="' + index + '"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>'
    }).join('')
  }

  function rebindPDSongEvents(page) {
    var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    page.querySelectorAll('.pd-song-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.pd-song-more')) return
        var idx = parseInt(item.getAttribute('data-song-idx'))
        if (!isNaN(idx) && PLAYLIST_DETAIL_SONGS[idx]) {
          playFromPlaylistDetail(PLAYLIST_DETAIL_SONGS[idx], page, PLAYLIST_DETAIL_SONGS, idx, settings.name)
        }
      })
    })

    bindPlaylistSongRemoveButtons(page, function(songIdx) {
      if (songIdx >= 0 && songIdx < PLAYLIST_DETAIL_SONGS.length) {
        PLAYLIST_DETAIL_SONGS.splice(songIdx, 1)
        return saveLikedSongs().then(function() {
          refreshLikedUI()
          return refreshMusicProfilePage()
        })
      }
      return Promise.resolve()
    })
  }

  function bindPlaylistSongRemoveButtons(page, onRemove) {
    page.querySelectorAll('[data-pd-remove]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var idx = parseInt(btn.getAttribute('data-pd-remove'))
        showPDSongRemoveMenu(idx, btn, onRemove)
      })
    })
  }

  function showPDSongRemoveMenu(songIdx, anchorBtn, onRemove) {
    var existing = document.querySelector('.music-search-menu-popup')
    if (existing) existing.remove()
    var existingOverlay = document.querySelector('.music-search-menu-overlay')
    if (existingOverlay) existingOverlay.remove()

    var overlay = document.createElement('div')
    overlay.className = 'music-search-menu-overlay'
    var menu = document.createElement('div')
    menu.className = 'music-search-menu-popup'
    menu.innerHTML =
      '<button class="music-search-menu-item" id="liked-song-remove">' +
        '<i class="fa-solid fa-trash-can"></i>' +
        '<span>从歌单中移除</span>' +
      '</button>'

    document.body.appendChild(overlay)
    document.body.appendChild(menu)

    var rect = anchorBtn.getBoundingClientRect()
    menu.style.top = (rect.bottom + 4) + 'px'
    menu.style.right = (window.innerWidth - rect.right) + 'px'
    if (menu.getBoundingClientRect().bottom > window.innerHeight - 10) {
      menu.style.top = ''
      menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    }

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      menu.classList.add('show')
    })

    function closeMenu() {
      overlay.classList.remove('show')
      menu.classList.remove('show')
      setTimeout(function() { overlay.remove(); menu.remove() }, 200)
    }

    overlay.addEventListener('click', closeMenu)

    menu.querySelector('#liked-song-remove').addEventListener('click', async function() {
      closeMenu()
      if (typeof onRemove === 'function') {
        await onRemove(songIdx)
        window.toast && window.toast('已从歌单中移除')
      }
    })
  }

  function updatePDSongCount(page) {
    var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    var countEl = page.querySelector('.pd-play-all-count')
    if (countEl) countEl.textContent = PLAYLIST_DETAIL_SONGS.length + '首'
    var mainPlaylist = document.querySelector('.music-playlist-item[data-open-detail] .music-playlist-sub')
    if (mainPlaylist) mainPlaylist.textContent = PLAYLIST_DETAIL_SONGS.length + '首·' + settings.playCount + '次播放'
  }

  function playSong(song, page) {
    if (!song || !song.id) return

    if (_playQueue.length === 0) {
      _playQueueSource = '心动电台'
    }

    var artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知')
    _currentSong = {
      id: song.id,
      name: song.name,
      artist: artist,
      album: song.album || '',
      pic_id: song.pic_id,
      source: song.source || 'netease',
      pic: null
    }

    showPlayerBar(page)
    updatePlayerBarUI()
    window.toast && window.toast('加载中...')

    var songUrl = MUSIC_API + '?types=url&source=' + encodeURIComponent(_currentSong.source) + '&id=' + encodeURIComponent(song.id)

    var picPromise = fetchPicWithFallback(song, 300).then(function(url) { return { url: url } }).catch(function() { return {} })
    var urlPromise = fetch(songUrl).then(function(res) { return res.json() }).catch(function() { return {} })

    Promise.all([picPromise, urlPromise]).then(function(results) {
      var picData = results[0]
      var urlData = results[1]

      if (picData && picData.url) {
        _currentSong.pic = picData.url
      } else if (song.pic || song.cover) {
        _currentSong.pic = song.pic || song.cover
      } else if (song.pic_id) {
        _currentSong.pic = getMetingMediaUrl('pic', song.pic_id, { cover: 300 })
      }

      updatePlayerBarUI()
      updateNowPlayingUI()

      if (!urlData || !urlData.url) {
        var metingUrls = getMetingMediaUrls('url', song.id)
        if (song.metingUrl && metingUrls.indexOf(song.metingUrl) < 0) metingUrls.unshift(song.metingUrl)
        urlData = { url: song.metingUrl || metingUrls[0], metingFallbackUrls: metingUrls }
      }

      if (!urlData || !urlData.url) {
        window.toast && window.toast('该歌曲暂无播放链接')
        return
      }

      var audio = getAudio()
      _metingFallbackUrls = urlData.metingFallbackUrls || []
      _metingFallbackIndex = _metingFallbackUrls.length ? 1 : 0
      audio.src = urlData.url
      audio.play().then(function() {
        _isPlaying = true
        updatePlayerBarUI()
        updateNowPlayingUI()
        startProgressTimer()
      }).catch(function() {
        _isPlaying = false
        updatePlayerBarUI()
        updateNowPlayingUI()
        window.toast && window.toast('播放失败')
      })
    })
  }

  function togglePlay() {
    var audio = getAudio()
    if (!_currentSong || !audio.src) return

    if (_isPlaying) {
      audio.pause()
      _isPlaying = false
      stopProgressTimer()
    } else {
      audio.play().then(function() {
        _isPlaying = true
        updatePlayerBarUI()
        updateNowPlayingUI()
        startProgressTimer()
      }).catch(function() {
        window.toast && window.toast('播放失败')
      })
    }
    updatePlayerBarUI()
    updateNowPlayingUI()
  }

  function bindPlayerBarPrevNext(bar) {
    var prevBtn = bar.querySelector('.prev-btn')
    var nextBtn = bar.querySelector('.next-btn')
    if (prevBtn) {
      prevBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        playPrevInQueue()
      })
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        playNextInQueue()
      })
    }
  }

  function showPlayerBar() {
    var bars = document.querySelectorAll('.music-player-bar')
    for (var i = 0; i < bars.length; i++) bars[i].style.display = ''
  }

  function updatePlayerBarUI() {
    var bars = document.querySelectorAll('.music-player-bar')
    for (var b = 0; b < bars.length; b++) {
      var bar = bars[b]
      var cover = bar.querySelector('.music-player-avatar img')
      var info = bar.querySelector('.music-player-info')
      var playBtn = bar.querySelector('.play-btn')

      if (_currentSong) {
        if (cover) cover.src = _currentSong.pic || 'img/ava-00.jpg'
        if (info) info.innerHTML = esc(_currentSong.name) + ' <span class="song-artist">- ' + esc(_currentSong.artist) + '</span>'
      }

      if (playBtn) {
        var icon = playBtn.querySelector('i')
        if (icon) icon.className = _isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'
      }
    }
  }

  // ===== 时间格式化 =====
  function formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '00:00'
    var m = Math.floor(seconds / 60)
    var s = Math.floor(seconds % 60)
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
  }

  // ===== 进度定时器 =====
  function startProgressTimer() {
    stopProgressTimer()
    _progressTimer = setInterval(function() {
      updateNowPlayingProgress()
    }, 500)
  }

  function stopProgressTimer() {
    if (_progressTimer) {
      clearInterval(_progressTimer)
      _progressTimer = null
    }
  }

  function updateNowPlayingProgress() {
    var np = document.getElementById('now-playing-page')
    if (!np) return
    var audio = _audio
    if (!audio) return

    var current = audio.currentTime || 0
    var duration = audio.duration || 0
    var pct = duration > 0 ? (current / duration * 100) : 0

    var filled = np.querySelector('.np-progress-filled')
    var thumb = np.querySelector('.np-progress-thumb')
    var curEl = np.querySelector('.np-time-current')
    var durEl = np.querySelector('.np-time-duration')

    if (filled) filled.style.width = pct + '%'
    if (thumb) thumb.style.left = pct + '%'
    if (curEl) curEl.textContent = formatTime(current)
    if (durEl) durEl.textContent = formatTime(duration)
  }

  // ===== 全屏播放页 =====
  function openNowPlayingPage() {
    if (!_currentSong) return
    var existing = document.getElementById('now-playing-page')
    if (existing) return

    var songPic = _currentSong.pic || 'img/ava-00.jpg'
    var page = document.createElement('div')
    page.id = 'now-playing-page'
    page.className = 'now-playing-page'

    page.innerHTML =
      '<div class="now-playing-bg" id="np-bg" style="background-image:url(' + esc(songPic) + ')"></div>' +
      '<div class="now-playing-bg-overlay" id="np-bg-overlay"></div>' +
      '<div class="now-playing-content">' +
        buildNPTopbar() +
        buildNPVinyl(songPic) +
        buildNPSongInfo() +
        buildNPProgress() +
        buildNPControls() +
      '</div>'

    document.body.appendChild(page)
    requestAnimationFrame(function() {
      page.classList.add('show')
    })

    bindNPEvents(page)
    if (_togetherActive) {
      bindTogetherEvents(page)
      if (_togetherFriend) startTogetherTimer()
    }
    updateNowPlayingUI()
    updateNowPlayingProgress()
    if (_isPlaying) startProgressTimer()
  }

  function closeNowPlayingPage() {
    closeNPMoreMenu()
    stopTogetherTimer()
    var page = document.getElementById('now-playing-page')
    if (!page) return
    page.classList.remove('show')
    page.classList.add('is-closing')
    setTimeout(function() { page.remove() }, 380)
  }

  function buildNPTopbar() {
    var titleText = _playQueueSource || '心动电台'
    return '' +
      '<div class="np-topbar">' +
        '<button class="np-topbar-btn" id="np-back"><i class="fa-solid fa-chevron-down"></i></button>' +
        '<div class="np-topbar-center">' +
          '<div class="np-topbar-title" id="np-queue-title">' + esc(titleText) + '</div>' +
        '</div>' +
        '<button class="np-topbar-btn" id="np-share" type="button" aria-label="更多">' +
          '<i class="fa-solid fa-ellipsis-vertical"></i>' +
        '</button>' +
      '</div>'
  }

  function closeNPMoreMenu() {
    var overlay = document.querySelector('.np-more-menu-overlay')
    var menu = document.querySelector('.np-more-menu-popup')
    if (!overlay && !menu) return
    if (overlay) overlay.classList.remove('show')
    if (menu) menu.classList.remove('show')
    setTimeout(function() {
      if (overlay && overlay.parentNode) overlay.remove()
      if (menu && menu.parentNode) menu.remove()
    }, 180)
  }

  function toggleNPMoreMenu(anchorBtn) {
    var existingMenu = document.querySelector('.np-more-menu-popup')
    var existingOverlay = document.querySelector('.np-more-menu-overlay')
    if (existingMenu || existingOverlay) {
      closeNPMoreMenu()
      return
    }

    var page = document.getElementById('now-playing-page')
    if (!page || !anchorBtn) return

    var overlay = document.createElement('div')
    overlay.className = 'np-more-menu-overlay'

    var menu = document.createElement('div')
    menu.className = 'np-more-menu-popup'
    var togetherItem = _togetherActive
      ? '<button class="np-more-menu-item" type="button" data-np-more-action="end-together">' +
          '<i class="fa-solid fa-user-group"></i>' +
          '<span>结束一起听</span>' +
        '</button>'
      : '<button class="np-more-menu-item" type="button" data-np-more-action="listen-together">' +
          '<i class="fa-solid fa-user-group"></i>' +
          '<span>邀请好友一起听</span>' +
        '</button>'
    menu.innerHTML =
      '<button class="np-more-menu-item" type="button" data-np-more-action="share-wechat">' +
        '<i class="fa-brands fa-weixin"></i>' +
        '<span>分享微信好友</span>' +
      '</button>' +
      togetherItem

    page.appendChild(overlay)
    page.appendChild(menu)

    var btnRect = anchorBtn.getBoundingClientRect()
    var pageRect = page.getBoundingClientRect()
    menu.style.top = (btnRect.bottom - pageRect.top + 8) + 'px'
    menu.style.right = Math.max(16, pageRect.right - btnRect.right) + 'px'

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      menu.classList.add('show')
    })

    overlay.addEventListener('click', closeNPMoreMenu)

    menu.querySelectorAll('[data-np-more-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var action = btn.getAttribute('data-np-more-action')
        closeNPMoreMenu()
        if (action === 'listen-together') {
          startListenTogether()
        } else if (action === 'end-together') {
          endListenTogether()
        } else {
          window.toast && window.toast('敬请期待')
        }
      })
    })
  }

  function renderNPVinylArea() {
    var page = document.getElementById('now-playing-page')
    if (!page) return
    var area = page.querySelector('.np-vinyl-area')
    if (!area) return
    var pic = (_currentSong && _currentSong.pic) || 'img/ava-00.jpg'
    var wrap = document.createElement('div')
    wrap.innerHTML = buildNPVinyl(pic)
    area.replaceWith(wrap.firstChild)
    if (_togetherActive) bindTogetherEvents(page)
  }

  function bindTogetherEvents(page) {
    var friendEl = page.querySelector('#np-together-friend')
    if (friendEl && !_togetherFriend) {
      friendEl.addEventListener('click', function(e) {
        e.stopPropagation()
        showTogetherCharPicker()
      })
    }
    getMusicProfile().then(function(profile) {
      var myImg = page.querySelector('#np-together-my-img')
      if (myImg && profile && profile.avatar) myImg.src = profile.avatar
    })
  }

  function startListenTogether() {
    if (_togetherActive) return
    _togetherActive = true
    _togetherFriend = null
    _togetherStartTime = 0
    renderNPVinylArea()
    window.toast && window.toast('已开启一起听，邀请好友加入吧')
  }

  function endListenTogether() {
    if (!_togetherActive) return
    _togetherActive = false
    _togetherFriend = null
    _togetherStartTime = 0
    stopTogetherTimer()
    renderNPVinylArea()
    updateNowPlayingUI()
    window.toast && window.toast('已结束一起听')
  }

  function updateTogetherText() {
    var textEl = document.querySelector('#np-together-text')
    if (textEl) textEl.textContent = getTogetherText()
  }

  function startTogetherTimer() {
    stopTogetherTimer()
    _togetherTimer = setInterval(updateTogetherText, 30000)
  }

  function stopTogetherTimer() {
    if (_togetherTimer) {
      clearInterval(_togetherTimer)
      _togetherTimer = null
    }
  }

  function showTogetherCharPicker() {
    if (!window.db || !db.characters) {
      window.toast && window.toast('暂无角色')
      return
    }
    db.characters.where('type').equals('char').toArray().then(function(chars) {
      if (!chars || !chars.length) {
        window.toast && window.toast('暂无角色，请先创建角色')
        return
      }

      var overlay = document.createElement('div')
      overlay.className = 'cp-dialog-overlay'

      var dialog = document.createElement('div')
      dialog.className = 'cp-dialog np-together-picker-dialog'

      var listHTML = chars.map(function(c) {
        var av = c.avatar
          ? '<img src="' + esc(c.avatar) + '" alt="">'
          : '<i class="fa-solid fa-user"></i>'
        return '<button class="np-together-char-item" data-together-char-id="' + c.id + '">' +
          '<div class="np-together-char-avatar">' + av + '</div>' +
          '<div class="np-together-char-name">' + esc(c.name || '未命名') + '</div>' +
        '</button>'
      }).join('')

      dialog.innerHTML =
        '<div class="cp-dialog-title">邀请好友一起听</div>' +
        '<div class="np-together-char-list">' + listHTML + '</div>'

      document.body.appendChild(overlay)
      document.body.appendChild(dialog)

      requestAnimationFrame(function() {
        overlay.classList.add('show')
        dialog.classList.add('show')
      })

      function closeDialog() {
        overlay.classList.remove('show')
        dialog.classList.remove('show')
        setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
      }

      overlay.addEventListener('click', closeDialog)

      dialog.querySelectorAll('[data-together-char-id]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var id = parseInt(btn.getAttribute('data-together-char-id'))
          var char = chars.find(function(c) { return c.id === id })
          closeDialog()
          if (!char) return
          _togetherFriend = { id: char.id, name: char.name || '', avatar: char.avatar || '' }
          _togetherStartTime = Date.now()
          renderNPVinylArea()
          startTogetherTimer()
          window.toast && window.toast((char.name || '好友') + '已加入一起听')
        })
      })
    })
  }

  function buildNPTogether() {
    var myAvatar = (_musicProfile && _musicProfile.avatar) || 'img/ava-00.jpg'
    var friendHtml = _togetherFriend
      ? '<img src="' + esc(_togetherFriend.avatar || 'img/ava-00.jpg') + '" alt="">'
      : '<i class="fa-solid fa-plus"></i>'
    var friendEmpty = _togetherFriend ? '' : ' np-together-empty'
    return '' +
      '<div class="np-together-area" id="np-together">' +
        '<div class="np-together-avatars">' +
          '<div class="np-together-avatar np-together-me"><img src="' + esc(myAvatar) + '" alt="" id="np-together-my-img"></div>' +
          '<div class="np-together-avatar np-together-friend' + friendEmpty + '" id="np-together-friend">' + friendHtml + '</div>' +
        '</div>' +
        '<div class="np-together-text" id="np-together-text">' + getTogetherText() + '</div>' +
      '</div>'
  }

  function getTogetherText() {
    if (!_togetherFriend || !_togetherStartTime) return '等待好友加入'
    var mins = Math.max(0, Math.floor((Date.now() - _togetherStartTime) / 60000))
    return '一起听' + mins + '分钟'
  }

  function buildNPVinyl(pic) {
    var spinClass = _isPlaying ? ' spinning' : ''
    var topHtml = _togetherActive ? buildNPTogether() : buildNPNeedle()
    return '' +
      '<div class="np-vinyl-area">' +
        '<div class="np-vinyl-disc' + spinClass + '" id="np-vinyl-disc">' +
          '<div class="np-vinyl-outer"></div>' +
          '<div class="np-vinyl-cover">' +
            '<img src="' + esc(pic) + '" alt="" id="np-vinyl-img">' +
          '</div>' +
        '</div>' +
        topHtml +
      '</div>'
  }

  function buildNPNeedle() {
    return '' +
        '<svg class="np-needle-svg" id="np-needle" viewBox="0 0 100 260" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<linearGradient id="arm-grad" x1="0" y1="0" x2="1" y2="0">' +
              '<stop offset="0%" stop-color="#d0d0d0"/>' +
              '<stop offset="50%" stop-color="#f0f0f0"/>' +
              '<stop offset="100%" stop-color="#c8c8c8"/>' +
            '</linearGradient>' +
            '<filter id="needle-shadow"><feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.25"/></filter>' +
          '</defs>' +
          '<path d="M50,18 L47,148 L28,210" stroke="url(#arm-grad)" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#needle-shadow)"/>' +
          '<rect x="21" y="208" width="14" height="17" rx="2.5" fill="#ccc" stroke="#aaa" stroke-width="0.5" filter="url(#needle-shadow)"/>' +
          '<rect x="23" y="224" width="10" height="8" rx="2" fill="#aaa"/>' +
          '<circle cx="50" cy="16" r="10" fill="#e8e8e8" stroke="#d0d0d0" stroke-width="1.5" filter="url(#needle-shadow)"/>' +
          '<circle cx="50" cy="16" r="4" fill="#f8f8f8"/>' +
        '</svg>'
  }

  function buildNPSongInfo() {
    return '' +
      '<div class="np-song-info">' +
        '<div class="np-song-text">' +
          '<div class="np-song-name" id="np-song-name"></div>' +
          '<div class="np-song-artist" id="np-song-artist"></div>' +
        '</div>' +
        '<div class="np-song-actions">' +
          '<button class="np-song-action-btn" id="np-like-btn">' +
            '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M518.4 149.290667c112.597333-80.789333 267.882667-69.397333 368.128 32 53.866667 54.528 84.138667 128.853333 84.138667 206.378666 0 77.525333-30.293333 151.850667-84.096 206.336l-294.421334 299.52a110.976 110.976 0 0 1-80.213333 34.474667 110.72 110.72 0 0 1-79.914667-34.176L137.322667 593.770667C83.562667 539.242667 53.333333 464.981333 53.333333 387.541333s30.229333-151.722667 84.010667-206.272c101.973333-103.146667 260.992-113.152 374.016-27.626666l0.554667 0.426666z m322.602667 76.970666c-84.629333-85.589333-219.157333-88.64-307.328-6.954666l-21.76 20.138666-21.717334-20.138666c-88.192-81.685333-222.72-78.634667-307.306666 6.933333-41.92 42.496-65.557333 100.608-65.557334 161.28 0 60.693333 23.637333 118.805333 65.6 161.344l295.04 300.416c9.045333 9.450667 21.269333 14.72 33.962667 14.72 12.693333 0 24.917333-5.269333 34.261333-15.04L840.96 549.077333c42.005333-42.496 65.685333-100.650667 65.685333-161.408 0-60.736-23.68-118.912-65.664-161.408z m-192.874667 15.509334c52.416 0.96 95.296 16.981333 126.826667 48.512 31.552 31.573333 47.509333 74.410667 48.32 126.72a32 32 0 1 1-64 1.002666c-0.554667-36.586667-10.56-63.466667-29.568-82.453333-19.029333-19.029333-46.016-29.12-82.773334-29.802667a32 32 0 0 1 1.194667-63.978666z" fill="currentColor"/></svg>' +
          '</button>' +
          '<button class="np-song-action-btn" id="np-comment-btn">' +
            '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M523.946667 85.333333C802.773333 85.333333 982.826667 307.541333 982.826667 511.338667c0 242.837333-197.397333 448-458.837334 448-84.16 0-150.464-16.597333-221.610666-55.402667l-88.618667 50.197333c-27.797333 8.426667-50.474667 5.162667-68.010667-9.834666-17.557333-14.997333-25.130667-34.730667-22.72-59.2a19570.688 19570.688 0 0 0 29.653334-106.368C123.008 741.76 64 656.426667 64 511.338667 64 307.541333 245.141333 85.333333 523.946667 85.333333z m-1.28 64C304.064 149.333333 128 317.12 128 522.666667c0 77.354667 24.874667 151.125333 70.634667 213.184l5.397333 7.125333 18.218667 23.509333-36.970667 128.746667a0.32 0.32 0 0 0 0.490667 0.384l113.408-63.829333 26.752 14.592C385.237333 878.72 452.544 896 522.666667 896 741.269333 896 917.333333 728.213333 917.333333 522.666667S741.269333 149.333333 522.666667 149.333333z m-192 320a53.333333 53.333333 0 1 1 0 106.666667 53.333333 53.333333 0 0 1 0-106.666667z m182.848 0a53.333333 53.333333 0 1 1 0 106.666667 53.333333 53.333333 0 0 1 0-106.666667z m182.869333 0a53.333333 53.333333 0 1 1 0 106.666667 53.333333 53.333333 0 0 1 0-106.666667z" fill="currentColor"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
  }

  function buildNPProgress() {
    return '' +
      '<div class="np-progress-area">' +
        '<div class="np-progress-bar" id="np-progress-bar">' +
          '<div class="np-progress-filled" id="np-progress-filled"></div>' +
          '<div class="np-progress-thumb" id="np-progress-thumb"></div>' +
        '</div>' +
        '<div class="np-progress-times">' +
          '<span class="np-time-current">00:00</span>' +
          '<span class="np-time-duration">00:00</span>' +
        '</div>' +
      '</div>'
  }

  function getNPRepeatSvg() {
    if (_repeatMode === 'one') {
      return '' +
        '<svg class="np-ctrl-svg np-repeat-svg np-repeat-svg-one" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path d="M3.5 11.25v-.75a4 4 0 0 1 4-4H20"></path>' +
          '<path d="M17.4 3.9l2.85 2.6-2.85 2.6"></path>' +
          '<path d="M20.5 12.75v.75a4 4 0 0 1-4 4H4"></path>' +
          '<path d="M6.6 20.1l-2.85-2.6 2.85-2.6"></path>' +
          '<path d="M10.5 10.45l1.6-1.15"></path>' +
          '<path d="M12.1 9.3v5.4"></path>' +
        '</svg>'
    }

    return '' +
      '<svg class="np-ctrl-svg np-repeat-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M3.5 11.25v-.75a4 4 0 0 1 4-4H20"></path>' +
        '<path d="M17.4 3.9l2.85 2.6-2.85 2.6"></path>' +
        '<path d="M20.5 12.75v.75a4 4 0 0 1-4 4H4"></path>' +
        '<path d="M6.6 20.1l-2.85-2.6 2.85-2.6"></path>' +
      '</svg>'
  }

  function getNPMoreSvg() {
    return '' +
      '<svg class="np-ctrl-svg np-more-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M3.5 6.5H16"></path>' +
        '<path d="M3.5 12h8.5"></path>' +
        '<path d="M3.5 17.5H12"></path>' +
        '<path d="M20.5 15V6.5"></path>' +
        '<circle class="np-more-svg-arrow" cx="18.1" cy="15.4" r="2.4"></circle>' +
      '</svg>'
  }

  function buildNPControls() {
    var playIcon = _isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'
    var repeatActive = _repeatMode === 'one' ? ' np-active' : ''
    return '' +
      '<div class="np-controls">' +
        '<button class="np-ctrl-btn np-small' + repeatActive + '" id="np-repeat" aria-label="循环模式">' + getNPRepeatSvg() + '</button>' +
        '<button class="np-ctrl-btn np-medium" id="np-prev"><i class="fa-solid fa-backward-step"></i></button>' +
        '<button class="np-ctrl-btn np-play" id="np-play"><i class="' + playIcon + '"></i></button>' +
        '<button class="np-ctrl-btn np-medium" id="np-next"><i class="fa-solid fa-forward-step"></i></button>' +
        '<button class="np-ctrl-btn np-small" id="np-playlist" aria-label="更多">' + getNPMoreSvg() + '</button>' +
      '</div>'
  }

  function bindNPEvents(page) {
    page.querySelector('#np-back').addEventListener('click', closeNowPlayingPage)

    page.querySelector('#np-share').addEventListener('click', function(e) {
      e.stopPropagation()
      toggleNPMoreMenu(e.currentTarget)
    })

    page.querySelector('#np-play').addEventListener('click', function() {
      togglePlay()
    })

    page.querySelector('#np-prev').addEventListener('click', function() {
      playPrevInQueue()
    })

    page.querySelector('#np-next').addEventListener('click', function() {
      playNextInQueue()
    })

    page.querySelector('#np-repeat').addEventListener('click', function() {
      var btn = page.querySelector('#np-repeat')
      if (_repeatMode === 'list') {
        _repeatMode = 'one'
        btn.classList.add('np-active')
        btn.innerHTML = getNPRepeatSvg()
        window.toast && window.toast('单曲循环')
      } else {
        _repeatMode = 'list'
        btn.classList.remove('np-active')
        btn.innerHTML = getNPRepeatSvg()
        window.toast && window.toast('列表循环')
      }
    })

    // 进度条拖动
    var progressBar = page.querySelector('#np-progress-bar')
    if (progressBar) {
      progressBar.addEventListener('click', function(e) {
        if (!_audio || !_audio.duration) return
        var rect = progressBar.getBoundingClientRect()
        var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        _audio.currentTime = pct * _audio.duration
        updateNowPlayingProgress()
      })
    }

    // 下滑关闭手势
    var startY = 0
    var currentY = 0
    var dragging = false

    page.addEventListener('touchstart', function(e) {
      if (
        e.target.closest('.np-progress-bar') ||
        e.target.closest('.np-controls') ||
        e.target.closest('.np-more-menu-popup') ||
        e.target.closest('.np-together-area') ||
        e.target.closest('#np-share')
      ) return
      startY = e.touches[0].clientY
      currentY = startY
      dragging = true
      page.style.transition = 'none'
    }, { passive: true })

    page.addEventListener('touchmove', function(e) {
      if (!dragging) return
      currentY = e.touches[0].clientY
      var dy = Math.max(0, currentY - startY)
      page.style.transform = 'translateY(' + dy + 'px)'
    }, { passive: true })

    page.addEventListener('touchend', function() {
      if (!dragging) return
      dragging = false
      page.style.transition = ''
      var dy = currentY - startY
      if (dy > 120) {
        closeNowPlayingPage()
      } else {
        page.style.transform = ''
        page.classList.add('show')
      }
    })
  }

  function updateNowPlayingUI() {
    var np = document.getElementById('now-playing-page')
    if (!np) return

    var songPic = _currentSong ? (_currentSong.pic || 'img/ava-00.jpg') : 'img/ava-00.jpg'

    var bg = np.querySelector('#np-bg')
    var vinylImg = np.querySelector('#np-vinyl-img')
    var disc = np.querySelector('#np-vinyl-disc')
    var needle = np.querySelector('#np-needle')
    var nameEl = np.querySelector('#np-song-name')
    var artistEl = np.querySelector('#np-song-artist')
    var playBtn = np.querySelector('#np-play i')
    var titleEl = np.querySelector('#np-queue-title')

    if (bg) bg.style.backgroundImage = 'url(' + songPic + ')'
    if (vinylImg) vinylImg.src = songPic
    if (_currentSong) {
      if (nameEl) nameEl.textContent = _currentSong.name || ''
      if (artistEl) artistEl.textContent = _currentSong.artist || ''
    }

    if (titleEl) titleEl.textContent = _playQueueSource || '心动电台'

    if (disc) {
      if (_isPlaying) disc.classList.add('spinning')
      else disc.classList.remove('spinning')
    }

    if (needle) {
      if (_isPlaying) needle.classList.add('np-needle-on')
      else needle.classList.remove('np-needle-on')
    }

    if (playBtn) {
      playBtn.className = _isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'
    }

    var repeatBtn = np.querySelector('#np-repeat')
    if (repeatBtn) {
      repeatBtn.classList.toggle('np-active', _repeatMode === 'one')
      repeatBtn.innerHTML = getNPRepeatSvg()
    }

    extractNPBgColor(np, songPic)
  }

  function extractNPBgColor(np, songPic) {
    var overlay = np.querySelector('#np-bg-overlay')
    if (!overlay) return

    var img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        canvas.width = 50
        canvas.height = 50
        ctx.drawImage(img, 0, 0, 50, 50)
        var data = ctx.getImageData(0, 0, 50, 50).data
        var r = 0, g = 0, b = 0, count = 0
        for (var i = 0; i < data.length; i += 16) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count++
        }
        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)
        var dr = Math.round(r * 0.3)
        var dg = Math.round(g * 0.3)
        var db = Math.round(b * 0.3)
        overlay.style.background = 'linear-gradient(180deg, rgba(' + dr + ',' + dg + ',' + db + ',0.55) 0%, rgba(' + dr + ',' + dg + ',' + db + ',0.7) 50%, rgba(' + Math.round(dr * 0.5) + ',' + Math.round(dg * 0.5) + ',' + Math.round(db * 0.5) + ',0.85) 100%)'
      } catch (e) {}
    }
    img.onerror = function() {}
    img.src = songPic
  }

  // ===== 歌单详情页 =====
  async function openPlaylistDetailPage() {
    var profile = await getMusicProfile()
    var settings = await getPlaylistSettings()
    var page = document.createElement('div')
    page.id = 'playlist-detail-page'
    page.className = 'full-page pd-page'
    page.innerHTML = buildPlaylistDetailHTML(profile, settings)
    window.openPage(page)
    bindPlaylistDetailEvents(page)
  }

  function buildPlaylistDetailHTML(profile, settings) {
    var s = settings || _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    var coverImg = s.cover
    var avatar = profile ? esc(profile.avatar) : 'img/ava-00.jpg'
    var nickname = profile ? esc(profile.nickname) : '用户'
    return '' +
      '<div class="pd-header">' +
        '<div class="pd-header-bg" style="background-image:url(' + coverImg + ')"></div>' +
        '<div class="pd-header-overlay"></div>' +
        '<div class="pd-topbar">' +
          '<button class="pd-topbar-btn" id="pd-back"><i class="fa-solid fa-chevron-left"></i></button>' +
          '<div class="pd-topbar-right-group">' +
            '<button class="pd-topbar-btn" id="pd-edit-playlist">' +
              '<i class="fa-solid fa-ellipsis-vertical"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="pd-info">' +
          '<div class="pd-cover"><img src="' + coverImg + '" alt=""></div>' +
          '<div class="pd-meta">' +
            '<div class="pd-title">' + esc(s.name) + '</div>' +
            '<div class="pd-user-row">' +
              '<img class="pd-user-avatar" src="' + avatar + '" alt="">' +
              '<span class="pd-username">' + nickname + '</span>' +
              '<span class="pd-sep">|</span>' +
              '<span class="pd-plays">' + esc(String(s.playCount)) + '次播放</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pd-body">' +
        '<div class="pd-play-all">' +
          '<button class="pd-play-all-btn" id="pd-play-all"><i class="fa-solid fa-play"></i></button>' +
          '<div class="pd-play-all-info">' +
            '<div class="pd-play-all-title">播放全部</div>' +
            '<div class="pd-play-all-count">' + PLAYLIST_DETAIL_SONGS.length + '首</div>' +
          '</div>' +
          '<div class="pd-play-all-actions">' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-bars"></i></button>' +
          '</div>' +
        '</div>' +
        buildPDSongList() +
      '</div>' +
      buildPlayerBar()
  }

  function buildPDSongList() {
    var html = PLAYLIST_DETAIL_SONGS.map(function(song, index) {
      var badgesHTML = ''
      if (song.vip) {
        badgesHTML += '<span class="pd-badge pd-badge-vip">VIP</span>'
      }
      for (var i = 0; i < song.badges.length; i++) {
        badgesHTML += '<span class="pd-badge pd-badge-sq">' + esc(song.badges[i]) + '</span>'
      }
      var artistText = esc(song.artist)
      if (song.album) artistText += ' - ' + esc(song.album)
      return '' +
        '<div class="pd-song-item" data-song-idx="' + index + '">' +
          '<div class="pd-song-cover"><img src="' + esc(song.cover) + '" alt=""></div>' +
          '<div class="pd-song-info">' +
            '<div class="pd-song-title">' + esc(song.title) + '</div>' +
            '<div class="pd-song-sub">' +
              badgesHTML +
              '<span class="pd-song-artist">' + artistText + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="pd-song-more" data-pd-remove="' + index + '"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>'
    }).join('')
    return '<div class="pd-song-list">' + html + '</div>'
  }

  function bindPlaylistDetailEvents(page) {
    var backBtn = page.querySelector('#pd-back')
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        window.closePage && window.closePage('playlist-detail-page')
      })
    }

    var editBtn = page.querySelector('#pd-edit-playlist')
    if (editBtn) {
      editBtn.addEventListener('click', function() {
        openEditPlaylistPage()
      })
    }

    var playAllBtn = page.querySelector('#pd-play-all')
    if (playAllBtn) {
      playAllBtn.addEventListener('click', function() {
        var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
        if (PLAYLIST_DETAIL_SONGS.length > 0) {
          playFromPlaylistDetail(PLAYLIST_DETAIL_SONGS[0], page, PLAYLIST_DETAIL_SONGS, 0, settings.name)
        }
      })
    }

    var settings = _playlistSettings || DEFAULT_PLAYLIST_SETTINGS
    page.querySelectorAll('.pd-song-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.pd-song-more')) return
        var idx = parseInt(item.getAttribute('data-song-idx'))
        if (!isNaN(idx) && PLAYLIST_DETAIL_SONGS[idx]) {
          playFromPlaylistDetail(PLAYLIST_DETAIL_SONGS[idx], page, PLAYLIST_DETAIL_SONGS, idx, settings.name)
        }
      })
    })

    bindPlaylistSongRemoveButtons(page, function(songIdx) {
      if (songIdx >= 0 && songIdx < PLAYLIST_DETAIL_SONGS.length) {
        PLAYLIST_DETAIL_SONGS.splice(songIdx, 1)
        return saveLikedSongs().then(function() {
          refreshLikedUI()
          return refreshMusicProfilePage()
        })
      }
      return Promise.resolve()
    })

    var playerBar = page.querySelector('.music-player-bar')
    if (playerBar) {
      playerBar.addEventListener('click', function() {
        openNowPlayingPage()
      })

      var playBtn = playerBar.querySelector('.play-btn')
      if (playBtn) {
        playBtn.addEventListener('click', function(e) {
          e.stopPropagation()
          togglePlay()
        })
      }
      bindPlayerBarPrevNext(playerBar)
    }
  }

  async function openEditPlaylistPage() {
    var settings = await getPlaylistSettings()
    var page = document.createElement('div')
    page.id = 'edit-playlist-page'
    page.className = 'full-page edit-playlist-page'
    page.innerHTML = buildEditPlaylistHTML(settings)
    window.openPage(page)
    bindEditPlaylistEvents(page)
  }

  function buildEditPlaylistHTML(settings) {
    return '' +
      '<div class="ep-header">' +
        '<button class="ep-header-btn" id="ep-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>' +
        '<div class="ep-header-title">编辑歌单</div>' +
        '<button class="ep-header-btn ep-save" id="ep-save" type="button">保存</button>' +
      '</div>' +
      '<div class="ep-scroll">' +
        '<section class="ep-section">' +
          '<div class="ep-cover-wrap">' +
            '<button class="ep-cover-btn" id="ep-cover-btn" type="button">' +
              '<img src="' + esc(settings.cover) + '" alt="" id="ep-cover-img">' +
              '<div class="ep-cover-overlay"><i class="fa-solid fa-camera"></i><span>更换封面</span></div>' +
            '</button>' +
            '<input type="hidden" id="ep-cover-input" value="' + esc(settings.cover) + '">' +
          '</div>' +
        '</section>' +
        '<section class="ep-section">' +
          '<label class="ep-field">' +
            '<span class="ep-field-label">歌单名称</span>' +
            '<input class="ep-field-input ep-field-disabled" id="ep-name-input" value="' + esc(settings.name) + '" readonly>' +
          '</label>' +
          '<label class="ep-field">' +
            '<span class="ep-field-label">播放次数</span>' +
            '<input class="ep-field-input" id="ep-playcount-input" value="' + esc(String(settings.playCount)) + '" inputmode="numeric" placeholder="输入播放次数">' +
          '</label>' +
        '</section>' +
      '</div>'
  }

  function bindEditPlaylistEvents(page) {
    page.querySelector('#ep-back').addEventListener('click', function() {
      window.closePage('edit-playlist-page')
    })

    page.querySelector('#ep-cover-btn').addEventListener('click', function() {
      window.showImagePicker(function(imageUrl) {
        if (!imageUrl) return
        page.querySelector('#ep-cover-input').value = imageUrl
        page.querySelector('#ep-cover-img').src = imageUrl
      })
    })

    var playCountInput = page.querySelector('#ep-playcount-input')
    playCountInput.addEventListener('input', function() {
      this.value = this.value.replace(/[^\d]/g, '')
    })

    page.querySelector('#ep-save').addEventListener('click', async function() {
      var coverVal = page.querySelector('#ep-cover-input').value.trim() || DEFAULT_PLAYLIST_SETTINGS.cover
      var nameVal = page.querySelector('#ep-name-input').value.trim() || DEFAULT_PLAYLIST_SETTINGS.name
      var countVal = parseInt(playCountInput.value) || 0

      await savePlaylistSettings({
        cover: coverVal,
        name: nameVal,
        playCount: countVal
      })

      await refreshPlaylistDetailPage()
      await refreshMusicProfilePage()
      window.closePage('edit-playlist-page')
      window.toast && window.toast('歌单已更新')
    })
  }

  async function refreshPlaylistDetailPage() {
    var detailPage = document.getElementById('playlist-detail-page')
    if (!detailPage) return
    var profile = await getMusicProfile()
    var settings = await getPlaylistSettings()
    detailPage.innerHTML = buildPlaylistDetailHTML(profile, settings)
    bindPlaylistDetailEvents(detailPage)
  }

  function showPlaylistMenu(anchorBtn) {
    var existing = document.querySelector('.music-playlist-menu-popup')
    if (existing) existing.remove()
    var existingOverlay = document.querySelector('.music-playlist-menu-overlay')
    if (existingOverlay) existingOverlay.remove()

    var overlay = document.createElement('div')
    overlay.className = 'music-playlist-menu-overlay'

    var menu = document.createElement('div')
    menu.className = 'music-playlist-menu-popup'
    menu.innerHTML =
      '<button class="music-playlist-menu-item" id="pm-create">' +
        '<i class="fa-solid fa-plus"></i>' +
        '<span>新建歌单</span>' +
      '</button>' +
      '<button class="music-playlist-menu-item" id="pm-import">' +
        '<i class="fa-solid fa-arrow-right-from-bracket"></i>' +
        '<span>导入外部歌单</span>' +
      '</button>'

    document.body.appendChild(overlay)
    document.body.appendChild(menu)

    var rect = anchorBtn.getBoundingClientRect()
    menu.style.top = (rect.bottom + 4) + 'px'
    menu.style.right = (window.innerWidth - rect.right) + 'px'

    if (menu.getBoundingClientRect().bottom > window.innerHeight - 10) {
      menu.style.top = ''
      menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    }

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      menu.classList.add('show')
    })

    function closeMenu() {
      overlay.classList.remove('show')
      menu.classList.remove('show')
      setTimeout(function() { overlay.remove(); menu.remove() }, 200)
    }

    overlay.addEventListener('click', closeMenu)

    menu.querySelector('#pm-create').addEventListener('click', function() {
      closeMenu()
      setTimeout(function() { showCreatePlaylistDialog() }, 220)
    })

    menu.querySelector('#pm-import').addEventListener('click', function() {
      closeMenu()
      setTimeout(function() { showImportPlaylistDialog() }, 220)
    })
  }

  function showCreatePlaylistDialog() {
    var overlay = document.createElement('div')
    overlay.className = 'cp-dialog-overlay'

    var dialog = document.createElement('div')
    dialog.className = 'cp-dialog'
    dialog.innerHTML =
      '<div class="cp-dialog-title">新建歌单</div>' +
      '<input class="cp-dialog-input" id="cp-name-input" placeholder="输入歌单名称" maxlength="40">' +
      '<div class="cp-dialog-btns">' +
        '<button class="cp-dialog-btn cp-cancel" id="cp-cancel">取消</button>' +
        '<button class="cp-dialog-btn cp-confirm" id="cp-confirm">创建</button>' +
      '</div>'

    document.body.appendChild(overlay)
    document.body.appendChild(dialog)

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      dialog.classList.add('show')
      dialog.querySelector('#cp-name-input').focus()
    })

    function closeDialog() {
      overlay.classList.remove('show')
      dialog.classList.remove('show')
      setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
    }

    overlay.addEventListener('click', closeDialog)

    dialog.querySelector('#cp-cancel').addEventListener('click', closeDialog)

    dialog.querySelector('#cp-confirm').addEventListener('click', async function() {
      var name = dialog.querySelector('#cp-name-input').value.trim()
      if (!name) {
        window.toast && window.toast('请输入歌单名称')
        return
      }
      var playlists = await getUserPlaylists()
      playlists.push({
        id: Date.now(),
        name: name,
        cover: 'img/music_blank.jpg',
        playCount: 0,
        songCount: 0
      })
      await saveUserPlaylists(playlists)
      closeDialog()
      await refreshMusicProfilePage()
      window.toast && window.toast('歌单已创建')
    })

    dialog.querySelector('#cp-name-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        dialog.querySelector('#cp-confirm').click()
      }
    })
  }

  function showImportPlaylistDialog() {
    var overlay = document.createElement('div')
    overlay.className = 'cp-dialog-overlay'

    var dialog = document.createElement('div')
    dialog.className = 'cp-dialog'
    dialog.innerHTML =
      '<div class="cp-dialog-title">导入外部歌单</div>' +
      '<input class="cp-dialog-input" id="ip-id-input" placeholder="输入歌单ID" inputmode="numeric">' +
      '<div class="cp-dialog-btns">' +
        '<button class="cp-dialog-btn cp-cancel" id="ip-cancel">取消</button>' +
        '<button class="cp-dialog-btn cp-confirm" id="ip-confirm">查询</button>' +
      '</div>'

    document.body.appendChild(overlay)
    document.body.appendChild(dialog)

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      dialog.classList.add('show')
      dialog.querySelector('#ip-id-input').focus()
    })

    function closeDialog() {
      overlay.classList.remove('show')
      dialog.classList.remove('show')
      setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
    }

    overlay.addEventListener('click', closeDialog)
    dialog.querySelector('#ip-cancel').addEventListener('click', closeDialog)

    dialog.querySelector('#ip-confirm').addEventListener('click', function() {
      var playlistId = dialog.querySelector('#ip-id-input').value.trim()
      if (!playlistId) {
        window.toast && window.toast('请输入歌单ID')
        return
      }
      closeDialog()
      fetchAndImportPlaylist(playlistId)
    })

    dialog.querySelector('#ip-id-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        dialog.querySelector('#ip-confirm').click()
      }
    })
  }

  function fetchAndImportPlaylist(playlistId) {
    window.toast && window.toast('正在获取歌单...')

    fetchMusicApiPlaylist(playlistId, true)
      .then(function(playlist) {
        showImportPlaylistSelect(playlist, playlist.tracks)
      })
      .catch(function() {
        return fetchMetingJson('playlist', { id: playlistId })
          .then(function(data) {
            var songs = normalizeMetingSongs(data)
            if (!songs.length) {
              window.toast && window.toast('该歌单暂无歌曲')
              return
            }
            return fetchMusicApiPlaylistMetaWithRetry(playlistId, 5)
              .then(function(playlistMeta) {
                showImportPlaylistSelect(playlistMeta, songs)
              })
              .catch(function() {
                window.toast && window.toast('获取歌单信息失败，请重试')
              })
          })
      })
      .catch(function() {
        window.toast && window.toast('获取歌单失败，请重试')
      })
  }

  function showImportPlaylistSelect(playlist, songs) {
    if (!songs || !songs.length) {
      window.toast && window.toast('该歌单暂无歌曲')
      return
    }

    var plName = playlist.name || '未知歌单'

    var overlay = document.createElement('div')
    overlay.className = 'cp-dialog-overlay'

    var dialog = document.createElement('div')
    dialog.className = 'cp-dialog import-playlist-select-dialog'

    var songsHTML = songs.map(function(song, idx) {
      return '' +
        '<label class="ip-song-row">' +
          '<input type="checkbox" checked data-ip-idx="' + idx + '">' +
          '<div class="ip-song-info">' +
            '<div class="ip-song-name">' + esc(song.name || '') + '</div>' +
            '<div class="ip-song-artist">' + esc(song.artist || '') + (song.album ? ' - ' + esc(song.album) : '') + '</div>' +
          '</div>' +
        '</label>'
    }).join('')

    dialog.innerHTML =
      '<div class="cp-dialog-title">' + esc(plName) + '</div>' +
      '<div class="ip-song-count">' + songs.length + '首歌曲</div>' +
      '<div class="ip-select-actions">' +
        '<button class="ip-select-toggle" id="ip-toggle-all">全选/取消</button>' +
      '</div>' +
      '<div class="ip-song-list">' + songsHTML + '</div>' +
      '<div class="cp-dialog-btns">' +
        '<button class="cp-dialog-btn cp-cancel" id="ip-sel-cancel">取消</button>' +
        '<button class="cp-dialog-btn cp-confirm" id="ip-sel-confirm">导入</button>' +
      '</div>'

    document.body.appendChild(overlay)
    document.body.appendChild(dialog)

    requestAnimationFrame(function() {
      overlay.classList.add('show')
      dialog.classList.add('show')
    })

    function closeDialog() {
      overlay.classList.remove('show')
      dialog.classList.remove('show')
      setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
    }

    overlay.addEventListener('click', closeDialog)
    dialog.querySelector('#ip-sel-cancel').addEventListener('click', closeDialog)

    dialog.querySelector('#ip-toggle-all').addEventListener('click', function() {
      var boxes = dialog.querySelectorAll('input[type="checkbox"]')
      var allChecked = true
      for (var i = 0; i < boxes.length; i++) {
        if (!boxes[i].checked) { allChecked = false; break }
      }
      for (var j = 0; j < boxes.length; j++) {
        boxes[j].checked = !allChecked
      }
    })

    dialog.querySelector('#ip-sel-confirm').addEventListener('click', async function() {
      var boxes = dialog.querySelectorAll('input[type="checkbox"]:checked')
      if (!boxes.length) {
        window.toast && window.toast('请至少选择一首歌曲')
        return
      }

      var importedSongs = []
      for (var i = 0; i < boxes.length; i++) {
        var idx = parseInt(boxes[i].getAttribute('data-ip-idx'))
        var song = songs[idx]
        if (!song) continue
        importedSongs.push({
          title: song.name || '',
          search: song.name || '',
          artist: song.artist || '',
          album: song.album || '',
          cover: song.cover || 'img/ava-00.jpg',
          badges: [],
          vip: false,
          songId: song.id,
          source: 'netease',
          pic_id: song.pic_id || '',
          metingUrl: song.metingUrl || ''
        })
      }

      if (!importedSongs.length) {
        window.toast && window.toast('没有可导入的歌曲')
        return
      }

      // 创建新歌单
      var plCover = playlist.coverImgUrl || playlist.picUrl || (importedSongs[0] && importedSongs[0].cover) || 'img/music_blank.jpg'
      var newPlaylist = {
        id: Date.now(),
        name: plName,
        cover: plCover,
        playCount: 0,
        songCount: importedSongs.length
      }

      var playlists = await getUserPlaylists()
      playlists.push(newPlaylist)
      await saveUserPlaylists(playlists)
      await saveUserPlaylistSongs(newPlaylist.id, importedSongs)

      closeDialog()
      await refreshMusicProfilePage()
      window.toast && window.toast('已导入歌单「' + plName + '」' + importedSongs.length + '首歌曲')
    })
  }

  function playFromPlaylistDetail(song, page, queueSongs, queueIdx, queueName) {
    if (queueSongs && queueSongs.length > 0) {
      _playQueue = queueSongs.slice()
      _playQueueIndex = typeof queueIdx === 'number' ? queueIdx : 0
      _playQueueSource = queueName || ''
    }

    _retryCount = 0

    if (song.songId) {
      var directSong = {
        id: song.songId,
        name: song.title || song.search || '',
        artist: song.artist || '',
        album: song.album || '',
        pic_id: song.pic_id || '',
        source: song.source || 'netease',
        cover: song.cover || '',
        pic: song.cover || '',
        metingUrl: song.metingUrl || ''
      }
      playSong(directSong, page)
      return
    }

    var keyword = song.search || song.title
    window.toast && window.toast('加载中...')

    fetchSearchWithFallback(keyword, 5)
      .then(function(data) {
        if (!data || !data.length) {
          window.toast && window.toast('未找到该歌曲')
          return
        }
        playSong(data[0], page)
      })
      .catch(function() {
        window.toast && window.toast('搜索失败，请重试')
      })
  }

  // ===== 用户歌单点击绑定 =====
  function bindUserPlaylistClicks(container) {
    container.querySelectorAll('.music-playlist-item[data-user-playlist-id]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.music-playlist-more')) return
        var plId = parseInt(item.getAttribute('data-user-playlist-id'))
        if (!isNaN(plId)) openUserPlaylistDetailPage(plId)
      })
    })
  }

  // ===== 用户歌单详情页 =====
  async function openUserPlaylistDetailPage(playlistId) {
    var profile = await getMusicProfile()
    var playlists = await getUserPlaylists()
    var playlist = null
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === playlistId) { playlist = playlists[i]; break }
    }
    if (!playlist) return
    var songs = await getUserPlaylistSongs(playlistId)

    var page = document.createElement('div')
    page.id = 'user-playlist-detail-page'
    page.className = 'full-page pd-page'
    page.setAttribute('data-playlist-id', String(playlistId))
    page.innerHTML = buildUserPlaylistDetailHTML(playlist, songs, profile)
    window.openPage(page)
    bindUserPlaylistDetailEvents(page, playlistId)
  }

  function buildUserPlaylistDetailHTML(playlist, songs, profile) {
    var coverImg = playlist.cover || 'img/music_blank.jpg'
    var avatar = profile ? esc(profile.avatar) : 'img/ava-00.jpg'
    var nickname = profile ? esc(profile.nickname) : '用户'
    return '' +
      '<div class="pd-header">' +
        '<div class="pd-header-bg" style="background-image:url(' + coverImg + ')"></div>' +
        '<div class="pd-header-overlay"></div>' +
        '<div class="pd-topbar">' +
          '<button class="pd-topbar-btn" id="upd-back"><i class="fa-solid fa-chevron-left"></i></button>' +
          '<div class="pd-topbar-right-group">' +
            '<button class="pd-topbar-btn" id="upd-edit">' +
              '<i class="fa-solid fa-ellipsis-vertical"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="pd-info">' +
          '<div class="pd-cover"><img src="' + coverImg + '" alt=""></div>' +
          '<div class="pd-meta">' +
            '<div class="pd-title">' + esc(playlist.name) + '</div>' +
            '<div class="pd-user-row">' +
              '<img class="pd-user-avatar" src="' + avatar + '" alt="">' +
              '<span class="pd-username">' + nickname + '</span>' +
              '<span class="pd-sep">|</span>' +
              '<span class="pd-plays">' + esc(String(playlist.playCount || 0)) + '次播放</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pd-body">' +
        '<div class="pd-play-all">' +
          '<button class="pd-play-all-btn" id="upd-play-all"><i class="fa-solid fa-play"></i></button>' +
          '<div class="pd-play-all-info">' +
            '<div class="pd-play-all-title">播放全部</div>' +
            '<div class="pd-play-all-count">' + songs.length + '首</div>' +
          '</div>' +
          '<div class="pd-play-all-actions">' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-bars"></i></button>' +
          '</div>' +
        '</div>' +
        buildUserPDSongList(songs) +
      '</div>' +
      buildPlayerBar()
  }

  function buildUserPDSongList(songs) {
    var html = songs.map(function(song, index) {
      var badgesHTML = ''
      if (song.vip) badgesHTML += '<span class="pd-badge pd-badge-vip">VIP</span>'
      if (song.badges) {
        for (var i = 0; i < song.badges.length; i++) {
          badgesHTML += '<span class="pd-badge pd-badge-sq">' + esc(song.badges[i]) + '</span>'
        }
      }
      var artistText = esc(song.artist)
      if (song.album) artistText += ' - ' + esc(song.album)
      return '' +
        '<div class="pd-song-item" data-song-idx="' + index + '">' +
          '<div class="pd-song-cover"><img src="' + esc(song.cover) + '" alt=""></div>' +
          '<div class="pd-song-info">' +
            '<div class="pd-song-title">' + esc(song.title) + '</div>' +
            '<div class="pd-song-sub">' +
              badgesHTML +
              '<span class="pd-song-artist">' + artistText + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="pd-song-more" data-pd-remove="' + index + '"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
        '</div>'
    }).join('')
    return '<div class="pd-song-list">' + html + '</div>'
  }

  function buildSearchOverlayForUserPlaylist() {
    return '' +
      '<div class="music-search-overlay" id="upd-search-overlay">' +
        '<div class="music-search-header">' +
          '<button class="music-search-back" id="upd-search-back">' +
            '<i class="fa-solid fa-chevron-left"></i>' +
          '</button>' +
          '<div class="music-search-input-wrap">' +
            '<i class="fa-solid fa-magnifying-glass music-search-icon"></i>' +
            '<input type="text" class="music-search-input" id="upd-search-input" placeholder="搜索歌曲、歌手">' +
          '</div>' +
          '<button class="music-search-submit" id="upd-search-submit">搜索</button>' +
        '</div>' +
        '<div class="music-search-results" id="upd-search-results">' +
          '<div class="music-search-empty">搜索并添加歌曲到歌单</div>' +
        '</div>' +
      '</div>'
  }

  function bindUserPlaylistDetailEvents(page, playlistId) {
    page.querySelector('#upd-back').addEventListener('click', function() {
      window.closePage && window.closePage('user-playlist-detail-page')
    })

    page.querySelector('#upd-edit').addEventListener('click', function() {
      openEditUserPlaylistPage(playlistId)
    })

    var playAllBtn = page.querySelector('#upd-play-all')
    if (playAllBtn) {
      playAllBtn.addEventListener('click', async function() {
        var songs = await getUserPlaylistSongs(playlistId)
        var playlists = await getUserPlaylists()
        var plName = ''
        for (var p = 0; p < playlists.length; p++) {
          if (playlists[p].id === playlistId) { plName = playlists[p].name; break }
        }
        if (songs.length > 0) playFromPlaylistDetail(songs[0], page, songs, 0, plName)
      })
    }

    bindUserPDSongEvents(page, playlistId)

    var playerBar = page.querySelector('.music-player-bar')
    if (playerBar) {
      playerBar.addEventListener('click', function() { openNowPlayingPage() })
      var playBtn = playerBar.querySelector('.play-btn')
      if (playBtn) {
        playBtn.addEventListener('click', function(e) {
          e.stopPropagation()
          togglePlay()
        })
      }
      bindPlayerBarPrevNext(playerBar)
    }
  }

  function bindUserPDSongEvents(page, playlistId) {
    page.querySelectorAll('.pd-song-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.pd-song-more')) return
        var idx = parseInt(item.getAttribute('data-song-idx'))
        var songs = _userPlaylistSongsCache[playlistId] || []
        var playlists = _userPlaylists || []
        var plName = ''
        for (var p = 0; p < playlists.length; p++) {
          if (playlists[p].id === playlistId) { plName = playlists[p].name; break }
        }
        if (!isNaN(idx) && songs[idx]) playFromPlaylistDetail(songs[idx], page, songs, idx, plName)
      })
    })

    bindPlaylistSongRemoveButtons(page, function(songIdx) {
      return getUserPlaylistSongs(playlistId).then(function(songs) {
        if (songIdx >= 0 && songIdx < songs.length) {
          songs.splice(songIdx, 1)
          return saveUserPlaylistSongs(playlistId, songs).then(function() {
            return refreshUserPlaylistDetailPage(playlistId)
          }).then(function() {
            return refreshMusicProfilePage()
          })
        }
        return Promise.resolve()
      })
    })
  }

  function doSearchForUserPlaylist(keyword, page, playlistId) {
    if (!keyword) {
      window.toast && window.toast('请输入搜索内容')
      return
    }
    if (_searchLoading) return
    _searchLoading = true

    var resultsContainer = page.querySelector('#upd-search-results')
    resultsContainer.innerHTML = '<div class="music-search-loading"><i class="fa-solid fa-spinner fa-spin"></i> 搜索中...</div>'

    fetchSearchWithFallback(keyword, 20)
      .then(function(data) {
        _searchLoading = false
        if (!data || !data.length) {
          resultsContainer.innerHTML = '<div class="music-search-empty">未找到相关歌曲</div>'
          return
        }
        renderUserPlaylistSearchResults(data, resultsContainer, page, playlistId)
      })
      .catch(function() {
        _searchLoading = false
        resultsContainer.innerHTML = '<div class="music-search-empty">搜索失败，请重试</div>'
      })
  }

  function renderUserPlaylistSearchResults(songs, container, page, playlistId) {
    var html = songs.map(function(song, index) {
      var artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知')
      var hasSQ = seedRandom(index * 2) < 0.95
      var hasVIP = seedRandom(index * 2 + 1) < 0.70
      song._hasSQ = hasSQ
      song._hasVIP = hasVIP
      var badgesHTML = ''
      if (hasSQ) badgesHTML += '<span class="pd-badge pd-badge-sq">超清母带</span>'
      if (hasVIP) badgesHTML += '<span class="pd-badge pd-badge-vip">VIP</span>'
      return '' +
        '<div class="music-search-item" data-index="' + index + '">' +
          '<div class="music-search-item-index">' + (index + 1) + '</div>' +
          '<div class="music-search-item-info">' +
            '<div class="music-search-item-name">' + esc(song.name) + '</div>' +
            '<div class="music-search-item-artist">' +
              badgesHTML +
              '<span>' + esc(artist) + (song.album ? ' - ' + esc(song.album) : '') + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="music-search-item-more" data-add-index="' + index + '"><i class="fa-solid fa-plus"></i></button>' +
        '</div>'
    }).join('')

    container.innerHTML = html

    container.querySelectorAll('.music-search-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.music-search-item-more')) return
        var idx = parseInt(item.getAttribute('data-index'))
        playSong(songs[idx], page)
      })
    })

    container.querySelectorAll('[data-add-index]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation()
        var idx = parseInt(btn.getAttribute('data-add-index'))
        await addSongToUserPlaylist(songs[idx], playlistId, page)
      })
    })
  }

  async function addSongToUserPlaylist(song, playlistId, page) {
    var artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知')
    var album = song.album || ''
    var songs = await getUserPlaylistSongs(playlistId)

    for (var i = 0; i < songs.length; i++) {
      if (songs[i].title === (song.name || '') && songs[i].artist === artist) {
        window.toast && window.toast('该歌曲已在歌单中')
        return
      }
    }

    var newSong = {
      title: song.name || '',
      search: song.name || '',
      artist: artist,
      album: album,
      cover: song.cover || song.pic || 'img/ava-00.jpg',
      badges: song._hasSQ ? ['超清母带'] : [],
      vip: !!song._hasVIP,
      songId: song.id,
      source: song.source || 'netease',
      pic_id: song.pic_id,
      metingUrl: song.metingUrl || ''
    }

    songs.push(newSong)
    await saveUserPlaylistSongs(playlistId, songs)
    window.toast && window.toast('已添加到歌单')
    await refreshUserPlaylistDetailPage(playlistId)
    await refreshMusicProfilePage()

    if (song.pic_id) {
      fetchPicWithFallback(song, 300).then(async function(picUrl) {
        if (picUrl) {
          newSong.cover = picUrl
          var updatedSongs = await getUserPlaylistSongs(playlistId)
          for (var j = 0; j < updatedSongs.length; j++) {
            if (updatedSongs[j].title === newSong.title && updatedSongs[j].artist === newSong.artist) {
              updatedSongs[j].cover = picUrl
              break
            }
          }
          await saveUserPlaylistSongs(playlistId, updatedSongs)
          await refreshUserPlaylistDetailPage(playlistId)
        }
      }).catch(function() {})
    }
  }

  async function refreshUserPlaylistDetailPage(playlistId) {
    var page = document.getElementById('user-playlist-detail-page')
    if (!page) return
    var currentId = parseInt(page.getAttribute('data-playlist-id'))
    if (currentId !== playlistId) return
    var profile = await getMusicProfile()
    var playlists = await getUserPlaylists()
    var playlist = null
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === playlistId) { playlist = playlists[i]; break }
    }
    if (!playlist) return
    var songs = await getUserPlaylistSongs(playlistId)

    var body = page.querySelector('.pd-body')
    if (body) {
      body.innerHTML =
        '<div class="pd-play-all">' +
          '<button class="pd-play-all-btn" id="upd-play-all"><i class="fa-solid fa-play"></i></button>' +
          '<div class="pd-play-all-info">' +
            '<div class="pd-play-all-title">播放全部</div>' +
            '<div class="pd-play-all-count">' + songs.length + '首</div>' +
          '</div>' +
          '<div class="pd-play-all-actions">' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>' +
            '<button class="pd-icon-btn"><i class="fa-solid fa-bars"></i></button>' +
          '</div>' +
        '</div>' +
        buildUserPDSongList(songs)

      var playAllBtn = body.querySelector('#upd-play-all')
      if (playAllBtn) {
        playAllBtn.addEventListener('click', async function() {
          var s = await getUserPlaylistSongs(playlistId)
          var pls = await getUserPlaylists()
          var plnm = ''
          for (var p = 0; p < pls.length; p++) {
            if (pls[p].id === playlistId) { plnm = pls[p].name; break }
          }
          if (s.length > 0) playFromPlaylistDetail(s[0], page, s, 0, plnm)
        })
      }
      bindUserPDSongEvents(page, playlistId)
    }
  }

  // ===== 编辑用户歌单 =====
  async function openEditUserPlaylistPage(playlistId) {
    var playlists = await getUserPlaylists()
    var playlist = null
    for (var i = 0; i < playlists.length; i++) {
      if (playlists[i].id === playlistId) { playlist = playlists[i]; break }
    }
    if (!playlist) return

    var page = document.createElement('div')
    page.id = 'edit-user-playlist-page'
    page.className = 'full-page edit-playlist-page'
    page.innerHTML =
      '<div class="ep-header">' +
        '<button class="ep-header-btn" id="eup-back" type="button"><i class="fa-solid fa-chevron-left"></i></button>' +
        '<div class="ep-header-title">编辑歌单</div>' +
        '<button class="ep-header-btn ep-save" id="eup-save" type="button">保存</button>' +
      '</div>' +
      '<div class="ep-scroll">' +
        '<section class="ep-section">' +
          '<div class="ep-cover-wrap">' +
            '<button class="ep-cover-btn" id="eup-cover-btn" type="button">' +
              '<img src="' + esc(playlist.cover || 'img/music_blank.jpg') + '" alt="" id="eup-cover-img">' +
              '<div class="ep-cover-overlay"><i class="fa-solid fa-camera"></i><span>更换封面</span></div>' +
            '</button>' +
            '<input type="hidden" id="eup-cover-input" value="' + esc(playlist.cover || 'img/music_blank.jpg') + '">' +
          '</div>' +
        '</section>' +
        '<section class="ep-section">' +
          '<label class="ep-field">' +
            '<span class="ep-field-label">歌单名称</span>' +
            '<input class="ep-field-input" id="eup-name-input" value="' + esc(playlist.name) + '" placeholder="输入歌单名称">' +
          '</label>' +
          '<label class="ep-field">' +
            '<span class="ep-field-label">播放次数</span>' +
            '<input class="ep-field-input" id="eup-playcount-input" value="' + esc(String(playlist.playCount || 0)) + '" inputmode="numeric" placeholder="输入播放次数">' +
          '</label>' +
        '</section>' +
        '<section class="ep-section">' +
          '<button class="ep-delete-btn" id="eup-delete">删除歌单</button>' +
        '</section>' +
      '</div>'

    window.openPage(page)

    page.querySelector('#eup-back').addEventListener('click', function() {
      window.closePage('edit-user-playlist-page')
    })

    page.querySelector('#eup-cover-btn').addEventListener('click', function() {
      window.showImagePicker(function(imageUrl) {
        if (!imageUrl) return
        page.querySelector('#eup-cover-input').value = imageUrl
        page.querySelector('#eup-cover-img').src = imageUrl
      })
    })

    var playCountInput = page.querySelector('#eup-playcount-input')
    playCountInput.addEventListener('input', function() {
      this.value = this.value.replace(/[^\d]/g, '')
    })

    page.querySelector('#eup-save').addEventListener('click', async function() {
      var coverVal = page.querySelector('#eup-cover-input').value.trim() || 'img/music_blank.jpg'
      var nameVal = page.querySelector('#eup-name-input').value.trim()
      if (!nameVal) {
        window.toast && window.toast('请输入歌单名称')
        return
      }
      var countVal = parseInt(playCountInput.value) || 0

      var pls = await getUserPlaylists()
      for (var i = 0; i < pls.length; i++) {
        if (pls[i].id === playlistId) {
          pls[i].cover = coverVal
          pls[i].name = nameVal
          pls[i].playCount = countVal
          break
        }
      }
      await saveUserPlaylists(pls)

      window.closePage('edit-user-playlist-page')

      var detailPage = document.getElementById('user-playlist-detail-page')
      if (detailPage && parseInt(detailPage.getAttribute('data-playlist-id')) === playlistId) {
        var profile = await getMusicProfile()
        var songs = await getUserPlaylistSongs(playlistId)
        var updatedPl = null
        for (var j = 0; j < pls.length; j++) {
          if (pls[j].id === playlistId) { updatedPl = pls[j]; break }
        }
        if (updatedPl) {
          detailPage.innerHTML = buildUserPlaylistDetailHTML(updatedPl, songs, profile)
          bindUserPlaylistDetailEvents(detailPage, playlistId)
        }
      }

      await refreshMusicProfilePage()
      window.toast && window.toast('歌单已更新')
    })

    page.querySelector('#eup-delete').addEventListener('click', function() {
      showDeletePlaylistConfirm(playlistId, page)
    })
  }

  function showDeletePlaylistConfirm(playlistId, editPage) {
    var overlay = document.createElement('div')
    overlay.className = 'cp-dialog-overlay'
    var dialog = document.createElement('div')
    dialog.className = 'cp-dialog'
    dialog.innerHTML =
      '<div class="cp-dialog-title">确认删除歌单？</div>' +
      '<div style="text-align:center;color:#999;font-size:13px;margin-bottom:8px;">删除后无法恢复</div>' +
      '<div class="cp-dialog-btns">' +
        '<button class="cp-dialog-btn cp-cancel" id="del-cancel">取消</button>' +
        '<button class="cp-dialog-btn cp-confirm" id="del-confirm" style="background:#ff4444">删除</button>' +
      '</div>'

    document.body.appendChild(overlay)
    document.body.appendChild(dialog)
    requestAnimationFrame(function() {
      overlay.classList.add('show')
      dialog.classList.add('show')
    })

    function closeDialog() {
      overlay.classList.remove('show')
      dialog.classList.remove('show')
      setTimeout(function() { overlay.remove(); dialog.remove() }, 200)
    }

    overlay.addEventListener('click', closeDialog)
    dialog.querySelector('#del-cancel').addEventListener('click', closeDialog)
    dialog.querySelector('#del-confirm').addEventListener('click', async function() {
      closeDialog()
      var pls = await getUserPlaylists()
      pls = pls.filter(function(p) { return p.id !== playlistId })
      await saveUserPlaylists(pls)
      delete _userPlaylistSongsCache[playlistId]
      if (window.db && db.config) {
        try { await db.config.delete('userPlaylistSongs_' + playlistId) } catch (e) {}
      }
      window.closePage('edit-user-playlist-page')
      window.closePage('user-playlist-detail-page')
      await refreshMusicProfilePage()
      window.toast && window.toast('歌单已删除')
    })
  }

})()
