// game-hall.js — 游戏大厅主页

(function() {
  var GAMES = [
    {
      id: 'werewolf',
      title: '狼人杀',
      meta: '发言 · 推理',
      icon: 'fa-solid fa-moon',
      tone: 'wolf'
    },
    {
      id: 'liars-bar',
      title: '骗子酒馆',
      meta: '博弈 · 诈唬',
      icon: 'fa-solid fa-martini-glass-citrus',
      tone: 'bar'
    },
    {
      id: 'anonymous-chat',
      title: '匿名聊天室',
      meta: '匿名 · 即时',
      icon: 'fa-solid fa-user-secret',
      tone: 'chat'
    },
    {
      id: 'heart-vote',
      title: '心动投票',
      meta: '选择 · 心跳',
      icon: 'fa-solid fa-heart',
      tone: 'vote'
    }
  ]

  function esc(str) {
    if (window.escapeMainHtml) return window.escapeMainHtml(str)
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    })
  }

  function buildGameCards() {
    return GAMES.map(function(game) {
      return '' +
        '<button class="game-card game-card-' + esc(game.tone) + '" type="button" data-game="' + esc(game.id) + '">' +
          '<span class="game-card-icon" aria-hidden="true"><i class="' + esc(game.icon) + '"></i></span>' +
          '<span class="game-card-copy">' +
            '<span class="game-card-title">' + esc(game.title) + '</span>' +
            '<span class="game-card-meta">' + esc(game.meta) + '</span>' +
          '</span>' +
      '<span class="game-card-status">' + (game.id === 'werewolf' ? '立即进入' : '暂未开放') + '</span>' +
        '</button>'
    }).join('')
  }

  function buildGameApiCard(options) {
    options = options || {}
    var title = options.title || '游戏专属 API'
    var description = options.description || '与橙光共用设置，游玩消耗大量API'
    return '' +
      '<section class="game-api-section" aria-labelledby="game-api-title">' +
        '<button class="game-api-card" id="game-api-card" type="button">' +
          '<span class="game-api-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>' +
          '<span class="game-api-copy">' +
            '<strong id="game-api-title">' + esc(title) + '</strong>' +
            '<small>' + esc(description) + '</small>' +
          '</span>' +
          '<span class="game-api-value" id="game-api-value" data-game-api-value>读取中</span>' +
          '<i class="fa-solid fa-angle-right game-api-arrow" aria-hidden="true"></i>' +
        '</button>' +
      '</section>'
  }

  async function updateGameApiStatus(root) {
    var value = root && root.querySelector('#game-api-value')
    if (!value || !window.loadGameApiConfig) return
    var cfg = await window.loadGameApiConfig()
    value.textContent = cfg.url && cfg.key && cfg.model ? cfg.model : '未配置'
    value.title = value.textContent
  }

  async function refreshAllGameApiStatus() {
    var pages = [
      document.getElementById('game-hall-page'),
      document.getElementById('avg-home-page')
    ].filter(Boolean)
    await Promise.all(pages.map(function(page) {
      return updateGameApiStatus(page)
    }))
    var avgStatus = document.querySelector('[data-avg-api-status]')
    if (avgStatus && window.updateAvgSettingsApiStatus) {
      await window.updateAvgSettingsApiStatus(avgStatus)
    }
  }

  function gameApiFormHTML() {
    return '' +
      '<div class="game-api-form-note">该配置仅供游戏大厅内的游戏使用；未完整配置时将使用主 API。</div>' +
      '<div class="setting-section"><div class="api-form">' +
        '<label class="form-label" for="game-api-base-url">Base URL</label>' +
        '<input class="input-field" id="game-api-base-url" placeholder="https://api.openai.com/v1">' +
        '<label class="form-label" for="game-api-key">API Key</label>' +
        '<div class="input-with-toggle">' +
          '<input class="input-field" id="game-api-key" type="password" placeholder="sk-...">' +
          '<button class="btn-text-toggle" id="toggle-game-api-key" type="button">显示</button>' +
        '</div>' +
        '<label class="form-label" for="game-api-model-input">模型</label>' +
        '<input class="input-field" id="game-api-model-input" placeholder="手动输入模型名，例如 gemini-2.5-flash">' +
        '<div class="model-row">' +
          '<select class="input-field" id="game-api-model"><option value="">拉取后选择模型</option></select>' +
          '<button class="btn-ghost btn-sm" id="btn-load-game-models" type="button">获取</button>' +
        '</div>' +
        '<label class="form-label" for="game-api-temperature">温度</label>' +
        '<div class="temp-row">' +
          '<input type="range" id="game-api-temperature" min="0" max="2" step="0.1" value="0.7">' +
          '<span class="temp-val" id="game-api-temp-value">0.7</span>' +
        '</div>' +
        '<button class="btn-ghost btn-full" id="btn-test-game-api" type="button">连接测试</button>' +
        '<button class="btn-pill btn-full" id="btn-save-game-api" type="button">保存</button>' +
      '</div></div>'
  }

  function readGameApiForm(page) {
    var get = function(id) { return ((page.querySelector('#' + id) || {}).value || '').trim() }
    var temperature = parseFloat(get('game-api-temperature'))
    return {
      url: get('game-api-base-url').replace(/\/+$/, ''),
      key: get('game-api-key'),
      model: get('game-api-model-input'),
      temp: isNaN(temperature) ? 0.7 : temperature
    }
  }

  function showGameApiTestResult(ok, message, detail) {
    if (window.showApiTestModal) {
      window.showApiTestModal('游戏专属 API 连接测试' + (ok ? '成功' : '失败'), ok, message, detail || '')
    } else if (window.toast) {
      window.toast(message)
    }
  }

  async function fillGameApiForm(page) {
    var cfg = await window.loadGameApiConfig()
    page.querySelector('#game-api-base-url').value = cfg.url || ''
    page.querySelector('#game-api-key').value = cfg.key || ''
    page.querySelector('#game-api-model-input').value = cfg.model || ''
    page.querySelector('#game-api-temperature').value = cfg.temp == null ? 0.7 : cfg.temp
    page.querySelector('#game-api-temp-value').textContent = parseFloat(cfg.temp == null ? 0.7 : cfg.temp).toFixed(1)
  }

  function setBusy(button, busy, text) {
    if (!button) return
    if (busy) button.dataset.oldText = button.textContent
    button.disabled = busy
    button.textContent = busy ? text : (button.dataset.oldText || button.textContent)
  }

  function bindGameApiForm(page) {
    var key = page.querySelector('#game-api-key')
    page.querySelector('#toggle-game-api-key').onclick = function() {
      var visible = key.type === 'text'
      key.type = visible ? 'password' : 'text'
      this.textContent = visible ? '显示' : '隐藏'
    }
    var temperature = page.querySelector('#game-api-temperature')
    temperature.oninput = function() {
      page.querySelector('#game-api-temp-value').textContent = parseFloat(temperature.value).toFixed(1)
    }
    var modelSelect = page.querySelector('#game-api-model')
    modelSelect.onchange = function() {
      if (modelSelect.value) page.querySelector('#game-api-model-input').value = modelSelect.value
    }
    page.querySelector('#btn-load-game-models').onclick = async function() {
      var button = this
      var cfg = readGameApiForm(page)
      if (!cfg.url) { window.toast && window.toast('请先填写 Base URL'); return }
      setBusy(button, true, '获取中...')
      try {
        var res = await fetch(cfg.url + '/models', { headers: { Authorization: 'Bearer ' + cfg.key } })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        var json = await res.json()
        var models = (json.data || []).map(function(item) { return item && item.id }).filter(Boolean)
        modelSelect.innerHTML = '<option value="">请选择模型</option>' + models.map(function(model) {
          return '<option value="' + esc(model) + '">' + esc(model) + '</option>'
        }).join('')
        window.toast && window.toast(models.length ? '已获取 ' + models.length + ' 个模型' : '未获取到模型')
      } catch (error) {
        window.toast && window.toast('获取模型失败：' + (error.message || error))
      } finally {
        setBusy(button, false)
      }
    }
    page.querySelector('#btn-test-game-api').onclick = async function() {
      var button = this
      var cfg = readGameApiForm(page)
      if (!cfg.url || !cfg.key || !cfg.model) {
        showGameApiTestResult(false, '请完整填写 Base URL、API Key 和模型。')
        return
      }
      setBusy(button, true, '测试中...')
      try {
        var json = await window.runTrackedChatCompletion(cfg, {
          model: cfg.model,
          temperature: cfg.temp,
          messages: [{ role: 'user', content: '请只回复：连接成功' }]
        }, '游戏专属 API 连接测试')
        var reply = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
        if (!reply) throw new Error('接口已响应，但没有返回有效的聊天内容。')
        showGameApiTestResult(true, '连接成功，模型已返回内容。', '模型回复：' + reply)
      } catch (error) {
        showGameApiTestResult(false, error.message || '连接测试失败')
      } finally {
        setBusy(button, false)
      }
    }
    page.querySelector('#btn-save-game-api').onclick = async function() {
      var cfg = readGameApiForm(page)
      var required = [
        { value: cfg.url, label: 'Base URL', el: page.querySelector('#game-api-base-url') },
        { value: cfg.key, label: 'API Key', el: page.querySelector('#game-api-key') },
        { value: cfg.model, label: '模型', el: page.querySelector('#game-api-model-input') },
        { value: page.querySelector('#game-api-temperature').value, label: '温度', el: page.querySelector('#game-api-temperature') }
      ]
      var missing = required.filter(function(field) { return !String(field.value == null ? '' : field.value).trim() })
      if (missing.length) {
        window.toast && window.toast('游戏专属 API 保存失败，请填写：' + missing.map(function(field) { return field.label }).join('、'))
        if (missing[0].el && missing[0].el.focus) missing[0].el.focus()
        return
      }
      try {
        await Promise.all([
          db.config.put({ key: 'gameApiBaseUrl', value: cfg.url }),
          db.config.put({ key: 'gameApiKey', value: cfg.key }),
          db.config.put({ key: 'gameApiModel', value: cfg.model }),
          db.config.put({ key: 'gameApiTemperature', value: cfg.temp })
        ])
        window._gameApiConfigCache = null
        await refreshAllGameApiStatus()
        window.toast && window.toast('游戏专属 API 已保存')
      } catch (error) {
        window.toast && window.toast('游戏专属 API 保存失败：' + (error.message || error))
      }
    }
  }

  function openGameApiPage() {
    var old = document.getElementById('game-api-config-page')
    if (old) old.remove()
    var page = window.buildSubPage
      ? window.buildSubPage('game-api-config-page', '游戏专属 API', gameApiFormHTML())
      : null
    if (!page) return
    window.openSubPage(page)
    fillGameApiForm(page)
    bindGameApiForm(page)
  }

  function bindGameHallEvents(page) {
    var heading = page.querySelector('#game-hall-heading')
    if (heading) {
      heading.addEventListener('click', function() {
        window.closePage && window.closePage('game-hall-page')
      })
    }

    page.querySelectorAll('.game-card').forEach(function(card) {
      card.addEventListener('click', function() {
        if (card.getAttribute('data-game') === 'werewolf' && window.showWerewolfGame) {
          window.showWerewolfGame()
          return
        }
        if (window.toast) window.toast('暂未开放')
      })
    })
    var apiCard = page.querySelector('#game-api-card')
    if (apiCard) apiCard.addEventListener('click', function() { window.openGameApiConfigPage && window.openGameApiConfigPage() })
    updateGameApiStatus(page)
  }

  window.buildGameApiCard = buildGameApiCard
  window.updateGameApiStatus = updateGameApiStatus
  window.refreshAllGameApiStatus = refreshAllGameApiStatus
  window.openGameApiConfigPage = openGameApiPage

  window.showGameHallPage = function() {
    var existing = document.getElementById('game-hall-page')
    if (existing) existing.remove()

    var page = document.createElement('div')
    page.id = 'game-hall-page'
    page.className = 'full-page game-hall-page'
    page.innerHTML =
      '<header class="game-hall-header">' +
        '<button class="game-hall-heading" id="game-hall-heading" type="button" aria-label="返回">' +
          '<div class="game-hall-kicker">WanWan Arcade</div>' +
          '<h1>游戏大厅</h1>' +
        '</button>' +
      '</header>' +
      '<main class="game-hall-main">' +
        '<section class="game-hall-grid" aria-label="游戏列表">' +
          buildGameCards() +
        '</section>' +
        buildGameApiCard({
          title: '游戏专属 API',
          description: '与橙光共用设置，游玩消耗大量API'
        }) +
      '</main>'

    if (window.openPage) {
      window.openPage(page)
    } else {
      ;(document.getElementById('app') || document.body).appendChild(page)
    }
    bindGameHallEvents(page)
  }
})()
