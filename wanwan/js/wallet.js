// wallet.js — 钱迹应用（独立桌面App）

window.showWalletApp = async function() {
  var users = await db.characters.where('type').equals('user').toArray()
    .then(function(arr) { return arr.sort(function(a, b) { return (b.id || 0) - (a.id || 0) }) })
  if (!users.length) {
    window.toast('请先创建微信账号')
    return
  }
  showWalletAccountSelect(users)
}

function walletEscape(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function getWalletAvatarHTML(user) {
  if (user.avatar) {
    return '<img src="' + walletEscape(user.avatar) + '" alt="">'
  }
  var name = user.name || '?'
  return '<span class="avatar-placeholder">' + walletEscape(name[0] || '?') + '</span>'
}

// ===== 账号选择页（使用 miss-you 风格） =====
function showWalletAccountSelect(users) {
  var page = document.createElement('div')
  page.id = 'wallet-select-page'
  page.className = 'full-page miss-page'

  var rowsHTML = users.map(function(user) {
    var sub = user.identity && user.identity.account
      ? '@' + user.identity.account
      : (user.description || '微信账号')
    return '<button class="miss-row" data-uid="' + user.id + '">' +
      '<div class="miss-avatar">' + getWalletAvatarHTML(user) + '</div>' +
      '<div class="miss-row-main">' +
        '<div class="miss-row-title">' + walletEscape(user.name || '未命名') + '</div>' +
        '<div class="miss-row-sub">' + walletEscape(sub) + '</div>' +
      '</div>' +
      '<i class="fa fa-angle-right"></i>' +
    '</button>'
  }).join('')

  page.innerHTML =
    '<div class="page-header">' +
      '<button class="header-back" id="wallet-select-back">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="header-title">钱迹</span>' +
    '</div>' +
    '<div class="miss-body">' +
      '<div class="miss-section-title">选择微信账号</div>' +
      '<div class="miss-list">' + rowsHTML + '</div>' +
    '</div>'

  window.openPage(page)

  page.querySelector('#wallet-select-back').addEventListener('click', function() {
    window.closePage('wallet-select-page')
  })

  page.querySelectorAll('.miss-row').forEach(function(row) {
    row.addEventListener('click', async function() {
      var uid = parseInt(row.dataset.uid)
      var user = await window.getCharacter(uid)
      if (!user) { window.toast('账号不存在'); return }
      tryEnterWallet(user)
    })
  })
}

// ===== 入口检查：余额 + 密码 =====
async function tryEnterWallet(user) {
  var walletRow = await db.config.get('wechat_wallet_' + user.id)
  var walletData = walletRow ? walletRow.value : null
  var hasBalance = walletData && walletData.wechatBalance !== undefined
  var bankPass = user.identity && user.identity.bankPass

  if (!hasBalance) {
    showWalletGuideDialog(
      '尚未生成余额',
      '该账号尚未在微信支付中生成余额，请先前往微信钱包生成余额',
      '去微信钱包',
      function() {
        if (window.showWechatPage) window.showWechatPage()
      }
    )
    return
  }
  if (!bankPass) {
    showWalletGuideDialog(
      '未设置银行卡密码',
      '该账号尚未设置银行卡密码，请前往角色档案进行设置',
      '去设置',
      function() {
        if (window.showCharacterPage) window.showCharacterPage()
      }
    )
    return
  }
  showWalletPasswordPage(user)
}

// ===== 引导弹窗 =====
function showWalletGuideDialog(title, message, btnText, onConfirm) {
  var overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  overlay.style.zIndex = '300'
  var modal = document.createElement('div')
  modal.className = 'center-modal'
  modal.style.zIndex = '301'
  modal.innerHTML =
    '<div class="sheet-title" style="text-align:center">' + walletEscape(title) + '</div>' +
    '<div style="padding:0 20px 16px;font-size:13px;color:var(--c-sub);line-height:1.7;text-align:center">' +
      walletEscape(message) +
    '</div>' +
    '<div class="sheet-actions" style="display:flex;gap:10px">' +
      '<button class="btn-pill btn-full" id="wallet-guide-cancel" style="background:var(--c-card);color:var(--c-text)">取消</button>' +
      '<button class="btn-pill btn-full" id="wallet-guide-go" style="background:var(--c-accent);color:#fff">' + walletEscape(btnText) + '</button>' +
    '</div>'
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(modal)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    modal.classList.add('show')
  })
  var close = function() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 200)
  }
  overlay.addEventListener('click', close)
  modal.querySelector('#wallet-guide-cancel').addEventListener('click', close)
  modal.querySelector('#wallet-guide-go').addEventListener('click', function() {
    close()
    if (onConfirm) onConfirm()
  })
}

// ===== 密码验证页 =====
var WALLET_KEYS = [
  { key: '1', sub: '' },
  { key: '2', sub: 'ABC' },
  { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' },
  { key: '5', sub: 'JKL' },
  { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' },
  { key: '8', sub: 'TUV' },
  { key: '9', sub: 'WXYZ' },
  { key: '', sub: '', blank: true },
  { key: '0', sub: '' },
  { key: 'del', sub: '', del: true }
]

function buildWalletKeypad() {
  return '<div class="wallet-ios-keypad" id="wallet-pass-keypad">' +
    WALLET_KEYS.map(function(k) {
      if (k.blank) return '<div class="wallet-ios-key wallet-ios-key--blank"></div>'
      if (k.del) return '<button class="wallet-ios-key wallet-ios-key--del" data-key="del">' +
        '<i class="fa fa-delete-left"></i></button>'
      return '<button class="wallet-ios-key" data-key="' + k.key + '">' +
        '<span class="wik-num">' + k.key + '</span>' +
        (k.sub ? '<span class="wik-sub">' + k.sub + '</span>' : '') +
        '</button>'
    }).join('') +
  '</div>'
}

function showWalletPasswordPage(user) {
  var bankPass = user.identity && user.identity.bankPass
  if (!bankPass) {
    showWalletNoBankPassDialog(user)
    return
  }

  var page = document.createElement('div')
  page.id = 'wallet-password-page'
  page.className = 'full-page wallet-password-page'

  page.innerHTML =
    '<div class="page-header">' +
      '<button class="header-back" id="wallet-pass-back">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="header-title">钱迹</span>' +
    '</div>' +
    '<div class="wallet-pass-body">' +
      '<div class="wallet-pass-hero">' +
        '<div class="wallet-pass-avatar">' + getWalletAvatarHTML(user) + '</div>' +
        '<div class="wallet-pass-name">' + walletEscape(user.name || '未命名') + '</div>' +
      '</div>' +
      '<div class="wallet-pass-label">请输入银行卡密码</div>' +
      '<div class="wallet-pass-dots" id="wallet-pass-dots">' +
        '<span></span><span></span><span></span><span></span><span></span><span></span>' +
      '</div>' +
      '<div class="wallet-pass-error" id="wallet-pass-error"></div>' +
      buildWalletKeypad() +
    '</div>'

  window.openPage(page)

  var dots = page.querySelectorAll('#wallet-pass-dots span')
  var errorEl = page.querySelector('#wallet-pass-error')
  var currentValue = ''

  function updateDots() {
    dots.forEach(function(dot, i) {
      dot.classList.toggle('filled', i < currentValue.length)
    })
  }

  function handleKey(key) {
    errorEl.textContent = ''
    if (key === 'del') {
      currentValue = currentValue.slice(0, -1)
      updateDots()
      return
    }
    if (key === '' || currentValue.length >= 6) return
    currentValue += key
    updateDots()
    if (currentValue.length === 6) {
      setTimeout(function() {
        if (currentValue === bankPass) {
          window.closePage('wallet-password-page')
          showWalletMainPage(user)
        } else {
          errorEl.textContent = '密码错误，请重试'
          currentValue = ''
          updateDots()
          var dotsWrap = page.querySelector('#wallet-pass-dots')
          dotsWrap.classList.add('shake')
          setTimeout(function() { dotsWrap.classList.remove('shake') }, 400)
        }
      }, 150)
    }
  }

  page.querySelectorAll('#wallet-pass-keypad .wallet-ios-key').forEach(function(btn) {
    btn.addEventListener('click', function() {
      handleKey(btn.dataset.key)
    })
  })

  page.querySelector('#wallet-pass-back').addEventListener('click', function() {
    window.closePage('wallet-password-page')
  })
}

// ===== 钱迹主页 =====
function showWalletMainPage(user) {
  var page = document.createElement('div')
  page.id = 'wallet-main-page'
  page.className = 'full-page wallet-main-page'

  page.innerHTML =
    '<div class="page-header">' +
      '<button class="header-back" id="wallet-main-back">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="header-title">钱迹</span>' +
    '</div>' +
    '<div class="wallet-main-scroll">' +
      '<div class="wallet-main-user-bar">' +
        '<div class="wallet-main-user-avatar">' + getWalletAvatarHTML(user) + '</div>' +
        '<div class="wallet-main-user-name">' + walletEscape(user.name || '未命名') + '</div>' +
      '</div>' +
      '<div class="wallet-main-modules">' +
        '<button class="wallet-module-card wallet-module-work" id="wallet-btn-work">' +
          '<div class="wallet-module-icon"><i class="fa-solid fa-briefcase"></i></div>' +
          '<div class="wallet-module-title">打工系统</div>' +
          '<div class="wallet-module-desc">工作赚取收入</div>' +
        '</button>' +
        '<button class="wallet-module-card wallet-module-bank" id="wallet-btn-bank">' +
          '<div class="wallet-module-icon"><i class="fa-solid fa-money-bill-trend-up"></i></div>' +
          '<div class="wallet-module-title">银行系统</div>' +
          '<div class="wallet-module-desc">存款与理财管理</div>' +
        '</button>' +
      '</div>' +
    '</div>'

  window.openPage(page)

  page.querySelector('#wallet-main-back').addEventListener('click', function() {
    window.closePage('wallet-main-page')
  })

  page.querySelector('#wallet-btn-work').addEventListener('click', function() {
    if (window.showWorkPage) window.showWorkPage(user)
  })

  page.querySelector('#wallet-btn-bank').addEventListener('click', function() {
    if (window.showBankPage) window.showBankPage(user)
  })
}
