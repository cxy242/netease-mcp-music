// taobao.js — 仿淘宝登录页面（手机号登录 + 微信登录）

var TAOBAO_SESSION_UID_KEY = 'wanwan_taobao_uid'

async function getTaobaoSessionUser() {
  var stored = localStorage.getItem(TAOBAO_SESSION_UID_KEY)
  if (!stored) return null
  try {
    var user = await db.characters.get(parseInt(stored))
    if (!user || user.type !== 'user') {
      localStorage.removeItem(TAOBAO_SESSION_UID_KEY)
      return null
    }
    return user
  } catch (e) {
    localStorage.removeItem(TAOBAO_SESSION_UID_KEY)
    return null
  }
}

function setTaobaoSessionUser(user) {
  if (user && user.id != null) localStorage.setItem(TAOBAO_SESSION_UID_KEY, user.id)
}

window.showTaobaoPage = async function() {
  var user = await getTaobaoSessionUser()
  if (user) {
    showTaobaoHomePage(user)
  } else {
    showTaobaoLoginPage()
  }
}

function showTaobaoLoginPage() {
  var existing = document.getElementById('taobao-login-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'taobao-login-page'
  page.className = 'full-page taobao-login-page'
  page.innerHTML =
    '<button class="tb-login-close" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
    '<button class="tb-login-help" type="button">帮助</button>' +
    '<div class="tb-login-shell">' +
      '<div class="tb-login-logo">' + getTaobaoLogoSvg() + '</div>' +
      '<div class="tb-login-slogan">手机号登录</div>' +

      '<div class="tb-login-form">' +
        '<div class="tb-login-field tb-login-phone">' +
          '<button class="tb-login-cc" type="button">+86<i class="fa fa-angle-down"></i></button>' +
          '<input class="tb-login-input" id="tb-login-phone" type="tel" inputmode="numeric" maxlength="11" placeholder="请输入手机号">' +
          '<button class="tb-login-clear" id="tb-login-phone-clear" type="button" hidden aria-label="清空"><i class="fa fa-circle-xmark"></i></button>' +
        '</div>' +
        '<div class="tb-login-field tb-login-code">' +
          '<input class="tb-login-input" id="tb-login-code" type="tel" inputmode="numeric" maxlength="6" placeholder="请输入验证码">' +
          '<button class="tb-login-getcode" id="tb-login-getcode" type="button">获取验证码</button>' +
        '</div>' +
      '</div>' +

      '<button class="tb-login-submit" id="tb-login-submit" type="button">登录</button>' +

      '<div class="tb-login-links">' +
        '<span class="tb-login-link">密码登录</span>' +
        '<span class="tb-login-link">登录遇到问题</span>' +
      '</div>' +

      '<div class="tb-login-other">' +
        '<div class="tb-login-other-title"><span></span><em>其他登录方式</em><span></span></div>' +
        '<div class="tb-login-other-icons">' +
          '<button class="tb-login-other-btn tb-other-wechat" type="button" aria-label="微信登录"><i class="fa-brands fa-weixin"></i></button>' +
        '</div>' +
      '</div>' +

      '<label class="tb-login-agree">' +
        '<input type="checkbox" id="tb-login-agree-check">' +
        '<span>已阅读并同意 <em>《淘宝平台服务协议》</em><em>《隐私权政策》</em></span>' +
      '</label>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindTaobaoLoginEvents(page)
}

function bindTaobaoLoginEvents(page) {
  var phoneInput = page.querySelector('#tb-login-phone')
  var codeInput = page.querySelector('#tb-login-code')
  var clearBtn = page.querySelector('#tb-login-phone-clear')
  var getCodeBtn = page.querySelector('#tb-login-getcode')
  var submitBtn = page.querySelector('#tb-login-submit')
  var agreeCheck = page.querySelector('#tb-login-agree-check')

  page.querySelector('.tb-login-close').addEventListener('click', closeTaobaoLoginPage)

  // 返回手势 — 从左边缘右滑关闭
  var startX = 0, startY = 0, tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) { startX = t.clientX; startY = t.clientY; tracking = true }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    if (t.clientX - startX > 80 && Math.abs(t.clientY - startY) < 100) closeTaobaoLoginPage()
  }, { passive: true })

  function isValidPhone() {
    return /^1\d{10}$/.test(phoneInput.value.trim())
  }

  function syncState() {
    var phone = phoneInput.value.trim()
    clearBtn.hidden = !phone
    var ready = isValidPhone() && codeInput.value.trim().length >= 4 && agreeCheck.checked
    submitBtn.classList.toggle('ready', ready)
    if (getCodeBtn.dataset.counting !== '1') {
      getCodeBtn.classList.toggle('active', isValidPhone())
    }
  }

  phoneInput.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 11)
    syncState()
  })
  codeInput.addEventListener('input', function() {
    this.value = this.value.replace(/\D/g, '').slice(0, 6)
    syncState()
  })
  agreeCheck.addEventListener('change', syncState)

  clearBtn.addEventListener('click', function() {
    phoneInput.value = ''
    phoneInput.focus()
    syncState()
  })

  var sentCode = null
  var sentPhone = null

  getCodeBtn.addEventListener('click', async function() {
    if (getCodeBtn.dataset.counting === '1') return
    if (!isValidPhone()) {
      taobaoToast('请输入正确的手机号')
      return
    }
    var phone = phoneInput.value.trim()
    var user = window.findUserByPhone ? await window.findUserByPhone(phone) : null
    if (!user) {
      taobaoToast('该手机号未注册')
      return
    }
    sentCode = await window.sendAppVerificationSMS({ ownerPhone: phone, appKey: 'taobao' })
    sentPhone = phone
    startTaobaoCountdown(getCodeBtn)
    taobaoToast('验证码已发送')
    codeInput.focus()
  })

  submitBtn.addEventListener('click', async function() {
    if (!isValidPhone()) { taobaoToast('请输入正确的手机号'); return }
    if (!agreeCheck.checked) { taobaoToast('请先阅读并同意协议'); return }
    var code = codeInput.value.trim()
    if (code.length !== 6) { taobaoToast('请输入6位验证码'); return }
    if (!sentCode || code !== sentCode || phoneInput.value.trim() !== sentPhone) {
      taobaoToast('验证码错误')
      return
    }
    var user = window.findUserByPhone ? await window.findUserByPhone(sentPhone) : null
    if (!user) { taobaoToast('该手机号未注册'); return }
    taobaoLoginSuccess(user)
  })

  page.querySelector('.tb-other-wechat').addEventListener('click', function() {
    if (!window.showWechatLoginModal) { taobaoToast('该功能暂未开放'); return }
    window.showWechatLoginModal({ mingwen: '淘宝', onSuccess: taobaoLoginSuccess })
  })

  page.querySelectorAll('.tb-login-link, .tb-login-cc, .tb-login-help').forEach(function(el) {
    el.addEventListener('click', function() { taobaoToast('该功能暂未开放') })
  })

  syncState()
}

function taobaoLoginSuccess(user) {
  setTaobaoSessionUser(user)
  closeTaobaoLoginPage()
  taobaoToast('登录成功')
  showTaobaoHomePage(user)
}

// ===== 登录后主页面：四标签（首页 / 商品 / 购物车 / 我的） =====

var TAOBAO_CART_KEY = 'wanwan_taobao_cart'
var TAOBAO_PRODUCTS_KEY = 'taobao_products'
var TAOBAO_ORDER_PREFIX = 'taobao_orders_'
var TAOBAO_LINK_PREFIX = 'taobao_links_'
var taobaoState = { tab: 'home', user: null, category: 'all', products: [] }

// 商品数据（自包含，无外链图，用渐变+图标占位，契合弯弯灰白风格）
var TAOBAO_PRODUCTS = [
  { id: 'p1',  cat: 'home',    title: '原木质感香薰蜡烛 静谧白茶', price: 89,  sold: '2.3万', icon: 'fa-fire-flame-simple', tone: 'a' },
  { id: 'p2',  cat: 'wear',    title: '宽松落肩纯棉卫衣 雾灰色', price: 219, sold: '8657', icon: 'fa-shirt', tone: 'b' },
  { id: 'p3',  cat: 'digital', title: '无线降噪耳机 极简哑光机身', price: 599, sold: '1.1万', icon: 'fa-headphones', tone: 'c' },
  { id: 'p4',  cat: 'home',    title: '陶瓷手冲咖啡套装 釉面磨砂', price: 168, sold: '4321', icon: 'fa-mug-hot', tone: 'd' },
  { id: 'p5',  cat: 'beauty',  title: '氨基酸温和洁面 敏感肌适用', price: 79,  sold: '6.8万', icon: 'fa-pump-soap', tone: 'a' },
  { id: 'p6',  cat: 'digital', title: '极薄机械键盘 灰白键帽', price: 459, sold: '3210', icon: 'fa-keyboard', tone: 'c' },
  { id: 'p7',  cat: 'wear',    title: '极简小白鞋 真皮软底', price: 329, sold: '2.7万', icon: 'fa-shoe-prints', tone: 'b' },
  { id: 'p8',  cat: 'home',    title: '北欧亚麻抱枕套 一对装', price: 49,  sold: '1.5万', icon: 'fa-couch', tone: 'd' },
  { id: 'p9',  cat: 'beauty',  title: '哑光裸色唇釉 雾感丝绒', price: 129, sold: '9.2万', icon: 'fa-wand-magic-sparkles', tone: 'a' },
  { id: 'p10', cat: 'digital', title: '复古胶片相机 银灰配色', price: 899, sold: '768',  icon: 'fa-camera-retro', tone: 'c' },
  { id: 'p11', cat: 'wear',    title: '羊毛混纺围巾 燕麦色', price: 159, sold: '5436', icon: 'fa-mitten', tone: 'b' },
  { id: 'p12', cat: 'home',    title: '原木蓝牙小音箱 布艺网面', price: 249, sold: '3877', icon: 'fa-volume-low', tone: 'd' }
]

var TAOBAO_CATS = [
  { key: 'all',     label: '精选' },
  { key: 'wear',    label: '服饰' },
  { key: 'beauty',  label: '美妆' },
  { key: 'digital', label: '数码' },
  { key: 'home',    label: '居家' }
]

var TAOBAO_EDIT_CATS = TAOBAO_CATS.filter(function(c) { return c.key !== 'all' })

var TAOBAO_ICON_OPTIONS = [
  'fa-bag-shopping', 'fa-shirt', 'fa-mug-hot', 'fa-headphones',
  'fa-pump-soap', 'fa-keyboard', 'fa-camera-retro', 'fa-gift',
  'fa-couch', 'fa-wand-magic-sparkles', 'fa-shoe-prints', 'fa-fire-flame-simple'
]

var TAOBAO_COLOR_OPTIONS = ['#d9d9dc', '#cfd2d6', '#2f3033', '#e2ddd6', '#f0d4c6', '#c7d8d2', '#d8d1e6', '#e5d7aa']

var TAOBAO_QUICK = [
  { icon: 'fa-bolt',          label: '聚划算' },
  { icon: 'fa-gift',          label: '天猫超市' },
  { icon: 'fa-truck-fast',    label: '极速达' },
  { icon: 'fa-ticket',        label: '领券中心' },
  { icon: 'fa-arrow-rotate-left', label: '退货退款' },
  { icon: 'fa-crown',         label: '88VIP' },
  { icon: 'fa-leaf',          label: '芭芭农场' },
  { icon: 'fa-ellipsis',      label: '全部' }
]

function tbEsc(s) { return window.escapeMainHtml ? escapeMainHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] }) }
function tbMoney(num) { return Math.round((Number(num) || 0) * 100) / 100 }
function tbFormatMoney(num) { return tbMoney(num).toFixed(2).replace(/\.00$/, '') }
function tbBgImageStyle(src) { return 'background-image:url(' + tbEsc(JSON.stringify(src || '')) + ')' }
function tbProduct(id) { return (taobaoState.products || TAOBAO_PRODUCTS).find(function(p) { return p.id === id }) }
function tbOrderKey(uid) { return TAOBAO_ORDER_PREFIX + uid }
function tbLinkKey(id) { return TAOBAO_LINK_PREFIX + id }

async function tbGetCustomProducts() {
  var row = await db.config.get(TAOBAO_PRODUCTS_KEY)
  return row && Array.isArray(row.value) ? row.value : []
}

async function tbSaveCustomProducts(products) {
  await db.config.put({ key: TAOBAO_PRODUCTS_KEY, value: products })
}

async function tbLoadProducts() {
  var custom = await tbGetCustomProducts()
  taobaoState.products = TAOBAO_PRODUCTS.concat(custom)
  return taobaoState.products
}

function tbRandomSold() {
  var n = Math.floor(300 + Math.random() * 98000)
  if (n >= 10000) return (Math.round(n / 1000) / 10).toFixed(1).replace('.0', '') + '万'
  return String(n)
}

async function tbGetOrders(uid) {
  var row = await db.config.get(tbOrderKey(uid))
  return row && Array.isArray(row.value) ? row.value : []
}

async function tbSaveOrders(uid, orders) {
  await db.config.put({ key: tbOrderKey(uid), value: orders })
}

async function tbPutOrder(uid, order) {
  var orders = await tbGetOrders(uid)
  var idx = orders.findIndex(function(o) { return o.id === order.id })
  if (idx >= 0) orders[idx] = order
  else orders.unshift(order)
  await tbSaveOrders(uid, orders)
}

async function tbFindOrder(orderId) {
  var users = await db.characters.where('type').equals('user').toArray()
  for (var i = 0; i < users.length; i++) {
    var orders = await tbGetOrders(users[i].id)
    var order = orders.find(function(o) { return o.id === orderId })
    if (order) return { ownerUid: users[i].id, order: order }
  }
  return null
}

function tbGetCart() {
  try { return JSON.parse(localStorage.getItem(TAOBAO_CART_KEY)) || [] }
  catch (e) { return [] }
}
function tbSaveCart(cart) {
  localStorage.setItem(TAOBAO_CART_KEY, JSON.stringify(cart))
}
function tbCartCount() {
  return tbGetCart().reduce(function(n, it) { return n + it.qty }, 0)
}
function tbAddToCart(id) {
  var cart = tbGetCart()
  var row = cart.find(function(it) { return it.id === id })
  if (row) { row.qty++ }
  else { cart.push({ id: id, qty: 1, checked: true }) }
  tbSaveCart(cart)
  taobaoToast('已加入购物车')
  tbRefreshBadge()
}

async function showTaobaoHomePage(user) {
  var existing = document.getElementById('taobao-home-page')
  if (existing) existing.remove()

  taobaoState.user = user
  taobaoState.tab = 'home'
  await tbLoadProducts()

  var page = document.createElement('div')
  page.id = 'taobao-home-page'
  page.className = 'full-page taobao-app'
  page.innerHTML =
    '<div class="tb-screen" id="tb-screen"></div>' +
    tbTabbarHTML('home')

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindTaobaoTabbar(page)
  tbRenderTab(page, 'home')

  // 返回手势 — 从左边缘右滑关闭
  var startX = 0, startY = 0, tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) { startX = t.clientX; startY = t.clientY; tracking = true }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    if (t.clientX - startX > 80 && Math.abs(t.clientY - startY) < 100) closeTaobaoHomePage()
  }, { passive: true })
}

// ===== 底部导航栏 =====
var TAOBAO_TABS = [
  { key: 'home',     label: '首页',   icon: 'fa-house' },
  { key: 'products', label: '商品',   icon: 'fa-bag-shopping' },
  { key: 'cart',     label: '购物车', icon: 'fa-cart-shopping' },
  { key: 'mine',     label: '我的',   icon: 'fa-user' }
]

function tbTabbarHTML(active) {
  var count = tbCartCount()
  var items = TAOBAO_TABS.map(function(t) {
    var badge = (t.key === 'cart' && count > 0)
      ? '<span class="tb-tab-badge">' + (count > 99 ? '99+' : count) + '</span>'
      : ''
    return '<button class="tb-tab' + (t.key === active ? ' active' : '') + '" data-tab="' + t.key + '" type="button">' +
        '<span class="tb-tab-ico"><i class="fa-solid ' + t.icon + '"></i>' + badge + '</span>' +
        '<span class="tb-tab-label">' + t.label + '</span>' +
      '</button>'
  }).join('')
  return '<nav class="tb-tabbar">' + items + '</nav>'
}

function bindTaobaoTabbar(page) {
  page.querySelectorAll('.tb-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.dataset.tab
      if (tab === taobaoState.tab) return
      taobaoState.tab = tab
      page.querySelectorAll('.tb-tab').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tab === tab)
      })
      tbRenderTab(page, tab)
    })
  })
}

function tbRefreshBadge() {
  var page = document.getElementById('taobao-home-page')
  if (!page) return
  var bar = page.querySelector('.tb-tabbar')
  if (!bar) return
  var newBar = document.createElement('div')
  newBar.innerHTML = tbTabbarHTML(taobaoState.tab)
  bar.replaceWith(newBar.firstChild)
  bindTaobaoTabbar(page)
}

// ===== 标签渲染分发 =====
function tbRenderTab(page, tab) {
  var screen = page.querySelector('#tb-screen')
  screen.scrollTop = 0
  if (tab === 'home') tbRenderHome(screen)
  else if (tab === 'products') tbRenderProducts(screen)
  else if (tab === 'cart') tbRenderCart(screen)
  else if (tab === 'mine') tbRenderMine(screen)
}

// 商品卡片
function tbCardHTML(p) {
  var img = p.image
    ? '<div class="tb-card-img tb-card-photo" style="' + tbBgImageStyle(p.image) + '"></div>'
    : '<div class="tb-card-img tone-' + (p.tone || 'a') + '" style="' + (p.bgColor ? 'background:' + tbEsc(p.bgColor) : '') + '"><i class="fa-solid ' + tbEsc(p.icon || 'fa-bag-shopping') + '"></i></div>'
  return '<article class="tb-card" data-id="' + p.id + '">' +
      img +
      '<div class="tb-card-body">' +
        '<div class="tb-card-title">' + tbEsc(p.title) + '</div>' +
        '<div class="tb-card-foot">' +
          '<span class="tb-card-price"><em>¥</em>' + tbFormatMoney(p.price) + '</span>' +
          '<span class="tb-card-sold">已售 ' + tbEsc(p.sold) + '</span>' +
        '</div>' +
        '<button class="tb-card-add" data-add="' + p.id + '" type="button" aria-label="加入购物车"><i class="fa-solid fa-plus"></i></button>' +
      '</div>' +
    '</article>'
}

function tbBindAddButtons(root) {
  root.querySelectorAll('[data-add]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation()
      tbAddToCart(btn.dataset.add)
    })
  })
}

// ===== 首页 =====
function tbRenderHome(screen) {
  var quick = TAOBAO_QUICK.map(function(q) {
    return '<button class="tb-quick" type="button">' +
        '<span class="tb-quick-ico"><i class="fa-solid ' + q.icon + '"></i></span>' +
        '<span class="tb-quick-label">' + q.label + '</span>' +
      '</button>'
  }).join('')

  var grid = taobaoState.products.map(tbCardHTML).join('')

  screen.innerHTML =
    '<header class="tb-topbar">' +
      '<button class="tb-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="tb-search"><i class="fa-solid fa-magnifying-glass"></i><span>搜索你想要的好物</span></div>' +
      '<button class="tb-top-ic" type="button" aria-label="消息"><i class="fa-solid fa-comment-dots"></i></button>' +
    '</header>' +
    '<div class="tb-scroll">' +
      '<section class="tb-banner">' +
        '<div class="tb-banner-text">' +
          '<span class="tb-banner-kicker">弯弯严选</span>' +
          '<h2>质感生活<br>从一件好物开始</h2>' +
          '<span class="tb-banner-sub">精选灰白美学 · 限时直降</span>' +
        '</div>' +
        '<div class="tb-banner-art"><i class="fa-solid fa-bag-shopping"></i></div>' +
      '</section>' +
      '<section class="tb-quickgrid">' + quick + '</section>' +
      '<section class="tb-section-head"><h3>为你推荐</h3><span>猜你喜欢</span></section>' +
      '<section class="tb-grid">' + grid + '</section>' +
    '</div>'

  screen.querySelector('.tb-back').addEventListener('click', closeTaobaoHomePage)
  screen.querySelector('.tb-search').addEventListener('click', function() { taobaoToast('搜索暂未开放') })
  screen.querySelector('.tb-top-ic').addEventListener('click', function() { taobaoToast('暂无新消息') })
  tbBindAddButtons(screen)
}

// ===== 商品（分类筛选） =====
function tbRenderProducts(screen) {
  var chips = TAOBAO_CATS.map(function(c) {
    return '<button class="tb-chip' + (c.key === taobaoState.category ? ' active' : '') + '" data-cat="' + c.key + '" type="button">' + c.label + '</button>'
  }).join('')

  screen.innerHTML =
    '<header class="tb-topbar tb-topbar-plain">' +
      '<h1 class="tb-page-title">商品</h1>' +
      '<button class="tb-add-product-btn" id="tb-add-product" type="button" aria-label="添加商品"><i class="fa-solid fa-plus"></i></button>' +
    '</header>' +
    '<div class="tb-chipbar">' + chips + '</div>' +
    '<div class="tb-scroll"><section class="tb-grid" id="tb-prod-grid"></section></div>'

  function paint() {
    var list = taobaoState.category === 'all'
      ? taobaoState.products
      : taobaoState.products.filter(function(p) { return p.cat === taobaoState.category })
    var gridEl = screen.querySelector('#tb-prod-grid')
    gridEl.innerHTML = list.map(tbCardHTML).join('')
    tbBindAddButtons(gridEl)
  }

  screen.querySelectorAll('.tb-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      taobaoState.category = chip.dataset.cat
      screen.querySelectorAll('.tb-chip').forEach(function(c) {
        c.classList.toggle('active', c.dataset.cat === taobaoState.category)
      })
      screen.querySelector('.tb-scroll').scrollTop = 0
      paint()
    })
  })
  screen.querySelector('#tb-add-product').addEventListener('click', showTaobaoProductEditor)
  paint()
}

function showTaobaoProductEditor() {
  var state = {
    icon: TAOBAO_ICON_OPTIONS[0],
    bgColor: TAOBAO_COLOR_OPTIONS[0],
    image: ''
  }
  var overlay = document.createElement('div')
  overlay.className = 'tb-modal-overlay'
  var modal = document.createElement('div')
  modal.className = 'tb-product-editor'
  modal.innerHTML =
    '<div class="tb-sheet-handle"></div>' +
    '<div class="tb-editor-head">' +
      '<h2>添加商品</h2>' +
      '<button class="tb-editor-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>' +
    '<div class="tb-editor-scroll">' +
      '<label class="tb-field"><span>商品名称</span><input id="tb-prod-title" maxlength="36" placeholder="输入商品名称"></label>' +
      '<label class="tb-field"><span>价格</span><input id="tb-prod-price" type="number" min="0.01" step="0.01" placeholder="0.00"></label>' +
      '<label class="tb-field"><span>销售量</span><input id="tb-prod-sold" maxlength="12" placeholder="不填则随机生成"></label>' +
      '<div class="tb-field"><span>分类</span><div class="tb-editor-options tb-cat-options">' +
        TAOBAO_EDIT_CATS.map(function(c) {
          return '<button class="tb-editor-option" data-cat="' + c.key + '" type="button">' + c.label + '</button>'
        }).join('') +
      '</div></div>' +
      '<div class="tb-field"><span>商品图标</span><div class="tb-editor-options tb-icon-options">' +
        TAOBAO_ICON_OPTIONS.map(function(icon, idx) {
          return '<button class="tb-icon-option' + (idx === 0 ? ' active' : '') + '" data-icon="' + icon + '" type="button"><i class="fa-solid ' + icon + '"></i></button>'
        }).join('') +
      '</div></div>' +
      '<div class="tb-field"><span>背景颜色</span><div class="tb-editor-options tb-color-options">' +
        TAOBAO_COLOR_OPTIONS.map(function(color, idx) {
          return '<button class="tb-color-option' + (idx === 0 ? ' active' : '') + '" data-color="' + color + '" style="background:' + color + '" type="button"></button>'
        }).join('') +
      '</div></div>' +
      '<div class="tb-field"><span>产品图片</span>' +
        '<div class="tb-image-pick-row">' +
          '<div class="tb-image-preview" id="tb-prod-image-preview"><i class="fa-solid fa-image"></i></div>' +
          '<button class="tb-secondary-btn" id="tb-pick-product-image" type="button">选择图片</button>' +
          '<button class="tb-secondary-btn" id="tb-clear-product-image" type="button">清除</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="tb-editor-actions"><button class="tb-primary-btn" id="tb-save-product" type="button">保存商品</button></div>'

  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(modal)
  requestAnimationFrame(function() { overlay.classList.add('show'); modal.classList.add('show') })

  function close() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 180)
  }
  function syncImage() {
    var preview = modal.querySelector('#tb-prod-image-preview')
    preview.style.backgroundImage = state.image ? 'url(' + JSON.stringify(state.image) + ')' : ''
    preview.classList.toggle('has-image', !!state.image)
    preview.innerHTML = state.image ? '' : '<i class="fa-solid fa-image"></i>'
  }
  overlay.addEventListener('click', close)
  modal.querySelector('.tb-editor-close').addEventListener('click', close)
  modal.querySelectorAll('[data-cat]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.cat = btn.dataset.cat
      modal.querySelectorAll('[data-cat]').forEach(function(b) { b.classList.toggle('active', b === btn) })
    })
  })
  modal.querySelectorAll('[data-icon]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.icon = btn.dataset.icon
      modal.querySelectorAll('[data-icon]').forEach(function(b) { b.classList.toggle('active', b === btn) })
    })
  })
  modal.querySelectorAll('[data-color]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.bgColor = btn.dataset.color
      modal.querySelectorAll('[data-color]').forEach(function(b) { b.classList.toggle('active', b === btn) })
    })
  })
  modal.querySelector('#tb-pick-product-image').addEventListener('click', function() {
    if (!window.showImagePicker) { taobaoToast('当前环境不支持选择图片'); return }
    window.showImagePicker(function(imageUrl) {
      state.image = imageUrl || ''
      syncImage()
    })
  })
  modal.querySelector('#tb-clear-product-image').addEventListener('click', function() {
    state.image = ''
    syncImage()
  })
  modal.querySelector('#tb-save-product').addEventListener('click', async function() {
    var title = modal.querySelector('#tb-prod-title').value.trim()
    var price = parseFloat(modal.querySelector('#tb-prod-price').value)
    var sold = modal.querySelector('#tb-prod-sold').value.trim()
    if (!title) { taobaoToast('请输入商品名称'); return }
    if (!price || price <= 0) { taobaoToast('请输入有效价格'); return }
    if (!state.cat) { taobaoToast('请选择商品分类'); return }
    var custom = await tbGetCustomProducts()
    custom.unshift({
      id: 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      custom: true,
      cat: state.cat,
      title: title,
      price: tbMoney(price),
      sold: sold || tbRandomSold(),
      icon: state.icon,
      bgColor: state.bgColor,
      image: state.image,
      tone: 'a'
    })
    await tbSaveCustomProducts(custom)
    await tbLoadProducts()
    close()
    taobaoToast('商品已添加')
    var page = document.getElementById('taobao-home-page')
    if (page) tbRenderTab(page, 'products')
  })
  syncImage()
}

// ===== 购物车 =====
function tbRenderCart(screen) {
  var cart = tbGetCart()

  if (!cart.length) {
    screen.innerHTML =
      '<header class="tb-topbar tb-topbar-plain"><h1 class="tb-page-title">购物车</h1></header>' +
      '<div class="tb-empty">' +
        '<i class="fa-solid fa-cart-shopping"></i>' +
        '<p>购物车还是空的</p>' +
        '<button class="tb-empty-btn" type="button">去逛逛</button>' +
      '</div>'
    screen.querySelector('.tb-empty-btn').addEventListener('click', function() {
      var page = document.getElementById('taobao-home-page')
      taobaoState.tab = 'home'
      page.querySelectorAll('.tb-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === 'home') })
      tbRenderTab(page, 'home')
    })
    return
  }

  var rows = cart.map(function(it) {
    var p = tbProduct(it.id)
    if (!p) return ''
    var img = p.image
      ? '<div class="tb-cart-img tb-cart-photo" style="' + tbBgImageStyle(p.image) + '"></div>'
      : '<div class="tb-cart-img tone-' + (p.tone || 'a') + '" style="' + (p.bgColor ? 'background:' + tbEsc(p.bgColor) : '') + '"><i class="fa-solid ' + tbEsc(p.icon || 'fa-bag-shopping') + '"></i></div>'
    return '<div class="tb-cart-row" data-id="' + it.id + '">' +
        '<button class="tb-check' + (it.checked ? ' on' : '') + '" data-check="' + it.id + '" type="button" aria-label="选择">' +
          '<i class="fa-solid fa-check"></i></button>' +
        img +
        '<div class="tb-cart-info">' +
          '<div class="tb-cart-title">' + tbEsc(p.title) + '</div>' +
          '<div class="tb-cart-bottom">' +
            '<span class="tb-cart-price"><em>¥</em>' + tbFormatMoney(p.price) + '</span>' +
            '<div class="tb-stepper">' +
              '<button data-dec="' + it.id + '" type="button" aria-label="减少"><i class="fa-solid fa-minus"></i></button>' +
              '<span>' + it.qty + '</span>' +
              '<button data-inc="' + it.id + '" type="button" aria-label="增加"><i class="fa-solid fa-plus"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
  }).join('')

  screen.innerHTML =
    '<header class="tb-topbar tb-topbar-plain"><h1 class="tb-page-title">购物车</h1></header>' +
    '<div class="tb-scroll"><section class="tb-cart-list">' + rows + '</section></div>' +
    '<div class="tb-cart-bar">' +
      '<button class="tb-check tb-check-all" id="tb-check-all" type="button" aria-label="全选"><i class="fa-solid fa-check"></i></button>' +
      '<span class="tb-checkall-label">全选</span>' +
      '<div class="tb-cart-total">合计 <span class="tb-cart-sum" id="tb-cart-sum">¥0</span></div>' +
      '<button class="tb-checkout" id="tb-checkout" type="button">结算</button>' +
    '</div>'

  function recalc() {
    var c = tbGetCart()
    var sum = 0, allChecked = c.length > 0
    c.forEach(function(it) {
      var p = tbProduct(it.id)
      if (it.checked && p) sum += p.price * it.qty
      if (!it.checked) allChecked = false
    })
    screen.querySelector('#tb-cart-sum').textContent = '¥' + sum
    screen.querySelector('#tb-check-all').classList.toggle('on', allChecked)
  }

  screen.querySelectorAll('[data-check]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var c = tbGetCart()
      var row = c.find(function(it) { return it.id === btn.dataset.check })
      if (row) { row.checked = !row.checked; tbSaveCart(c) }
      btn.classList.toggle('on', row && row.checked)
      recalc()
    })
  })

  screen.querySelector('#tb-check-all').addEventListener('click', function() {
    var c = tbGetCart()
    var makeOn = !this.classList.contains('on')
    c.forEach(function(it) { it.checked = makeOn })
    tbSaveCart(c)
    tbRenderTab(document.getElementById('taobao-home-page'), 'cart')
  })

  function stepBind(attr, delta) {
    screen.querySelectorAll('[' + attr + ']').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute(attr)
        var c = tbGetCart()
        var row = c.find(function(it) { return it.id === id })
        if (!row) return
        row.qty += delta
        if (row.qty < 1) { c = c.filter(function(it) { return it.id !== id }) }
        tbSaveCart(c)
        tbRefreshBadge()
        tbRenderTab(document.getElementById('taobao-home-page'), 'cart')
      })
    })
  }
  stepBind('data-inc', 1)
  stepBind('data-dec', -1)

  screen.querySelector('#tb-checkout').addEventListener('click', function() {
    var c = tbGetCart()
    if (!c.some(function(it) { return it.checked })) { taobaoToast('请选择商品'); return }
    tbStartCheckout()
  })

  recalc()
}

function tbBuildOrderFromCart(kind) {
  var selected = tbGetCart().filter(function(it) { return it.checked && tbProduct(it.id) })
  var items = selected.map(function(it) {
    var p = tbProduct(it.id)
    return {
      id: p.id,
      title: p.title,
      price: tbMoney(p.price),
      qty: it.qty,
      icon: p.icon,
      bgColor: p.bgColor,
      image: p.image,
      tone: p.tone,
      cat: p.cat
    }
  })
  var total = items.reduce(function(sum, it) { return sum + it.price * it.qty }, 0)
  return {
    id: 'tb_order_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    ownerUid: taobaoState.user.id,
    status: 'pending_payment',
    kind: kind || 'buy',
    items: items,
    total: tbMoney(total),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function tbRemoveCheckedCartItems() {
  var next = tbGetCart().filter(function(it) { return !it.checked })
  tbSaveCart(next)
  tbRefreshBadge()
}

function tbRefreshCartIfOpen() {
  var page = document.getElementById('taobao-home-page')
  if (!page) return
  taobaoState.tab = 'cart'
  page.querySelectorAll('.tb-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === 'cart')
  })
  tbRenderTab(page, 'cart')
}

async function tbStartCheckout() {
  if (!taobaoState.user || !taobaoState.user.id) { taobaoToast('请先登录淘宝'); return }
  var order = tbBuildOrderFromCart('buy')
  if (!order.items.length) { taobaoToast('请选择商品'); return }
  await tbPutOrder(taobaoState.user.id, order)
  showTaobaoCheckoutSheet(order)
}

function tbOrderItemsHTML(order) {
  return order.items.map(function(it) {
    var img = it.image
      ? '<div class="tb-order-img tb-order-photo" style="' + tbBgImageStyle(it.image) + '"></div>'
      : '<div class="tb-order-img tone-' + (it.tone || 'a') + '" style="' + (it.bgColor ? 'background:' + tbEsc(it.bgColor) : '') + '"><i class="fa-solid ' + tbEsc(it.icon || 'fa-bag-shopping') + '"></i></div>'
    return '<div class="tb-order-line">' +
        img +
        '<div class="tb-order-line-main">' +
          '<div class="tb-order-line-title">' + tbEsc(it.title) + '</div>' +
          '<div class="tb-order-line-sub">x' + it.qty + '</div>' +
        '</div>' +
        '<div class="tb-order-line-price">¥' + tbFormatMoney(it.price * it.qty) + '</div>' +
      '</div>'
  }).join('')
}

function showTaobaoCheckoutSheet(order) {
  var overlay = document.createElement('div')
  overlay.className = 'tb-modal-overlay'
  var modal = document.createElement('div')
  modal.className = 'tb-checkout-sheet'
  modal.innerHTML =
    '<div class="tb-sheet-handle"></div>' +
    '<div class="tb-editor-head">' +
      '<h2>确认订单</h2>' +
      '<button class="tb-editor-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>' +
    '<div class="tb-order-list">' + tbOrderItemsHTML(order) + '</div>' +
    '<div class="tb-order-total"><span>合计</span><strong>¥' + tbFormatMoney(order.total) + '</strong></div>' +
    '<div class="tb-checkout-actions">' +
      '<button class="tb-primary-btn" data-checkout-action="pay" type="button"><i class="fa-solid fa-wallet"></i> 自己付款</button>' +
      '<button class="tb-secondary-btn" data-checkout-action="gift" type="button"><i class="fa-solid fa-gift"></i> 赠送</button>' +
      '<button class="tb-secondary-btn" data-checkout-action="request" type="button"><i class="fa-solid fa-link"></i> 找TA代付</button>' +
    '</div>'
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(modal)
  requestAnimationFrame(function() { overlay.classList.add('show'); modal.classList.add('show') })
  function close() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 180)
  }
  overlay.addEventListener('click', close)
  modal.querySelector('.tb-editor-close').addEventListener('click', close)
  modal.querySelector('[data-checkout-action="pay"]').addEventListener('click', function() {
    close()
    showTaobaoPaySheet(order, 'buy')
  })
  modal.querySelector('[data-checkout-action="gift"]').addEventListener('click', function() {
    close()
    showTaobaoPaySheet(order, 'gift')
  })
  modal.querySelector('[data-checkout-action="request"]').addEventListener('click', async function() {
    order.status = 'pay_requested'
    order.kind = 'pay_request'
    order.updatedAt = Date.now()
    await tbPutOrder(order.ownerUid, order)
    close()
    showTaobaoFriendPicker({
      title: '发送代付请求',
      empty: '暂无微信好友',
      onPick: async function(friend) {
        await tbSendTbDeal(order, friend, 'pay')
        tbRemoveCheckedCartItems()
        taobaoToast('代付请求已发送')
        tbRefreshCartIfOpen()
      }
    })
  })
}

function showTaobaoPaySheet(order, flow, payerUid) {
  payerUid = payerUid || order.ownerUid
  var overlay = document.createElement('div')
  overlay.className = 'tb-modal-overlay'
  var modal = document.createElement('div')
  modal.className = 'tb-pay-sheet'
  modal.innerHTML =
    '<div class="tb-sheet-handle"></div>' +
    '<div class="tb-editor-head">' +
      '<h2>选择支付方式</h2>' +
      '<button class="tb-editor-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>' +
    '<div class="tb-pay-amount">¥' + tbFormatMoney(order.total) + '</div>' +
    '<div class="tb-pay-methods">' +
      '<button class="tb-pay-method" data-pay-method="wechat" type="button"><i class="fa-brands fa-weixin"></i><span>微信零钱</span></button>' +
      '<button class="tb-pay-method" data-pay-method="huabei" type="button"><i class="fa-solid fa-credit-card"></i><span>花呗</span></button>' +
      '<button class="tb-pay-method" data-pay-method="checking" type="button"><i class="fa-solid fa-building-columns"></i><span>银行卡 Checking</span></button>' +
    '</div>'
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(modal)
  requestAnimationFrame(function() { overlay.classList.add('show'); modal.classList.add('show') })
  function close() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 180)
  }
  overlay.addEventListener('click', close)
  modal.querySelector('.tb-editor-close').addEventListener('click', close)
  modal.querySelectorAll('[data-pay-method]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true
      var result = await tbPayOrder(order, btn.dataset.payMethod, payerUid, flow)
      btn.disabled = false
      if (!result.ok) { taobaoToast(result.msg || '支付失败'); return }
      close()
      if (flow === 'gift') {
        showTaobaoFriendPicker({
          title: '选择赠送好友',
          empty: '暂无微信好友',
          onPick: async function(friend) {
            await tbSendTbDeal(order, friend, 'gift')
            order.status = 'gift_sent'
            order.giftRecipientId = friend.id
            order.giftRecipientName = friend.wechatName || friend.nick || friend.name || '好友'
            order.updatedAt = Date.now()
            await tbPutOrder(order.ownerUid, order)
            taobaoToast('礼物已送出')
            tbRefreshCartIfOpen()
          }
        })
      } else {
        taobaoToast('支付成功')
        tbRefreshCartIfOpen()
      }
    })
  })
}

async function tbPayOrder(order, method, payerUid, flow) {
  payerUid = parseInt(payerUid, 10)
  if (!payerUid) return { ok: false, msg: '暂无可用支付账号' }
  var amount = tbMoney(order.total)
  var desc = flow === 'gift' ? '淘宝赠送订单' : (flow === 'pay_request' ? '淘宝代付订单' : '淘宝购物订单')
  if (method === 'huabei') {
    if (!window.huabeiSpend) return { ok: false, msg: '花呗不可用' }
    var h = await window.huabeiSpend(payerUid, amount, desc)
    if (!h || !h.ok) return h || { ok: false, msg: '花呗支付失败' }
  } else {
    var row = await db.config.get('wechat_wallet_' + payerUid)
    var wd = row ? row.value : null
    if (!wd || wd.wechatBalance === undefined) return { ok: false, msg: '请先在微信支付中生成账户余额' }
    var field = method === 'checking' ? 'checkingBalance' : 'wechatBalance'
    var source = method === 'checking' ? 'checking' : 'wechat'
    if ((Number(wd[field]) || 0) < amount) return { ok: false, msg: method === 'checking' ? 'Checking 余额不足' : '微信零钱不足' }
    wd[field] = tbMoney((Number(wd[field]) || 0) - amount)
    await db.config.put({ key: 'wechat_wallet_' + payerUid, value: wd })
    await db.finance.add({ charId: payerUid, amount: amount, desc: desc, type: 'expense', source: source, createdAt: Date.now() })
  }
  order.status = 'paid'
  order.paidByUid = payerUid
  order.payMethod = method
  order.paidAt = Date.now()
  order.updatedAt = Date.now()
  await tbPutOrder(order.ownerUid, order)
  if (flow !== 'pay_request') tbRemoveCheckedCartItems()
  return { ok: true }
}

async function tbGetFriendList(ownerUid) {
  var row = await db.config.get('friends_' + ownerUid)
  var ids = row && Array.isArray(row.value) ? row.value : []
  var list = []
  for (var i = 0; i < ids.length; i++) {
    var id = parseInt(ids[i], 10)
    var char = window.getWechatDisplayCharacter ? await window.getWechatDisplayCharacter(id, ownerUid) : await db.characters.get(id)
    if (char) list.push(char)
  }
  return list
}

async function showTaobaoFriendPicker(opts) {
  opts = opts || {}
  var ownerUid = taobaoState.user && taobaoState.user.id
  if (!ownerUid) { taobaoToast('请先登录淘宝'); return }
  var friends = await tbGetFriendList(ownerUid)
  var overlay = document.createElement('div')
  overlay.className = 'tb-modal-overlay'
  var modal = document.createElement('div')
  modal.className = 'tb-friend-sheet'
  var rows = friends.length ? friends.map(function(f) {
    var name = f.wechatName || f.nick || f.name || '好友'
    var avatar = (f.wechatAvatar || f.avatar)
      ? '<img src="' + tbEsc(f.wechatAvatar || f.avatar) + '" alt="">'
      : '<span>' + tbEsc(String(name).slice(0, 1)) + '</span>'
    return '<button class="tb-friend-row" data-id="' + f.id + '" type="button">' +
        '<div class="tb-friend-avatar">' + avatar + '</div>' +
        '<div class="tb-friend-name">' + tbEsc(name) + '</div>' +
        '<i class="fa-solid fa-angle-right"></i>' +
      '</button>'
  }).join('') : '<div class="tb-friend-empty">' + tbEsc(opts.empty || '暂无好友') + '</div>'
  modal.innerHTML =
    '<div class="tb-sheet-handle"></div>' +
    '<div class="tb-editor-head"><h2>' + tbEsc(opts.title || '选择微信好友') + '</h2><button class="tb-editor-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="tb-friend-list">' + rows + '</div>'
  document.getElementById('app').appendChild(overlay)
  document.getElementById('app').appendChild(modal)
  requestAnimationFrame(function() { overlay.classList.add('show'); modal.classList.add('show') })
  function close() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 180)
  }
  overlay.addEventListener('click', close)
  modal.querySelector('.tb-editor-close').addEventListener('click', close)
  modal.querySelectorAll('.tb-friend-row').forEach(function(row) {
    row.addEventListener('click', async function() {
      var friend = friends.find(function(f) { return String(f.id) === row.dataset.id })
      if (!friend) return
      close()
      if (opts.onPick) await opts.onPick(friend)
    })
  })
}

async function tbSendTbDeal(order, friend, type) {
  var dealType = type === 'gift' ? 'gift' : 'pay'
  var deal = {
    dealType: dealType,
    siteName: '淘宝',
    title: order.items && order.items.length
      ? (order.items.length > 1 ? order.items[0].title + ' 等' + order.items.length + '件' : order.items[0].title)
      : '淘宝订单',
    total: tbMoney(order.total),
    items: (order.items || []).map(function(it) {
      return { title: it.title, qty: it.qty, price: tbMoney(it.price), icon: it.icon, image: it.image, bgColor: it.bgColor, tone: it.tone }
    }),
    orderId: order.id,
    ownerUid: order.ownerUid,
    origin: 'app'
  }
  var content = typeof buildTbDealMessageContent === 'function'
    ? buildTbDealMessageContent(deal)
    : '__TBDEAL__' + JSON.stringify(deal)
  var chat = await db.chats.where('[ownerUid+charId]').equals([order.ownerUid, friend.id]).first()
  if (!chat) {
    var chatId = await db.chats.add({ charId: friend.id, ownerUid: order.ownerUid, createdAt: Date.now(), unread: 0 })
    chat = { id: chatId, charId: friend.id, ownerUid: order.ownerUid }
  }
  var lastMessage = (dealType === 'gift' ? '[淘宝赠送] ' : '[淘宝代付] ') + deal.title + ' ¥' + tbFormatMoney(order.total)
  await db.messages.add({ chatId: chat.id, charId: friend.id, role: 'user', content: content, createdAt: Date.now() })
  await db.chats.update(chat.id, { updatedAt: Date.now(), lastMessage: lastMessage })
}

window.openTaobaoInternalLink = async function(url, viewerUid) {
  var m = String(url || '').match(/^wanwan:\/\/taobao\/(gift|pay)\/([^/?#]+)/)
  if (!m) return false
  var type = m[1]
  var linkId = m[2]
  var row = await db.config.get(tbLinkKey(linkId))
  var link = row ? row.value : null
  if (!link) { taobaoToast('链接已失效'); return true }
  var found = await tbFindOrder(link.orderId)
  if (!found) { taobaoToast('订单不存在'); return true }
  var order = found.order
  if (type === 'gift') {
    showTaobaoGiftAcceptPage(order, link, viewerUid)
  } else {
    showTaobaoPayRequestPage(order, link, viewerUid)
  }
  return true
}

function showTaobaoGiftAcceptPage(order, link, viewerUid) {
  var page = document.createElement('div')
  page.id = 'taobao-gift-link-page'
  page.className = 'full-page taobao-app tb-link-page'
  page.innerHTML =
    '<header class="tb-topbar tb-topbar-plain"><button class="tb-back" id="tb-link-back" type="button"><i class="fa-solid fa-angle-left"></i></button><h1 class="tb-page-title">淘宝礼物</h1></header>' +
    '<div class="tb-link-body">' +
      '<div class="tb-link-hero"><i class="fa-solid fa-gift"></i><h2>你收到一份礼物</h2><p>来自淘宝赠送链接</p></div>' +
      '<div class="tb-order-list">' + tbOrderItemsHTML(order) + '</div>' +
      '<div class="tb-order-total"><span>礼物金额</span><strong>¥' + tbFormatMoney(order.total) + '</strong></div>' +
      '<button class="tb-primary-btn" id="tb-accept-gift" type="button">确认收礼</button>' +
    '</div>'
  window.openPage(page)
  page.querySelector('#tb-link-back').addEventListener('click', function() { window.closePage('taobao-gift-link-page') })
  page.querySelector('#tb-accept-gift').addEventListener('click', async function() {
    order.status = 'gift_sent'
    order.giftAcceptedByUid = viewerUid || link.friendId || null
    order.giftAcceptedAt = Date.now()
    order.updatedAt = Date.now()
    await tbPutOrder(order.ownerUid, order)
    taobaoToast('已确认收礼')
    window.closePage('taobao-gift-link-page')
  })
}

function showTaobaoPayRequestPage(order, link, viewerUid) {
  var page = document.createElement('div')
  page.id = 'taobao-pay-link-page'
  page.className = 'full-page taobao-app tb-link-page'
  page.innerHTML =
    '<header class="tb-topbar tb-topbar-plain"><button class="tb-back" id="tb-pay-link-back" type="button"><i class="fa-solid fa-angle-left"></i></button><h1 class="tb-page-title">淘宝代付</h1></header>' +
    '<div class="tb-link-body">' +
      '<div class="tb-link-hero"><i class="fa-solid fa-link"></i><h2>好友找你代付</h2><p>选择支付方式完成订单</p></div>' +
      '<div class="tb-order-list">' + tbOrderItemsHTML(order) + '</div>' +
      '<div class="tb-order-total"><span>需代付</span><strong>¥' + tbFormatMoney(order.total) + '</strong></div>' +
      '<button class="tb-primary-btn" id="tb-pay-request-now" type="button">帮TA付款</button>' +
    '</div>'
  window.openPage(page)
  page.querySelector('#tb-pay-link-back').addEventListener('click', function() { window.closePage('taobao-pay-link-page') })
  page.querySelector('#tb-pay-request-now').addEventListener('click', function() {
    if (!viewerUid) { taobaoToast('暂无可用支付账号'); return }
    showTaobaoPaySheet(order, 'pay_request', viewerUid)
  })
}

// ===== 我的 =====
function tbRenderMine(screen) {
  var user = taobaoState.user || {}
  var name = user.nick || user.name || '淘宝用户'
  var avatar = user.avatar || ''
  var avatarHTML = avatar
    ? '<img class="tb-mine-avatar" src="' + tbEsc(avatar) + '" alt="">'
    : '<div class="tb-mine-avatar tb-mine-avatar-ph"><i class="fa-solid fa-user"></i></div>'

  var orders = [
    { icon: 'fa-wallet',        label: '待付款' },
    { icon: 'fa-box-open',      label: '待发货' },
    { icon: 'fa-truck',         label: '待收货' },
    { icon: 'fa-star',          label: '待评价' },
    { icon: 'fa-rotate-left',   label: '退款/售后' }
  ]
  var ordersHTML = orders.map(function(o) {
    return '<button class="tb-order-cell" type="button">' +
        '<i class="fa-solid ' + o.icon + '"></i><span>' + o.label + '</span>' +
      '</button>'
  }).join('')

  var tools = [
    { icon: 'fa-heart',       label: '我的收藏' },
    { icon: 'fa-clock-rotate-left', label: '浏览足迹' },
    { icon: 'fa-location-dot', label: '收货地址' },
    { icon: 'fa-ticket',      label: '我的优惠券' },
    { icon: 'fa-headset',     label: '官方客服' },
    { icon: 'fa-gear',        label: '设置' }
  ]
  var toolsHTML = tools.map(function(t) {
    return '<button class="tb-tool-row" type="button">' +
        '<span class="tb-tool-left"><i class="fa-solid ' + t.icon + '"></i>' + t.label + '</span>' +
        '<i class="fa-solid fa-angle-right tb-tool-arrow"></i>' +
      '</button>'
  }).join('')

  screen.innerHTML =
    '<div class="tb-scroll">' +
      '<section class="tb-mine-head">' +
        avatarHTML +
        '<div class="tb-mine-id">' +
          '<div class="tb-mine-name">' + tbEsc(name) + '</div>' +
          '<div class="tb-mine-sub">查看并编辑个人资料</div>' +
        '</div>' +
        '<button class="tb-mine-setting" type="button" aria-label="设置"><i class="fa-solid fa-gear"></i></button>' +
      '</section>' +
      '<section class="tb-mine-stats">' +
        '<button class="tb-stat" type="button"><strong>12</strong><span>关注</span></button>' +
        '<button class="tb-stat" type="button"><strong>5</strong><span>收藏</span></button>' +
        '<button class="tb-stat" type="button"><strong>38</strong><span>足迹</span></button>' +
        '<button class="tb-stat" type="button"><strong>3</strong><span>优惠券</span></button>' +
      '</section>' +
      '<section class="tb-panel">' +
        '<div class="tb-panel-head"><h3>我的订单</h3><button class="tb-panel-more" type="button">全部订单 <i class="fa-solid fa-angle-right"></i></button></div>' +
        '<div class="tb-order-grid">' + ordersHTML + '</div>' +
      '</section>' +
      '<section class="tb-panel tb-tools">' + toolsHTML + '</section>' +
    '</div>'

  screen.querySelectorAll('.tb-order-cell, .tb-tool-row, .tb-panel-more, .tb-mine-setting, .tb-stat').forEach(function(el) {
    el.addEventListener('click', function() { taobaoToast('该功能暂未开放') })
  })
}

function closeTaobaoHomePage() {
  var page = document.getElementById('taobao-home-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('taobao-home-page')
  } else {
    page.remove()
  }
}

function startTaobaoCountdown(btn) {
  var seconds = 60
  btn.dataset.counting = '1'
  btn.classList.remove('active')
  btn.classList.add('counting')
  btn.textContent = seconds + 's'
  var timer = setInterval(function() {
    seconds--
    if (seconds <= 0) {
      clearInterval(timer)
      btn.dataset.counting = '0'
      btn.classList.remove('counting')
      btn.textContent = '获取验证码'
      return
    }
    btn.textContent = seconds + 's'
  }, 1000)
}

function closeTaobaoLoginPage() {
  var page = document.getElementById('taobao-login-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('taobao-login-page')
  } else {
    page.remove()
  }
}

function taobaoToast(msg) {
  if (window.toast) window.toast(msg)
}

function getTaobaoLogoSvg() {
  return '<svg class="tb-login-logo-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M152.576516 353.144969 101.660339 431.755417l93.919704 58.484798c0 0 62.441122 32.166639 32.510667 92.543591C200.396439 639.892491 63.989249 764.94675 63.989249 764.94675l122.130018 76.718293c84.630942-184.571141 78.954477-159.973123 100.112212-226.370569 21.845792-67.429531 26.662187-119.205779-10.320847-156.876869C228.434739 410.425668 223.102301 405.953301 152.576516 353.144969z"></path><path d="M219.317991 323.558542c44.379641 0 80.33059-32.338653 80.33059-72.245926 0-40.251302-35.950949-72.589955-80.33059-72.589955-44.723669 0-80.502604 32.510667-80.502604 72.589955C138.987401 291.047875 174.594322 323.558542 219.317991 323.558542z"></path><path d="M944.873509 332.503276c0 0-26.662187-207.793046-478.199227-79.126491 19.437594-33.88678 28.554342-55.732572 28.554342-55.732572l-112.669242-31.994625c0 0-45.583739 149.652276-126.774399 219.317991 0 0 78.782463 45.755753 77.922392 44.379641 22.533848-22.705863 42.831514-45.755753 60.032925-68.117588 18.061482-8.084663 35.434907-15.48127 52.29229-22.361834-20.985721 37.843104-54.528473 94.607761-88.243239 130.386696l47.475895 41.971443c0 0 32.510667-31.478582 67.77356-69.149672l40.251302 0 0 69.837729-157.220897 0L356.069209 567.646565l157.220897 0 0 133.654964-6.020494-0.172014c-17.373425-0.860071-44.207626-3.78431-54.872501-20.641693-12.729044-20.641693-3.268268-57.968755-2.752226-81.19066l-108.540904 0-3.956325 2.236183c0 0-39.907274 179.410717 114.733412 175.454393 144.491853 3.956325 227.402654-40.767344 267.309928-71.55787l15.825298 59.516882 89.103309-37.67109-60.376953-148.620192L691.496724 601.533345l13.417101 50.744163c-18.233496 14.105157-39.73526 24.426004-62.613136 32.166639L642.300689 567.646565l153.264572 0 0-55.904586-153.264572 0 0-69.837729 153.780615 0 0-55.732572-273.502436 0c19.781623-24.25399 35.090879-46.44381 39.219217-60.376953l-47.819923-13.073072c204.696792-73.966068 318.742147-61.237023 317.882076 59.86091L831.860239 691.496724c0 0 12.040988 109.400974-112.497228 101.660339l-67.429531-14.621199-15.653284 64.505291c0 0 290.875861 83.942886 314.613808-141.395599C974.459936 476.307072 944.873509 332.503276 944.873509 332.503276z"></path></svg>'
}
