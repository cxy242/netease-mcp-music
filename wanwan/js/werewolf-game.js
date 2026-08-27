// werewolf-game.js — 游戏大厅 / 狼人杀（6 人基础局）
(function() {
  'use strict'

  var STORAGE_KEY = 'wanwanWerewolfState'
  var HISTORY_KEY = 'wanwanWerewolfHistory'
  var ROLE_LABEL = { werewolf: '狼人', seer: '预言家', witch: '女巫', villager: '村民' }
  var ROLE_HELP = {
    werewolf: '每晚与狼队友选择一名玩家袭击。隐藏身份，活到狼人数量不少于好人。',
    seer: '每晚查验一名玩家的阵营。你需要判断何时公开信息。',
    witch: '你有一瓶解药和一瓶毒药，每瓶全局只能使用一次。',
    villager: '你没有夜间技能。观察发言和票型，找出所有狼人。'
  }
  var FALLBACK_NAMES = ['老周', '小鹿', '阿杰', '南星', '可乐', '小满', '迟雨', '阿禾']
  var state = null
  var resumableState = null
  var selectedUser = null
  var selectedFriends = []
  var page = null
  var busy = false

  function esc(value) {
    if (window.escapeMainHtml) return window.escapeMainHtml(value)
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    })
  }

  function uid() { return 'ww_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) }
  function shuffle(list) {
    var copy = list.slice()
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = copy[i]; copy[i] = copy[j]; copy[j] = t
    }
    return copy
  }
  function pick(list) { return list.length ? list[Math.floor(Math.random() * list.length)] : null }
  function getPlayer(id) { return state && state.players.find(function(p) { return String(p.id) === String(id) }) }
  function userPlayer() { return state && getPlayer(state.settings.userPlayerId) }
  function alivePlayers() { return state.players.filter(function(p) { return p.alive }) }
  function publicName(id) { var p = getPlayer(id); return p ? p.publicName : '未知玩家' }
  function playerLabel(playerOrId) {
    var p = typeof playerOrId === 'object' ? playerOrId : getPlayer(playerOrId)
    return p ? String(p.seatNumber).padStart(2, '0') + ' · ' + p.publicName : '未知玩家'
  }
  function isInlineImage(value) { return typeof value === 'string' && /^data:image\//i.test(value) }
  function serializeState(value) {
    return JSON.stringify(value, function(key, item) {
      return key === 'avatar' && isInlineImage(item) ? '' : item
    })
  }
  function save() {
    if (!state) return false
    try {
      localStorage.setItem(STORAGE_KEY, serializeState(state))
      resumableState = state
      return true
    } catch (e) {
      console.warn('[狼人杀] 对局存档写入失败', e)
      return false
    }
  }
  function clearSave() { localStorage.removeItem(STORAGE_KEY) }
  function toast(msg) { if (window.toast) window.toast(msg) }

  function log(type, text, data) {
    state.publicLog.push({ id: uid(), type: type, text: text, data: data || null, day: state.day, at: Date.now() })
  }
  function privateLog(type, data) {
    state.privateLog.push({ id: uid(), type: type, data: data || {}, day: state.day, at: Date.now() })
  }

  function avatarHTML(p, className) {
    var name = p.publicName || p.name || '?'
    return '<span class="' + (className || 'ww-avatar') + '" aria-label="' + esc(name) + '">' +
      (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : '<span class="ww-avatar-fallback" aria-hidden="true">' + esc(name.slice(0, 1)) + '</span>') + '</span>'
  }

  async function loadFriends(user) {
    if (!window.db || !db.config || !db.characters) return []
    var cfg = null
    try {
      cfg = await db.config.get('friends_' + user.id)
    } catch (e) {
      return []
    }
    var ids = Array.isArray(cfg && cfg.value) ? cfg.value : []
    if (!ids.length) return []
    var numericIds = ids.map(function(id) { return parseInt(id && id.id != null ? id.id : id, 10) }).filter(function(id) { return Number.isFinite(id) })
    if (!numericIds.length) return []
    var rows = []
    try {
      rows = typeof db.characters.bulkGet === 'function'
        ? await db.characters.bulkGet(numericIds)
        : await Promise.all(numericIds.map(function(id) { return db.characters.get(id) }))
    } catch (e) {
      return []
    }
    var result = []
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i]
      if (!c || c.type === 'user') continue
      result.push({
        id: c.id,
        name: c.name || '好友',
        avatar: c.avatar || '',
        description: c.description || c.personality || ''
      })
    }
    return result
  }

  function accountFromUser(user) {
    return {
      id: user.id,
      name: user.nick || user.name || '微信用户',
      avatar: user.avatar || '',
      account: user.identity && user.identity.account || ''
    }
  }

  async function hydrateStateResources(saved) {
    if (!saved || !saved.userAccount || saved.userAccount.id == null || !window.db || !db.characters) return null
    var user = null
    try { user = await db.characters.get(parseInt(saved.userAccount.id, 10)) } catch (e) {}
    if (!user || user.type !== 'user') return null
    var friends = await loadFriends(user)
    var friendMap = {}
    friends.forEach(function(friend) { friendMap[String(friend.id)] = friend })
    saved.userAccount = accountFromUser(user)
    saved.friends = friends
    saved.invitedIds = Array.isArray(saved.invitedIds) ? saved.invitedIds.filter(function(id) { return !!friendMap[String(id)] }) : []
    function hydratePlayers(players) {
      if (!Array.isArray(players)) return
      players.forEach(function(player) {
        if (player.isUser || String(player.id) === String(user.id)) {
          player.avatar = user.avatar || ''
          return
        }
        var friend = friendMap[String(player.id)]
        if (friend) player.avatar = friend.avatar || ''
      })
    }
    hydratePlayers(saved.players)
    if (saved.report) hydratePlayers(saved.report.players)
    selectedUser = user
    selectedFriends = friends
    return saved
  }

  function freshLobby(user, friends) {
    return {
      id: uid(), gameMode: 'six_basic', phase: 'lobby', day: 0, round: 0,
      startedAt: null, endedAt: null, players: [], friends: friends || [], invitedIds: [],
      userAccount: accountFromUser(user),
      night: emptyNight(), vote: emptyVote(), publicLog: [], privateLog: [], winner: null, winReason: '',
      discussion: { order: [], index: 0, speeches: [] }, report: null,
      settings: { userPlayerId: String(user.id), allowUserRolePick: false, aiDelayMs: 160 }
    }
  }
  function emptyNight() {
    return {
      id: uid(), step: 'wolf', resolved: false, result: null,
      processing: { wolf: null, witch: null, seer: null },
      completed: { wolf: false, witch: false, seer: false },
      submissions: { wolf: false, witch: false, seer: false, wolfFinal: false },
      wolfProposal: null, wolfConsultation: null,
      wolfTargetId: null, seerTargetId: null, seerReveal: null,
      witchSaveUsed: false, witchPoisonUsed: false,
      witchSaveTargetId: null, witchPoisonTargetId: null,
      deaths: [], notices: []
    }
  }
  function emptyVote() { return { votes: [], exiledPlayerId: null, tiedPlayerIds: [], counts: {} } }

  window.showWerewolfGame = function() {
    var existing = document.getElementById('werewolf-page')
    if (existing) { existing.remove() }
    page = document.createElement('div')
    page.id = 'werewolf-page'; page.className = 'full-page werewolf-page'
    if (window.openPage) window.openPage(page); else (document.getElementById('app') || document.body).appendChild(page)
    selectedUser = null
    selectedFriends = []
    var saved = null
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch (e) {}
    resumableState = saved && saved.phase ? saved : null
    if (resumableState && resumableState.phase === 'ended' && resumableState.report) archiveGame(resumableState.report)
    bootstrapRoomPicker()
  }

  async function bootstrapRoomPicker() {
    if (resumableState) {
      resumableState = await hydrateStateResources(resumableState)
      if (resumableState) {
        state = resumableState
        save()
        state = null
      } else {
        clearSave()
      }
    }
    renderRoomPicker()
  }

  function shell(title, body, right, onTitle) {
    page.innerHTML = '<header class="ww-header"><button class="ww-heading" type="button" aria-label="返回">' +
      '<div class="ww-kicker">WanWan Arcade</div><h1>' + esc(title) + '</h1></button>' + (right || '<button class="ww-history" type="button"><i class="fa-solid fa-clock-rotate-left"></i><span>历史记录</span></button>') + '</header><main class="ww-main">' + body + '</main>'
    page.querySelector('.ww-heading').onclick = onTitle || function() { window.closePage && window.closePage('werewolf-page') }
    var history = page.querySelector('.ww-history')
    if (history) history.onclick = renderHistory
  }

  function renderRoomPicker() {
    state = null
    var rooms = [
      { mode: 'six', count: '6 人', name: '新手局', detail: '2 狼人 · 1 预言家 · 1 女巫 · 2 村民', open: true },
      { mode: 'nine', count: '9 人', name: '标准局', detail: '角色配置更完整，适合熟悉规则后体验' },
      { mode: 'twelve', count: '12 人', name: '进阶局', detail: '更多神职与策略空间' },
      { mode: 'custom', count: '自定义', name: '自定义房间', detail: '自由设置人数与角色配置' }
    ]
    var account = selectedUser
      ? '<section class="ww-account">' + avatarHTML({ publicName: selectedUser.nick || selectedUser.name, avatar: selectedUser.avatar }) + '<div><b>' + esc(selectedUser.nick || selectedUser.name || '微信用户') + '</b><span>当前微信账号</span></div><button id="ww-switch" type="button">切换</button></section>'
      : '<section class="ww-panel ww-login-card"><h3>使用微信身份创建房间</h3><p>请先选择微信账号，再选择房间类型。</p><button class="ww-primary" id="ww-login" type="button"><i class="fa-brands fa-weixin"></i> 微信登录</button></section>'
    shell('创建房间', account + '<section class="ww-room-intro"><p>选择房间类型</p><h2>准备开始一场狼人杀</h2></section><div class="ww-room-grid">' + rooms.map(function(room) {
      return '<button class="ww-room-card ' + (room.open && selectedUser ? 'available' : '') + '" type="button" data-room="' + room.mode + '" ' + (!selectedUser ? 'disabled' : '') + '><span class="ww-room-count">' + room.count + '</span><h3>' + room.name + '</h3><p>' + room.detail + '</p><b>' + (room.open ? '创建房间' : '暂未开放') + '</b></button>'
    }).join('') + '</div>')
    var switchButton = page.querySelector('#ww-switch')
    var loginButton = page.querySelector('#ww-login')
    if (switchButton) switchButton.onclick = chooseWechatAccount
    if (loginButton) loginButton.onclick = chooseWechatAccount
    page.querySelectorAll('[data-room]').forEach(function(card) {
      card.onclick = function() {
        if (card.dataset.room === 'six') enterSixPlayerRoom()
        else toast('该房间暂未开放')
      }
    })
  }

  function chooseWechatAccount() {
    if (!window.showWechatLoginModal) return toast('微信登录组件尚未加载')
    window.showWechatLoginModal({ mingwen: '狼人杀', onSuccess: async function(user) {
      if (!user) return toast('账号读取失败，请重试')
      var previousId = selectedUser && selectedUser.id
      if (previousId != null && String(previousId) !== String(user.id)) {
        clearSave()
        resumableState = null
      }
      selectedUser = user
      selectedFriends = await loadFriends(user)
      if (resumableState && String(resumableState.userAccount && resumableState.userAccount.id) === String(user.id)) {
        resumableState = await hydrateStateResources(resumableState)
      }
      renderRoomPicker()
    } })
  }

  function enterSixPlayerRoom() {
    if (!selectedUser) return chooseWechatAccount()
    if (!resumableState || String(resumableState.userAccount && resumableState.userAccount.id) !== String(selectedUser.id)) {
      state = freshLobby(selectedUser, selectedFriends)
      save()
      return renderLobby()
    }
    state = resumableState
    state.friends = selectedFriends
    if (state.phase === 'setup') { state.phase = 'lobby'; save() }
    if (state.phase === 'night') recoverNightState()
    render()
    if (state.phase === 'night') setTimeout(runNightStep, 0)
    if (state.phase === 'discussion') setTimeout(continueDiscussion, 0)
  }

  function getHistory() {
    try { var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(list) ? list : [] } catch (e) { return [] }
  }

  function archiveGame(report) {
    if (!report || !report.id) return
    var list = getHistory().filter(function(item) { return item.id !== report.id })
    list.unshift({ id: report.id, mode: report.mode, startedAt: report.startedAt, endedAt: report.endedAt, winner: report.winner, winReason: report.winReason, players: report.players || [], publicLog: report.publicLog || [] })
    try {
      localStorage.setItem(HISTORY_KEY, serializeState(list.slice(0, 50)))
    } catch (e) {
      console.warn('[狼人杀] 历史记录写入失败', e)
    }
  }

  function renderHistory() {
    var list = getHistory()
    var rows = list.map(function(item) {
      var date = item.endedAt ? new Date(item.endedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '时间未知'
      var winner = item.winner === 'villagers' ? '好人阵营获胜' : '狼人阵营获胜'
      return '<button class="ww-history-card" type="button" data-history-id="' + esc(item.id) + '"><div><b>6 人新手局</b><time>' + esc(date) + '</time></div><h3>' + winner + '</h3><p>' + esc(item.winReason || '') + '</p><span>' + ((item.players && item.players.length) || 6) + ' 位玩家</span></button>'
    }).join('')
    shell('历史记录', rows ? '<div class="ww-history-list">' + rows + '</div>' : '<div class="ww-history-empty"><i class="fa-solid fa-clock-rotate-left"></i><h2>暂无历史记录</h2><p>完成一局游戏后，对局结果会保存在这里。</p></div>', '<span></span>', function() { state ? render() : renderRoomPicker() })
    page.querySelectorAll('[data-history-id]').forEach(function(card) {
      card.onclick = function() {
        var report = list.find(function(item) { return String(item.id) === String(card.dataset.historyId) })
        if (report) renderGameSummary(report, true)
      }
    })
  }

  function render() {
    if (!state) return renderRoomPicker()
    if (state.phase === 'lobby') return renderLobby()
    if (state.phase === 'setup') return renderSetup()
    if (state.phase === 'ready') return renderReady()
    if (state.phase === 'role_reveal') return renderRoleReveal()
    if (state.phase === 'night') return renderNight()
    if (state.phase === 'dawn') return renderDawn()
    if (state.phase === 'discussion') return renderDiscussion()
    if (state.phase === 'vote' || state.phase === 'exile') return renderVote()
    if (state.phase === 'last_words') return renderLastWords()
    if (state.phase === 'ended') return renderEnded()
  }

  function renderLobby() {
    var selected = state.invitedIds.map(String)
    var slots = 5 - selected.length
    var friends = state.friends.map(function(f) {
      var on = selected.indexOf(String(f.id)) >= 0
      return '<button class="ww-friend ' + (on ? 'selected' : '') + '" data-friend="' + esc(f.id) + '" type="button">' + avatarHTML({ publicName: f.name, avatar: f.avatar }) +
        '<span><b>' + esc(f.name) + '</b><small>' + (on ? '已邀请' : '点击邀请') + '</small></span><i class="fa-solid ' + (on ? 'fa-check' : 'fa-plus') + '"></i></button>'
    }).join('')
    shell('组建房间', '<section class="ww-account">' + avatarHTML({ publicName: state.userAccount.name, avatar: state.userAccount.avatar }) + '<div><b>' + esc(state.userAccount.name) + '</b><span>房主</span></div></section>' +
      '<section class="ww-room-status"><div><span>当前人数</span><b>' + (selected.length + 1) + ' / 6</b></div><div class="ww-slot-dots">' + [0,1,2,3,4,5].map(function(i) { return '<i class="' + (i <= selected.length ? 'filled' : '') + '"></i>' }).join('') + '</div></section>' +
      '<section class="ww-section-head"><div><h3>邀请好友</h3><p>最多邀请 5 人</p></div></section>' +
      '<div class="ww-friend-list">' + (friends || '<div class="ww-empty">微信好友列表为空，可以直接匹配路人。</div>') + '</div>' +
      '<div class="ww-actions"><button class="ww-secondary" id="ww-match" type="button" ' + (slots <= 0 ? 'disabled' : '') + '><i class="fa-solid fa-users"></i> 匹配 ' + slots + ' 位路人</button>' +
      '<button class="ww-primary" id="ww-start" type="button" ' + (slots > 0 ? 'disabled' : '') + '>开始游戏</button></div>')
    page.querySelectorAll('[data-friend]').forEach(function(btn) {
      btn.onclick = function() {
        var id = String(btn.dataset.friend); var idx = state.invitedIds.map(String).indexOf(id)
        if (idx >= 0) state.invitedIds.splice(idx, 1)
        else if (state.invitedIds.length < 5) state.invitedIds.push(id)
        save(); renderLobby()
      }
    })
    page.querySelector('#ww-match').onclick = function() { setupGame(true) }
    page.querySelector('#ww-start').onclick = function() { setupGame(false) }
  }

  async function setupGame(matchStrangers) {
    if (busy) return; busy = true; state.phase = 'setup'; save(); renderSetup('正在邀请角色…')
    try {
      var invited = state.friends.filter(function(f) { return state.invitedIds.map(String).indexOf(String(f.id)) >= 0 })
      var adapted = await adaptInvited(invited)
      var strangerCount = matchStrangers ? Math.max(0, 5 - invited.length) : 0
      if (!matchStrangers && invited.length !== 5) throw new Error('人数不足')
      renderSetup(strangerCount ? '正在匹配路人玩家…' : '正在分发身份牌…')
      var strangers = strangerCount ? await generateStrangers(strangerCount, invited) : []
      var user = state.userAccount
      var players = [{ id: String(user.id), name: user.name, publicName: user.name, avatar: user.avatar, isUser: true, source: 'user', style: '根据现场信息做判断', speakingStyle: '自然直接', socialGoal: '找出狼人', seatNumber: 1 }]
      invited.forEach(function(f) {
        var a = adapted.find(function(x) { return x.name === f.name }) || {}
        players.push({ id: String(f.id), name: f.name, publicName: f.name, avatar: f.avatar, isUser: false, source: 'invited', style: a.style || f.description || '谨慎观察型', speakingStyle: a.speakingStyle || '说话自然简洁', socialGoal: a.socialGoal || '通过发言建立可信度' })
      })
      strangers.forEach(function(s) { players.push({ id: s.id, name: s.name, publicName: s.name, avatar: '', isUser: false, source: 'stranger', style: s.style, speakingStyle: s.speakingStyle, socialGoal: s.socialGoal }) })
      players.forEach(function(p, i) { p.seatNumber = i + 1; p.role = ''; p.camp = ''; p.alive = true; p.deathDay = null; p.deathCause = null; p.revealed = false; p.canSpeak = true; p.memory = { seerChecks: [], notes: [], suspicions: {} } })
      assignRoles(players)
      state.players = players; state.startedAt = Date.now(); state.day = 0; state.round = 0; state.phase = 'ready'
      state.publicLog = []; state.privateLog = []; log('system', '6 人基础局已创建，所有玩家已进入准备席。'); save(); renderReady()
    } catch (err) { state.phase = 'lobby'; save(); toast(err.message || '开局失败'); renderLobby() }
    busy = false
  }

  function assignRoles(players) {
    var roles = shuffle(['werewolf', 'werewolf', 'seer', 'witch', 'villager', 'villager'])
    players.forEach(function(p, i) { p.role = roles[i]; p.camp = roles[i] === 'werewolf' ? 'werewolf' : 'villager' })
  }

  function renderSetup(text) {
    shell('正在组局', '<section class="ww-loading"><div class="ww-spinner"></div><h2>' + esc(text || '正在准备对局…') + '</h2><p>身份和隐藏信息只保存在本地游戏引擎中</p></section>')
  }

  function renderReady() {
    shell('对局准备', '<section class="ww-ready-hero"><p>6 人基础局</p><h2>玩家已到齐</h2><span>确认座位后即可进入对局</span></section>' +
      '<section class="ww-panel"><h3>本局玩家</h3><div class="ww-ready-list">' + state.players.map(function(p) {
        return '<div>' + avatarHTML(p) + '<span class="ww-ready-copy"><b>' + esc(playerLabel(p)) + '</b><small>' + (p.isUser ? '你 · 房主' : p.source === 'invited' ? '受邀好友' : '匹配路人') + '</small></span><i class="fa-solid fa-check"></i></div>'
      }).join('') + '</div></section><button class="ww-primary ww-bottom-button" id="ww-ready-game" type="button">准备，进入对局</button>')
    page.querySelector('#ww-ready-game').onclick = function() { state.phase = 'role_reveal'; log('system', '全员准备完毕，身份牌已发放。'); save(); renderRoleReveal() }
  }

  function renderRoleReveal() {
    var me = userPlayer(); var teammates = me.role === 'werewolf' ? state.players.filter(function(p) { return p.role === 'werewolf' && !p.isUser }).map(playerLabel).join('、') : ''
    shell('查看身份', '<section class="ww-role-card role-' + esc(me.role) + '"><div class="ww-role-icon"><i class="fa-solid ' + (me.role === 'werewolf' ? 'fa-paw' : me.role === 'seer' ? 'fa-eye' : me.role === 'witch' ? 'fa-flask' : 'fa-seedling') + '"></i></div><p>你的身份是</p><h2>' + ROLE_LABEL[me.role] + '</h2><div class="ww-role-rule">' + esc(ROLE_HELP[me.role]) + '</div>' + (teammates ? '<div class="ww-secret">你的狼人队友：<b>' + esc(teammates) + '</b></div>' : '') + '</section><button class="ww-primary ww-bottom-button" id="ww-ready" type="button">记住身份，进入夜晚</button>')
    page.querySelector('#ww-ready').onclick = function() { startNight() }
  }

  function startNight() {
    state.day += 1; state.round += 1; state.phase = 'night'; state.night = emptyNight(); state.vote = emptyVote();
    log('phase', '第 ' + state.day + ' 夜，天黑请闭眼。'); save(); runNightStep()
  }

  async function runNightStep() {
    if (state.phase !== 'night') return
    var night = state.night; var nightId = night.id; var step = night.step; var me = userPlayer()
    if (night.resolved) return
    renderNight()
    if (me.alive && ((step === 'wolf' && me.role === 'werewolf') || (step === 'witch' && me.role === 'witch') || (step === 'seer' && me.role === 'seer'))) return
    if (night.completed[step]) return advanceNightStep(step, nightId)
    if (night.processing[step]) return
    var requestToken = uid()
    night.processing[step] = requestToken
    save(); renderNight()
    var outcome = null
    try {
      if (step === 'wolf') outcome = await computeAIWolfAction()
      else if (step === 'witch') outcome = await computeAIWitchAction()
      else if (step === 'seer') outcome = await computeAISeerAction()
    } catch (e) {
      outcome = { error: String(e && e.message || e) }
    }
    if (!isCurrentNightStep(nightId, step, requestToken)) return
    applyAINightAction(step, outcome || {})
    night.processing[step] = null
    night.completed[step] = true
    addNightNotice(step)
    save()
    advanceNightStep(step, nightId)
  }

  function advanceNightStep(expectedStep, nightId) {
    if (!isCurrentNight(nightId) || state.night.step !== expectedStep || !state.night.completed[expectedStep]) return false
    if (expectedStep === 'wolf') state.night.step = 'witch'
    else if (expectedStep === 'witch') state.night.step = 'seer'
    else return resolveNight(nightId)
    save(); runNightStep()
    return true
  }

  function isCurrentNight(nightId) {
    return !!(state && state.phase === 'night' && state.night && state.night.id === nightId && !state.night.resolved)
  }

  function isCurrentNightStep(nightId, step, token) {
    return !!(isCurrentNight(nightId) && state.night.step === step && !state.night.completed[step] && state.night.processing[step] === token)
  }

  function addNightNotice(step) {
    var label = step === 'wolf' ? '狼人行动结束' : step === 'witch' ? '女巫行动结束' : '预言家行动结束'
    if (state.night.notices.indexOf(label) < 0) state.night.notices.push(label)
  }

  function recoverNightState() {
    var night = state.night || emptyNight()
    state.night = night
    night.id = night.id || uid(); night.processing = night.processing || { wolf: null, witch: null, seer: null }
    night.completed = night.completed || { wolf: false, witch: false, seer: false }
    night.submissions = night.submissions || { wolf: false, witch: false, seer: false, wolfFinal: false }
    night.seerReveal = night.seerReveal || null
    night.notices = night.notices || []; night.resolved = !!night.resolved
    var me = userPlayer()
    if (night.step === 'wolf' && me && me.alive && me.role === 'werewolf' && night.wolfProposal && !night.wolfConsultation) {
      var teammate = state.players.find(function(p) { return p.role === 'werewolf' && !p.isUser })
      night.processing.wolf = null
      night.wolfConsultation = {
        userTargetId: String(night.wolfProposal.targetId), aiTargetId: String(night.wolfProposal.targetId),
        teammateName: teammate ? playerLabel(teammate) : '狼队友',
        thinking: '刚才的商议被打断了。结合你提出的目标，我认为可以按这个方向行动。',
        response: '我看到了你的选择。当前先按你的判断来，这个目标可以落刀。',
        reason: night.wolfProposal.reason || '接受队友建议', agree: true, recovered: true
      }
    } else if (night.processing[night.step]) {
      night.processing[night.step] = null
    }
    save()
  }

  function legalTargets(excludeIds) {
    excludeIds = (excludeIds || []).map(String)
    return alivePlayers().filter(function(p) { return excludeIds.indexOf(String(p.id)) < 0 })
  }

  function renderNight() {
    var me = userPlayer(); var step = state.night.step; var roleStep = step === 'wolf' ? '狼人行动' : step === 'witch' ? '女巫行动' : '预言家行动'
    var controls = '<div class="ww-night-wait"><div class="ww-pulse"></div><p>' + esc(roleStep) + '中</p><small>其他玩家无法看到具体行动</small></div>'
    if (step === 'wolf' && me.alive && me.role === 'werewolf') {
      if (state.night.wolfConsultation) {
        var consult = state.night.wolfConsultation
        var sameTarget = String(consult.userTargetId) === String(consult.aiTargetId)
        controls = '<h3>狼人私密商议</h3><div class="ww-wolf-votes">' +
          '<div><span>你的投票</span><b>' + esc(playerLabel(consult.userTargetId)) + '</b><small>' + esc((state.night.wolfProposal && state.night.wolfProposal.reason) || '未填写理由') + '</small></div>' +
          '<div><span>' + esc(consult.teammateName) + ' 的投票</span><b>' + esc(playerLabel(consult.aiTargetId)) + '</b><small>' + esc(consult.reason || '未说明理由') + '</small></div></div>' +
          '<div class="ww-wolf-chat"><b>' + esc(consult.teammateName) + '</b>' + (consult.thinking ? '<small class="ww-wolf-thinking">队内分析：' + esc(consult.thinking) + '</small>' : '') + '<p>' + esc(consult.response) + '</p></div>' +
          '<div class="ww-wolf-agreement ' + (sameTarget ? 'agreed' : 'split') + '">' + (sameTarget ? '你们的投票一致' : '你们的投票不一致，请做最终决定') + '</div>' +
          (sameTarget
            ? '<button class="ww-primary" id="ww-wolf-confirm" type="button">确认击杀 ' + esc(playerLabel(consult.userTargetId)) + '</button>'
            : '<div class="ww-actions"><button class="ww-secondary" id="ww-wolf-own" type="button">坚持我的选择</button><button class="ww-primary" id="ww-wolf-ai" type="button">采纳队友建议</button></div>')
      } else if (state.night.wolfProposal) {
        controls = '<h3>已提交给狼队友</h3><div class="ww-wolf-votes"><div><span>你的投票</span><b>' + esc(playerLabel(state.night.wolfProposal.targetId)) + '</b><small>' + esc(state.night.wolfProposal.reason || '未填写理由') + '</small></div></div>' +
          '<div class="ww-night-wait"><div class="ww-pulse"></div><p>等待狼队友回应</p><small>你的选择已锁定，不可重复提交</small></div>'
      } else controls = targetForm('选择今晚袭击的玩家', legalTargets(state.players.filter(function(p) { return p.role === 'werewolf' }).map(function(p) { return p.id })), 'ww-wolf-submit', true, '提交给狼队友')
    }
    if (step === 'seer' && me.alive && me.role === 'seer') {
      if (state.night.seerReveal) {
        var reveal = state.night.seerReveal
        controls = '<section class="ww-seer-reveal ' + (reveal.result === 'werewolf' ? 'is-wolf' : 'is-good') + '">' +
          '<div class="ww-seer-reveal-icon"><i class="fa-solid ' + (reveal.result === 'werewolf' ? 'fa-paw' : 'fa-shield-heart') + '"></i></div>' +
          '<p>查验结果</p><h3>' + esc(playerLabel(reveal.targetId)) + '</h3>' +
          '<strong>' + (reveal.result === 'werewolf' ? '狼人' : '好人') + '</strong>' +
          '<small>查验仅显示阵营，不会显示具体身份</small>' +
          '<button class="ww-primary" id="ww-seer-confirm" type="button">确认结果</button></section>'
      } else {
        controls = targetForm('选择今晚查验的玩家', legalTargets([me.id]).filter(function(p) { return !me.memory.seerChecks.some(function(c) { return String(c.targetId) === String(p.id) }) }), 'ww-seer-submit')
      }
    }
    if (step === 'witch' && me.alive && me.role === 'witch') controls = witchForm(me)
    var notices = state.night.notices.map(function(n) { return '<div class="ww-stage-done"><i class="fa-solid fa-check"></i>' + esc(n) + '</div>' }).join('')
    shell('第 ' + state.day + ' 夜', '<section class="ww-night"><div class="ww-night-title"><i class="fa-solid fa-moon"></i><h2>天黑请闭眼</h2></div>' + notices + '<div class="ww-panel">' + controls + '</div></section>')
    bindNightControls()
  }

  function targetForm(title, targets, buttonId, withReason, buttonText) {
    return '<h3>' + esc(title) + '</h3><div class="ww-target-grid">' + targets.map(function(p) { return '<label class="ww-target">' + avatarHTML(p) + '<span><b>' + esc(playerLabel(p)) + '</b></span><input type="radio" name="ww-target" value="' + esc(p.id) + '"></label>' }).join('') + '</div>' +
      (withReason ? '<textarea id="ww-night-reason" maxlength="120" placeholder="告诉狼队友你的理由（可选）"></textarea>' : '') + '<button class="ww-primary" id="' + buttonId + '" type="button">' + esc(buttonText || '确认行动') + '</button>'
  }

  function witchForm(me) {
    var victim = getPlayer(state.night.wolfTargetId); var saveAvailable = !state.inventory || state.inventory.save !== false; var poisonAvailable = !state.inventory || state.inventory.poison !== false
    var poisonables = legalTargets([me.id, victim && victim.id])
    return '<h3>女巫，请选择行动</h3><p class="ww-victim">今晚被袭击的是：<b>' + esc(victim ? playerLabel(victim) : '无人') + '</b></p>' +
      '<label class="ww-option"><input id="ww-use-save" type="checkbox" ' + (!victim || !saveAvailable ? 'disabled' : '') + '> 使用解药' + (!saveAvailable ? '（已用完）' : '') + '</label>' +
      '<label class="ww-field"><span>使用毒药</span><select id="ww-poison" ' + (!poisonAvailable ? 'disabled' : '') + '><option value="">今晚不用毒</option>' + poisonables.map(function(p) { return '<option value="' + esc(p.id) + '">' + esc(playerLabel(p)) + '</option>' }).join('') + '</select></label>' +
      '<button class="ww-primary" id="ww-witch-submit" type="button">确认用药</button>'
  }

  function bindNightControls() {
    var wolf = page.querySelector('#ww-wolf-submit'); var seer = page.querySelector('#ww-seer-submit'); var seerConfirm = page.querySelector('#ww-seer-confirm'); var witch = page.querySelector('#ww-witch-submit')
    if (wolf) wolf.onclick = async function() {
      var night = state.night; var nightId = night.id
      if (!isCurrentNight(nightId) || night.step !== 'wolf' || night.submissions.wolf) return
      var input = page.querySelector('[name="ww-target"]:checked'); if (!input) return toast('请选择目标')
      var target = String(input.value); var teammate = state.players.find(function(p) { return p.role === 'werewolf' && !p.isUser }); var userReason = (page.querySelector('#ww-night-reason') || {}).value || ''
      var requestToken = uid()
      night.submissions.wolf = true
      night.wolfProposal = { targetId: target, reason: userReason, submittedAt: Date.now() }
      night.processing.wolf = requestToken
      wolf.disabled = true
      save(); renderNight()
      var response = await wolfTeammateResponse(teammate, target, userReason)
      if (!isCurrentNightStep(nightId, 'wolf', requestToken) || state.night.wolfConsultation) return
      var legal = legalTargets(state.players.filter(function(p) { return p.role === 'werewolf' }).map(function(p) { return p.id }))
      var aiTarget = validateTarget(response.targetId, legal) || target
      state.night.processing.wolf = null
      state.night.wolfConsultation = { userTargetId: target, aiTargetId: aiTarget, teammateName: teammate ? playerLabel(teammate) : '狼队友', response: response.response || '我已经看过你的选择，这是我的判断。', thinking: response.thinking || '', reason: response.reason || '', agree: aiTarget === target }
      if (response._fallbackError) privateLog('ai_fallback', { kind: 'teammate', error: response._fallbackError })
      save(); renderNight()
    }
    if (seer) seer.onclick = function() {
      var nightId = state.night.id
      if (!isCurrentNight(nightId) || state.night.step !== 'seer' || state.night.submissions.seer) return
      var input = page.querySelector('[name="ww-target"]:checked'); if (!input) return toast('请选择查验目标')
      state.night.submissions.seer = true; seer.disabled = true
      var target = getPlayer(input.value); var result = target.role === 'werewolf' ? 'werewolf' : 'not_werewolf'
      userPlayer().memory.seerChecks.push({ targetId: String(target.id), result: result, day: state.day }); state.night.seerTargetId = String(target.id)
      state.night.seerReveal = { targetId: String(target.id), result: result }
      privateLog('seer_check', { playerId: userPlayer().id, targetId: target.id, result: result }); save(); renderNight()
    }
    if (seerConfirm) seerConfirm.onclick = function() {
      var nightId = state.night.id
      if (!isCurrentNight(nightId) || state.night.step !== 'seer' || !state.night.seerReveal || state.night.completed.seer) return
      seerConfirm.disabled = true
      state.night.completed.seer = true; addNightNotice('seer'); save(); advanceNightStep('seer', nightId)
    }
    if (witch) witch.onclick = function() {
      var nightId = state.night.id
      if (!isCurrentNight(nightId) || state.night.step !== 'witch' || state.night.submissions.witch) return
      state.night.submissions.witch = true; witch.disabled = true
      var useSave = page.querySelector('#ww-use-save').checked; var poison = page.querySelector('#ww-poison').value || null
      state.inventory = state.inventory || { save: true, poison: true }
      if (useSave && state.inventory.save && state.night.wolfTargetId) { state.night.witchSaveTargetId = state.night.wolfTargetId; state.night.witchSaveUsed = true; state.inventory.save = false }
      if (poison && state.inventory.poison) { state.night.witchPoisonTargetId = poison; state.night.witchPoisonUsed = true; state.inventory.poison = false }
      state.night.completed.witch = true; privateLog('witch_action', { playerId: userPlayer().id, saveTargetId: state.night.witchSaveTargetId, poisonTargetId: poison }); addNightNotice('witch'); save(); advanceNightStep('witch', nightId)
    }
    var own = page.querySelector('#ww-wolf-own'); var ai = page.querySelector('#ww-wolf-ai'); var confirm = page.querySelector('#ww-wolf-confirm')
    if (own) own.onclick = function() { finishUserWolfAction(state.night.wolfConsultation.userTargetId, '用户坚持原目标', own) }
    if (ai) ai.onclick = function() { finishUserWolfAction(state.night.wolfConsultation.aiTargetId, state.night.wolfConsultation.reason || '采纳狼队友建议', ai) }
    if (confirm) confirm.onclick = function() { finishUserWolfAction(state.night.wolfConsultation.userTargetId, state.night.wolfConsultation.reason || '双方达成一致', confirm) }
  }

  function finishUserWolfAction(targetId, reason, button) {
    var nightId = state.night.id
    if (!isCurrentNight(nightId) || state.night.step !== 'wolf' || !state.night.wolfConsultation || state.night.submissions.wolfFinal) return
    state.night.submissions.wolfFinal = true
    if (button) button.disabled = true
    state.night.wolfTargetId = String(targetId); state.night.completed.wolf = true
    privateLog('wolf_decision', { targetId: state.night.wolfTargetId, reason: reason || '', userTargetId: state.night.wolfProposal && state.night.wolfProposal.targetId, teammateTargetId: state.night.wolfConsultation.aiTargetId })
    addNightNotice('wolf'); save(); advanceNightStep('wolf', nightId)
  }

  async function computeAIWolfAction() {
    var wolves = alivePlayers().filter(function(p) { return p.role === 'werewolf' }); var targets = legalTargets(wolves.map(function(p) { return p.id }))
    var result = await callWerewolfAI('wolf', { actor: wolves[0], wolves: wolves, legal: targets })
    return { targetId: validateTarget(result.targetId, targets), reason: result.reason || '本地 fallback', fallbackError: result._fallbackError || '' }
  }
  async function computeAIWitchAction() {
    var witch = alivePlayers().find(function(p) { return p.role === 'witch' }); if (!witch) return { skipped: true }
    state.inventory = state.inventory || { save: true, poison: true }
    var victim = getPlayer(state.night.wolfTargetId); var poisonables = legalTargets([witch.id, victim && victim.id])
    var result = await callWerewolfAI('witch', { actor: witch, victim: victim, legal: poisonables, saveAvailable: state.inventory.save, poisonAvailable: state.inventory.poison })
    return { playerId: witch.id, useSave: result.useSave === true && !!victim, saveTargetId: victim && victim.id, poisonTargetId: result.poisonTargetId ? validateTarget(result.poisonTargetId, poisonables) : null, reason: result.reason || '', fallbackError: result._fallbackError || '' }
  }
  async function computeAISeerAction() {
    var seer = alivePlayers().find(function(p) { return p.role === 'seer' }); if (!seer) return { skipped: true }
    var targets = legalTargets([seer.id]).filter(function(p) { return !seer.memory.seerChecks.some(function(c) { return String(c.targetId) === String(p.id) }) })
    if (!targets.length) targets = legalTargets([seer.id])
    var result = await callWerewolfAI('seer', { actor: seer, legal: targets }); var id = validateTarget(result.targetId, targets); var target = getPlayer(id); var check = target.role === 'werewolf' ? 'werewolf' : 'not_werewolf'
    return { playerId: seer.id, targetId: id, result: check, reason: result.reason || '', fallbackError: result._fallbackError || '' }
  }

  function applyAINightAction(step, outcome) {
    if (outcome.fallbackError || outcome.error) privateLog('ai_fallback', { kind: step, error: outcome.fallbackError || outcome.error })
    if (step === 'wolf') {
      state.night.wolfTargetId = outcome.targetId
      privateLog('wolf_decision', { targetId: outcome.targetId, reason: outcome.reason || '本地 fallback' })
      return
    }
    if (step === 'witch') {
      if (outcome.skipped) return
      if (outcome.useSave && outcome.saveTargetId && state.inventory.save) { state.night.witchSaveTargetId = outcome.saveTargetId; state.night.witchSaveUsed = true; state.inventory.save = false }
      if (outcome.poisonTargetId && state.inventory.poison) { state.night.witchPoisonTargetId = outcome.poisonTargetId; state.night.witchPoisonUsed = true; state.inventory.poison = false }
      privateLog('witch_action', { playerId: outcome.playerId, saveTargetId: state.night.witchSaveTargetId, poisonTargetId: state.night.witchPoisonTargetId, reason: outcome.reason || '' })
      return
    }
    if (step === 'seer' && !outcome.skipped) {
      var seer = getPlayer(outcome.playerId)
      if (seer) seer.memory.seerChecks.push({ targetId: outcome.targetId, result: outcome.result, day: state.day })
      state.night.seerTargetId = outcome.targetId
      privateLog('seer_check', { playerId: outcome.playerId, targetId: outcome.targetId, result: outcome.result, reason: outcome.reason || '' })
    }
  }

  function resolveNight(nightId) {
    if (!isCurrentNight(nightId) || state.night.step !== 'seer' || !state.night.completed.seer) return false
    state.night.resolved = true
    var deaths = []
    if (state.night.wolfTargetId && String(state.night.wolfTargetId) !== String(state.night.witchSaveTargetId)) deaths.push(String(state.night.wolfTargetId))
    if (state.night.witchPoisonTargetId && deaths.indexOf(String(state.night.witchPoisonTargetId)) < 0) deaths.push(String(state.night.witchPoisonTargetId))
    deaths.forEach(function(id) { var p = getPlayer(id); p.alive = false; p.deathDay = state.day; p.deathCause = String(id) === String(state.night.witchPoisonTargetId) ? 'poison' : 'night' })
    state.night.result = Object.freeze ? Object.freeze({ nightId: nightId, day: state.day, deaths: deaths.slice(), wolfTargetId: state.night.wolfTargetId, saveTargetId: state.night.witchSaveTargetId, poisonTargetId: state.night.witchPoisonTargetId }) : { nightId: nightId, day: state.day, deaths: deaths.slice(), wolfTargetId: state.night.wolfTargetId, saveTargetId: state.night.witchSaveTargetId, poisonTargetId: state.night.witchPoisonTargetId }
    state.night.deaths = state.night.result.deaths.slice(); state.phase = 'dawn';
    var text = deaths.length ? '昨夜 ' + deaths.map(playerLabel).join('、') + ' 死亡。' : '昨夜无人死亡。'
    log('dawn', text, { nightId: nightId, deaths: deaths }); privateLog('night_summary', state.night.result); save(); renderDawn(); return true
  }

  function renderDawn() {
    var result = state.night.result || { deaths: state.night.deaths || [] }; var deaths = result.deaths || []; var win = checkWin()
    shell('第 ' + state.day + ' 天', '<section class="ww-dawn"><div class="ww-sun"><i class="fa-solid fa-sun"></i></div><p>天亮了</p><h2>' + (deaths.length ? esc(deaths.map(playerLabel).join('、') + ' 死亡') : '平安夜') + '</h2><small>夜间死亡不公开身份，也没有遗言</small></section>' +
      '<section class="ww-seat-list">' + renderSeats() + '</section><button class="ww-primary ww-bottom-button" id="ww-discuss" type="button">' + (win ? '查看结算' : '进入发言阶段') + '</button>')
    page.querySelector('#ww-discuss').onclick = function() { if (win) return endGame(win); startDiscussion() }
  }

  function renderSeats() {
    return state.players.map(function(p) { return '<div class="ww-seat ' + (!p.alive ? 'dead' : '') + '">' + avatarHTML(p) + '<span><b>' + esc(playerLabel(p)) + '</b><small>' + (p.alive ? '存活' : '已死亡') + '</small></span></div>' }).join('')
  }

  function startDiscussion() {
    var alive = alivePlayers().sort(function(a,b) { return a.seatNumber - b.seatNumber })
    var startSeat
    if (state.night.deaths.length) { var last = getPlayer(state.night.deaths[state.night.deaths.length - 1]); startSeat = last.seatNumber % state.players.length + 1 }
    else startSeat = pick(alive).seatNumber
    var order = []
    for (var i = 0; i < state.players.length; i++) { var seat = (startSeat - 1 + i) % state.players.length + 1; var p = alive.find(function(x) { return x.seatNumber === seat }); if (p) order.push(String(p.id)) }
    state.discussion = { order: order, index: 0, speeches: [] }; state.phase = 'discussion'; log('phase', '第 ' + state.day + ' 天开始发言。'); save(); continueDiscussion()
  }

  async function continueDiscussion() {
    if (busy || state.phase !== 'discussion') return
    if (state.discussion.index >= state.discussion.order.length) { state.phase = 'vote'; save(); return renderVote() }
    var actor = getPlayer(state.discussion.order[state.discussion.index]); renderDiscussion()
    if (actor.isUser) return
    busy = true
    var result = await callWerewolfAI('speech', { actor: actor, legal: [] })
    var speech = cleanSpeech(result.speech || '我这轮先保守一点，主要看大家的票型和发言变化。现在信息还不够，我不想过早站死边。')
    state.discussion.speeches.push({ day: state.day, id: actor.id, name: actor.publicName, speech: speech, claim: result.claim === 'yes' ? 'yes' : null })
    log('speech', playerLabel(actor) + '：' + speech, { playerId: actor.id, speech: speech })
    if (result.claim === 'yes') { actor.revealed = true; log('reveal', '系统公示：' + playerLabel(actor) + ' 的真实身份是 ' + ROLE_LABEL[actor.role] + '。', { playerId: actor.id, role: actor.role }) }
    state.discussion.index++; save(); busy = false; renderDiscussion(); setTimeout(continueDiscussion, state.settings.aiDelayMs)
  }

  function renderDiscussion() {
    var d = state.discussion; var actor = d.index < d.order.length ? getPlayer(d.order[d.index]) : null
    var speeches = renderSpeechHistory()
    var input = actor && actor.isUser ? '<section class="ww-user-turn"><h3>轮到你发言</h3><textarea id="ww-user-speech" placeholder="说出你的判断…"></textarea><label class="ww-option"><input id="ww-user-claim" type="checkbox"> 系统公示我的真实身份</label><button class="ww-primary" id="ww-send-speech">发送发言</button></section>' : '<div class="ww-speaking"><div class="ww-dots"><i></i><i></i><i></i></div>' + esc(actor ? playerLabel(actor) + ' 正在发言' : '准备投票') + '</div>'
    shell('白天讨论', '<div class="ww-progress">发言 ' + Math.min(d.index + 1, d.order.length) + ' / ' + d.order.length + '</div><section class="ww-speeches">' + speeches + '</section>' + input)
    var btn = page.querySelector('#ww-send-speech')
    if (btn) btn.onclick = function() { var text = cleanSpeech(page.querySelector('#ww-user-speech').value); if (!text) return toast('请输入发言'); d.speeches.push({ day: state.day, id: actor.id, name: actor.publicName, speech: text, claim: page.querySelector('#ww-user-claim').checked ? 'yes' : null }); log('speech', playerLabel(actor) + '：' + text, { playerId: actor.id, speech: text }); if (page.querySelector('#ww-user-claim').checked) { actor.revealed = true; log('reveal', '系统公示：' + playerLabel(actor) + ' 的真实身份是 ' + ROLE_LABEL[actor.role] + '。', { playerId: actor.id, role: actor.role }) } d.index++; save(); continueDiscussion() }
  }

  function renderSpeechHistory() {
    return (state.discussion.speeches || []).map(function(s) { var p = getPlayer(s.id); return '<article class="ww-speech">' + avatarHTML(p) + '<div><b>' + esc(playerLabel(p)) + '</b><p>' + esc(s.speech) + '</p></div></article>' }).join('')
  }

  function renderVote() {
    var me = userPlayer(); var canVote = me.alive && !state.vote.votes.some(function(v) { return String(v.voterId) === String(me.id) })
    var targets = alivePlayers().filter(function(p) { return String(p.id) !== String(me.id) })
    var controls = canVote ? targetForm('匿名投票', targets, 'ww-vote-submit') : '<div class="ww-night-wait ww-vote-wait"><div class="ww-spinner"></div><p>正在收集匿名投票…</p></div>'
    shell('投票阶段', '<section class="ww-vote-speeches"><h3>本轮发言</h3><div class="ww-speeches">' + renderSpeechHistory() + '</div></section><section class="ww-panel"><p class="ww-private-hint"><i class="fa-solid fa-lock"></i> 投票人和理由将在游戏结束后公开</p>' + controls + '</section>')
    var btn = page.querySelector('#ww-vote-submit')
    if (btn) btn.onclick = function() { var checked = page.querySelector('[name="ww-target"]:checked'); if (!checked) return toast('请选择投票目标'); state.vote.votes.push({ voterId: me.id, targetId: String(checked.value), reason: '用户投票' }); save(); collectAIVotes() }
    else if (!canVote) collectAIVotes()
  }

  async function collectAIVotes() {
    if (busy || state.phase !== 'vote') return; busy = true; renderVote()
    await new Promise(function(resolve) { setTimeout(resolve, 500) })
    var voters = alivePlayers().filter(function(p) { return !p.isUser && !state.vote.votes.some(function(v) { return String(v.voterId) === String(p.id) }) })
    for (var i = 0; i < voters.length; i++) {
      var actor = voters[i]; var targets = alivePlayers().filter(function(p) { return String(p.id) !== String(actor.id) })
      var result = await callWerewolfAI('vote', { actor: actor, legal: targets })
      state.vote.votes.push({ voterId: actor.id, targetId: validateTarget(result.targetId, targets), reason: result.reason || '综合今天的发言和票型，我先投这个位置。' })
    }
    busy = false; resolveVote()
  }

  function resolveVote() {
    var counts = {}; state.vote.votes.forEach(function(v) { counts[v.targetId] = (counts[v.targetId] || 0) + 1 }); state.vote.counts = counts
    var max = Math.max.apply(null, Object.keys(counts).map(function(id) { return counts[id] }))
    var tied = Object.keys(counts).filter(function(id) { return counts[id] === max }); state.vote.tiedPlayerIds = tied
    var summary = Object.keys(counts).sort(function(a,b) { return counts[b] - counts[a] }).map(function(id) { return playerLabel(id) + '：' + counts[id] + ' 票' }).join('，')
    log('vote_summary', summary, { counts: counts })
    if (tied.length !== 1) { log('exile', '最高票平票，本轮无人出局。', { tied: tied }); save(); toast('平票，无人出局'); return setTimeout(startNight, 900) }
    var exiled = getPlayer(tied[0]); exiled.alive = false; exiled.deathDay = state.day; exiled.deathCause = 'vote'; state.vote.exiledPlayerId = exiled.id; state.vote.lastWords = null; log('exile', playerLabel(exiled) + ' 被投票出局。', { playerId: exiled.id })
    var win = checkWin()
    if (win) return endGame(win)
    state.phase = 'last_words'; save(); renderLastWords()
  }

  async function renderLastWords() {
    var p = getPlayer(state.vote.exiledPlayerId); var isUser = p && p.isUser
    var voteRows = Object.keys(state.vote.counts || {}).sort(function(a,b) { return state.vote.counts[b] - state.vote.counts[a] }).map(function(id) { return '<div><span>' + esc(playerLabel(id)) + '</span><b>' + state.vote.counts[id] + ' 票</b></div>' }).join('')
    var words = state.vote.lastWords
    var wordsArea = words ? '<section class="ww-last-words"><h3>遗言</h3><p>“' + esc(words) + '”</p><button class="ww-primary" id="ww-after-exile" type="button">继续游戏</button></section>' : isUser ? '<section class="ww-user-turn"><h3>留下遗言</h3><textarea id="ww-last-words" placeholder="这是你最后一次公开发言…"></textarea><button class="ww-primary" id="ww-send-last">发表遗言</button></section>' : '<div class="ww-speaking"><div class="ww-dots"><i></i><i></i><i></i></div>正在整理遗言</div>'
    shell('出局与遗言', '<section class="ww-exile"><div class="ww-exile-avatar">' + avatarHTML(p) + '</div><p>被放逐的是</p><h2>' + esc(playerLabel(p)) + '</h2></section><section class="ww-vote-result"><h3>匿名票数汇总</h3>' + voteRows + '</section>' + wordsArea)
    var continueBtn = page.querySelector('#ww-after-exile')
    if (continueBtn) return continueBtn.onclick = function() { var win = checkWin(); if (win) endGame(win); else startNight() }
    if (isUser) return page.querySelector('#ww-send-last').onclick = function() { finishLastWords(cleanSpeech(page.querySelector('#ww-last-words').value) || '后面大家重点看票型，不要只听单点发言。') }
    if (busy) return; busy = true; var result = await callWerewolfAI('lastWords', { actor: p, legal: [] }); busy = false; finishLastWords(cleanSpeech(result.speech || '我能说的信息不多，后面大家重点看票型，不要只听单点发言。'))
  }

  function finishLastWords(text) {
    var p = getPlayer(state.vote.exiledPlayerId); state.vote.lastWords = text; log('last_words', playerLabel(p) + ' 的遗言：' + text, { playerId: p.id, speech: text }); save(); renderLastWords()
  }

  function checkWin() {
    var wolves = alivePlayers().filter(function(p) { return p.role === 'werewolf' }).length; var good = alivePlayers().length - wolves
    if (wolves === 0) return { winner: 'villagers', reason: '所有狼人均已出局' }
    if (wolves >= good) return { winner: 'werewolves', reason: '存活狼人人数已不少于好人' }
    return null
  }

  function endGame(result) {
    state.phase = 'ended'; state.winner = result.winner; state.winReason = result.reason; state.endedAt = Date.now(); log('ended', (result.winner === 'villagers' ? '好人阵营' : '狼人阵营') + '获胜：' + result.reason); state.report = buildLocalGameReport(state); archiveGame(state.report); save(); renderEnded()
  }

  function buildLocalGameReport(s) {
    return { id: s.id, mode: s.gameMode, startedAt: s.startedAt, endedAt: s.endedAt, winner: s.winner, winReason: s.winReason,
      players: s.players.map(function(p) { return { id: p.id, publicName: p.publicName, avatar: p.avatar || '', source: p.source, seatNumber: p.seatNumber, role: p.role } }),
      publicLog: s.publicLog, privateLog: s.privateLog.map(function(item) { var copy = JSON.parse(JSON.stringify(item)); if (copy.data) delete copy.data.thinking; return copy }) }
  }

  function renderEnded() {
    renderGameSummary(state.report || buildLocalGameReport(state), false)
  }

  function renderGameSummary(report, historical) {
    var goodWin = report.winner === 'villagers'
    var players = (report.players || []).slice().sort(function(a,b) { return a.seatNumber-b.seatNumber })
    var logs = Array.isArray(report.publicLog) ? report.publicLog : null
    var body = '<section class="ww-result ' + (goodWin ? 'good' : 'wolf') + '"><i class="fa-solid ' + (goodWin ? 'fa-sun' : 'fa-moon') + '"></i><p>本局胜方</p><h2>' + (goodWin ? '好人阵营' : '狼人阵营') + '</h2><span>' + esc(report.winReason) + '</span></section>' +
      '<section class="ww-panel"><h3>身份揭晓</h3><div class="ww-reveal-list">' + players.map(function(p) { return '<div>' + avatarHTML(p) + '<span class="ww-reveal-copy"><b>' + esc(String(p.seatNumber).padStart(2, '0') + ' · ' + p.publicName) + '</b><small>' + esc(ROLE_LABEL[p.role] || p.role || '未知') + '</small></span></div>' }).join('') + '</div></section>' +
      '<section class="ww-panel"><h3>公开对局记录</h3><div class="ww-report-log">' + (logs ? logs.map(function(x) { return '<p><span>第 ' + x.day + ' 天</span>' + esc(x.text) + '</p>' }).join('') : '<p class="ww-legacy-log">此记录创建于详细记录功能上线前，暂无公开对局记录。</p>') + '</div></section>' +
      (historical ? '' : '<div class="ww-actions"><button class="ww-secondary" id="ww-exit" type="button">返回大厅</button><button class="ww-primary" id="ww-again" type="button">再来一局</button></div>')
    shell('游戏结束', body, historical ? '<span></span>' : null, historical ? renderHistory : null)
    if (historical) return
    page.querySelector('#ww-exit').onclick = function() { clearSave(); resumableState = null; renderRoomPicker() }
    page.querySelector('#ww-again').onclick = async function() {
      var user = selectedUser || await db.characters.get(parseInt(state.userAccount.id, 10))
      selectedUser = user
      selectedFriends = await loadFriends(user)
      state = freshLobby(user, selectedFriends)
      save(); renderLobby()
    }
  }

  function buildPlayerView(actor) {
    var secrets = {}
    if (actor.role === 'werewolf') secrets.wolves = state.players.filter(function(p) { return p.role === 'werewolf' }).map(function(p) { return { id: p.id, name: p.publicName } })
    if (actor.role === 'seer') secrets.seerChecks = actor.memory.seerChecks.map(function(c) { return { targetId: c.targetId, name: publicName(c.targetId), result: c.result } })
    if (actor.role === 'witch') { secrets.victim = state.night.wolfTargetId ? { id: state.night.wolfTargetId, name: publicName(state.night.wolfTargetId) } : null; secrets.canSave = state.inventory && state.inventory.save; secrets.canPoison = state.inventory && state.inventory.poison }
    return { self: { id: actor.id, name: actor.publicName, role: actor.role, camp: actor.camp, style: actor.style, speakingStyle: actor.speakingStyle }, day: state.day, phase: state.phase,
      alive: alivePlayers().map(function(p) { return { id: p.id, name: p.publicName } }), dead: state.players.filter(function(p) { return !p.alive }).map(function(p) { return { id: p.id, name: p.publicName, deathDay: p.deathDay } }),
      publicLog: state.publicLog.map(function(x) { return x.text }).slice(-30), speeches: state.discussion.speeches || [], secrets: secrets }
  }

  var AI_SYSTEM = {
    wolf: '你是中文狼人杀中的狼人团队决策器。只能依据提供的公开信息和狼人队友信息选择目标。只输出合法 JSON，字段为 targetId、reason。',
    witch: '你是中文狼人杀中的女巫。只能依据个人视角决定用药，不得假设其他玩家身份。只输出合法 JSON，字段为 useSave、poisonTargetId、reason。',
    seer: '你是中文狼人杀中的预言家。根据个人视角选择信息价值最高且未查验的目标。只输出合法 JSON，字段为 targetId、reason。',
    speech: '你是中文狼人杀玩家。严格使用该玩家视角，发言自然、简洁，不泄露未知身份。只输出合法 JSON，字段为 speech、claim、note；claim 只能是字符串 yes 或 null。',
    vote: '你是中文狼人杀玩家。严格使用个人视角，根据公开发言投票。只输出合法 JSON，字段为 targetId、reason。',
    lastWords: '你是刚被白天投出的中文狼人杀玩家。只能根据个人已知信息留下 180 字内遗言。只输出合法 JSON，字段为 speech。',
    adapt: '你是狼人杀角色风格适配器。输入只来自微信好友对应的角色档案。角色档案有人设时必须保持一致；description 为空时属于正常情况，请根据角色名字为其自动补全一个自然、不过度戏剧化且与其他玩家有区分度的狼人杀人设。不得暗示任何真实身份。只输出合法 JSON，字段 adapted，子项 name、style、speakingStyle、socialGoal。',
    strangers: '你是狼人杀路人玩家生成器。为预分配 ID 生成不同的自然中文名字和风格，不暗示身份。只输出合法 JSON，字段 strangers，子项 id、name、style、speakingStyle、socialGoal。',
    teammate: '你是用户的狼人队友。依据自己的性格回应用户的击杀建议，不得假设好人真实身份。只输出合法 JSON，字段 thinking、response、targetId、reason、agree。'
  }

  async function rawAI(kind, payload, temperature) {
    if (!window.callGameAI) throw new Error('AI 未配置')
    var raw = await window.callGameAI([{ role: 'user', content: JSON.stringify(payload) }], { system: AI_SYSTEM[kind], temperature: temperature, responseFormat: 'json_object' })
    if (typeof raw === 'object') return raw
    var text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    return JSON.parse(text)
  }

  async function callWerewolfAI(kind, payload) {
    var legal = payload.legal || []; var actor = payload.actor
    var input = { day: state.day, playerView: actor ? buildPlayerView(actor) : null, legalTargets: legal.map(function(p) { return { id: p.id, name: p.publicName } }), publicContext: state.publicLog.map(function(x) { return x.text }).slice(-30), todaySpeeches: state.discussion.speeches || [] }
    if (kind === 'witch') { input.victim = payload.victim && { id: payload.victim.id, name: payload.victim.publicName }; input.saveAvailable = payload.saveAvailable; input.poisonAvailable = payload.poisonAvailable }
    try { return await rawAI(kind, input, kind === 'speech' ? 0.75 : kind === 'lastWords' ? 0.7 : 0.4) }
    catch (e) {
      var fallback = fallbackAI(kind, legal); fallback._fallbackError = String(e.message || e)
      if (state.phase !== 'night') privateLog('ai_fallback', { kind: kind, error: fallback._fallbackError })
      return fallback
    }
  }

  function fallbackAI(kind, legal) {
    if (kind === 'witch') return { useSave: state.day === 1 && !!state.night.wolfTargetId, poisonTargetId: null, reason: '首夜优先保留信息量' }
    if (kind === 'speech') return { speech: '我这轮先保守一点，主要看大家的票型和发言变化。现在信息还不够，我不想过早站死边。', claim: null }
    if (kind === 'lastWords') return { speech: '我能说的信息不多，后面大家重点看票型，不要只听单点发言。' }
    var fallbackTarget = pick(legal)
    return { targetId: fallbackTarget && fallbackTarget.id, reason: kind === 'vote' ? '综合今天的发言和票型，我先投这个位置。' : '从当前合法目标中选择。' }
  }

  async function adaptInvited(invited) {
    if (!invited.length) return []
    try { var result = await rawAI('adapt', { invitedCharacters: invited.map(function(f) { return { name: f.name, description: f.description } }) }, 0.55); return Array.isArray(result.adapted) ? result.adapted : [] }
    catch (e) { privateLog('ai_fallback', { kind: 'adapt', error: String(e.message || e) }); return invited.map(function(f, index) { return { name: f.name, style: f.description || (index % 2 ? '直觉敏锐，敢于直接点名可疑位置' : '沉稳观察，习惯复盘发言中的前后矛盾'), speakingStyle: index % 2 ? '表达直接，常用反问确认对方立场' : '先给结论，再按顺序补充理由', socialGoal: '通过公开分析和回应质疑建立可信度' } }) }
  }

  async function generateStrangers(count, invited) {
    var ids = []; for (var i = 0; i < count; i++) ids.push('Player_' + String(i + 1).padStart(2, '0'))
    try {
      var result = await rawAI('strangers', { strangerIds: ids, invitedNames: invited.map(function(f) { return f.name }) }, 0.7)
      if (Array.isArray(result.strangers) && result.strangers.length === count) return ids.map(function(id, idx) { var s = result.strangers.find(function(x) { return x.id === id }) || result.strangers[idx]; return { id: id, name: s.name || FALLBACK_NAMES[idx], style: s.style || '谨慎观察型', speakingStyle: s.speakingStyle || '自然简洁', socialGoal: s.socialGoal || '建立可信度' } })
    } catch (e) { privateLog('ai_fallback', { kind: 'strangers', error: String(e.message || e) }) }
    return ids.map(function(id, i) { return { id: id, name: FALLBACK_NAMES[i], style: i % 2 ? '直觉敏锐，敢于点名质疑' : '沉稳观察，习惯复盘前后矛盾', speakingStyle: i % 2 ? '语速快，常用反问句' : '先说结论，再补两点理由', socialGoal: '通过公开分析建立可信度' } })
  }

  async function wolfTeammateResponse(teammate, targetId, reason) {
    var legal = legalTargets(state.players.filter(function(p) { return p.role === 'werewolf' }).map(function(p) { return p.id }))
    try { var result = await rawAI('teammate', { day: state.day, WolfView: buildPlayerView(teammate), legalTargets: legal.map(function(p) { return { id: p.id, name: p.publicName } }), userTargetId: targetId, userReason: reason }, 0.45); result.agree = String(result.targetId) === String(targetId); return result }
    catch (e) { return { targetId: targetId, agree: true, thinking: '结合目前的公开信息，这个目标可以接受。', response: '我同意这个目标，今晚就按你的判断来。', reason: reason || '接受队友建议', _fallbackError: String(e.message || e) } }
  }

  function validateTarget(id, legal) { return legal.some(function(p) { return String(p.id) === String(id) }) ? String(id) : String((pick(legal) || {}).id || '') }
  function cleanSpeech(text) { return String(text || '').replace(/```[\s\S]*?```/g, '').replace(/^\s*#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '').trim() }

  window.createWerewolfGame = freshLobby
  window.assignWerewolfRoles = assignRoles
  window.buildWerewolfPlayerView = buildPlayerView
  window.checkWerewolfWin = checkWin
  window.buildLocalWerewolfReport = buildLocalGameReport
})()
