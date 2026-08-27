// character.js — 角色档案管理
// 依赖：db.js 必须先加载
// ===== 页面入口 =====
window.showCharacterPage = function() {
  const page = buildCharListPage()
  window.openPage(page)
}

// ===== 构建角色列表页 =====
function buildCharListPage() {
  const page = document.createElement('div')
  page.id = 'character-page'
  page.className = 'full-page'
  page.innerHTML = `
    <div class="page-header">
      <button class="header-back" onclick="window.closePage('character-page')">
        <i class="fa fa-angle-left"></i>
      </button>
      <span class="header-title">角色档案</span>
      <div style="display:flex;gap:8px">
        <button class="btn-icon" id="btn-ai-npc" title="AI生成NPC">
          <i class="fa fa-magic"></i>
        </button>
        <button class="btn-icon" id="btn-import-chars" title="导入角色">
          <i class="fa fa-upload"></i>
        </button>
        <button class="btn-icon" id="btn-new-char" title="新建角色">
          <i class="fa fa-plus"></i>
        </button>
      </div>
    </div>
    <!-- 类型筛选Tab -->
    <div class="char-filter-tabs">
      <button class="filter-tab active" data-filter="all">全部</button>
      <button class="filter-tab" data-filter="char">CHAR</button>
      <button class="filter-tab" data-filter="npc">NPC</button>
      <button class="filter-tab" data-filter="user">USER</button>
    </div>
    <!-- 分组筛选行 -->
    <div class="char-group-row" id="char-group-row" style="display:none">
      <button class="group-chip active" data-group="">全部分组</button>
    </div>
    <!-- 角色列表 -->
    <div class="char-list" id="char-list"></div>
    <input type="file" id="char-import-input" accept=".json,application/json" style="display:none">
  `
  bindCharListEvents(page)
  loadCharacterList(page, 'all', '')
  return page
}

// ===== 加载并渲染角色列表 =====
async function loadCharacterList(page, filter, group) {
  const list = page.querySelector('#char-list')
  if (!list) return
  const token = (page._charListLoadToken || 0) + 1
  page._charListLoadToken = token
  page.dataset.charFilter = filter || 'all'
  page.dataset.charGroup = group || ''

  if (page._charListState) {
    renderCharacterListFromState(page, page._charListState.chars, filter, group)
  } else {
    list.innerHTML = '<div class="list-loading"><i class="fa fa-spinner fa-spin"></i></div>'
  }

  let chars = await db.characters.toArray()
  if (page._charListLoadToken !== token) return
  page._charListState = { chars }
  renderCharacterListFromState(page, chars, filter, group)
}

function renderCharacterListFromState(page, allChars, filter, group) {
  const list = page.querySelector('#char-list')
  if (!list) return
  let chars = allChars || []
  if (filter !== 'all') chars = chars.filter(c => c.type === filter)

  renderGroupRow(page, chars, group, filter)
  if (group) chars = chars.filter(c => c.group === group)

  if (!chars.length) {
    list.innerHTML = '<div class="list-empty">暂无角色，点击右上角+新建</div>'
    return
  }
  renderCharCards(list, chars, page)
}

// ===== 渲染分组筛选行 =====
function renderGroupRow(page, chars, group, filter) {
  const allGroups = [...new Set(chars.map(c => c.group).filter(Boolean))]
  const groupRow = page.querySelector('#char-group-row')
  if (!allGroups.length) { groupRow.style.display = 'none'; return }

  groupRow.style.display = 'flex'
  groupRow.innerHTML = ['', ...allGroups].map(g =>
    `<button class="group-chip${g === (group || '') ? ' active' : ''}" data-group="${g}">${g || '全部分组'}</button>`
  ).join('')

  groupRow.querySelectorAll('.group-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      page.querySelectorAll('.group-chip').forEach(c => c.classList.remove('active'))
      chip.classList.add('active')
      const activeType = page.querySelector('.filter-tab.active')
      loadCharacterList(page, activeType?.dataset.filter || 'all', chip.dataset.group)
    })
  })
}

// ===== 渲染角色卡片列表 =====
function renderCharCards(list, chars, page) {
  const typeLabel = { char: 'CHAR', npc: 'NPC', user: 'USER' }
  list.innerHTML = chars.map(c => `
    <div class="char-card" data-id="${c.id}">
      <div class="char-avatar">
        ${c.avatar
          ? `<img src="${c.avatar}" alt="${c.name}">`
          : `<div class="avatar-placeholder">${(c.name || '?')[0]}</div>`}
      </div>
      <div class="char-info">
        <div class="char-name">${c.name}${c.nick ? ` <span class="char-nick">${c.nick}</span>` : ''}</div>
        <div class="char-meta">
          ${c.gender ? `<span class="char-meta-item">${c.gender}</span>` : ''}
          ${c.role ? `<span class="char-meta-item">${c.role}</span>` : ''}
          ${c.group ? `<span class="char-meta-item char-meta-group">${c.group}</span>` : ''}
        </div>
        <div class="char-desc">${c.description ? c.description.slice(0, 40) + '...' : '暂无描述'}</div>
      </div>
      <span class="char-type-tag tag-${c.type}">${typeLabel[c.type] || c.type}</span>
    </div>
  `).join('')

  bindCharCardEvents(list, page)
}

// ===== 绑定卡片点击和长按事件 =====
function bindCharCardEvents(list, page) {
  list.querySelectorAll('.char-card').forEach(card => {
    card.addEventListener('click', () => openCharacterEdit(page, parseInt(card.dataset.id)))
    let pressTimer
    card.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => confirmDeleteChar(parseInt(card.dataset.id), page), 700)
    })
    card.addEventListener('touchend', () => clearTimeout(pressTimer))
  })
}

// ===== 列表页事件绑定 =====
function bindCharListEvents(page) {
  // 筛选Tab切换
  page.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      loadCharacterList(page, tab.dataset.filter, '')
    })
  })
  // 新建按钮
  page.querySelector('#btn-new-char').addEventListener('click', () => openCharacterEdit(page, null))
  // AI生成NPC
  page.querySelector('#btn-ai-npc').addEventListener('click', () => showNPCGenerateModal(page))
  // 导入角色
  page.querySelector('#btn-import-chars').addEventListener('click', () => page.querySelector('#char-import-input').click())
  page.querySelector('#char-import-input').addEventListener('change', e => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    importCharacters(file, page)
  })
}

// ===== 打开角色编辑页 =====
async function openCharacterEdit(listPage, charId) {
  const char = charId ? await db.characters.get(charId) : null
  const editPage = buildCharEditPage(char)
  window.openPage(editPage)
  // 关闭编辑页时刷新列表
  editPage.querySelector('.header-back').addEventListener('click', () => {
    window.closePage('char-edit-page')
    const activeFilter = listPage.querySelector('.filter-tab.active')
    loadCharacterList(listPage, activeFilter ? activeFilter.dataset.filter : 'all', '')
  })
}

// ===== 构建角色编辑页 =====
function buildCharEditPage(char) {
  const isNew = !char
  const c = char || { type: 'char', identity: {}, relations: [] }
  const page = document.createElement('div')
  page.id = 'char-edit-page'
  page.className = 'full-page'
  page.innerHTML = buildEditPageHTML(c, isNew)
  bindCharEditEvents(page, char)
  if (c.relations?.length) renderRelationsList(page, c.relations, c)
  return page
}

// ===== 编辑页HTML模板 =====
function buildEditPageHTML(c, isNew) {
  return `
    <div class="page-header">
      <button class="header-back"><i class="fa fa-angle-left"></i></button>
      <span class="header-title">${isNew ? '新建角色' : '编辑角色'}</span>
      <button class="btn-icon" id="btn-save-char" title="保存">
        <i class="fa-solid fa-floppy-disk"></i>
      </button>
    </div>
    <div class="char-edit-scroll">
      ${buildBasicSection(c)}
      ${buildAccountSection(c)}
      ${buildIdentitySection(c)}
      ${buildRelationsSection()}
      ${!isNew ? buildDeleteSection() : ''}
    </div>
  `
}

// ===== 基础信息区块 =====
function buildBasicSection(c) {
  const genderTabs = ['未知','男','女','其他'].map(g => {
    const active = (c.gender === g) || (!c.gender && g === '未知')
    return `<button class="gender-tab${active ? ' active' : ''}" data-gender="${g}">${g}</button>`
  }).join('')

  return `
    <div class="edit-section">
      <div class="section-label">基础信息</div>
      <div class="avatar-upload-wrap">
        <div class="avatar-upload" id="avatar-preview">
          ${c.avatar
            ? `<img src="${c.avatar}" id="avatar-img">`
            : `<i class="fa fa-camera"></i><span>上传头像</span>`}
        </div>
      </div>
      <div class="char-type-tabs">
        <button class="type-tab ${c.type==='char'?'active':''}" data-type="char">CHAR</button>
        <button class="type-tab ${c.type==='npc'?'active':''}" data-type="npc">NPC</button>
        <button class="type-tab ${c.type==='user'?'active':''}" data-type="user">USER</button>
      </div>
      <input class="input-field" id="edit-name" placeholder="姓名（必填）" value="${c.name || ''}">
      <input class="input-field" id="edit-nick" placeholder="昵称" value="${c.nick || ''}">
      <div class="gender-row">
        <span class="field-label">性别</span>
        <div class="gender-tabs">${genderTabs}</div>
      </div>
      <input class="input-field" id="edit-role" placeholder="社会身份/职业（如：大学生、律师、全职主妇）" value="${c.role || ''}">
      <div class="group-input-wrap">
        <input class="input-field" id="edit-group" placeholder="分组（如：家人、同学、职场）" value="${c.group || ''}">
        <div class="group-suggestions" id="group-suggestions"></div>
      </div>
      <div class="desc-import-row">
        <span class="field-label desc-field-label">人物设定</span>
        <button class="btn-ghost btn-sm" id="btn-import-desc-file" type="button">
          <i class="fa-solid fa-upload"></i> 导入doc/txt
        </button>
      </div>
      <textarea class="input-field" id="edit-desc" placeholder="描述角色性格、背景、说话方式...">${c.description || ''}</textarea>
      <input type="file" id="desc-import-input" accept=".doc,.docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" style="display:none">
    </div>
  `
}

// ===== 微信账号区块 =====
function buildAccountSection(c) {
  return `
    <div class="edit-section" id="section-wechat-account">
      <span class="section-label">微信账号</span>
      <div class="section-content" style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
        <input class="input-field" id="edit-account" placeholder="微信号" value="${c.identity?.account || ''}">
        <div class="field-error" id="err-account" style="display:none;font-size:11px;color:var(--c-danger,#e53935);margin-top:-6px">微信号只能包含英文字母、数字和英文字符</div>
        <input class="input-field" id="edit-password" type="password" placeholder="设置6-20位登录密码" value="${c.identity?.password || ''}">
        <div class="field-error" id="err-password" style="display:none;font-size:11px;color:var(--c-danger,#e53935);margin-top:-6px">密码长度需为6-20位</div>
        <div style="font-size:11px;color:var(--c-hint)">* 微信号用于登录微信，请记住密码${c.type === 'user' ? '（用户类型才可登录微信）' : ''}</div>
      </div>
    </div>
  `
}

// ===== 其他身份信息区块（可折叠） =====
function buildIdentitySection(c) {
  return `
    <div class="edit-section collapsible" id="section-identity">
      <div class="section-header-row" onclick="toggleSection('section-identity')">
        <span class="section-label">其他信息</span>
        <i class="fa fa-angle-down section-arrow"></i>
      </div>
      <div class="section-content">
        <div class="input-with-btn">
          <input class="input-field" id="edit-phone" placeholder="手机号（11位数字）" maxlength="11" inputmode="numeric" value="${c.identity?.phone || ''}">
          <button class="btn-ghost btn-sm" id="btn-gen-phone">随机</button>
        </div>
        <input class="input-field" id="edit-id-card" placeholder="身份证号" value="${c.identity?.idCard || ''}">
        <div class="input-with-btn">
          <input class="input-field" id="edit-bank-card" placeholder="银行卡号（12位数字）" maxlength="14" inputmode="numeric" value="${c.identity?.bankCard ? formatBankCard(c.identity.bankCard) : ''}">
          <button class="btn-ghost btn-sm" id="btn-gen-bank-card">随机</button>
        </div>
        <input class="input-field" id="edit-bank-pass" placeholder="银行卡密码（6位数字）" type="password" maxlength="6" inputmode="numeric" value="${c.identity?.bankPass || ''}">
      </div>
    </div>
  `
}

// ===== 关系管理区块 =====
function buildRelationsSection() {
  return `
    <div class="edit-section collapsible" id="section-relations">
      <div class="section-header-row" onclick="toggleSection('section-relations')">
        <span class="section-label">关系管理</span>
        <i class="fa fa-angle-down section-arrow"></i>
      </div>
      <div class="section-content">
        <div class="relations-list" id="relations-list"></div>
        <button class="btn-ghost btn-full" id="btn-add-relation">
          <i class="fa fa-plus"></i> 添加关系
        </button>
      </div>
    </div>
  `
}

// ===== 删除按钮区块 =====
function buildDeleteSection() {
  return `
    <div class="edit-section">
      <button class="btn-danger btn-pill btn-full" id="btn-delete-char">
        <i class="fa fa-trash"></i> 删除此角色
      </button>
    </div>
  `
}

// ===== 编辑页事件绑定 =====
function bindCharEditEvents(page, originalChar) {
  // 头像上传
  page.querySelector('#avatar-preview').addEventListener('click', () => {
    window.showImagePicker((result) => {
      page.querySelector('#avatar-preview').innerHTML = `<img src="${result}" id="avatar-img">`
    })
  })

  // 类型Tab切换
  page.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
    })
  })

  // 性别Tab切换
  page.querySelectorAll('.gender-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.gender-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
    })
  })

  bindGroupSuggestions(page)
  bindEditButtons(page, originalChar)
}

// ===== 分组建议加载 =====
function bindGroupSuggestions(page) {
  db.characters.toArray().then(all => {
    const groups = [...new Set(all.map(c => c.group).filter(Boolean))]
    const suggestEl = page.querySelector('#group-suggestions')
    if (!groups.length || !suggestEl) return
    suggestEl.innerHTML = groups.map(g =>
      `<button class="group-suggest-chip" data-group="${g}">${g}</button>`
    ).join('')
    suggestEl.querySelectorAll('.group-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        page.querySelector('#edit-group').value = chip.dataset.group
      })
    })
  })
}

// ===== 微信号与密码实时验证 =====
function bindAccountValidation(page) {
  const accountInput = page.querySelector('#edit-account')
  const errAccount = page.querySelector('#err-account')
  const pwdInput = page.querySelector('#edit-password')
  const errPwd = page.querySelector('#err-password')

  // 微信号：仅允许英文字母、数字和英文字符
  if (accountInput && errAccount) {
    accountInput.addEventListener('input', () => {
      const val = accountInput.value
      if (val && !/^[a-zA-Z0-9_\-\.!@#$%^&*()]+$/.test(val)) {
        errAccount.style.display = ''
      } else {
        errAccount.style.display = 'none'
      }
    })
  }

  // 密码：6-20位（非空时校验）
  if (pwdInput && errPwd) {
    pwdInput.addEventListener('input', () => {
      const val = pwdInput.value
      if (val && (val.length < 6 || val.length > 20)) {
        errPwd.style.display = ''
      } else {
        errPwd.style.display = 'none'
      }
    })
  }
}

// ===== 编辑页按钮绑定 =====
function bindEditButtons(page, originalChar) {
  // 随机手机号
  page.querySelector('#btn-gen-phone').addEventListener('click', () => {
    page.querySelector('#edit-phone').value = genPhone()
  })

  // 手机号只允许数字
  page.querySelector('#edit-phone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11)
  })

  // 随机银行卡号
  page.querySelector('#btn-gen-bank-card').addEventListener('click', () => {
    page.querySelector('#edit-bank-card').value = formatBankCard(genBankCard())
  })

  // 银行卡号输入格式化（4位一组）
  page.querySelector('#edit-bank-card').addEventListener('input', (e) => {
    const pos = e.target.selectionStart
    const oldVal = e.target.value
    const newVal = formatBankCard(oldVal)
    e.target.value = newVal
    const diff = newVal.length - oldVal.length
    e.target.setSelectionRange(pos + diff, pos + diff)
  })

  // 银行卡密码只允许数字
  page.querySelector('#edit-bank-pass').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
  })

  // 微信号实时验证
  bindAccountValidation(page)

  const descImportBtn = page.querySelector('#btn-import-desc-file')
  const descImportInput = page.querySelector('#desc-import-input')
  if (descImportBtn && descImportInput) {
    descImportBtn.addEventListener('click', () => descImportInput.click())
    descImportInput.addEventListener('change', async e => {
      const file = e.target.files[0]
      e.target.value = ''
      if (!file) return
      await importDescriptionFromFile(file, page)
    })
  }

  // 保存
  page.querySelector('#btn-save-char').addEventListener('click', () => saveCharacter(page, originalChar))

  // 删除
  const btnDel = page.querySelector('#btn-delete-char')
  if (btnDel) btnDel.addEventListener('click', () => confirmDeleteChar(originalChar.id, null, page))

  // 添加关系
  page.querySelector('#btn-add-relation').addEventListener('click', () => showAddRelationModal(page, originalChar))
}

async function importDescriptionFromFile(file, page) {
  const descInput = page.querySelector('#edit-desc')
  if (!descInput) return

  try {
    const text = await readCharacterDescriptionFile(file)
    const clean = normalizeImportedDescription(text)
    if (!clean) {
      window.toast('文件中没有识别到文字内容')
      return
    }
    descInput.value = clean
    descInput.dispatchEvent(new Event('input', { bubbles: true }))
    window.toast('角色性格描述已导入')
  } catch (e) {
    window.toast('导入失败：' + (e.message || '无法读取文件'))
  }
}

async function readCharacterDescriptionFile(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.docx')) return readDocxText(file)
  if (name.endsWith('.txt')) return file.text()
  if (name.endsWith('.doc')) return readLegacyDocText(file)
  throw new Error('仅支持 doc、docx、txt 文件')
}

async function readDocxText(file) {
  if (!window.JSZip) throw new Error('DOCX解析组件未加载')
  const zip = await window.JSZip.loadAsync(file)
  const targets = Object.keys(zip.files).filter(name => {
    if (!/^word\/.+\.xml$/i.test(name)) return false
    return /^word\/(document|footnotes|endnotes|comments|header\d+|footer\d+)\.xml$/i.test(name)
  })
  const ordered = targets.sort((a, b) => {
    const rank = name => name === 'word/document.xml' ? 0 : name.includes('/header') ? 1 : name.includes('/footer') ? 2 : 3
    return rank(a) - rank(b) || a.localeCompare(b)
  })

  const parts = []
  for (const path of ordered) {
    const xml = await zip.file(path).async('text')
    const text = extractWordXmlText(xml)
    if (text) parts.push(text)
  }
  return parts.join('\n\n')
}

function extractWordXmlText(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('DOCX内容解析失败')
  const chunks = []
  const pushNewline = () => {
    if (chunks.length && chunks[chunks.length - 1] !== '\n') chunks.push('\n')
  }
  const walk = node => {
    if (node.nodeType !== 1) return
    const name = node.localName
    if (name === 't') {
      chunks.push(node.textContent || '')
      return
    }
    if (name === 'tab') {
      chunks.push('\t')
      return
    }
    if (name === 'br' || name === 'cr') {
      pushNewline()
      return
    }
    Array.from(node.childNodes).forEach(walk)
    if (name === 'p') pushNewline()
  }
  walk(doc.documentElement)
  return chunks.join('')
}

async function readLegacyDocText(file) {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const utf16 = extractUtf16LeRuns(bytes)
  if (utf16.length > 20) return utf16
  const decoded = await file.text()
  return decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
}

function extractUtf16LeRuns(bytes) {
  const runs = []
  for (let offset = 0; offset < 2; offset++) {
    let current = ''
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      const code = bytes[i] | (bytes[i + 1] << 8)
      if (isReadableDocChar(code)) {
        current += String.fromCharCode(code)
      } else {
        if (current.trim().length >= 4) runs.push(current)
        current = ''
      }
    }
    if (current.trim().length >= 4) runs.push(current)
  }
  return runs.join('\n')
}

function isReadableDocChar(code) {
  return code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 32 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd)
}

function normalizeImportedDescription(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ===== 保存角色 =====
async function saveCharacter(page, originalChar) {
  const name = page.querySelector('#edit-name').value.trim()
  if (!name) { window.toast('请填写角色姓名'); return }

  // 微信号验证
  const accountVal = page.querySelector('#edit-account').value.trim()
  if (accountVal && !/^[a-zA-Z0-9_\-\.!@#$%^&*()]+$/.test(accountVal)) {
    window.toast('微信号只能包含英文字母、数字和英文字符'); return
  }

  // 密码验证
  const pwdVal = page.querySelector('#edit-password').value
  if (pwdVal && (pwdVal.length < 6 || pwdVal.length > 20)) {
    window.toast('密码长度需为6-20位'); return
  }

  // 手机号验证（非空时必须11位数字）
  const phoneVal = page.querySelector('#edit-phone').value.trim()
  if (phoneVal && !/^\d{11}$/.test(phoneVal)) {
    window.toast('手机号必须是11位数字'); return
  }

  // 银行卡号验证（非空时必须12位数字）
  const bankCardRaw = page.querySelector('#edit-bank-card').value.replace(/\s/g, '')
  if (bankCardRaw && !/^\d{12}$/.test(bankCardRaw)) {
    window.toast('银行卡号必须是12位数字'); return
  }

  // 银行卡密码验证（非空时必须6位数字）
  const bankPassVal = page.querySelector('#edit-bank-pass').value
  if (bankPassVal && !/^\d{6}$/.test(bankPassVal)) {
    window.toast('银行卡密码必须是6位数字'); return
  }

  const activeType = page.querySelector('.type-tab.active')
  const avatarImg = page.querySelector('#avatar-img')
  const activeGender = page.querySelector('.gender-tab.active')
  const genderVal = activeGender?.dataset.gender || '未知'

  const charData = {
    type: activeType ? activeType.dataset.type : 'char',
    group: page.querySelector('#edit-group').value.trim(),
    name,
    nick: page.querySelector('#edit-nick').value.trim(),
    gender: genderVal === '未知' ? '' : genderVal,
    role: page.querySelector('#edit-role').value.trim(),
    description: page.querySelector('#edit-desc').value.trim(),
    avatar: avatarImg ? avatarImg.src : (originalChar?.avatar || ''),
    identity: collectIdentity(page),
    relations: collectRelations(page)
  }

  if (originalChar) {
    await db.characters.update(originalChar.id, charData)
  } else {
    await db.characters.add(charData)
  }

  const lastId = originalChar?.id || (await db.characters.toCollection().lastKey())
  await window.refreshCharCache(lastId)
  window.toast('角色已保存')
  page.querySelector('.header-back').click()
}

// ===== 收集身份信息 =====
function collectIdentity(page) {
  return {
    account: page.querySelector('#edit-account').value.trim(),
    password: page.querySelector('#edit-password').value,
    phone: page.querySelector('#edit-phone').value.trim(),
    idCard: page.querySelector('#edit-id-card').value.trim(),
    bankCard: page.querySelector('#edit-bank-card').value.replace(/\s/g, ''),
    bankPass: page.querySelector('#edit-bank-pass').value,
  }
}

// ===== 渲染关系列表 =====
async function renderRelationsList(page, relations, currentChar) {
  const list = page.querySelector('#relations-list')
  if (!list || !relations?.length) {
    if (list) list.innerHTML = '<div class="list-empty-sm">暂无关系</div>'
    return
  }

  const charIds = [...new Set(relations.map(r => r.charId))]
  const chars = await db.characters.bulkGet(charIds)
  const charMap = {}
  chars.forEach(c => { if (c) charMap[c.id] = c })

  list.innerHTML = relations.map((r, i) => {
    const c = charMap[r.charId]
    return `
      <div class="relation-row" data-index="${i}" data-char-id="${r.charId}" data-type="${r.type || ''}" data-desc="${r.desc || ''}">
        <div class="relation-avatar">
          ${c?.avatar ? `<img src="${c.avatar}">` : `<span class="avatar-text">${(c?.name || '?')[0]}</span>`}
        </div>
        <div class="relation-info">
          <div class="relation-info-top">
            <span class="relation-name">${c?.name || '未知角色'}</span>
            <span class="relation-label">${r.type || ''}</span>
          </div>
        </div>
        <div class="relation-actions">
          <button class="btn-icon relation-edit" data-index="${i}">
            <i class="fa fa-pencil"></i>
          </button>
          <button class="btn-icon relation-del" data-index="${i}">
            <i class="fa fa-times"></i>
          </button>
        </div>
      </div>
    `
  }).join('')

  bindRelationButtons(list, currentChar)
}

// ===== 绑定关系操作按钮 =====
function bindRelationButtons(list, currentChar) {
  list.querySelectorAll('.relation-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.relation-row')
      const targetCharId = parseInt(row.dataset.charId)
      if (currentChar?.id && targetCharId) {
        const target = await db.characters.get(targetCharId)
        if (target?.relations) {
          await db.characters.update(targetCharId, {
            relations: target.relations.filter(r => r.charId !== currentChar.id)
          })
        }
      }
      row.remove()
    })
  })
  list.querySelectorAll('.relation-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      showEditRelationModal(btn.closest('.relation-row'), currentChar)
    })
  })
}

// ===== 收集当前关系数据 =====
function collectRelations(page) {
  const rows = page.querySelectorAll('.relation-row')
  const relations = []
  rows.forEach(row => {
    const charId = parseInt(row.dataset.charId)
    const type = row.dataset.type || ''
    const desc = row.dataset.desc || ''
    if (charId && type) relations.push({ charId, type, ...(desc ? { desc } : {}) })
  })
  return relations
}

// ===== 编辑关系弹窗 =====
async function showEditRelationModal(row, currentChar) {
  const currentType = row.dataset.type || ''
  const currentDesc = row.dataset.desc || ''
  const targetCharId = parseInt(row.dataset.charId)

  let reverseRelation = null
  let target = null
  if (currentChar?.id && targetCharId) {
    target = await db.characters.get(targetCharId)
    if (target?.relations) {
      reverseRelation = target.relations.find(r => r.charId === currentChar.id) || null
    }
  }

  const reverseTypeBlock = reverseRelation ? `
    <div style="border-top:1px solid var(--c-border,#eee);padding-top:10px;margin-top:2px">
      <div style="font-size:12px;color:var(--c-sub);margin-bottom:6px">对方视角（${target?.name || '对方'}）</div>
      <input class="input-field" id="edit-reverse-type-input" placeholder="对方的关系类型" value="${reverseRelation.type || ''}">
    </div>
  ` : ''

  const overlay = createOverlay()
  const sheet = createSheet(`
    <div class="sheet-title">编辑关系</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:10px">
      <input class="input-field" id="edit-relation-type-input" placeholder="关系类型（如：女友、哥哥）" value="${currentType}">
      ${reverseTypeBlock}
      <textarea class="input-field" id="edit-relation-desc-input" placeholder="关系描述（选填，正反共用）" rows="3">${currentDesc}</textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn-pill btn-full" id="btn-confirm-edit-relation">确认修改</button>
    </div>
  `)

  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show') })

  const close = () => {
    overlay.classList.remove('show'); sheet.classList.remove('show')
    setTimeout(() => { overlay.remove(); sheet.remove() }, 200)
  }
  overlay.addEventListener('click', close)

  sheet.querySelector('#btn-confirm-edit-relation').addEventListener('click', async () => {
    const newType = sheet.querySelector('#edit-relation-type-input').value.trim()
    const newDesc = sheet.querySelector('#edit-relation-desc-input').value.trim()
    if (!newType) { window.toast('请填写关系类型'); return }
    row.dataset.type = newType
    row.dataset.desc = newDesc
    row.querySelector('.relation-label').textContent = newType

    if (reverseRelation && target) {
      const newReverseType = sheet.querySelector('#edit-reverse-type-input')?.value.trim()
      if (newReverseType) {
        await db.characters.update(targetCharId, {
          relations: target.relations.map(r =>
            r.charId === currentChar.id
              ? { ...r, type: newReverseType, ...(newDesc ? { desc: newDesc } : {}) }
              : r
          )
        })
      }
    }

    close()
  })
}

// ===== 添加关系弹窗 =====
async function showAddRelationModal(page, currentChar) {
  const allChars = await db.characters.toArray()

  // 收集页面上已有的关系角色ID，防止重复添加
  const existingCharIds = new Set()
  page.querySelectorAll('.relation-row').forEach(row => {
    const id = parseInt(row.dataset.charId)
    if (id) existingCharIds.add(id)
  })

  // 过滤：排除自身和已有关系的角色
  const availChars = allChars.filter(c => {
    if (currentChar?.id && c.id === currentChar.id) return false
    if (existingCharIds.has(c.id)) return false
    return true
  })

  if (!availChars.length) {
    window.toast('暂无可添加关系的角色')
    return
  }

  const overlay = createOverlay()
  const sheet = createSheet(`
    <div class="sheet-title">添加关系</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:10px">
      <select class="input-field" id="relation-char-select">
        <option value="">选择角色</option>
        ${availChars.map(c => `<option value="${c.id}">${c.name}${c.nick ? ` (${c.nick})` : ''}</option>`).join('')}
      </select>
      <input class="input-field" id="relation-type-input" placeholder="关系类型（如：女友、哥哥）">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--c-sub)">
        <input type="checkbox" id="relation-reverse-cb">
        同时添加反向关系（对方视角）
      </label>
      <input class="input-field" id="relation-reverse-type-input" placeholder="对方的关系类型（如：男友、妹妹）" style="display:none">
      <textarea class="input-field" id="relation-desc-input" placeholder="关系描述（选填，正反共用）" rows="2"></textarea>
    </div>
    <div class="sheet-actions">
      <button class="btn-pill btn-full" id="btn-confirm-relation">确认添加</button>
    </div>
  `)
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show') })

  const close = () => {
    overlay.classList.remove('show'); sheet.classList.remove('show')
    setTimeout(() => { overlay.remove(); sheet.remove() }, 200)
  }
  overlay.addEventListener('click', close)

  sheet.querySelector('#relation-reverse-cb').addEventListener('change', function() {
    sheet.querySelector('#relation-reverse-type-input').style.display = this.checked ? '' : 'none'
  })

  sheet.querySelector('#btn-confirm-relation').addEventListener('click', async () => {
    const charId = parseInt(sheet.querySelector('#relation-char-select').value)
    const type = sheet.querySelector('#relation-type-input').value.trim()
    const desc = sheet.querySelector('#relation-desc-input').value.trim()
    const addReverse = sheet.querySelector('#relation-reverse-cb').checked
    const reverseType = sheet.querySelector('#relation-reverse-type-input').value.trim()

    if (!charId || !type) { window.toast('请选择角色并填写关系类型'); return }
    if (addReverse && !reverseType) { window.toast('请填写对方的关系类型'); return }

    await appendRelationRow(page, charId, type, desc, currentChar)

    if (addReverse && currentChar?.id) {
      const target = await db.characters.get(charId)
      if (target) {
        // 移除旧的反向关系（防止重复），再写入新的（使用相同的 desc）
        const filtered = (target.relations || []).filter(r => r.charId !== currentChar.id)
        await db.characters.update(charId, {
          relations: [...filtered, { charId: currentChar.id, type: reverseType, ...(desc ? { desc } : {}) }]
        })
      }
    }
    close()
  })
}

// ===== 追加关系行到列表 =====
async function appendRelationRow(page, charId, type, desc, currentChar) {
  const char = await db.characters.get(charId)
  const relList = page.querySelector('#relations-list')
  if (!relList) return
  const idx = relList.querySelectorAll('.relation-row').length
  relList.insertAdjacentHTML('beforeend', `
    <div class="relation-row" data-index="${idx}" data-char-id="${charId}" data-type="${type}" data-desc="${desc || ''}">
      <div class="relation-avatar">
        ${char?.avatar ? `<img src="${char.avatar}">` : `<span class="avatar-text">${(char?.name || '?')[0]}</span>`}
      </div>
      <div class="relation-info">
        <div class="relation-info-top">
          <span class="relation-name">${char?.name || ''}</span>
          <span class="relation-label">${type}</span>
        </div>
      </div>
      <div class="relation-actions">
        <button class="btn-icon relation-edit">
          <i class="fa fa-pencil"></i>
        </button>
        <button class="btn-icon relation-del">
          <i class="fa fa-times"></i>
        </button>
      </div>
    </div>
  `)
  const newRow = relList.querySelector('.relation-row:last-child')
  newRow.querySelector('.relation-del').addEventListener('click', async () => {
    if (currentChar?.id) {
      const target = await db.characters.get(charId)
      if (target?.relations) {
        await db.characters.update(charId, {
          relations: target.relations.filter(r => r.charId !== currentChar.id)
        })
      }
    }
    newRow.remove()
  })
  newRow.querySelector('.relation-edit').addEventListener('click', () => showEditRelationModal(newRow, currentChar))
}

// ===== NPC批量生成弹窗 =====
async function showNPCGenerateModal(listPage) {
  const allChars = (await db.characters.toArray()).filter(c => c.type === 'char')
  const allBooks = await loadLorebooks()

  const overlay = createOverlay()
  const sheet = createSheet(`
    <div class="sheet-title">AI生成NPC</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:10px">
      <input class="input-field" id="npc-count" type="number" min="1" max="10" value="3" placeholder="生成数量（1-10）">
      <textarea class="input-field" id="npc-req" placeholder="特别剧情要求（可选）" rows="2"></textarea>
      <div>
        <div style="font-size:13px;color:var(--text-secondary,#888);margin-bottom:4px">选择角色（可选）</div>
        <select class="input-field" id="npc-char-select">
          <option value="">不选择角色</option>
          ${allChars.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div id="npc-lb-wrap">
        <div style="font-size:13px;color:var(--text-secondary,#888);margin-bottom:4px">绑定世界书（可选，可多选）</div>
        <div id="npc-lb-list" style="display:flex;flex-direction:column;gap:2px;max-height:140px;overflow-y:auto">
          ${allBooks.map(b => `
            <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer">
              <input type="checkbox" class="npc-lb-cb" value="${b.id}">
              <span>${b.name}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn-pill btn-full" id="btn-confirm-gen-npc">
        <i class="fa fa-magic"></i> 开始生成
      </button>
    </div>
  `)
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show') })

  const close = () => {
    overlay.classList.remove('show'); sheet.classList.remove('show')
    setTimeout(() => { overlay.remove(); sheet.remove() }, 200)
  }
  overlay.addEventListener('click', close)

  // Auto-check lorebooks bound to selected char
  sheet.querySelector('#npc-char-select').addEventListener('change', function() {
    const charId = parseInt(this.value) || null
    sheet.querySelectorAll('.npc-lb-cb').forEach(cb => {
      const book = allBooks.find(b => b.id === cb.value)
      if (!book) return
      const boundIds = book.charIds || []
      if (charId && book.scope === 'personal' && boundIds.includes(charId)) {
        cb.checked = true
      } else if (!charId || book.scope !== 'personal' || !boundIds.includes(charId)) {
        // Only uncheck if it was auto-checked for a previous char (not manually checked)
        if (cb.dataset.autoChecked === '1') cb.checked = false
      }
      cb.dataset.autoChecked = (charId && book.scope === 'personal' && boundIds.includes(charId)) ? '1' : '0'
    })
  })

  sheet.querySelector('#btn-confirm-gen-npc').addEventListener('click', async () => {
    const count = Math.min(10, Math.max(1, parseInt(sheet.querySelector('#npc-count').value) || 3))
    const req = sheet.querySelector('#npc-req').value.trim()
    const charId = parseInt(sheet.querySelector('#npc-char-select').value) || null
    const lorebookIds = [...sheet.querySelectorAll('.npc-lb-cb:checked')].map(cb => cb.value)
    const btn = sheet.querySelector('#btn-confirm-gen-npc')
    btn.textContent = '生成中...'
    btn.disabled = true
    try {
      await generateNPCs(count, req, charId, lorebookIds)
      window.toast(`已生成 ${count} 个NPC`)
      close()
      loadCharacterList(listPage, 'npc', '')
    } catch (e) {
      window.toast('生成失败：' + e.message)
      btn.textContent = '重试'
      btn.disabled = false
    }
  })
}

// ===== 调用AI生成NPC =====
async function generateNPCs(count, req, charId, lorebookIds) {
  const system = '你是角色设计师，请返回JSON数组，不要有其他内容。'

  let char = null
  if (charId) char = await db.characters.get(charId)

  // Split selected lorebooks into char-bound vs other
  let charLorebookText = ''
  let otherLorebookText = ''
  if (lorebookIds && lorebookIds.length > 0) {
    const allBooks = await loadLorebooks()
    for (const lid of lorebookIds) {
      const book = allBooks.find(b => b.id === lid)
      if (!book) continue
      const content = (book.entries || []).filter(e => e.enabled !== false).map(e => e.content).filter(Boolean).join('\n')
      if (!content) continue
      const boundIds = book.charIds || []
      if (charId && book.scope === 'personal' && boundIds.includes(charId)) {
        charLorebookText += (charLorebookText ? '\n' : '') + content
      } else {
        otherLorebookText += (otherLorebookText ? '\n' : '') + content
      }
    }
  }

  const hasContext = char || otherLorebookText

  let prompt = `深度创作 ${count} 个相关的 NPC 角色。\n特别剧情要求：${req || '无'}\n`

  if (hasContext) {
    prompt += '\n请根据以下【主角信息】和【世界设定】具体设定\n'

    if (char) {
      prompt += `\n【主角信息】\n名字：${char.name}\n设定：${char.description || '无'}\n`
      if (charLorebookText) prompt += `\n${charLorebookText}\n`
    }

    if (otherLorebookText) {
      prompt += `\n【世界设定】\n${otherLorebookText}\n`
    }

    prompt += `
【生成要求】
1. **世界观锚定**：NPC 必须与世界观（Lorebook）紧密结合，基于已知设定（地名、势力、规则、种族、历史事件等），不得随意杜撰与世界观冲突的元素。
2. **细节丰富**：外貌（衣着和体貌特征）、性格（口癖或习惯性动作）、背景（具体成长或生活经历）等，拒绝空洞描述。
3. **多样性**：生成的角色性格和身份应各不相同，除非【特别剧情要求】另有指定。
`
  }

  prompt += `
请返回一个 JSON 数组，每个对象包含：
- name: 名字
- nickname: 昵称（可选）
- gender: 性别（未知/男/女/其他）
- appearance: 外貌描写（详细，如发色、瞳色、服装风格）
- personality: 性格特征（详细，如高冷、热血、腹黑）
- background: 背景故事（${hasContext ? '结合【主角信息】和【世界设定】具体设定的个人经历' : '详细的个人成长与生活经历'}）`

  if (char) {
    prompt += `
- relation: NPC与主角的关系类型（一个词，如：女友、损友）
- reverse_relation: 主角对该NPC的关系类型（一个词，如：男友、哥们）
- relation_desc: 关系详情描述（具体的互动模式）`
  }

  prompt += '\n\n请严格返回 JSON 格式，不要包含 Markdown 代码块标记。'

  const result = await window.callAI([{ role: 'user', content: prompt }], { system, temperature: 0.4 })
  const match = result.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('AI返回格式错误')
  const npcs = JSON.parse(match[0])

  for (const npc of npcs) {
    const npcRelation = char ? [{
      charId: char.id,
      type: npc.relation || '',
      ...(npc.relation_desc ? { desc: npc.relation_desc } : {})
    }] : []
    const npcId = await db.characters.add({
      type: 'npc',
      name: npc.name || '未命名',
      nick: npc.nickname || '',
      gender: npc.gender || '',
      description: [npc.appearance, npc.personality, npc.background].filter(Boolean).join('\n'),
      avatar: '',
      identity: { phone: genPhone(), account: genAccount() },
      relations: npcRelation
    })
    if (char && npc.reverse_relation) {
      const mainChar = await db.characters.get(char.id)
      const updatedRelations = [...(mainChar.relations || []), {
        charId: npcId,
        type: npc.reverse_relation,
        ...(npc.relation_desc ? { desc: npc.relation_desc } : {})
      }]
      await db.characters.update(char.id, { relations: updatedRelations })
    }
  }
}

// ===== 导出全部角色 =====
window.exportCharacters = async function() {
  const chars = await db.characters.toArray()
  downloadJSON(chars, `wanwan-characters-${Date.now()}.json`)
  window.toast('角色已导出')
}

// ===== 从JSON文件导入角色 =====
async function importCharacters(file, listPage) {
  try {
    const text = await file.text()
    const raw = JSON.parse(text)
    if (!Array.isArray(raw)) throw new Error('仅支持弯弯导出的角色 JSON 文件')
    await importWanwanCharacters(raw, listPage)
  } catch (e) {
    window.toast('导入失败：' + (e.message || '请检查文件格式'))
  }
}

async function importWanwanCharacters(chars, listPage) {
  if (!chars.length) throw new Error()
  const validTypes = new Set(['char', 'npc', 'user'])
  const clean = chars.map(c => {
    if (!c || typeof c !== 'object' || !validTypes.has(c.type) || !c.name) throw new Error()
    return {
      ...c,
      identity: c.identity || { account:'', password:'', phone:'', idCard:'', bankCard:'', bankPass:'' },
      relations: Array.isArray(c.relations) ? c.relations : []
    }
  })
  await db.characters.bulkPut(clean)
  window.toast(`已导入 ${clean.length} 个角色`)
  loadCharacterList(listPage, 'all', '')
}

// ===== 银行卡号格式化（4位一组） =====
function formatBankCard(val) {
  const digits = val.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

// ===== 随机生成12位银行卡号 =====
function genBankCard() {
  const prefixes = ['6217', '6222', '6228', '6212', '6214', '6216', '6221', '6225']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  return prefix + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
}

// ===== 随机生成中国大陆手机号 =====
function genPhone() {
  const prefixes = ['130','131','132','133','134','135','136','137','138','139',
    '150','151','152','153','155','156','157','158','159',
    '176','177','178','180','181','182','183','184','185','186','187','188','189']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  return prefix + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
}

// ===== 随机生成微信号风格账号 =====
function genAccount() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
  const len = 7 + Math.floor(Math.random() * 5)
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// ===== 折叠/展开区块 =====
window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId)
  if (!section) return
  section.classList.toggle('collapsed')
}

// ===== 删除确认 =====
function confirmDeleteChar(charId, listPage, editPage) {
  const overlay = createOverlay()
  const sheet = createSheet(`
    <div class="sheet-title" style="text-align:center">删除角色</div>
    <div style="padding:0 20px 16px;font-size:13px;color:var(--c-sub);line-height:1.7;text-align:center">
      删除后，此角色的聊天、想见你记录、朋友圈/论坛内容、关系、记忆和其他可定位数据都会被清除。此操作不可恢复。
    </div>
    <div class="sheet-actions">
      <button class="btn-ghost btn-pill" id="char-delete-cancel" type="button" style="flex:1">取消</button>
      <button class="btn-pill" id="char-delete-confirm" type="button" style="flex:1;background:var(--c-red);color:#fff">删除</button>
    </div>
  `)
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(sheet)
  requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show') })
  const close = () => {
    overlay.classList.remove('show')
    sheet.classList.remove('show')
    setTimeout(() => { overlay.remove(); sheet.remove() }, 300)
  }
  overlay.addEventListener('click', close)
  sheet.querySelector('#char-delete-cancel').addEventListener('click', close)
  sheet.querySelector('#char-delete-confirm').addEventListener('click', async () => {
    const btn = sheet.querySelector('#char-delete-confirm')
    btn.disabled = true
    btn.textContent = '删除中...'
    try {
      await deleteCharacterEverywhere(charId)
      window.toast('角色已删除')
      delete window._charCache[charId]
      if (window.refreshCharCache) await window.refreshCharCache(charId)
      close()
      if (editPage) editPage.querySelector('.header-back').click()
      if (listPage) {
        const activeFilter = listPage.querySelector('.filter-tab.active')
        loadCharacterList(listPage, activeFilter ? activeFilter.dataset.filter : 'all', '')
      }
    } catch (err) {
      console.error('[character] 删除角色失败:', err)
      btn.disabled = false
      btn.textContent = '删除'
      window.toast('删除失败：' + (err.message || '未知错误'))
    }
  })
}

function sameCharId(a, b) {
  return String(a) === String(b)
}

function cleanIdArray(value, charId) {
  return Array.isArray(value) ? value.filter(id => !sameCharId(id, charId)) : []
}

function actorMatchesChar(value, charId) {
  if (!value || typeof value !== 'object') return false
  const keys = ['charId', 'authorId', 'senderId', 'fromId', 'userId']
  return keys.some(key => value[key] !== undefined && sameCharId(value[key], charId))
}

function filterActorTree(value, charId) {
  if (Array.isArray(value)) {
    return value
      .filter(item => !(item == null || typeof item !== 'object' ? sameCharId(item, charId) : actorMatchesChar(item, charId)))
      .map(item => filterActorTree(item, charId))
  }
  if (value && typeof value === 'object') {
    const copy = { ...value }
    Object.keys(copy).forEach(key => {
      if (Array.isArray(copy[key]) || (copy[key] && typeof copy[key] === 'object')) {
        copy[key] = filterActorTree(copy[key], charId)
      }
    })
    return copy
  }
  return value
}

async function deleteConfigKeys(keys) {
  const clean = [...new Set((keys || []).filter(Boolean))]
  if (clean.length && db.config) await db.config.bulkDelete(clean)
}

async function deleteConfigKeysMatching(predicate) {
  if (!db.config) return
  const rows = await db.config.toArray()
  const keys = rows.map(row => row?.key).filter(key => key && predicate(String(key), rows.find(row => row?.key === key)?.value))
  await deleteConfigKeys(keys)
}

async function deleteChatScopedConfig(chatIds) {
  const ids = [...new Set((chatIds || []).filter(Boolean).map(String))]
  if (!ids.length || !db.config) return
  await deleteConfigKeysMatching(key => {
    return ids.some(chatId =>
      key === `chatTimeSettings_${chatId}` ||
      key === `chatBilingual_${chatId}` ||
      key === `chatImageGen_${chatId}` ||
      key === `chatStickerImageInput_${chatId}` ||
      key === `chatMsgNotify_${chatId}` ||
      key === `chatLongMemory_${chatId}` ||
      key === `chatAppearance_${chatId}` ||
      (key.startsWith('offlineMeetSettings_') && key.includes(`_${chatId}_`))
    )
  })
}

async function deleteChatsEverywhereForCharacter(charId) {
  const chats = await db.chats.toArray()
  const targetChats = chats.filter(chat => sameCharId(chat.charId, charId) || sameCharId(chat.ownerUid, charId))
  const chatIds = targetChats.map(chat => chat.id).filter(Boolean)
  for (const chatId of chatIds) {
    await db.messages.where('chatId').equals(chatId).delete()
    if (db.memories) await db.memories.where('chatId').equals(chatId).delete()
    if (db.memoryRuns) await db.memoryRuns.where('chatId').equals(chatId).delete()
    if (db.callRecords) await db.callRecords.where('chatId').equals(chatId).delete()
  }
  if (db.offlineChats && chatIds.length) {
    const offlineRows = await db.offlineChats.toArray()
    const offlineIds = offlineRows.filter(row => chatIds.some(chatId => sameCharId(row.chatId, chatId))).map(row => row.id)
    if (offlineIds.length) await db.offlineChats.bulkDelete(offlineIds)
  }
  if (chatIds.length) await db.chats.bulkDelete(chatIds)
  await deleteChatScopedConfig(chatIds)
  await cleanupWechatChatMeta(chatIds, charId)
  return chatIds
}

async function cleanupWechatChatMeta(chatIds, charId) {
  if (!db.config) return
  const chatKeys = new Set((chatIds || []).map(id => `private:${id}`))
  const rows = await db.config.toArray()
  for (const row of rows) {
    if (!row?.key || !String(row.key).startsWith('wechatChatMeta_') || !row.value || typeof row.value !== 'object') continue
    if (sameCharId(String(row.key).replace('wechatChatMeta_', ''), charId)) {
      await db.config.delete(row.key)
      continue
    }
    const next = { ...row.value }
    let changed = false
    Object.keys(next).forEach(key => {
      if (chatKeys.has(key)) {
        delete next[key]
        changed = true
      }
    })
    if (changed) await db.config.put({ key: row.key, value: next })
  }
}

async function cleanupCharacterRelations(charId) {
  const chars = await db.characters.toArray()
  for (const char of chars) {
    if (!char || sameCharId(char.id, charId) || !Array.isArray(char.relations)) continue
    const nextRelations = char.relations.filter(rel => !sameCharId(rel?.charId, charId))
    if (nextRelations.length !== char.relations.length) {
      await db.characters.update(char.id, { relations: nextRelations })
    }
  }
}

async function cleanupFriendsAndProfileConfig(charId) {
  if (!db.config) return
  const rows = await db.config.toArray()
  for (const row of rows) {
    const key = String(row?.key || '')
    if (!key) continue
    if (key.startsWith('friends_') && Array.isArray(row.value)) {
      const next = row.value.filter(id => !sameCharId(id, charId))
      if (next.length !== row.value.length) await db.config.put({ key, value: next })
    } else if (
      key.endsWith(`_${charId}`) &&
      (key.startsWith('wechatProfile_') || key.startsWith('wechatContactMomentsProfile_'))
    ) {
      await db.config.delete(key)
    } else if (
      (key.startsWith('wechatSelfProfile_') && sameCharId(key.replace(/^wechatSelfProfile_/, ''), charId)) ||
      (key.startsWith('wechat_wallet_') && sameCharId(key.replace(/^wechat_wallet_/, ''), charId)) ||
      (key.startsWith('work_state_') && sameCharId(key.replace(/^work_state_/, ''), charId)) ||
      (key.startsWith('huabei_state_') && sameCharId(key.replace(/^huabei_state_/, ''), charId)) ||
      (key.startsWith('investment_state_') && sameCharId(key.replace(/^investment_state_/, ''), charId)) ||
      (key.startsWith('hire_state_') && sameCharId(key.replace(/^hire_state_/, ''), charId)) ||
      (key.startsWith('char_work_values_') && sameCharId(key.replace(/^char_work_values_/, ''), charId))
    ) {
      await db.config.delete(key)
    }
  }
}

async function cleanupGroupsForCharacter(charId) {
  if (!db.groupChats) return
  const groups = await db.groupChats.toArray()
  for (const group of groups) {
    const members = cleanIdArray(group.members, charId)
    const adminIds = cleanIdArray(group.adminIds, charId)
    const patch = {}
    if (Array.isArray(group.members) && members.length !== group.members.length) patch.members = members
    if (Array.isArray(group.adminIds) && adminIds.length !== group.adminIds.length) patch.adminIds = adminIds
    if (sameCharId(group.ownerId, charId)) patch.ownerId = members[0] || null
    if (Object.keys(patch).length) await db.groupChats.update(group.id, patch)
  }
  if (db.groupMessages) {
    const messages = await db.groupMessages.toArray()
    const ids = messages.filter(msg => sameCharId(msg.senderId, charId)).map(msg => msg.id)
    if (ids.length) await db.groupMessages.bulkDelete(ids)
  }
}

async function cleanupMomentsForCharacter(charId) {
  if (!db.moments) return
  const moments = await db.moments.toArray()
  const deleteIds = moments.filter(moment => sameCharId(moment.charId, charId) || sameCharId(moment.ownerUid, charId)).map(moment => moment.id)
  if (deleteIds.length) await db.moments.bulkDelete(deleteIds)
  const rest = await db.moments.toArray()
  for (const moment of rest) {
    const patch = {}
    if (Array.isArray(moment.likes)) patch.likes = filterActorTree(moment.likes, charId)
    if (Array.isArray(moment.comments)) patch.comments = filterActorTree(moment.comments, charId)
    if (Object.keys(patch).length) await db.moments.update(moment.id, patch)
  }
}

async function cleanupDirectTablesForCharacter(charId) {
  if (db.offlineChats) await db.offlineChats.where('charId').equals(charId).delete()
  if (db.memories) await db.memories.where('charId').equals(charId).delete()
  if (db.memoryRuns) await db.memoryRuns.where('charId').equals(charId).delete()
  if (db.callRecords) await db.callRecords.where('charId').equals(charId).delete()
  if (db.finance) await db.finance.where('charId').equals(charId).delete()
  if (db.doorResults) {
    const rows = await db.doorResults.toArray()
    const ids = rows
      .filter(row => sameCharId(row.characterId, charId) || sameCharId(row.userId, charId))
      .map(row => row.id)
    if (ids.length) await db.doorResults.bulkDelete(ids)
  }
}

async function cleanupLorebookBindings(charId) {
  const row = await db.config.get('lorebooks')
  const books = Array.isArray(row?.value) ? row.value : []
  let changed = false
  const next = books.map(book => {
    if (!Array.isArray(book.charIds)) return book
    const charIds = book.charIds.filter(id => !sameCharId(id, charId))
    if (charIds.length !== book.charIds.length) changed = true
    return { ...book, charIds }
  })
  if (changed) await db.config.put({ key: 'lorebooks', value: next })
}

function cleanupICityLocalStorageForCharacter(charId) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('wanwan_icity_posts_')) continue
    try {
      const posts = JSON.parse(localStorage.getItem(key) || '[]')
      if (!Array.isArray(posts)) continue
      const next = posts
        .filter(post => !(post?.authorType === 'role' && sameCharId(post.authorId, charId)))
        .map(post => ({
          ...post,
          notes: Array.isArray(post.notes)
            ? post.notes.filter(note => !sameCharId(note?.fromId, charId) && !sameCharId(note?.authorId, charId))
            : post.notes
        }))
      if (next.length !== posts.length || JSON.stringify(next) !== JSON.stringify(posts)) {
        localStorage.setItem(key, JSON.stringify(next))
      }
    } catch (_) {}
  }
}

function cleanupJsonStorageValue(raw, charId) {
  let parsed
  try { parsed = JSON.parse(raw || 'null') } catch (_) { return { changed: false, value: raw } }
  const next = filterActorTree(parsed, charId)
  const changed = JSON.stringify(next) !== JSON.stringify(parsed)
  return { changed, value: JSON.stringify(next) }
}

function cleanupLocalStorageForCharacter(charId) {
  cleanupICityLocalStorageForCharacter(charId)
  const removeKeys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (
      key === 'wanwan_wechat_uid' && sameCharId(localStorage.getItem(key), charId) ||
      key === 'wanwan_ig_uid' && sameCharId(localStorage.getItem(key), charId) ||
      key === 'wanwan_x_uid' && sameCharId(localStorage.getItem(key), charId) ||
      key.startsWith(`wanwan_ig_profile_${charId}`) ||
      key.startsWith(`wanwan_x_profile_${charId}`) ||
      key.startsWith(`wanwan_ig_generated_feed_${charId}`) ||
      key.startsWith(`wanwan_ig_hidden_posts_${charId}`) ||
      key.startsWith(`wanwan_icity_posts_${charId}`) ||
      key.includes(`_${charId}`) && key.startsWith('wanwan_ig_dm_')
    ) {
      removeKeys.push(key)
      continue
    }
    if (key.startsWith('wanwan_ig_generated_feed_') || key.startsWith('wanwan_ig_post_comments_')) {
      const result = cleanupJsonStorageValue(localStorage.getItem(key), charId)
      if (result.changed) localStorage.setItem(key, result.value)
    }
  }
  removeKeys.forEach(key => localStorage.removeItem(key))
}

async function cleanupSocialConfigForCharacter(charId) {
  if (!db.config) return
  const rows = await db.config.toArray()
  for (const row of rows) {
    const key = String(row?.key || '')
    if (!key) continue
    if (
      key.startsWith(`wanwan_ig_profile_${charId}`) ||
      key.startsWith(`wanwan_ig_generated_feed_${charId}`) ||
      key.startsWith(`wanwan_ig_hidden_posts_${charId}`) ||
      (key.startsWith('wanwan_ig_dm_') && key.includes(`_${charId}`))
    ) {
      await db.config.delete(key)
      continue
    }
    if ((key.startsWith('wanwan_ig_generated_feed_') || key.startsWith('wanwan_ig_post_comments_')) && row.value) {
      const next = filterActorTree(row.value, charId)
      if (JSON.stringify(next) !== JSON.stringify(row.value)) {
        await db.config.put({ key, value: next })
      }
    }
  }
}

async function deleteCharacterEverywhere(charId) {
  charId = parseInt(charId, 10)
  if (!charId) return
  const wasWechatSession = sameCharId(localStorage.getItem('wanwan_wechat_uid'), charId)
  await cleanupCharacterRelations(charId)
  await deleteChatsEverywhereForCharacter(charId)
  await cleanupFriendsAndProfileConfig(charId)
  await cleanupGroupsForCharacter(charId)
  await cleanupMomentsForCharacter(charId)
  await cleanupDirectTablesForCharacter(charId)
  await cleanupLorebookBindings(charId)
  cleanupLocalStorageForCharacter(charId)
  await cleanupSocialConfigForCharacter(charId)
  await db.characters.delete(charId)
  if (wasWechatSession && window.clearWechatSession) window.clearWechatSession()
}

// ===== 创建遮罩层 =====
function createOverlay() {
  const el = document.createElement('div')
  el.className = 'sheet-overlay'
  el.style.zIndex = '200'
  return el
}

// ===== 创建居中弹窗 =====
function createSheet(html) {
  const el = document.createElement('div')
  el.className = 'center-modal'
  el.style.zIndex = '201'
  el.innerHTML = html
  return el
}

// ===== 下载JSON文件 =====
function downloadJSON(data, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  a.download = filename
  a.click()
}
