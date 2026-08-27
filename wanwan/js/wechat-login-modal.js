// wechat-login-modal.js — 共享「微信登录」中央弹窗（淘宝 / YumYum 等 App 复用）
// 列出已有 User 账号（头像 / 名字 / 微信号），点击账号即直接登录。
// 依赖：db.js

function wlmEscHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function closeWechatLoginModal() {
  var overlay = document.getElementById('wlm-overlay')
  var box = document.getElementById('wlm-box')
  if (box) box.classList.remove('show')
  if (overlay) overlay.classList.remove('show')
  setTimeout(function() {
    if (overlay) overlay.remove()
    if (box) box.remove()
  }, 200)
}

// opts: { mingwen, onSuccess(user) }
window.showWechatLoginModal = async function(opts) {
  opts = opts || {}
  var mingwen = opts.mingwen || ''

  // 已存在则先清理
  closeWechatLoginModal()

  var app = document.getElementById('app') || document.body

  var overlay = document.createElement('div')
  overlay.id = 'wlm-overlay'
  overlay.className = 'wlm-overlay'

  var box = document.createElement('div')
  box.id = 'wlm-box'
  box.className = 'wlm-box'

  var users = await db.characters.where('type').equals('user').toArray()

  var listHTML = ''
  if (!users.length) {
    listHTML = '<div class="wlm-empty">暂无可用账号</div>'
  } else {
    for (var i = 0; i < users.length; i++) {
      var u = users[i]
      var account = (u.identity && u.identity.account) || ''
      var displayName = u.nick || u.name || '微信用户'
      var avatarInner = u.avatar
        ? '<img src="' + wlmEscHtml(u.avatar) + '" alt="">'
        : '<div class="wlm-account-initial">' + wlmEscHtml(String(displayName).slice(0, 1)) + '</div>'
      listHTML +=
        '<button class="wlm-account" type="button" data-uid="' + u.id + '">' +
          '<div class="wlm-account-avatar">' + avatarInner + '</div>' +
          '<div class="wlm-account-info">' +
            '<span class="wlm-account-name">' + wlmEscHtml(displayName) + '</span>' +
            (account ? '<span class="wlm-account-id">微信号：' + wlmEscHtml(account) + '</span>' : '') +
          '</div>' +
          '<i class="fa fa-angle-right wlm-account-arrow"></i>' +
        '</button>'
    }
  }

  box.innerHTML =
    '<button class="wlm-close" type="button" aria-label="关闭"><i class="fa fa-xmark"></i></button>' +
    '<div class="wlm-logo"><i class="fa-brands fa-weixin"></i></div>' +
    '<div class="wlm-title">微信登录</div>' +
    '<div class="wlm-subtitle">选择账号登录' + wlmEscHtml(mingwen) + '</div>' +
    '<div class="wlm-account-list">' + listHTML + '</div>'

  app.appendChild(overlay)
  app.appendChild(box)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    box.classList.add('show')
  })

  overlay.addEventListener('click', closeWechatLoginModal)
  box.querySelector('.wlm-close').addEventListener('click', closeWechatLoginModal)

  box.querySelectorAll('.wlm-account').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var uid = parseInt(btn.getAttribute('data-uid'))
      var user = await db.characters.get(uid)
      if (!user) return
      closeWechatLoginModal()
      if (typeof opts.onSuccess === 'function') opts.onSuccess(user)
    })
  })
}
