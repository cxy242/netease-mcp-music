(function() {
  'use strict'

  var DOOR_SYSTEM_PROMPT = [
    '你是“任意门 HTML 模块运行器”。你的任务是根据 USER 资料、好友角色人设、近期对话、场景主题和当前 HTML 模块，生成一份可以直接运行的完整 HTML 文档。',
    '',
    '你必须遵守以下规则：',
    '',
    '1. 只输出完整 HTML，从 <!DOCTYPE html> 开始，以 </html> 结束。',
    '2. 不要输出 Markdown 代码围栏、解释、前言、后记或任何 HTML 之外的文字。',
    '3. 必须遵循当前 HTML 模块提供的生成模板。可以替换模板中的内容、颜色、文字和局部布局，但不得删除模块要求的核心结构。',
    '4. 生成内容必须符合角色人设、说话方式、与 USER 的关系以及近期对话，不得随意改变人物性格或捏造重大关系事实。',
    '5. 优先使用近期对话中已经出现的细节，让页面看起来是专属于当前 USER 和角色的内容。',
    '6. 保留模块原有的功能和交互方式。模块允许包含 CSS、JavaScript、图片、音频、视频、表单、解密输入或其他模块本身需要的内容。',
    '7. 根据当前模块的布局和用途合理控制内容长度，避免文字溢出或破坏主要排版。',
    '8. 最终 HTML 必须语法完整，替换所有需要生成的占位内容，并能直接写入 iframe 的 srcdoc 运行。'
  ].join('\n')

  var currentDoorRequest = null
  var doorFrameState = new WeakMap()
  var doorResizeObserver = null

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    })
  }

  function attr(value) {
    return esc(value).replace(/`/g, '&#96;')
  }

  function makeId(prefix) {
    if (window.crypto && crypto.randomUUID) return prefix + crypto.randomUUID()
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2)
  }

  function formatDate(value) {
    if (!value) return ''
    try {
      return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch (_) {
      return ''
    }
  }

  function validateHtmlInput(html, allowPlaceholders) {
    var value = String(html || '').trim()
    if (!value) throw new Error('请填写 HTML 模板或 HTML 片段')
    if (!/<[a-z][\s\S]*>/i.test(value)) throw new Error('请输入有效的 HTML 内容')
    if (!allowPlaceholders && /{{[\s\S]*?}}/.test(value)) {
      throw new Error('生成结果仍有未替换的 {{...}} 占位符')
    }
    return value
  }

  function isCompleteHtmlDocument(html) {
    return /(?:<!doctype\s+html[\s\S]*)?<html[\s>]/i.test(html) && /<\/html>\s*$/i.test(html)
  }

  function getFragmentDesignWidth(fragment) {
    var openingTag = String(fragment || '').match(/<([a-z][\w-]*)(?:\s[^>]*)?>/i)
    if (!openingTag) return 390
    var style = openingTag[0].match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)
    var width = style && style[2].match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px\b/i)
    return width ? Math.max(1, Number(width[1])) : 390
  }

  function normalizeHtmlDocument(html) {
    var value = String(html || '').trim()
    if (isCompleteHtmlDocument(value)) return value
    var designWidth = getFragmentDesignWidth(value)
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent;overflow-x:hidden;overscroll-behavior-x:none}body{overflow-y:visible}.door-fragment-root{display:flow-root;box-sizing:border-box;width:' + designWidth + 'px;min-height:1px;overflow-x:hidden}</style></head><body><div class="door-fragment-root" data-door-root>' + value + '</div></body></html>'
  }

  function extractGeneratedHtml(raw) {
    var value = String(raw || '').trim()
    var fence = value.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i)
    if (fence) value = fence[1].trim()
    var startDoctype = value.search(/<!doctype\s+html/i)
    var startHtml = value.search(/<html[\s>]/i)
    var start = startDoctype >= 0 ? startDoctype : startHtml
    var end = value.toLowerCase().lastIndexOf('</html>')
    if (start >= 0 && end >= start) value = value.slice(start, end + 7)
    return normalizeHtmlDocument(validateHtmlInput(value, false))
  }

  function injectRuntime(html) {
    var csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:\">"
    var containment = '<style id="anywhere-door-containment">html,body{max-width:100%;overflow-x:hidden!important;overscroll-behavior-x:none}body{touch-action:pan-y}</style>'
    var runtime = '<script>(function(){var last="";function root(){return document.querySelector("[data-door-root]")||document.body||document.documentElement}function report(){var node=root();var rect=node.getBoundingClientRect();var width=Math.max(rect.width||0,node.scrollWidth||0);var height=Math.max(rect.height||0,node.scrollHeight||0);var key=Math.ceil(width)+"x"+Math.ceil(height);if(key===last)return;last=key;parent.postMessage({type:"anywhere-door-size",width:width,height:height},"*")}window.addEventListener("load",report);window.addEventListener("resize",report);if(window.ResizeObserver)new ResizeObserver(report).observe(root());setTimeout(report,50);setTimeout(report,350)})();</script>'
    var output = normalizeHtmlDocument(validateHtmlInput(html, true))
    if (/<head[\s>]/i.test(output)) output = output.replace(/<head([^>]*)>/i, '<head$1>' + csp + containment)
    else output = output.replace(/<html([^>]*)>/i, '<html$1><head>' + csp + containment + '</head>')
    if (/<\/body>/i.test(output)) return output.replace(/<\/body>/i, runtime + '</body>')
    return output.replace(/<\/html>/i, '<body>' + runtime + '</body></html>')
  }

  function getDoorMaxHeight(stage) {
    var viewport = window.visualViewport ? window.visualViewport.height : window.innerHeight
    return Math.min(viewport * .68, 620)
  }

  function fitDoorFrame(stage, scaler, frame, contentWidth, contentHeight) {
    var stageWidth = stage.clientWidth
    if (!stageWidth || !contentWidth || !contentHeight) return
    var scale = stageWidth / contentWidth
    var scaledHeight = Math.max(1, contentHeight * scale)
    var maxHeight = stage.closest('.door-fullscreen') ? stage.clientHeight : getDoorMaxHeight(stage)
    frame.style.width = contentWidth + 'px'
    frame.style.height = contentHeight + 'px'
    frame.style.transform = 'scale(' + scale + ')'
    scaler.style.height = scaledHeight + 'px'
    if (!stage.closest('.door-fullscreen')) stage.style.height = Math.min(scaledHeight, maxHeight) + 'px'
    stage.style.overflowY = scaledHeight > maxHeight ? 'auto' : 'hidden'
  }

  function refitDoorFrame(frame) {
    var state = doorFrameState.get(frame)
    if (!state || !state.width || !state.height) return
    fitDoorFrame(state.stage, state.scaler, frame, state.width, state.height)
  }

  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'anywhere-door-size') return
    document.querySelectorAll('.anywhere-door-frame').forEach(function(frame) {
      if (frame.contentWindow !== event.source) return
      var state = doorFrameState.get(frame)
      if (!state) return
      var reportedWidth = Math.max(1, Number(event.data.width) || 0)
      // Width is the module's design width. Lock it after the first report so
      // percentage layouts cannot feed the scaled iframe width back into
      // measurement and shrink by a few pixels on every ResizeObserver pass.
      if (!state.width) state.width = reportedWidth
      state.height = Math.max(1, Number(event.data.height) || 0)
      refitDoorFrame(frame)
    })
  })

  window.addEventListener('resize', function() {
    document.querySelectorAll('.anywhere-door-frame').forEach(refitDoorFrame)
  })

  function mountDoorFrame(container, html, title) {
    container.innerHTML = '<div class="anywhere-door-stage"><div class="anywhere-door-scaler"><iframe class="anywhere-door-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="' + attr(title || '任意门场景') + '"></iframe></div></div>'
    var stage = container.querySelector('.anywhere-door-stage')
    var scaler = container.querySelector('.anywhere-door-scaler')
    var frame = container.querySelector('.anywhere-door-frame')
    doorFrameState.set(frame, { stage: stage, scaler: scaler, width: 0, height: 0 })
    frame.style.width = '390px'
    frame.style.height = '1px'
    frame.srcdoc = injectRuntime(html)
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(function() { refitDoorFrame(frame) })
      observer.observe(stage)
      doorResizeObserver = observer
    }
    return frame
  }

  function createPage(id, title, rightHtml) {
    var page = document.createElement('div')
    page.id = id
    page.className = 'full-page door-page'
    page.innerHTML = '<div class="page-header"><button class="header-back" type="button"><i class="fa fa-angle-left"></i></button><span class="header-title">' + esc(title) + '</span><div class="door-header-actions">' + (rightHtml || '') + '</div></div><div class="door-scroll"></div>'
    page.querySelector('.header-back').addEventListener('click', function() { window.closePage(id) })
    return page
  }

  async function getUsers() {
    return (await db.characters.where('type').equals('user').toArray()).sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    })
  }

  async function getFriends(userId) {
    if (!userId) return []
    var row = await db.config.get('friends_' + userId)
    var ids = Array.isArray(row && row.value) ? row.value.map(Number).filter(Boolean) : []
    var chars = await db.characters.bulkGet(ids)
    return chars.filter(function(item) { return item && item.type !== 'user' })
  }

  async function isFriend(userId, characterId) {
    var friends = await getFriends(userId)
    return friends.some(function(item) { return Number(item.id) === Number(characterId) })
  }

  async function getWechatProfile(userId, characterId) {
    var row = await db.config.get('wechatProfile_' + userId + '_' + characterId)
    return row && row.value ? row.value : {}
  }

  function profileName(character, profile) {
    return (profile && (profile.remark || profile.nickname || profile.name)) || character.nick || character.name || '未命名'
  }

  function relationDescription(character, userId) {
    var relation = (character.relations || []).find(function(item) { return Number(item.charId) === Number(userId) })
    return relation ? [relation.type, relation.desc].filter(Boolean).join('：') : ''
  }

  async function collectDoorContext(userId, characterId) {
    var user = await db.characters.get(Number(userId))
    var character = await db.characters.get(Number(characterId))
    if (!user || user.type !== 'user') throw new Error('所选 USER 不存在')
    if (!character || character.type === 'user') throw new Error('所选好友角色不存在')
    if (!(await isFriend(userId, characterId))) throw new Error('当前角色不是所选 USER 的好友')
    var profile = await getWechatProfile(userId, characterId)
    var friendName = profileName(character, profile)
    var chat = await db.chats.where('[ownerUid+charId]').equals([String(userId), Number(characterId)]).first()
    if (!chat) chat = await db.chats.where('[ownerUid+charId]').equals([Number(userId), Number(characterId)]).first()
    var messages = chat ? await db.messages.where('chatId').equals(chat.id).sortBy('createdAt') : []
    var recent = messages.slice(-50).map(function(message) {
      var text = summarizeMessage(message.content)
      if (!text) return ''
      return '[' + (message.role === 'user' ? profileName(user, {}) : friendName) + '] ' + text
    }).filter(Boolean).slice(-30)
    var conversation = recent.join('\n')
    if (conversation.length > 12000) conversation = conversation.slice(conversation.length - 12000)
    return {
      user: user,
      character: character,
      friendName: friendName,
      userProfile: {
        id: user.id,
        name: user.name || '',
        nickname: user.nick || '',
        gender: user.gender || '',
        personality: user.description || '',
        appearance: user.appearance || '',
        relationshipNotes: relationDescription(user, characterId)
      },
      characterProfile: {
        id: character.id,
        name: character.name || '',
        nickname: friendName,
        persona: character.description || '',
        appearance: character.appearance || '',
        speakingStyle: character.speakingStyle || '',
        relationship: relationDescription(character, userId),
        worldbook: await collectDoorWorldbook(character, user)
      },
      conversation: conversation || '无'
    }
  }

  function summarizeMessage(content) {
    var text = String(content || '').trim()
    if (!text || /^\[(?:系统|通知)/.test(text)) return ''
    if (text.indexOf('__IMG__') === 0) return '[图片]'
    if (text.indexOf('__LINK__') === 0) return '[链接]'
    if (text.indexOf('__TBDEAL__') === 0) return '[订单卡片]'
    if (/撤回了一条消息/.test(text)) return ''
    return text.replace(/\s+/g, ' ').slice(0, 800)
  }

  async function collectDoorWorldbook(character, user) {
    var row = await db.config.get('lorebooks')
    var books = Array.isArray(row && row.value) ? row.value : []
    var values = []
    books.forEach(function(book) {
      if (book.enabled === false || book.scope !== 'personal') return
      if (!(book.charIds || []).map(Number).includes(Number(character.id))) return
      ;(book.entries || []).forEach(function(entry) {
        if (entry.enabled === false || !entry.content) return
        values.push(String(entry.content)
          .replace(/{{user}}/gi, user.name || 'USER')
          .replace(/{{char}}/gi, character.name || '角色'))
      })
    })
    return values.join('\n\n')
  }

  function buildUserPrompt(module, context, topic, extraRequest) {
    function value(input) { return input == null || input === '' ? '无' : input }
    return [
      '请根据以下资料生成任意门 HTML。',
      '',
      '【本次主题】',
      value(topic),
      '',
      '【补充要求】',
      value(extraRequest),
      '',
      '【USER 资料】',
      JSON.stringify(context.userProfile, null, 2),
      '',
      '【好友角色资料】',
      JSON.stringify(context.characterProfile, null, 2),
      '',
      '【近期对话】',
      value(context.conversation),
      '',
      '【当前模块名称】',
      value(module.name),
      '',
      '【当前模块专属要求】',
      value(module.prompt),
      '',
      '【当前模块的 HTML 生成模板】',
      module.htmlTemplate,
      '',
      '请直接返回完整 HTML，不要返回解释或 Markdown 代码围栏。'
    ].join('\n')
  }

  window.showAnyDoorPage = async function() {
    var existing = document.getElementById('anywhere-door-page')
    if (existing) return
    var page = createPage('anywhere-door-page', '任意门', '<button class="btn-icon" id="door-new" title="新建模块"><i class="fa fa-plus"></i></button>')
    window.openPage(page)
    page.querySelector('#door-new').addEventListener('click', function() { openDoorEditor(page, null) })
    await renderDoorLibrary(page)
  }

  async function renderDoorLibrary(page) {
    var scroll = page.querySelector('.door-scroll')
    var modules = await db.doorModules.orderBy('updatedAt').reverse().toArray()
    var results = await db.doorResults.orderBy('createdAt').reverse().limit(20).toArray()
    var modulesHtml = modules.length ? '<div class="door-module-list">' + modules.map(function(module) {
      return '<article class="door-module-card' + (module.enabled ? '' : ' is-disabled') + '" data-id="' + attr(module.id) + '">' +
        '<div class="door-card-top"><div class="door-module-icon"><i class="fa-solid fa-code"></i></div><div class="door-card-copy"><div class="door-card-name">' + esc(module.name) + '</div><div class="door-card-meta">' + esc(formatDate(module.updatedAt)) + '</div></div><span class="door-status ' + (module.enabled ? 'enabled' : '') + '">' + (module.enabled ? '已启用' : '已停用') + '</span></div>' +
        '<div class="door-card-desc">' + esc(module.description || '暂无说明') + '</div>' +
        '<div class="door-card-actions"><button data-action="preview">预览</button><button data-action="copy">复制</button><button data-action="toggle">' + (module.enabled ? '停用' : '启用') + '</button><button data-action="edit">编辑</button><button class="door-delete" data-action="delete">删除</button></div></article>'
    }).join('') + '</div>' : '<div class="door-empty"><i class="fa-solid fa-cubes"></i><h2>还没有 HTML 模块</h2><p>先创建一个完整 HTML 模板，再进入任意门运行。</p><button class="door-primary" id="door-empty-new">新建第一个模块</button></div>'
    var historyHtml = results.length ? '<div class="door-section-title">运行历史</div><div class="door-history-list">' + results.map(function(result) {
      return '<div class="door-history-card" data-result-id="' + attr(result.id) + '"><button class="door-history-card" data-action="open"><span class="door-history-icon"><i class="fa-solid fa-clock-rotate-left"></i></span><span class="door-history-copy"><span class="door-history-title">' + esc(result.title || result.moduleName || '任意门结果') + '</span><span class="door-history-meta">' + esc((result.userName || 'USER') + ' & ' + (result.characterName || '好友') + ' · ' + formatDate(result.createdAt)) + '</span></span></button><button class="door-history-delete" data-action="delete-result" title="删除"><i class="fa fa-trash"></i></button></div>'
    }).join('') + '</div>' : ''
    scroll.innerHTML =
      '<button class="door-entry-card" id="door-enter" type="button">' +
        '<span class="door-module-icon"><i class="fa-solid fa-arrow-right-to-bracket"></i></span>' +
        '<span class="door-card-copy"><span class="door-card-name">进入任意门</span><span class="door-card-meta">进入虚拟时空</span></span>' +
        '<i class="fa fa-angle-right door-entry-arrow"></i>' +
      '</button>' +
      modulesHtml + historyHtml
    scroll.querySelector('#door-enter').addEventListener('click', function() { openDoorRunner() })
    var emptyNew = scroll.querySelector('#door-empty-new')
    if (emptyNew) emptyNew.addEventListener('click', function() { openDoorEditor(page, null) })
    scroll.querySelectorAll('.door-module-card').forEach(function(card) {
      card.addEventListener('click', async function(event) {
        var button = event.target.closest('button[data-action]')
        if (!button) return
        var module = await db.doorModules.get(card.dataset.id)
        if (!module) return
        var action = button.dataset.action
        if (action === 'edit') openDoorEditor(page, module)
        if (action === 'preview') openDoorPreview(module.htmlTemplate, module.name + ' · 静态预览')
        if (action === 'copy') {
          var copy = Object.assign({}, module, { id: makeId('door-module-'), name: module.name + ' 副本', createdAt: Date.now(), updatedAt: Date.now() })
          await db.doorModules.add(copy)
          await renderDoorLibrary(page)
          window.toast('模块已复制')
        }
        if (action === 'toggle') {
          await db.doorModules.update(module.id, { enabled: !module.enabled, updatedAt: Date.now() })
          await renderDoorLibrary(page)
        }
        if (action === 'delete' && window.confirm('删除这个 HTML 模块？历史运行结果会保留。')) {
          await db.doorModules.delete(module.id)
          await renderDoorLibrary(page)
        }
      })
    })
    scroll.querySelectorAll('[data-result-id]').forEach(function(row) {
      row.addEventListener('click', async function(event) {
        var action = event.target.closest('[data-action]')
        if (!action) return
        var result = await db.doorResults.get(row.dataset.resultId)
        if (!result) return
        if (action.dataset.action === 'open') openDoorResult(result)
        if (action.dataset.action === 'delete-result' && window.confirm('删除这条运行结果？')) {
          await db.doorResults.delete(result.id)
          await renderDoorLibrary(page)
        }
      })
    })
  }

  function openDoorEditor(libraryPage, module) {
    var isNew = !module
    var value = module || { name: '', description: '', prompt: '', htmlTemplate: '', enabled: true }
    var page = createPage('door-module-editor', isNew ? '新建 HTML 模块' : '编辑 HTML 模块')
    page.querySelector('.door-scroll').innerHTML =
      '<form class="door-form"><div class="door-field"><label>模块名称</label><input id="door-name" maxlength="80" value="' + attr(value.name) + '" placeholder="例如：角色来信"></div>' +
      '<div class="door-field"><label>模块说明</label><textarea id="door-description" placeholder="说明这个模块会生成什么">' + esc(value.description) + '</textarea></div>' +
      '<div class="door-field"><label>模块专属提示词</label><textarea id="door-prompt" placeholder="填写内容、风格和结构要求">' + esc(value.prompt) + '</textarea></div>' +
      '<div class="door-field"><label>HTML 生成模板</label><textarea class="door-html-editor" id="door-html" spellcheck="false" placeholder="支持完整 HTML 文档，也支持 <div>、<details> 等 HTML 片段">' + esc(value.htmlTemplate) + '</textarea></div>' +
      '<label class="door-switch-row"><span>启用模块</span><input id="door-enabled" type="checkbox"' + (value.enabled !== false ? ' checked' : '') + '></label>' +
      '<div class="door-form-actions"><button class="door-secondary" id="door-static-preview" type="button">静态预览</button><button class="door-primary" type="submit">保存模块</button></div></form>'
    window.openPage(page)
    page.querySelector('#door-static-preview').addEventListener('click', function() {
      try {
        var html = validateHtmlInput(page.querySelector('#door-html').value, true)
        openDoorPreview(html, (page.querySelector('#door-name').value || '模块') + ' · 静态预览')
      } catch (error) {
        window.toast(error.message)
      }
    })
    page.querySelector('form').addEventListener('submit', async function(event) {
      event.preventDefault()
      try {
        var name = page.querySelector('#door-name').value.trim()
        if (!name) throw new Error('请填写模块名称')
        var html = validateHtmlInput(page.querySelector('#door-html').value, true)
        var now = Date.now()
        var record = {
          id: value.id || makeId('door-module-'),
          name: name,
          description: page.querySelector('#door-description').value.trim(),
          prompt: page.querySelector('#door-prompt').value.trim(),
          htmlTemplate: html,
          enabled: page.querySelector('#door-enabled').checked,
          createdAt: value.createdAt || now,
          updatedAt: now
        }
        await db.doorModules.put(record)
        window.closePage('door-module-editor')
        await renderDoorLibrary(libraryPage)
        window.toast('HTML 模块已保存')
      } catch (error) {
        window.toast(error.message)
      }
    })
  }

  function openDoorPreview(html, title) {
    var old = document.getElementById('door-preview-page')
    if (old) old.remove()
    var page = createPage('door-preview-page', title || '静态预览')
    page.classList.add('door-preview-page')
    window.openPage(page)
    mountDoorFrame(page.querySelector('.door-scroll'), html, title)
  }

  async function openDoorRunner() {
    var old = document.getElementById('door-runner-page')
    if (old) return
    var page = createPage('door-runner-page', '虚拟时空01号机')
    page._door = { userId: '', characterId: '', moduleId: '', result: null, running: false }
    window.openPage(page)
    await renderDoorRunner(page)
  }

  async function renderDoorRunner(page) {
    var state = page._door
    var users = await getUsers()
    var friends = state.userId ? await getFriends(state.userId) : []
    var modules = (await db.doorModules.toArray()).filter(function(module) {
      return module.enabled !== false
    }).sort(function(a, b) { return b.updatedAt - a.updatedAt })
    var user = users.find(function(item) { return String(item.id) === String(state.userId) })
    var friend = friends.find(function(item) { return String(item.id) === String(state.characterId) })
    if (state.characterId && !friend) state.characterId = ''
    if (state.moduleId && !modules.some(function(item) { return item.id === state.moduleId })) state.moduleId = ''
    var scroll = page.querySelector('.door-scroll')
    scroll.innerHTML =
      '<div class="door-identity"><select class="door-select" id="door-user-select"><option value="">选择 USER</option>' + users.map(function(item) { return '<option value="' + item.id + '"' + (String(item.id) === String(state.userId) ? ' selected' : '') + '>' + esc(item.name || '未命名 USER') + '</option>' }).join('') + '</select><span class="door-identity-amp">&amp;</span><select class="door-select" id="door-friend-select"' + (!state.userId ? ' disabled' : '') + '><option value="">' + (!state.userId ? '暂无好友' : friends.length ? '选择好友' : '该账号暂无好友') + '</option>' + friends.map(function(item) { return '<option value="' + item.id + '"' + (String(item.id) === String(state.characterId) ? ' selected' : '') + '>' + esc(profileName(item, {})) + '</option>' }).join('') + '</select></div>' +
      '<div class="door-pair-title">' + esc((user ? user.name : 'USER') + ' & ' + (friend ? profileName(friend, {}) : '好友')) + '</div>' +
      '<section class="door-panel"><div class="door-section-title" style="margin-top:0">HTML 模块</div>' +
      (modules.length ? '<div class="door-module-choices">' + modules.map(function(module) { return '<button class="door-module-choice' + (module.id === state.moduleId ? ' active' : '') + '" data-module-id="' + attr(module.id) + '" type="button"><strong>' + esc(module.name) + '</strong><span>' + esc(module.description || '暂无说明') + '</span></button>' }).join('') + '</div>' : '<div class="door-empty" style="min-height:150px"><h2>还没有 HTML 模块</h2><p>创建并启用模块后才能运行。</p><button class="door-secondary" id="door-go-create" type="button">去创建模块</button></div>') +
      '<div class="door-field" style="margin-top:14px"><label>本次主题（可选）</label><input id="door-topic" value="' + attr(state.topic || '') + '" placeholder="例如：雨夜之后的来信"></div>' +
      '<div class="door-field" style="margin-top:12px"><label>补充要求（可选）</label><textarea id="door-extra" placeholder="例如：安静、克制、深蓝色">' + esc(state.extraRequest || '') + '</textarea></div>' +
      '<button class="door-primary door-run-button" id="door-run" type="button"' + ((!state.userId || !state.characterId || !state.moduleId || state.running) ? ' disabled' : '') + '>' + (state.running ? '<i class="fa fa-spinner fa-spin"></i> 正在运行 HTML 模块…' : '运行模块') + '</button></section>' +
      '<section class="door-panel" id="door-result-panel">' + renderDoorResultPanel(state.result, state.running) + '</section>'
    bindDoorRunner(page)
    if (state.result && !state.running) {
      var host = scroll.querySelector('#door-result-frame')
      if (host) mountDoorFrame(host, state.result.html, state.result.title)
    }
  }

  function bindDoorRunner(page) {
    var state = page._door
    var userSelect = page.querySelector('#door-user-select')
    var friendSelect = page.querySelector('#door-friend-select')
    userSelect.addEventListener('change', async function() {
      state.userId = userSelect.value
      state.characterId = ''
      state.result = null
      await renderDoorRunner(page)
    })
    friendSelect.addEventListener('change', async function() {
      state.characterId = friendSelect.value
      await renderDoorRunner(page)
    })
    page.querySelectorAll('[data-module-id]').forEach(function(button) {
      button.addEventListener('click', async function() {
        state.moduleId = button.dataset.moduleId
        await renderDoorRunner(page)
      })
    })
    var create = page.querySelector('#door-go-create')
    if (create) create.addEventListener('click', function() {
      var library = document.getElementById('anywhere-door-page')
      if (library) openDoorEditor(library, null)
    })
    var topic = page.querySelector('#door-topic')
    var extra = page.querySelector('#door-extra')
    topic.addEventListener('input', function() { state.topic = topic.value })
    extra.addEventListener('input', function() { state.extraRequest = extra.value })
    var run = page.querySelector('#door-run')
    run.addEventListener('click', function() { runDoorModule(page) })
    bindResultActions(page, state.result)
  }

  function renderDoorResultPanel(result, running) {
    if (running) return '<div class="door-loading"><div><i class="fa fa-spinner fa-spin"></i><p>正在运行 HTML 模块…</p></div><button class="door-secondary" id="door-cancel" type="button">取消</button></div>'
    if (!result) return '<div class="door-empty" style="min-height:180px"><i class="fa-solid fa-door-open"></i><h2>任意门还没有运行内容</h2><p>请先选择 USER、对应好友和 HTML 模块。</p></div>'
    return '<div class="door-result-head"><div><div class="door-result-name">' + esc(result.title || result.moduleName) + '</div><div class="door-card-meta">' + esc(result.userName + ' & ' + result.characterName) + '</div></div></div><div id="door-result-frame"></div><div class="door-result-actions"><button class="door-secondary" data-result-action="rerun">重新运行</button><button class="door-secondary" data-result-action="fullscreen">全屏查看</button><button class="door-danger" data-result-action="delete">删除结果</button></div>'
  }

  function bindResultActions(page, result) {
    var cancel = page.querySelector('#door-cancel')
    if (cancel) cancel.addEventListener('click', function() {
      if (currentDoorRequest) currentDoorRequest.cancelled = true
      page._door.running = false
      renderDoorRunner(page)
    })
    if (!result) return
    page.querySelectorAll('[data-result-action]').forEach(function(button) {
      button.addEventListener('click', async function() {
        var action = button.dataset.resultAction
        if (action === 'rerun') runDoorModule(page)
        if (action === 'fullscreen') openDoorFullscreen(result)
        if (action === 'delete' && window.confirm('删除这条运行结果？')) {
          await db.doorResults.delete(result.id)
          page._door.result = null
          await renderDoorRunner(page)
          var library = document.getElementById('anywhere-door-page')
          if (library) renderDoorLibrary(library)
        }
      })
    })
  }

  async function runDoorModule(page) {
    var state = page._door
    if (state.running) return
    var previous = state.result
    var request = { cancelled: false }
    currentDoorRequest = request
    state.running = true
    await renderDoorRunner(page)
    try {
      var module = await db.doorModules.get(state.moduleId)
      if (!module || !module.enabled) throw new Error('HTML 模块不存在或已停用')
      validateHtmlInput(module.htmlTemplate, true)
      var context = await collectDoorContext(state.userId, state.characterId)
      var prompt = buildUserPrompt(module, context, state.topic, state.extraRequest)
      var raw = await window.callAI([{ role: 'user', content: prompt }], { system: DOOR_SYSTEM_PROMPT, temperature: await window.getAITemperaturePreset('anywhereDoorHtml') })
      if (request.cancelled) return
      var html = extractGeneratedHtml(raw)
      var now = Date.now()
      var result = {
        id: makeId('door-result-'),
        userId: Number(state.userId),
        characterId: Number(state.characterId),
        moduleId: module.id,
        moduleName: module.name,
        userName: context.user.name || 'USER',
        characterName: context.friendName,
        topic: state.topic || '',
        extraRequest: state.extraRequest || '',
        title: state.topic || module.name,
        html: html,
        promptVersion: 1,
        createdAt: now,
        updatedAt: now
      }
      await db.doorResults.add(result)
      state.result = result
      window.toast('任意门运行完成')
      var library = document.getElementById('anywhere-door-page')
      if (library) renderDoorLibrary(library)
    } catch (error) {
      if (!request.cancelled) {
        state.result = previous
        window.toast(error.message === 'API未配置' ? '请先在设置里配置 API' : '运行失败：' + error.message)
      }
    } finally {
      if (currentDoorRequest === request) currentDoorRequest = null
      state.running = false
      if (document.body.contains(page)) await renderDoorRunner(page)
    }
  }

  function openDoorResult(result) {
    var old = document.getElementById('door-history-result-page')
    if (old) old.remove()
    var page = createPage('door-history-result-page', result.title || result.moduleName || '运行结果')
    page.querySelector('.door-scroll').innerHTML = '<div class="door-pair-title">' + esc(result.userName + ' & ' + result.characterName) + '</div><section class="door-panel"><div id="door-history-frame"></div><div class="door-result-actions"><button class="door-secondary" id="door-history-fullscreen">全屏查看</button><button class="door-danger" id="door-history-delete">删除结果</button></div></section>'
    window.openPage(page)
    mountDoorFrame(page.querySelector('#door-history-frame'), result.html, result.title)
    page.querySelector('#door-history-fullscreen').addEventListener('click', function() { openDoorFullscreen(result) })
    page.querySelector('#door-history-delete').addEventListener('click', async function() {
      if (!window.confirm('删除这条运行结果？')) return
      await db.doorResults.delete(result.id)
      window.closePage(page.id)
      var library = document.getElementById('anywhere-door-page')
      if (library) renderDoorLibrary(library)
    })
  }

  function openDoorFullscreen(result) {
    var overlay = document.createElement('div')
    overlay.className = 'door-fullscreen'
    overlay.innerHTML = '<div class="door-fullscreen-bar"><strong>' + esc(result.title || result.moduleName) + '</strong><button type="button" aria-label="关闭"><i class="fa fa-xmark"></i></button></div><div id="door-fullscreen-frame" style="flex:1;min-height:0"></div>'
    document.body.appendChild(overlay)
    mountDoorFrame(overlay.querySelector('#door-fullscreen-frame'), result.html, result.title)
    overlay.querySelector('button').addEventListener('click', function() { overlay.remove() })
  }
})()
