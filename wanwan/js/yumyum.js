// yumyum.js — YumYum 外卖 App

var YUMYUM_SESSION_UID_KEY = 'wanwan_yumyum_uid'

async function getYumYumSessionUser() {
  var stored = localStorage.getItem(YUMYUM_SESSION_UID_KEY)
  if (!stored) return null
  try {
    var user = await db.characters.get(parseInt(stored))
    if (!user || user.type !== 'user') {
      localStorage.removeItem(YUMYUM_SESSION_UID_KEY)
      return null
    }
    return user
  } catch (e) {
    localStorage.removeItem(YUMYUM_SESSION_UID_KEY)
    return null
  }
}

function setYumYumSessionUser(user) {
  if (user && user.id != null) localStorage.setItem(YUMYUM_SESSION_UID_KEY, user.id)
}

window.showYumYumPage = async function() {
  var user = await getYumYumSessionUser()
  if (user) {
    showYumYumHomePage(user)
  } else {
    showYumYumLoginPage()
  }
}

function showYumYumLoginPage() {
  var existing = document.getElementById('yumyum-login-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'yumyum-login-page'
  page.className = 'full-page yum-page'
  page.innerHTML =
    '<button class="yum-back" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
    '<button class="yum-help" type="button">帮助</button>' +

    '<div class="yum-panel">' +
      '<div class="yum-brand">' +
        '<div class="yum-logo" aria-hidden="true"><i class="fa-solid fa-drumstick-bite"></i></div>' +
        '<div class="yum-brand-copy">' +
          '<div class="yum-title">YumYum</div>' +
          '<div class="yum-subtitle">登录后继续点餐</div>' +
        '</div>' +
      '</div>' +

      '<div class="yum-form">' +
        '<div class="yum-field">' +
          '<label for="yum-login-phone">手机号</label>' +
          '<div class="yum-input-wrap yum-input-phone">' +
            '<button class="yum-cc" type="button">+86<i class="fa fa-angle-down"></i></button>' +
            '<input class="yum-input" id="yum-login-phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入手机号">' +
            '<button class="yum-clear" id="yum-login-phone-clear" type="button" hidden aria-label="清空"><i class="fa fa-circle-xmark"></i></button>' +
          '</div>' +
        '</div>' +

        '<div class="yum-field">' +
          '<label for="yum-login-code">验证码</label>' +
          '<div class="yum-input-wrap">' +
            '<input class="yum-input" id="yum-login-code" type="tel" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6位验证码">' +
            '<button class="yum-getcode" id="yum-login-getcode" type="button">获取验证码</button>' +
          '</div>' +
        '</div>' +

        '<label class="yum-agree">' +
          '<input type="checkbox" id="yum-login-agree-check">' +
          '<span class="yum-agree-check" aria-hidden="true"><i class="fa fa-check"></i></span>' +
          '<span>我已阅读并同意 <em>用户服务协议</em> 和 <em>隐私政策</em></span>' +
        '</label>' +

        '<button class="yum-submit" id="yum-login-submit" type="button">登录</button>' +

        '<div class="yum-links">' +
          '<span class="yum-link">密码登录</span>' +
          '<span class="yum-link">登录遇到问题</span>' +
        '</div>' +
      '</div>' +

      '<div class="yum-other">' +
        '<div class="yum-other-title"><span></span><em>其他方式</em><span></span></div>' +
        '<button class="yum-other-btn yum-other-wechat" type="button">' +
          '<i class="fa-brands fa-weixin"></i><span>使用微信登录</span>' +
        '</button>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindYumYumLoginEvents(page)
}

function bindYumYumLoginEvents(page) {
  var phoneInput = page.querySelector('#yum-login-phone')
  var codeInput = page.querySelector('#yum-login-code')
  var clearBtn = page.querySelector('#yum-login-phone-clear')
  var getCodeBtn = page.querySelector('#yum-login-getcode')
  var submitBtn = page.querySelector('#yum-login-submit')
  var agreeCheck = page.querySelector('#yum-login-agree-check')

  page.querySelector('.yum-back').addEventListener('click', closeYumYumLoginPage)

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
    if (t.clientX - startX > 80 && Math.abs(t.clientY - startY) < 100) closeYumYumLoginPage()
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
      yumyumToast('请输入正确的手机号')
      return
    }
    var phone = phoneInput.value.trim()
    var user = window.findUserByPhone ? await window.findUserByPhone(phone) : null
    if (!user) {
      yumyumToast('该手机号未注册')
      return
    }
    sentCode = await window.sendAppVerificationSMS({ ownerPhone: phone, appKey: 'yumyum' })
    sentPhone = phone
    startYumYumCountdown(getCodeBtn)
    yumyumToast('验证码已发送')
    codeInput.focus()
  })

  submitBtn.addEventListener('click', async function() {
    if (!isValidPhone()) { yumyumToast('请输入正确的手机号'); return }
    if (!agreeCheck.checked) { yumyumToast('请先阅读并同意协议'); return }
    var code = codeInput.value.trim()
    if (code.length !== 6) { yumyumToast('请输入6位验证码'); return }
    if (!sentCode || code !== sentCode || phoneInput.value.trim() !== sentPhone) {
      yumyumToast('验证码错误')
      return
    }
    var user = window.findUserByPhone ? await window.findUserByPhone(sentPhone) : null
    if (!user) { yumyumToast('该手机号未注册'); return }
    yumyumLoginSuccess(user)
  })

  page.querySelector('.yum-other-wechat').addEventListener('click', function() {
    if (!window.showWechatLoginModal) { yumyumToast('该功能暂未开放'); return }
    window.showWechatLoginModal({ mingwen: 'YumYum', onSuccess: yumyumLoginSuccess })
  })

  page.querySelectorAll('.yum-link, .yum-cc, .yum-help').forEach(function(el) {
    el.addEventListener('click', function() { yumyumToast('该功能暂未开放') })
  })

  syncState()
}

function yumyumLoginSuccess(user) {
  setYumYumSessionUser(user)
  closeYumYumLoginPage()
  yumyumToast('登录成功，开饭啦')
  showYumYumHomePage(user)
}

// ===== 登录后主页面：三标签外卖 App（首页 / 订单 / 我的 · 弯弯灰白风格） =====

var yumyumState = { tab: 'home', user: null, category: 'all', orderFilter: 'all', cart: {}, cartShopId: null, address: null, homeShopIds: null, catShopIds: {} }

function yhEsc(s) { return window.escapeMainHtml ? escapeMainHtml(s) : s }

// ===== 红包 / 神券系统 =====
var YUMYUM_VOUCHER_KEY = 'wanwan_yumyum_vouchers'
// 神券 SVG（满减券图标）
var YUMYUM_VOUCHER_SVG = '<svg class="yh-vc-svg" viewBox="0 0 1675 1024" xmlns="http://www.w3.org/2000/svg"><path d="M267.822545 46.545455l6.05091 24.576c13.730909 55.714909 55.808 99.514182 114.082909 118.690909l25.6 8.471272-27.787637 8.471273a246.178909 246.178909 0 0 0-123.950545 85.271273h102.865454l-11.682909 103.749818-82.664727 96.116364 62.045091 63.860363-11.124364 102.865455-76.334545-70.749091L211.968 884.363636H112.500364l24.808727-223.883636 1.768727-15.453091L46.545455 752.919273l17.221818-160.721455 168.401454-196.282182h-147.549091l11.170909-103.889454h114.315637c-19.828364-39.610182-55.761455-70.097455-101.794909-85.271273l-25.646546-8.517818 27.834182-8.424727c63.301818-19.223273 116.736-63.022545 144.942546-118.737455L267.822545 46.545455z m381.067637 145.780363l-6.516364 65.722182h160.116364l-40.401455 409.460364a130.187636 130.187636 0 0 1-129.210182 117.806545h-42.356363L580.608 884.363636h-94.533818l10.146909-99.048727H340.898909L392.843636 258.048h155.275637l6.423272-65.722182h94.394182z m47.941818 372.642909H619.52l-13.218909 131.723637h34.350545c24.482909 0 44.962909-18.711273 47.429819-43.194182l8.843636-88.529455z m-176.872727 4.654546l-73.076364 0.605091-12.567273 126.417454h72.983273l12.660364-127.069091z m198.842182-220.718546h-77.591273l-13.032727 130.746182h77.265454l13.358546-130.746182z m-176.593455 0h-72.936727l-12.567273 130.746182h72.610909l12.893091-130.746182zM1621.550545 429.242182l1.908364 50.362182c0.698182 18.338909-15.592727 33.512727-35.979636 33.512727h-61.207273l72.285091 155.322182h-83.176727l-9.029819 47.941818c-15.685818 82.850909-94.208 143.36-186.042181 143.36h-93.230546l44.450909-65.210182a41.751273 41.751273 0 0 1 29.742546-17.501091l5.306182-0.279273c50.082909 0 93.090909-32.581818 102.49309-77.730909l7.214546-34.629818h-287.790546l69.166546-91.648h243.432727l-29.602909-59.578182-282.996364 0.325819 64.605091-84.247273h428.450909zM1105.594182 190.045091l59.392 94.580364 71.214545-94.580364h117.294546l-287.976728 383.069091h125.672728l-215.738182 286.673454h-116.968727l147.456-195.118545h-127.860364l122.833455-161.512727h-101.515637V415.325091l167.051637-0.046546 55.668363-73.728h-181.248l2.792727-87.831272h94.766546l-35.095273-63.720728h102.260364z m461.730909 0L1540.654545 250.274909h82.804364v50.641455c0 17.92-17.035636 32.442182-38.074182 32.488727l-321.954909 0.186182 67.304727-83.316364h85.271273l34.769455-60.229818h116.503272z" fill="currentColor"></path></svg>'

function yhToday() {
  var d = new Date()
  return d.getFullYear() + '-' + yhPad2(d.getMonth() + 1) + '-' + yhPad2(d.getDate())
}

function yhRandInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

// 神券膨胀封顶：无门槛 ¥10，满20/30/40 封顶到门槛值
function yhVoucherCap(threshold) { return threshold === 0 ? 10 : threshold }

// 满减券门槛文案
function yhVoucherCond(threshold) { return threshold === 0 ? '无门槛' : '满' + threshold + '元可用' }

function yhGenDailyVouchers() {
  var thresholds = [0, 20, 30, 40]
  var list = []
  for (var i = 0; i < 5; i++) {
    var base = yhRandInt(3, 8)
    list.push({
      id: 'sv_' + Date.now() + '_' + i + '_' + yhRandInt(1000, 9999),
      threshold: thresholds[yhRandInt(0, thresholds.length - 1)],
      base: base,
      value: base,
      inflated: false
    })
  }
  return list
}

function yhLoadVouchers() {
  var data = null
  try { data = JSON.parse(localStorage.getItem(YUMYUM_VOUCHER_KEY)) } catch (e) { data = null }
  if (!data || typeof data !== 'object') data = {}
  if (!Array.isArray(data.fixed) || !data.fixed.length) {
    data.fixed = [
      { id: 'rp_1', threshold: 20, value: 3 },
      { id: 'rp_2', threshold: 40, value: 6 },
      { id: 'rp_3', threshold: 60, value: 10 }
    ]
  }
  if (!Array.isArray(data.usedIds)) data.usedIds = []
  var today = yhToday()
  if (!data.daily || data.daily.date !== today) {
    var oldIds = (data.daily && Array.isArray(data.daily.list)) ? data.daily.list.map(function(v) { return v.id }) : []
    // 清理昨日神券留下的已用记录
    data.usedIds = data.usedIds.filter(function(id) { return oldIds.indexOf(id) === -1 })
    data.daily = { date: today, list: yhGenDailyVouchers() }
  }
  yhSaveVouchers(data)
  return data
}

function yhSaveVouchers(data) {
  try { localStorage.setItem(YUMYUM_VOUCHER_KEY, JSON.stringify(data)) } catch (e) {}
}

function yhInflateVoucher(id) {
  var data = yhLoadVouchers()
  for (var i = 0; i < data.daily.list.length; i++) {
    var v = data.daily.list[i]
    if (v.id === id && !v.inflated) {
      var lo = v.base * 1.2
      var hi = yhVoucherCap(v.threshold)
      v.value = Math.round(lo + Math.random() * Math.max(0, hi - lo))
      v.inflated = true
      yhSaveVouchers(data)
      return v
    }
  }
  return null
}

function yhAvailableVouchers() {
  var data = yhLoadVouchers()
  var used = data.usedIds
  var out = []
  data.fixed.concat(data.daily.list).forEach(function(v) {
    if (used.indexOf(v.id) === -1) out.push(v)
  })
  return out
}

function yhUseVoucher(id) {
  var data = yhLoadVouchers()
  if (data.usedIds.indexOf(id) === -1) {
    data.usedIds.push(id)
    yhSaveVouchers(data)
  }
}

// ===== 购物车工具 =====
function yhFindShop(id) {
  for (var i = 0; i < YUMYUM_SHOPS.length; i++) {
    if (YUMYUM_SHOPS[i].id === id) return YUMYUM_SHOPS[i]
  }
  return null
}

// 进入某店铺时，若购物车属于其它店铺则清空
function yhEnterShopCart(shop) {
  if (yumyumState.cartShopId !== shop.id) {
    yumyumState.cart = {}
    yumyumState.cartShopId = shop.id
  }
}

// 返回当前店铺购物车明细 [{ item, qty }]
function yhCartItems(shop) {
  var list = []
  ;(shop.menu || []).forEach(function(item) {
    var qty = yumyumState.cart[item.id] || 0
    if (qty > 0) list.push({ item: item, qty: qty })
  })
  return list
}

// 返回 { count, amount }
function yhCartTotal(shop) {
  var count = 0, amount = 0
  yhCartItems(shop).forEach(function(row) {
    count += row.qty
    amount += row.item.price * row.qty
  })
  return { count: count, amount: amount }
}

// 分类快捷入口
var YUMYUM_CATS = [
  { icon: 'fa-utensils',         label: '美食', cat: 'food' },
  { icon: 'fa-cake-candles',     label: '甜点', cat: 'dessert' },
  { icon: 'fa-mug-saucer',       label: '饮品', cat: 'drink' },
  { icon: 'fa-basket-shopping',  label: '超市', cat: 'market' },
  { icon: 'fa-apple-whole',      label: '水果', cat: 'fruit' },
  { icon: 'fa-egg',              label: '早餐', cat: 'breakfast' },
  { icon: 'fa-moon',             label: '夜宵', cat: 'night' },
  { icon: 'fa-ellipsis',         label: '全部', cat: 'all' }
]

// 从指定分类随机抽取 n 家店铺，excludeIds 中的店铺不参与本次抽取
function yhShopsByCategory(cat) {
  if (cat === 'all') return YUMYUM_SHOPS.slice()
  return YUMYUM_SHOPS.filter(function(s) { return s.category === cat })
}

function yhPickRandomShops(pool, n, excludeIds) {
  var ex = excludeIds || []
  var avail = pool.filter(function(s) { return ex.indexOf(s.id) === -1 })
  // 候选不足时回退到整个分类池，保证仍能凑满 n 家
  if (avail.length < n) avail = pool.slice()
  for (var i = avail.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var t = avail[i]; avail[i] = avail[j]; avail[j] = t
  }
  return avail.slice(0, n)
}

// 按 id 列表还原店铺对象（保持顺序，过滤掉已不存在的）
function yhShopsByIds(ids) {
  return (ids || []).map(yhFindShop).filter(Boolean)
}

// 限时优惠（横向卡）
var YUMYUM_PROMOS = [
  { title: '招牌牛肉面', tag: '满30减15', icon: 'fa-bowl-food', tone: 'b' },
  { title: '茉莉奶绿', tag: '第二杯半价', icon: 'fa-mug-hot', tone: 'a' },
  { title: '炭炉烤串', tag: '满50减20', icon: 'fa-fire', tone: 'c' },
  { title: '手作甜筒', tag: '新客立减', icon: 'fa-ice-cream', tone: 'd' }
]

// 餐厅数据（自包含，渐变+图标占位，契合灰白风格）
var YUMYUM_SHOPS = [
  { id: 'yy-food-01', category: 'food', name: '山下里·现炒小馆', icon: 'fa-bowl-rice', tone: 'c', rate: '4.8', sales: '月售 2000+', time: '30分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['满30减15', '准时达'], menu: [
    { id: 'yy-food-01-1', name: '宫保鸡丁', desc: '家常现炒', price: 26, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-food-01-2', name: '黑椒牛柳', desc: '家常现炒', price: 32, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-food-01-3', name: '番茄炒蛋', desc: '家常现炒', price: 18, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-food-01-4', name: '清炒时蔬', desc: '家常现炒', price: 16, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-food-02', category: 'food', name: '暖食·轻食沙拉', icon: 'fa-leaf', tone: 'a', rate: '4.9', sales: '月售 860', time: '25分钟', dist: '0.8km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['新店特惠', '轻食优选'], menu: [
    { id: 'yy-food-02-1', name: '鸡胸牛油果沙拉', desc: '低脂轻食', price: 28, icon: 'fa-leaf', tone: 'a' },
    { id: 'yy-food-02-2', name: '三文鱼沙拉', desc: '低脂轻食', price: 38, icon: 'fa-leaf', tone: 'b' },
    { id: 'yy-food-02-3', name: '藜麦缤纷碗', desc: '低脂轻食', price: 30, icon: 'fa-leaf', tone: 'c' },
    { id: 'yy-food-02-4', name: '南瓜浓汤', desc: '低脂轻食', price: 12, icon: 'fa-leaf', tone: 'd' }
  ] },
  { id: 'yy-food-03', category: 'food', name: '一碗一面·手工面馆', icon: 'fa-bowl-food', tone: 'b', rate: '4.7', sales: '月售 3500', time: '28分钟', dist: '1.5km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['满20减8', '招牌'], menu: [
    { id: 'yy-food-03-1', name: '招牌牛肉面', desc: '中式汤面', price: 26, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-food-03-2', name: '番茄鸡蛋面', desc: '中式汤面', price: 20, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-food-03-3', name: '葱油拌面', desc: '中式汤面', price: 16, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-food-03-4', name: '红油抄手', desc: '中式汤面', price: 18, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-food-04', category: 'food', name: '元气日料·寿司', icon: 'fa-fish', tone: 'd', rate: '4.8', sales: '月售 1200', time: '35分钟', dist: '2.1km', fee: '配送 ¥5', min: '起送 ¥40', tags: ['品质优选'], menu: [
    { id: 'yy-food-04-1', name: '三文鱼刺身', desc: '寿司刺身', price: 48, icon: 'fa-fish', tone: 'a' },
    { id: 'yy-food-04-2', name: '鳗鱼寿司', desc: '寿司刺身', price: 42, icon: 'fa-fish', tone: 'b' },
    { id: 'yy-food-04-3', name: '加州卷', desc: '寿司刺身', price: 28, icon: 'fa-fish', tone: 'c' },
    { id: 'yy-food-04-4', name: '味噌汤', desc: '寿司刺身', price: 10, icon: 'fa-fish', tone: 'd' }
  ] },
  { id: 'yy-food-05', category: 'food', name: '金汤记·酸菜鱼', icon: 'fa-fish-fins', tone: 'c', rate: '4.7', sales: '月售 1800', time: '38分钟', dist: '2.4km', fee: '配送 ¥5', min: '起送 ¥35', tags: ['满50减18', '下饭推荐'], menu: [
    { id: 'yy-food-05-1', name: '金汤酸菜鱼', desc: '川味鱼锅', price: 39, icon: 'fa-fish-fins', tone: 'a' },
    { id: 'yy-food-05-2', name: '麻辣水煮鱼', desc: '川味鱼锅', price: 42, icon: 'fa-fish-fins', tone: 'b' },
    { id: 'yy-food-05-3', name: '藤椒鱼片', desc: '川味鱼锅', price: 40, icon: 'fa-fish-fins', tone: 'c' },
    { id: 'yy-food-05-4', name: '红糖糍粑', desc: '川味鱼锅', price: 12, icon: 'fa-fish-fins', tone: 'd' }
  ] },
  { id: 'yy-food-06', category: 'food', name: '咕嘟·韩式拌饭', icon: 'fa-bowl-rice', tone: 'b', rate: '4.8', sales: '月售 1350', time: '32分钟', dist: '1.9km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['韩式风味', '新客减6'], menu: [
    { id: 'yy-food-06-1', name: '石锅牛肉拌饭', desc: '韩餐简餐', price: 29, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-food-06-2', name: '泡菜五花肉饭', desc: '韩餐简餐', price: 27, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-food-06-3', name: '部队锅', desc: '韩餐简餐', price: 36, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-food-06-4', name: '海鲜饼', desc: '韩餐简餐', price: 22, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-food-07', category: 'food', name: '香料巷·印度咖喱', icon: 'fa-pepper-hot', tone: 'd', rate: '4.6', sales: '月售 520', time: '40分钟', dist: '3.2km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['异国料理'], menu: [
    { id: 'yy-food-07-1', name: '黄油咖喱鸡', desc: '咖喱与烤饼', price: 34, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-food-07-2', name: '玛萨拉羊肉', desc: '咖喱与烤饼', price: 39, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-food-07-3', name: '鹰嘴豆咖喱', desc: '咖喱与烤饼', price: 26, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-food-07-4', name: '蒜香烤饼', desc: '咖喱与烤饼', price: 10, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-food-08', category: 'food', name: '南洋小馆·海南鸡', icon: 'fa-drumstick-bite', tone: 'a', rate: '4.8', sales: '月售 1680', time: '30分钟', dist: '1.6km', fee: '配送 ¥3', min: '起送 ¥22', tags: ['招牌鸡饭', '满35减10'], menu: [
    { id: 'yy-food-08-1', name: '海南鸡饭', desc: '东南亚饭食', price: 28, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-food-08-2', name: '叻沙海鲜面', desc: '东南亚饭食', price: 32, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-food-08-3', name: '咖椰吐司', desc: '东南亚饭食', price: 12, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-food-08-4', name: '斑斓椰奶冻', desc: '东南亚饭食', price: 15, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-food-09', category: 'food', name: '焗里香·意式厨房', icon: 'fa-utensils', tone: 'c', rate: '4.7', sales: '月售 940', time: '36分钟', dist: '2.5km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['西餐精选'], menu: [
    { id: 'yy-food-09-1', name: '黑椒牛柳意面', desc: '意面焗饭', price: 32, icon: 'fa-utensils', tone: 'a' },
    { id: 'yy-food-09-2', name: '奶油培根意面', desc: '意面焗饭', price: 30, icon: 'fa-utensils', tone: 'b' },
    { id: 'yy-food-09-3', name: '芝士海鲜焗饭', desc: '意面焗饭', price: 38, icon: 'fa-utensils', tone: 'c' },
    { id: 'yy-food-09-4', name: '南瓜汤', desc: '意面焗饭', price: 14, icon: 'fa-utensils', tone: 'd' }
  ] },
  { id: 'yy-food-10', category: 'food', name: '豆香集·客家酿味', icon: 'fa-seedling', tone: 'd', rate: '4.6', sales: '月售 680', time: '34分钟', dist: '2.0km', fee: '配送 ¥4', min: '起送 ¥28', tags: ['地方风味'], menu: [
    { id: 'yy-food-10-1', name: '客家酿豆腐', desc: '客家菜', price: 26, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-food-10-2', name: '梅菜扣肉饭', desc: '客家菜', price: 30, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-food-10-3', name: '盐焗鸡腿', desc: '客家菜', price: 28, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-food-10-4', name: '艾草粄', desc: '客家菜', price: 12, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-food-11', category: 'food', name: '塔可星期五·墨西哥卷', icon: 'fa-burrito', tone: 'b', rate: '4.7', sales: '月售 760', time: '30分钟', dist: '1.7km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['异国风味', '第二份8折'], menu: [
    { id: 'yy-food-11-1', name: '香辣牛肉塔可', desc: '塔可卷饼', price: 28, icon: 'fa-burrito', tone: 'a' },
    { id: 'yy-food-11-2', name: '烤鸡卷饼', desc: '塔可卷饼', price: 30, icon: 'fa-burrito', tone: 'b' },
    { id: 'yy-food-11-3', name: '芝士玉米片', desc: '塔可卷饼', price: 24, icon: 'fa-burrito', tone: 'c' },
    { id: 'yy-food-11-4', name: '牛油果酱', desc: '塔可卷饼', price: 8, icon: 'fa-burrito', tone: 'd' }
  ] },
  { id: 'yy-food-12', category: 'food', name: '蒸味堂·广式点心', icon: 'fa-dumpster', tone: 'a', rate: '4.8', sales: '月售 2600', time: '29分钟', dist: '1.3km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['手工现蒸', '满30减8'], menu: [
    { id: 'yy-food-12-1', name: '虾饺皇', desc: '全天茶点', price: 22, icon: 'fa-dumpster', tone: 'a' },
    { id: 'yy-food-12-2', name: '豉汁蒸凤爪', desc: '全天茶点', price: 20, icon: 'fa-dumpster', tone: 'b' },
    { id: 'yy-food-12-3', name: '叉烧包', desc: '全天茶点', price: 16, icon: 'fa-dumpster', tone: 'c' },
    { id: 'yy-food-12-4', name: '鲜虾肠粉', desc: '全天茶点', price: 18, icon: 'fa-dumpster', tone: 'd' }
  ] },
  { id: 'yy-food-13', category: 'food', name: '小锅沸腾·麻辣烫', icon: 'fa-fire-burner', tone: 'c', rate: '4.6', sales: '月售 4200', time: '26分钟', dist: '0.9km', fee: '配送 ¥2', min: '起送 ¥18', tags: ['荤素同价', '夜间营业'], menu: [
    { id: 'yy-food-13-1', name: '招牌麻辣烫', desc: '自选小锅', price: 24, icon: 'fa-fire-burner', tone: 'a' },
    { id: 'yy-food-13-2', name: '番茄浓汤锅', desc: '自选小锅', price: 25, icon: 'fa-fire-burner', tone: 'b' },
    { id: 'yy-food-13-3', name: '骨汤小锅', desc: '自选小锅', price: 25, icon: 'fa-fire-burner', tone: 'c' },
    { id: 'yy-food-13-4', name: '麻酱拌菜', desc: '自选小锅', price: 18, icon: 'fa-fire-burner', tone: 'd' }
  ] },
  { id: 'yy-food-14', category: 'food', name: '米香田·湘味盖码饭', icon: 'fa-bowl-rice', tone: 'd', rate: '4.7', sales: '月售 3100', time: '25分钟', dist: '1.1km', fee: '配送 ¥2', min: '起送 ¥18', tags: ['米饭免费续', '满25减6'], menu: [
    { id: 'yy-food-14-1', name: '小炒黄牛肉饭', desc: '湖南小炒', price: 30, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-food-14-2', name: '辣椒炒肉饭', desc: '湖南小炒', price: 25, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-food-14-3', name: '农家一碗香饭', desc: '湖南小炒', price: 26, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-food-14-4', name: '外婆菜炒蛋饭', desc: '湖南小炒', price: 22, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-food-15', category: 'food', name: '胡椒海岸·新加坡食堂', icon: 'fa-shrimp', tone: 'a', rate: '4.8', sales: '月售 890', time: '37分钟', dist: '2.8km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['南洋风味'], menu: [
    { id: 'yy-food-15-1', name: '黑胡椒蟹肉饭', desc: '南洋熟食', price: 42, icon: 'fa-shrimp', tone: 'a' },
    { id: 'yy-food-15-2', name: '肉骨茶套餐', desc: '南洋熟食', price: 36, icon: 'fa-shrimp', tone: 'b' },
    { id: 'yy-food-15-3', name: '咖喱鱼蛋面', desc: '南洋熟食', price: 28, icon: 'fa-shrimp', tone: 'c' },
    { id: 'yy-food-15-4', name: '薏米水', desc: '南洋熟食', price: 10, icon: 'fa-shrimp', tone: 'd' }
  ] },
  { id: 'yy-food-16', category: 'food', name: '炉边小院·东北菜', icon: 'fa-bowl-rice', tone: 'b', rate: '4.7', sales: '月售 1750', time: '34分钟', dist: '2.0km', fee: '配送 ¥4', min: '起送 ¥28', tags: ['分量十足', '满40减10'], menu: [
    { id: 'yy-food-16-1', name: '锅包肉', desc: '东北家常菜', price: 32, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-food-16-2', name: '地三鲜', desc: '东北家常菜', price: 22, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-food-16-3', name: '小鸡炖蘑菇', desc: '东北家常菜', price: 36, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-food-16-4', name: '酸菜白肉', desc: '东北家常菜', price: 28, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-food-17', category: 'food', name: '盐味厨房·潮汕砂锅', icon: 'fa-pot-food', tone: 'd', rate: '4.8', sales: '月售 1280', time: '38分钟', dist: '2.5km', fee: '配送 ¥5', min: '起送 ¥35', tags: ['潮汕风味'], menu: [
    { id: 'yy-food-17-1', name: '鲜虾砂锅粥', desc: '砂锅粥饭', price: 34, icon: 'fa-pot-food', tone: 'a' },
    { id: 'yy-food-17-2', name: '膏蟹砂锅粥', desc: '砂锅粥饭', price: 48, icon: 'fa-pot-food', tone: 'b' },
    { id: 'yy-food-17-3', name: '蚝仔烙', desc: '砂锅粥饭', price: 26, icon: 'fa-pot-food', tone: 'c' },
    { id: 'yy-food-17-4', name: '卤水拼盘', desc: '砂锅粥饭', price: 32, icon: 'fa-pot-food', tone: 'd' }
  ] },
  { id: 'yy-food-18', category: 'food', name: '椰风泰味·泰国料理', icon: 'fa-pepper-hot', tone: 'a', rate: '4.8', sales: '月售 1060', time: '36分钟', dist: '2.3km', fee: '配送 ¥5', min: '起送 ¥32', tags: ['东南亚风味'], menu: [
    { id: 'yy-food-18-1', name: '冬阴功汤', desc: '泰式简餐', price: 32, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-food-18-2', name: '泰式打抛饭', desc: '泰式简餐', price: 27, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-food-18-3', name: '青咖喱鸡饭', desc: '泰式简餐', price: 29, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-food-18-4', name: '菠萝炒饭', desc: '泰式简餐', price: 26, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-food-19', category: 'food', name: '老城钵钵鸡', icon: 'fa-drumstick-bite', tone: 'c', rate: '4.6', sales: '月售 2900', time: '27分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥22', tags: ['藤椒鲜香', '满30减8'], menu: [
    { id: 'yy-food-19-1', name: '红油钵钵鸡', desc: '冷锅串串', price: 28, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-food-19-2', name: '藤椒钵钵鸡', desc: '冷锅串串', price: 28, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-food-19-3', name: '鸡汤饭', desc: '冷锅串串', price: 8, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-food-19-4', name: '冰粉', desc: '冷锅串串', price: 9, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-food-20', category: 'food', name: '石板炙肉屋', icon: 'fa-fire-burner', tone: 'b', rate: '4.7', sales: '月售 1420', time: '31分钟', dist: '1.8km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['肉食推荐'], menu: [
    { id: 'yy-food-20-1', name: '黑椒烤牛肉饭', desc: '韩式烤肉饭', price: 32, icon: 'fa-fire-burner', tone: 'a' },
    { id: 'yy-food-20-2', name: '韩式五花肉饭', desc: '韩式烤肉饭', price: 29, icon: 'fa-fire-burner', tone: 'b' },
    { id: 'yy-food-20-3', name: '照烧鸡腿饭', desc: '韩式烤肉饭', price: 27, icon: 'fa-fire-burner', tone: 'c' },
    { id: 'yy-food-20-4', name: '泡菜豆腐汤', desc: '韩式烤肉饭', price: 16, icon: 'fa-fire-burner', tone: 'd' }
  ] },
  { id: 'yy-food-21', category: 'food', name: '海岸渔粉·鲜汤鱼粉', icon: 'fa-fish-fins', tone: 'a', rate: '4.8', sales: '月售 2350', time: '25分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['鲜鱼现熬'], menu: [
    { id: 'yy-food-21-1', name: '招牌鱼粉', desc: '鱼汤米粉', price: 24, icon: 'fa-fish-fins', tone: 'a' },
    { id: 'yy-food-21-2', name: '酸菜鱼粉', desc: '鱼汤米粉', price: 26, icon: 'fa-fish-fins', tone: 'b' },
    { id: 'yy-food-21-3', name: '番茄鱼粉', desc: '鱼汤米粉', price: 26, icon: 'fa-fish-fins', tone: 'c' },
    { id: 'yy-food-21-4', name: '炸鱼块', desc: '鱼汤米粉', price: 12, icon: 'fa-fish-fins', tone: 'd' }
  ] },
  { id: 'yy-food-22', category: 'food', name: '白桦林·俄式厨房', icon: 'fa-utensils', tone: 'd', rate: '4.7', sales: '月售 460', time: '43分钟', dist: '3.6km', fee: '配送 ¥7', min: '起送 ¥45', tags: ['异国料理'], menu: [
    { id: 'yy-food-22-1', name: '俄式红菜汤', desc: '俄式西餐', price: 22, icon: 'fa-utensils', tone: 'a' },
    { id: 'yy-food-22-2', name: '奶油炖牛肉', desc: '俄式西餐', price: 38, icon: 'fa-utensils', tone: 'b' },
    { id: 'yy-food-22-3', name: '基辅鸡排', desc: '俄式西餐', price: 36, icon: 'fa-utensils', tone: 'c' },
    { id: 'yy-food-22-4', name: '土豆蘑菇饼', desc: '俄式西餐', price: 24, icon: 'fa-utensils', tone: 'd' }
  ] },
  { id: 'yy-food-23', category: 'food', name: '山城豆花饭', icon: 'fa-bowl-food', tone: 'c', rate: '4.6', sales: '月售 1860', time: '24分钟', dist: '0.9km', fee: '配送 ¥2', min: '起送 ¥16', tags: ['下饭实惠'], menu: [
    { id: 'yy-food-23-1', name: '荤豆花套餐', desc: '川渝豆花', price: 25, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-food-23-2', name: '酸菜豆花饭', desc: '川渝豆花', price: 20, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-food-23-3', name: '麻辣豆花饭', desc: '川渝豆花', price: 18, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-food-23-4', name: '粉蒸肉', desc: '川渝豆花', price: 22, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-food-24', category: 'food', name: '长街越南粉', icon: 'fa-bowl-food', tone: 'a', rate: '4.8', sales: '月售 920', time: '32分钟', dist: '1.9km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['清爽鲜汤'], menu: [
    { id: 'yy-food-24-1', name: '火车头牛肉河粉', desc: '越南河粉', price: 30, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-food-24-2', name: '鸡肉河粉', desc: '越南河粉', price: 26, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-food-24-3', name: '越南春卷', desc: '越南河粉', price: 18, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-food-24-4', name: '青木瓜沙拉', desc: '越南河粉', price: 20, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-food-25', category: 'food', name: '炙鸟小食堂', icon: 'fa-drumstick-bite', tone: 'b', rate: '4.8', sales: '月售 780', time: '35分钟', dist: '2.2km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['日式炭烤'], menu: [
    { id: 'yy-food-25-1', name: '鸡腿肉串饭', desc: '日式烤鸟饭', price: 30, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-food-25-2', name: '鸡肉丸串饭', desc: '日式烤鸟饭', price: 28, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-food-25-3', name: '盐烤青花鱼饭', desc: '日式烤鸟饭', price: 32, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-food-25-4', name: '玉子烧', desc: '日式烤鸟饭', price: 14, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-food-26', category: 'food', name: '苔原碗饭·北欧简餐', icon: 'fa-fish', tone: 'd', rate: '4.7', sales: '月售 410', time: '40分钟', dist: '3.1km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['高蛋白简餐'], menu: [
    { id: 'yy-food-26-1', name: '烟熏三文鱼碗', desc: '鱼肉谷物碗', price: 42, icon: 'fa-fish', tone: 'a' },
    { id: 'yy-food-26-2', name: '香草鸡肉碗', desc: '鱼肉谷物碗', price: 34, icon: 'fa-fish', tone: 'b' },
    { id: 'yy-food-26-3', name: '北欧虾仁碗', desc: '鱼肉谷物碗', price: 38, icon: 'fa-fish', tone: 'c' },
    { id: 'yy-food-26-4', name: '甜菜根沙拉', desc: '鱼肉谷物碗', price: 22, icon: 'fa-fish', tone: 'd' }
  ] },
  { id: 'yy-food-27', category: 'food', name: '陕味面坊·油泼面', icon: 'fa-bowl-food', tone: 'c', rate: '4.7', sales: '月售 2700', time: '26分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['手工扯面'], menu: [
    { id: 'yy-food-27-1', name: '油泼面', desc: '陕西面食', price: 19, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-food-27-2', name: '岐山臊子面', desc: '陕西面食', price: 22, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-food-27-3', name: '腊汁肉夹馍', desc: '陕西面食', price: 15, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-food-27-4', name: '凉皮', desc: '陕西面食', price: 12, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-food-28', category: 'food', name: '粤港烧味铺', icon: 'fa-drumstick-bite', tone: 'a', rate: '4.8', sales: '月售 3300', time: '28分钟', dist: '1.3km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['明炉烧味'], menu: [
    { id: 'yy-food-28-1', name: '蜜汁叉烧饭', desc: '烧腊饭', price: 28, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-food-28-2', name: '脆皮烧鸭饭', desc: '烧腊饭', price: 30, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-food-28-3', name: '玫瑰豉油鸡饭', desc: '烧腊饭', price: 27, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-food-28-4', name: '烧味双拼饭', desc: '烧腊饭', price: 34, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-food-29', category: 'food', name: '田野素食馆', icon: 'fa-seedling', tone: 'b', rate: '4.9', sales: '月售 590', time: '35分钟', dist: '2.4km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['纯植物料理'], menu: [
    { id: 'yy-food-29-1', name: '菌菇豆腐煲', desc: '纯素料理', price: 28, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-food-29-2', name: '素咖喱饭', desc: '纯素料理', price: 25, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-food-29-3', name: '藜麦时蔬碗', desc: '纯素料理', price: 27, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-food-29-4', name: '罗汉斋', desc: '纯素料理', price: 24, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-food-30', category: 'food', name: '铜锅记·云南米线', icon: 'fa-bowl-food', tone: 'd', rate: '4.7', sales: '月售 2450', time: '29分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['汤底现熬'], menu: [
    { id: 'yy-food-30-1', name: '过桥米线', desc: '过桥米线', price: 28, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-food-30-2', name: '酸汤肥牛米线', desc: '过桥米线', price: 30, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-food-30-3', name: '菌菇米线', desc: '过桥米线', price: 24, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-food-30-4', name: '包浆豆腐', desc: '过桥米线', price: 14, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-dessert-01', category: 'dessert', name: '甜屿·手工甜点', icon: 'fa-cake-candles', tone: 'b', rate: '4.9', sales: '月售 1500', time: '30分钟', dist: '1.8km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['新客立减'], menu: [
    { id: 'yy-dessert-01-1', name: '草莓千层', desc: '切块蛋糕', price: 28, icon: 'fa-cake-candles', tone: 'a' },
    { id: 'yy-dessert-01-2', name: '重芝士蛋糕', desc: '切块蛋糕', price: 24, icon: 'fa-cake-candles', tone: 'b' },
    { id: 'yy-dessert-01-3', name: '提拉米苏', desc: '切块蛋糕', price: 26, icon: 'fa-cake-candles', tone: 'c' },
    { id: 'yy-dessert-01-4', name: '香草甜筒', desc: '切块蛋糕', price: 12, icon: 'fa-cake-candles', tone: 'd' }
  ] },
  { id: 'yy-dessert-02', category: 'dessert', name: '云朵戚风研究所', icon: 'fa-cake-candles', tone: 'a', rate: '4.8', sales: '月售 980', time: '28分钟', dist: '1.4km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['低糖', '当日现烤'], menu: [
    { id: 'yy-dessert-02-1', name: '原味云朵戚风', desc: '戚风蛋糕', price: 22, icon: 'fa-cake-candles', tone: 'a' },
    { id: 'yy-dessert-02-2', name: '伯爵茶戚风', desc: '戚风蛋糕', price: 25, icon: 'fa-cake-candles', tone: 'b' },
    { id: 'yy-dessert-02-3', name: '海盐奥利奥戚风', desc: '戚风蛋糕', price: 26, icon: 'fa-cake-candles', tone: 'c' },
    { id: 'yy-dessert-02-4', name: '柠檬戚风', desc: '戚风蛋糕', price: 24, icon: 'fa-cake-candles', tone: 'd' }
  ] },
  { id: 'yy-dessert-03', category: 'dessert', name: '焦糖布丁屋', icon: 'fa-egg', tone: 'd', rate: '4.9', sales: '月售 1250', time: '22分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['第二件半价'], menu: [
    { id: 'yy-dessert-03-1', name: '焦糖烤布丁', desc: '布丁与奶冻', price: 16, icon: 'fa-egg', tone: 'a' },
    { id: 'yy-dessert-03-2', name: '香草牛乳布丁', desc: '布丁与奶冻', price: 15, icon: 'fa-egg', tone: 'b' },
    { id: 'yy-dessert-03-3', name: '抹茶红豆布丁', desc: '布丁与奶冻', price: 18, icon: 'fa-egg', tone: 'c' },
    { id: 'yy-dessert-03-4', name: '椰香芒果奶冻', desc: '布丁与奶冻', price: 17, icon: 'fa-egg', tone: 'd' }
  ] },
  { id: 'yy-dessert-04', category: 'dessert', name: '雪町·日式大福', icon: 'fa-circle', tone: 'b', rate: '4.7', sales: '月售 730', time: '27分钟', dist: '1.6km', fee: '配送 ¥4', min: '起送 ¥24', tags: ['手工现包'], menu: [
    { id: 'yy-dessert-04-1', name: '草莓奶油大福', desc: '糯米甜品', price: 18, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-dessert-04-2', name: '芒果大福', desc: '糯米甜品', price: 16, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-dessert-04-3', name: '抹茶红豆大福', desc: '糯米甜品', price: 15, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-dessert-04-4', name: '黑芝麻团子', desc: '糯米甜品', price: 14, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-dessert-05', category: 'dessert', name: '巴黎小窗·法式甜点', icon: 'fa-cookie-bite', tone: 'c', rate: '4.8', sales: '月售 610', time: '38分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['精品甜点'], menu: [
    { id: 'yy-dessert-05-1', name: '海盐焦糖闪电泡芙', desc: '精致西点', price: 28, icon: 'fa-cookie-bite', tone: 'a' },
    { id: 'yy-dessert-05-2', name: '覆盆子马卡龙', desc: '精致西点', price: 24, icon: 'fa-cookie-bite', tone: 'b' },
    { id: 'yy-dessert-05-3', name: '柠檬挞', desc: '精致西点', price: 30, icon: 'fa-cookie-bite', tone: 'c' },
    { id: 'yy-dessert-05-4', name: '歌剧院蛋糕', desc: '精致西点', price: 32, icon: 'fa-cookie-bite', tone: 'd' }
  ] },
  { id: 'yy-dessert-06', category: 'dessert', name: '暖炉派铺', icon: 'fa-chart-pie', tone: 'd', rate: '4.7', sales: '月售 840', time: '31分钟', dist: '2.1km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['现烤派点'], menu: [
    { id: 'yy-dessert-06-1', name: '经典苹果派', desc: '水果派与挞', price: 24, icon: 'fa-chart-pie', tone: 'a' },
    { id: 'yy-dessert-06-2', name: '蓝莓乳酪挞', desc: '水果派与挞', price: 26, icon: 'fa-chart-pie', tone: 'b' },
    { id: 'yy-dessert-06-3', name: '香蕉太妃派', desc: '水果派与挞', price: 28, icon: 'fa-chart-pie', tone: 'c' },
    { id: 'yy-dessert-06-4', name: '核桃枫糖挞', desc: '水果派与挞', price: 27, icon: 'fa-chart-pie', tone: 'd' }
  ] },
  { id: 'yy-dessert-07', category: 'dessert', name: '麻薯星球', icon: 'fa-cookie', tone: 'a', rate: '4.8', sales: '月售 2200', time: '20分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['买五送一'], menu: [
    { id: 'yy-dessert-07-1', name: '海盐芝士麻薯', desc: '麻薯与糯叽叽', price: 8, icon: 'fa-cookie', tone: 'a' },
    { id: 'yy-dessert-07-2', name: '可可脆皮麻薯', desc: '麻薯与糯叽叽', price: 9, icon: 'fa-cookie', tone: 'b' },
    { id: 'yy-dessert-07-3', name: '紫米芋泥麻薯', desc: '麻薯与糯叽叽', price: 10, icon: 'fa-cookie', tone: 'c' },
    { id: 'yy-dessert-07-4', name: '肉松小贝', desc: '麻薯与糯叽叽', price: 12, icon: 'fa-cookie', tone: 'd' }
  ] },
  { id: 'yy-dessert-08', category: 'dessert', name: '雪绒冰室', icon: 'fa-snowflake', tone: 'b', rate: '4.7', sales: '月售 1800', time: '24分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['夏日特惠'], menu: [
    { id: 'yy-dessert-08-1', name: '芒果绵绵冰', desc: '刨冰与冰沙', price: 26, icon: 'fa-snowflake', tone: 'a' },
    { id: 'yy-dessert-08-2', name: '红豆牛乳冰', desc: '刨冰与冰沙', price: 22, icon: 'fa-snowflake', tone: 'b' },
    { id: 'yy-dessert-08-3', name: '草莓酸奶冰', desc: '刨冰与冰沙', price: 28, icon: 'fa-snowflake', tone: 'c' },
    { id: 'yy-dessert-08-4', name: '杨枝甘露冰', desc: '刨冰与冰沙', price: 24, icon: 'fa-snowflake', tone: 'd' }
  ] },
  { id: 'yy-dessert-09', category: 'dessert', name: '可露丽公社', icon: 'fa-bread-slice', tone: 'c', rate: '4.8', sales: '月售 560', time: '35分钟', dist: '2.7km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['每日限量'], menu: [
    { id: 'yy-dessert-09-1', name: '香草朗姆可露丽', desc: '法式烘焙', price: 16, icon: 'fa-bread-slice', tone: 'a' },
    { id: 'yy-dessert-09-2', name: '伯爵茶可露丽', desc: '法式烘焙', price: 18, icon: 'fa-bread-slice', tone: 'b' },
    { id: 'yy-dessert-09-3', name: '巧克力可露丽', desc: '法式烘焙', price: 18, icon: 'fa-bread-slice', tone: 'c' },
    { id: 'yy-dessert-09-4', name: '开心果费南雪', desc: '法式烘焙', price: 15, icon: 'fa-bread-slice', tone: 'd' }
  ] },
  { id: 'yy-dessert-10', category: 'dessert', name: '豆乳日记', icon: 'fa-box', tone: 'd', rate: '4.6', sales: '月售 920', time: '26分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['轻甜不腻'], menu: [
    { id: 'yy-dessert-10-1', name: '原味豆乳盒子', desc: '豆乳盒子', price: 22, icon: 'fa-box', tone: 'a' },
    { id: 'yy-dessert-10-2', name: '黑芝麻豆乳盒子', desc: '豆乳盒子', price: 24, icon: 'fa-box', tone: 'b' },
    { id: 'yy-dessert-10-3', name: '抹茶豆乳盒子', desc: '豆乳盒子', price: 25, icon: 'fa-box', tone: 'c' },
    { id: 'yy-dessert-10-4', name: '黄豆粉麻薯杯', desc: '豆乳盒子', price: 18, icon: 'fa-box', tone: 'd' }
  ] },
  { id: 'yy-dessert-11', category: 'dessert', name: '糖水巷·广式甜品', icon: 'fa-bowl-food', tone: 'a', rate: '4.8', sales: '月售 1900', time: '25分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥16', tags: ['冷热可选'], menu: [
    { id: 'yy-dessert-11-1', name: '杨枝甘露', desc: '传统糖水', price: 20, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-dessert-11-2', name: '姜撞奶', desc: '传统糖水', price: 16, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-dessert-11-3', name: '双皮奶', desc: '传统糖水', price: 15, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-dessert-11-4', name: '陈皮红豆沙', desc: '传统糖水', price: 14, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-dessert-12', category: 'dessert', name: '杏仁月台·中式糕点', icon: 'fa-moon', tone: 'b', rate: '4.7', sales: '月售 680', time: '33分钟', dist: '2.3km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['手作糕点'], menu: [
    { id: 'yy-dessert-12-1', name: '桂花绿豆糕', desc: '国风点心', price: 18, icon: 'fa-moon', tone: 'a' },
    { id: 'yy-dessert-12-2', name: '桃花酥', desc: '国风点心', price: 22, icon: 'fa-moon', tone: 'b' },
    { id: 'yy-dessert-12-3', name: '枣泥山药糕', desc: '国风点心', price: 20, icon: 'fa-moon', tone: 'c' },
    { id: 'yy-dessert-12-4', name: '荷花酥', desc: '国风点心', price: 24, icon: 'fa-moon', tone: 'd' }
  ] },
  { id: 'yy-dessert-13', category: 'dessert', name: '巧克力实验室', icon: 'fa-cubes-stacked', tone: 'c', rate: '4.9', sales: '月售 770', time: '36分钟', dist: '2.6km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['浓醇可可'], menu: [
    { id: 'yy-dessert-13-1', name: '熔岩巧克力蛋糕', desc: '可可甜品', price: 28, icon: 'fa-cubes-stacked', tone: 'a' },
    { id: 'yy-dessert-13-2', name: '生巧礼盒', desc: '可可甜品', price: 36, icon: 'fa-cubes-stacked', tone: 'b' },
    { id: 'yy-dessert-13-3', name: '巧克力慕斯', desc: '可可甜品', price: 26, icon: 'fa-cubes-stacked', tone: 'c' },
    { id: 'yy-dessert-13-4', name: '榛果布朗尼', desc: '可可甜品', price: 22, icon: 'fa-cubes-stacked', tone: 'd' }
  ] },
  { id: 'yy-dessert-14', category: 'dessert', name: '贝果甜心', icon: 'fa-ring', tone: 'd', rate: '4.6', sales: '月售 1050', time: '23分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['低油烘焙'], menu: [
    { id: 'yy-dessert-14-1', name: '蓝莓乳酪贝果', desc: '甜口贝果', price: 16, icon: 'fa-ring', tone: 'a' },
    { id: 'yy-dessert-14-2', name: '肉桂苹果贝果', desc: '甜口贝果', price: 17, icon: 'fa-ring', tone: 'b' },
    { id: 'yy-dessert-14-3', name: '抹茶麻薯贝果', desc: '甜口贝果', price: 18, icon: 'fa-ring', tone: 'c' },
    { id: 'yy-dessert-14-4', name: '可可榛果贝果', desc: '甜口贝果', price: 18, icon: 'fa-ring', tone: 'd' }
  ] },
  { id: 'yy-dessert-15', category: 'dessert', name: '椰林小铺', icon: 'fa-umbrella-beach', tone: 'a', rate: '4.8', sales: '月售 1320', time: '27分钟', dist: '1.7km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['椰香限定'], menu: [
    { id: 'yy-dessert-15-1', name: '椰子冻', desc: '椰子甜品', price: 20, icon: 'fa-umbrella-beach', tone: 'a' },
    { id: 'yy-dessert-15-2', name: '椰乳斑斓糕', desc: '椰子甜品', price: 16, icon: 'fa-umbrella-beach', tone: 'b' },
    { id: 'yy-dessert-15-3', name: '芒果椰奶西米露', desc: '椰子甜品', price: 18, icon: 'fa-umbrella-beach', tone: 'c' },
    { id: 'yy-dessert-15-4', name: '椰香紫米露', desc: '椰子甜品', price: 17, icon: 'fa-umbrella-beach', tone: 'd' }
  ] },
  { id: 'yy-dessert-16', category: 'dessert', name: '泡芙云工房', icon: 'fa-cookie-bite', tone: 'b', rate: '4.8', sales: '月售 1180', time: '25分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['现点现灌'], menu: [
    { id: 'yy-dessert-16-1', name: '香草泡芙', desc: '现灌泡芙', price: 14, icon: 'fa-cookie-bite', tone: 'a' },
    { id: 'yy-dessert-16-2', name: '巧克力泡芙', desc: '现灌泡芙', price: 16, icon: 'fa-cookie-bite', tone: 'b' },
    { id: 'yy-dessert-16-3', name: '开心果泡芙', desc: '现灌泡芙', price: 18, icon: 'fa-cookie-bite', tone: 'c' },
    { id: 'yy-dessert-16-4', name: '焦糖脆皮泡芙', desc: '现灌泡芙', price: 17, icon: 'fa-cookie-bite', tone: 'd' }
  ] },
  { id: 'yy-dessert-17', category: 'dessert', name: '巴斯克小屋', icon: 'fa-cheese', tone: 'c', rate: '4.9', sales: '月售 860', time: '31分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['浓郁乳酪'], menu: [
    { id: 'yy-dessert-17-1', name: '原味巴斯克', desc: '巴斯克蛋糕', price: 26, icon: 'fa-cheese', tone: 'a' },
    { id: 'yy-dessert-17-2', name: '抹茶巴斯克', desc: '巴斯克蛋糕', price: 28, icon: 'fa-cheese', tone: 'b' },
    { id: 'yy-dessert-17-3', name: '巧克力巴斯克', desc: '巴斯克蛋糕', price: 29, icon: 'fa-cheese', tone: 'c' },
    { id: 'yy-dessert-17-4', name: '开心果巴斯克', desc: '巴斯克蛋糕', price: 32, icon: 'fa-cheese', tone: 'd' }
  ] },
  { id: 'yy-dessert-18', category: 'dessert', name: '铜锣烧日和', icon: 'fa-cookie', tone: 'd', rate: '4.7', sales: '月售 750', time: '27分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['当日现烤'], menu: [
    { id: 'yy-dessert-18-1', name: '红豆铜锣烧', desc: '日式铜锣烧', price: 12, icon: 'fa-cookie', tone: 'a' },
    { id: 'yy-dessert-18-2', name: '栗子铜锣烧', desc: '日式铜锣烧', price: 14, icon: 'fa-cookie', tone: 'b' },
    { id: 'yy-dessert-18-3', name: '抹茶奶油铜锣烧', desc: '日式铜锣烧', price: 15, icon: 'fa-cookie', tone: 'c' },
    { id: 'yy-dessert-18-4', name: '芝士铜锣烧', desc: '日式铜锣烧', price: 15, icon: 'fa-cookie', tone: 'd' }
  ] },
  { id: 'yy-dessert-19', category: 'dessert', name: '华夫街角', icon: 'fa-table-cells-large', tone: 'a', rate: '4.6', sales: '月售 1320', time: '23分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['热食现做'], menu: [
    { id: 'yy-dessert-19-1', name: '草莓奶油华夫', desc: '华夫饼甜品', price: 20, icon: 'fa-table-cells-large', tone: 'a' },
    { id: 'yy-dessert-19-2', name: '香蕉巧克力华夫', desc: '华夫饼甜品', price: 19, icon: 'fa-table-cells-large', tone: 'b' },
    { id: 'yy-dessert-19-3', name: '焦糖苹果华夫', desc: '华夫饼甜品', price: 21, icon: 'fa-table-cells-large', tone: 'c' },
    { id: 'yy-dessert-19-4', name: '原味珍珠糖华夫', desc: '华夫饼甜品', price: 15, icon: 'fa-table-cells-large', tone: 'd' }
  ] },
  { id: 'yy-dessert-20', category: 'dessert', name: '奶油卷卷社', icon: 'fa-scroll', tone: 'b', rate: '4.8', sales: '月售 940', time: '29分钟', dist: '1.8km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['轻盈奶油'], menu: [
    { id: 'yy-dessert-20-1', name: '原味牛乳卷', desc: '瑞士卷', price: 20, icon: 'fa-scroll', tone: 'a' },
    { id: 'yy-dessert-20-2', name: '抹茶红豆卷', desc: '瑞士卷', price: 22, icon: 'fa-scroll', tone: 'b' },
    { id: 'yy-dessert-20-3', name: '可可榛果卷', desc: '瑞士卷', price: 23, icon: 'fa-scroll', tone: 'c' },
    { id: 'yy-dessert-20-4', name: '芋泥肉松卷', desc: '瑞士卷', price: 22, icon: 'fa-scroll', tone: 'd' }
  ] },
  { id: 'yy-dessert-21', category: 'dessert', name: '冰淇淋花园', icon: 'fa-ice-cream', tone: 'c', rate: '4.9', sales: '月售 1650', time: '20分钟', dist: '0.7km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['低脂Gelato'], menu: [
    { id: 'yy-dessert-21-1', name: '开心果冰淇淋', desc: '意式冰淇淋', price: 18, icon: 'fa-ice-cream', tone: 'a' },
    { id: 'yy-dessert-21-2', name: '海盐焦糖冰淇淋', desc: '意式冰淇淋', price: 17, icon: 'fa-ice-cream', tone: 'b' },
    { id: 'yy-dessert-21-3', name: '树莓雪葩', desc: '意式冰淇淋', price: 16, icon: 'fa-ice-cream', tone: 'c' },
    { id: 'yy-dessert-21-4', name: '黑巧冰淇淋', desc: '意式冰淇淋', price: 18, icon: 'fa-ice-cream', tone: 'd' }
  ] },
  { id: 'yy-dessert-22', category: 'dessert', name: '木槿韩式年糕屋', icon: 'fa-cubes-stacked', tone: 'd', rate: '4.7', sales: '月售 610', time: '34分钟', dist: '2.3km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['韩式甜品'], menu: [
    { id: 'yy-dessert-22-1', name: '黄豆粉年糕', desc: '韩式甜点', price: 18, icon: 'fa-cubes-stacked', tone: 'a' },
    { id: 'yy-dessert-22-2', name: '蜂蜜米糕', desc: '韩式甜点', price: 16, icon: 'fa-cubes-stacked', tone: 'b' },
    { id: 'yy-dessert-22-3', name: '红豆糯米糕', desc: '韩式甜点', price: 17, icon: 'fa-cubes-stacked', tone: 'c' },
    { id: 'yy-dessert-22-4', name: '奶油夹心年糕', desc: '韩式甜点', price: 20, icon: 'fa-cubes-stacked', tone: 'd' }
  ] },
  { id: 'yy-dessert-23', category: 'dessert', name: '桂香酒酿铺', icon: 'fa-bowl-food', tone: 'a', rate: '4.8', sales: '月售 1250', time: '24分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥16', tags: ['手工酒酿'], menu: [
    { id: 'yy-dessert-23-1', name: '桂花酒酿圆子', desc: '酒酿甜汤', price: 16, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-dessert-23-2', name: '酒酿蛋花', desc: '酒酿甜汤', price: 15, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-dessert-23-3', name: '红糖酒酿小丸子', desc: '酒酿甜汤', price: 17, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-dessert-23-4', name: '酒酿酸奶杯', desc: '酒酿甜汤', price: 18, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-dessert-24', category: 'dessert', name: '蜂蜜蛋糕房', icon: 'fa-cake-candles', tone: 'b', rate: '4.7', sales: '月售 1880', time: '26分钟', dist: '1.3km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['出炉现切'], menu: [
    { id: 'yy-dessert-24-1', name: '原味古早蛋糕', desc: '古早蛋糕', price: 18, icon: 'fa-cake-candles', tone: 'a' },
    { id: 'yy-dessert-24-2', name: '芝士古早蛋糕', desc: '古早蛋糕', price: 22, icon: 'fa-cake-candles', tone: 'b' },
    { id: 'yy-dessert-24-3', name: '可可古早蛋糕', desc: '古早蛋糕', price: 20, icon: 'fa-cake-candles', tone: 'c' },
    { id: 'yy-dessert-24-4', name: '蜂蜜蛋糕', desc: '古早蛋糕', price: 16, icon: 'fa-cake-candles', tone: 'd' }
  ] },
  { id: 'yy-dessert-25', category: 'dessert', name: '芋泥制造所', icon: 'fa-bowl-food', tone: 'c', rate: '4.8', sales: '月售 1560', time: '25分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['真芋现蒸'], menu: [
    { id: 'yy-dessert-25-1', name: '芋泥麻薯盒子', desc: '芋泥甜品', price: 22, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-dessert-25-2', name: '芋泥奶冻杯', desc: '芋泥甜品', price: 18, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-dessert-25-3', name: '芋泥肉松小贝', desc: '芋泥甜品', price: 16, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-dessert-25-4', name: '芋圆仙草', desc: '芋泥甜品', price: 20, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-dessert-26', category: 'dessert', name: '苹果糖乐园', icon: 'fa-apple-whole', tone: 'd', rate: '4.6', sales: '月售 530', time: '28分钟', dist: '1.7km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['童趣甜点'], menu: [
    { id: 'yy-dessert-26-1', name: '晶莹苹果糖', desc: '糖果水果', price: 18, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-dessert-26-2', name: '草莓糖葫芦', desc: '糖果水果', price: 16, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-dessert-26-3', name: '山楂糖葫芦', desc: '糖果水果', price: 12, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-dessert-26-4', name: '巧克力香蕉', desc: '糖果水果', price: 15, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-dessert-27', category: 'dessert', name: '米布丁厨房', icon: 'fa-bowl-rice', tone: 'a', rate: '4.7', sales: '月售 420', time: '35分钟', dist: '2.6km', fee: '配送 ¥6', min: '起送 ¥30', tags: ['异国甜品'], menu: [
    { id: 'yy-dessert-27-1', name: '肉桂米布丁', desc: '世界米甜品', price: 18, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-dessert-27-2', name: '芒果糯米饭', desc: '世界米甜品', price: 24, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-dessert-27-3', name: '椰香黑米布丁', desc: '世界米甜品', price: 20, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-dessert-27-4', name: '西班牙牛奶米饭', desc: '世界米甜品', price: 22, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-dessert-28', category: 'dessert', name: '曲奇档案馆', icon: 'fa-cookie-bite', tone: 'b', rate: '4.9', sales: '月售 880', time: '30分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['礼盒可选'], menu: [
    { id: 'yy-dessert-28-1', name: '海盐巧克力曲奇', desc: '手工曲奇', price: 16, icon: 'fa-cookie-bite', tone: 'a' },
    { id: 'yy-dessert-28-2', name: '蔓越莓曲奇', desc: '手工曲奇', price: 14, icon: 'fa-cookie-bite', tone: 'b' },
    { id: 'yy-dessert-28-3', name: '抹茶白巧曲奇', desc: '手工曲奇', price: 17, icon: 'fa-cookie-bite', tone: 'c' },
    { id: 'yy-dessert-28-4', name: '燕麦葡萄干曲奇', desc: '手工曲奇', price: 15, icon: 'fa-cookie-bite', tone: 'd' }
  ] },
  { id: 'yy-dessert-29', category: 'dessert', name: '奶酪罐子', icon: 'fa-jar', tone: 'c', rate: '4.8', sales: '月售 690', time: '32分钟', dist: '2.2km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['冷藏鲜送'], menu: [
    { id: 'yy-dessert-29-1', name: '草莓奶酪罐', desc: '罐装慕斯', price: 22, icon: 'fa-jar', tone: 'a' },
    { id: 'yy-dessert-29-2', name: '蓝莓慕斯罐', desc: '罐装慕斯', price: 23, icon: 'fa-jar', tone: 'b' },
    { id: 'yy-dessert-29-3', name: '咖啡提拉米苏罐', desc: '罐装慕斯', price: 24, icon: 'fa-jar', tone: 'c' },
    { id: 'yy-dessert-29-4', name: '芒果酸奶罐', desc: '罐装慕斯', price: 21, icon: 'fa-jar', tone: 'd' }
  ] },
  { id: 'yy-dessert-30', category: 'dessert', name: '南法蜂蜜铺', icon: 'fa-jar-wheat', tone: 'd', rate: '4.7', sales: '月售 360', time: '38分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥35', tags: ['天然蜂蜜'], menu: [
    { id: 'yy-dessert-30-1', name: '蜂蜜柠檬玛德琳', desc: '蜂蜜甜点', price: 18, icon: 'fa-jar-wheat', tone: 'a' },
    { id: 'yy-dessert-30-2', name: '蜂蜜坚果塔', desc: '蜂蜜甜点', price: 24, icon: 'fa-jar-wheat', tone: 'b' },
    { id: 'yy-dessert-30-3', name: '薰衣草蜂蜜蛋糕', desc: '蜂蜜甜点', price: 22, icon: 'fa-jar-wheat', tone: 'c' },
    { id: 'yy-dessert-30-4', name: '蜂蜜酸奶杯', desc: '蜂蜜甜点', price: 16, icon: 'fa-jar-wheat', tone: 'd' }
  ] },
  { id: 'yy-drink-01', category: 'drink', name: '鲜萃·手作茶', icon: 'fa-mug-hot', tone: 'a', rate: '4.9', sales: '月售 5万+', time: '20分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['第二杯半价'], menu: [
    { id: 'yy-drink-01-1', name: '茉莉奶绿', desc: '鲜奶茶', price: 15, icon: 'fa-mug-hot', tone: 'a' },
    { id: 'yy-drink-01-2', name: '桂花乌龙', desc: '鲜奶茶', price: 16, icon: 'fa-mug-hot', tone: 'b' },
    { id: 'yy-drink-01-3', name: '芝士葡萄', desc: '鲜奶茶', price: 22, icon: 'fa-mug-hot', tone: 'c' },
    { id: 'yy-drink-01-4', name: '杨枝甘露', desc: '鲜奶茶', price: 20, icon: 'fa-mug-hot', tone: 'd' }
  ] },
  { id: 'yy-drink-02', category: 'drink', name: '黑石咖啡', icon: 'fa-mug-saucer', tone: 'c', rate: '4.8', sales: '月售 4200', time: '18分钟', dist: '0.4km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['咖啡豆现磨'], menu: [
    { id: 'yy-drink-02-1', name: '美式', desc: '精品咖啡', price: 12, icon: 'fa-mug-saucer', tone: 'a' },
    { id: 'yy-drink-02-2', name: '拿铁', desc: '精品咖啡', price: 18, icon: 'fa-mug-saucer', tone: 'b' },
    { id: 'yy-drink-02-3', name: '燕麦拿铁', desc: '精品咖啡', price: 21, icon: 'fa-mug-saucer', tone: 'c' },
    { id: 'yy-drink-02-4', name: '海盐焦糖冷萃', desc: '精品咖啡', price: 22, icon: 'fa-mug-saucer', tone: 'd' }
  ] },
  { id: 'yy-drink-03', category: 'drink', name: '柠檬力研究所', icon: 'fa-lemon', tone: 'd', rate: '4.7', sales: '月售 6800', time: '19分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥14', tags: ['真茶真柠檬'], menu: [
    { id: 'yy-drink-03-1', name: '招牌鸭屎香柠檬茶', desc: '手打柠檬茶', price: 16, icon: 'fa-lemon', tone: 'a' },
    { id: 'yy-drink-03-2', name: '泰绿柠檬茶', desc: '手打柠檬茶', price: 17, icon: 'fa-lemon', tone: 'b' },
    { id: 'yy-drink-03-3', name: '香水柠檬绿茶', desc: '手打柠檬茶', price: 15, icon: 'fa-lemon', tone: 'c' },
    { id: 'yy-drink-03-4', name: '苦瓜柠檬茶', desc: '手打柠檬茶', price: 18, icon: 'fa-lemon', tone: 'd' }
  ] },
  { id: 'yy-drink-04', category: 'drink', name: '果漾鲜榨站', icon: 'fa-blender', tone: 'b', rate: '4.8', sales: '月售 2100', time: '22分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['无糖现榨'], menu: [
    { id: 'yy-drink-04-1', name: '橙汁', desc: '鲜果汁', price: 18, icon: 'fa-blender', tone: 'a' },
    { id: 'yy-drink-04-2', name: '西瓜汁', desc: '鲜果汁', price: 14, icon: 'fa-blender', tone: 'b' },
    { id: 'yy-drink-04-3', name: '牛油果香蕉奶昔', desc: '鲜果汁', price: 22, icon: 'fa-blender', tone: 'c' },
    { id: 'yy-drink-04-4', name: '胡萝卜苹果汁', desc: '鲜果汁', price: 19, icon: 'fa-blender', tone: 'd' }
  ] },
  { id: 'yy-drink-05', category: 'drink', name: '山野气泡社', icon: 'fa-bottle-water', tone: 'a', rate: '4.6', sales: '月售 980', time: '24分钟', dist: '1.3km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['低糖气泡'], menu: [
    { id: 'yy-drink-05-1', name: '青提薄荷气泡', desc: '气泡饮', price: 18, icon: 'fa-bottle-water', tone: 'a' },
    { id: 'yy-drink-05-2', name: '西柚迷迭香气泡', desc: '气泡饮', price: 19, icon: 'fa-bottle-water', tone: 'b' },
    { id: 'yy-drink-05-3', name: '荔枝玫瑰气泡', desc: '气泡饮', price: 20, icon: 'fa-bottle-water', tone: 'c' },
    { id: 'yy-drink-05-4', name: '柠檬海盐苏打', desc: '气泡饮', price: 16, icon: 'fa-bottle-water', tone: 'd' }
  ] },
  { id: 'yy-drink-06', category: 'drink', name: '原叶茶寮', icon: 'fa-leaf', tone: 'd', rate: '4.9', sales: '月售 1300', time: '25分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['原叶现泡'], menu: [
    { id: 'yy-drink-06-1', name: '凤凰单丛', desc: '纯茶冷泡', price: 16, icon: 'fa-leaf', tone: 'a' },
    { id: 'yy-drink-06-2', name: '茉莉雪芽', desc: '纯茶冷泡', price: 15, icon: 'fa-leaf', tone: 'b' },
    { id: 'yy-drink-06-3', name: '桂花金萱', desc: '纯茶冷泡', price: 17, icon: 'fa-leaf', tone: 'c' },
    { id: 'yy-drink-06-4', name: '陈皮白茶', desc: '纯茶冷泡', price: 18, icon: 'fa-leaf', tone: 'd' }
  ] },
  { id: 'yy-drink-07', category: 'drink', name: '谷物生活', icon: 'fa-wheat-awn', tone: 'b', rate: '4.7', sales: '月售 1750', time: '21分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥12', tags: ['五谷现磨'], menu: [
    { id: 'yy-drink-07-1', name: '原味豆浆', desc: '豆浆谷饮', price: 7, icon: 'fa-wheat-awn', tone: 'a' },
    { id: 'yy-drink-07-2', name: '黑豆黑芝麻饮', desc: '豆浆谷饮', price: 10, icon: 'fa-wheat-awn', tone: 'b' },
    { id: 'yy-drink-07-3', name: '红枣燕麦饮', desc: '豆浆谷饮', price: 11, icon: 'fa-wheat-awn', tone: 'c' },
    { id: 'yy-drink-07-4', name: '紫薯米浆', desc: '豆浆谷饮', price: 10, icon: 'fa-wheat-awn', tone: 'd' }
  ] },
  { id: 'yy-drink-08', category: 'drink', name: '酸奶牧场', icon: 'fa-cow', tone: 'a', rate: '4.8', sales: '月售 2600', time: '23分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['鲜活乳酸菌'], menu: [
    { id: 'yy-drink-08-1', name: '紫米酸奶', desc: '酸奶昔', price: 16, icon: 'fa-cow', tone: 'a' },
    { id: 'yy-drink-08-2', name: '芒果酸奶昔', desc: '酸奶昔', price: 20, icon: 'fa-cow', tone: 'b' },
    { id: 'yy-drink-08-3', name: '牛油果酸奶昔', desc: '酸奶昔', price: 22, icon: 'fa-cow', tone: 'c' },
    { id: 'yy-drink-08-4', name: '坚果燕麦酸奶杯', desc: '酸奶昔', price: 18, icon: 'fa-cow', tone: 'd' }
  ] },
  { id: 'yy-drink-09', category: 'drink', name: '椰青补给站', icon: 'fa-tree', tone: 'd', rate: '4.7', sales: '月售 1900', time: '20分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥16', tags: ['新鲜椰青'], menu: [
    { id: 'yy-drink-09-1', name: '原只椰青', desc: '椰子饮', price: 16, icon: 'fa-tree', tone: 'a' },
    { id: 'yy-drink-09-2', name: '生椰拿铁', desc: '椰子饮', price: 19, icon: 'fa-tree', tone: 'b' },
    { id: 'yy-drink-09-3', name: '椰乳斑斓', desc: '椰子饮', price: 20, icon: 'fa-tree', tone: 'c' },
    { id: 'yy-drink-09-4', name: '芒果椰椰', desc: '椰子饮', price: 18, icon: 'fa-tree', tone: 'd' }
  ] },
  { id: 'yy-drink-10', category: 'drink', name: '可可邮局', icon: 'fa-mug-hot', tone: 'c', rate: '4.8', sales: '月售 880', time: '27分钟', dist: '1.9km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['进口可可'], menu: [
    { id: 'yy-drink-10-1', name: '经典热可可', desc: '巧克力饮品', price: 20, icon: 'fa-mug-hot', tone: 'a' },
    { id: 'yy-drink-10-2', name: '海盐可可', desc: '巧克力饮品', price: 22, icon: 'fa-mug-hot', tone: 'b' },
    { id: 'yy-drink-10-3', name: '榛果可可', desc: '巧克力饮品', price: 23, icon: 'fa-mug-hot', tone: 'c' },
    { id: 'yy-drink-10-4', name: '薄荷冰可可', desc: '巧克力饮品', price: 22, icon: 'fa-mug-hot', tone: 'd' }
  ] },
  { id: 'yy-drink-11', category: 'drink', name: '抹茶町', icon: 'fa-mortar-pestle', tone: 'a', rate: '4.9', sales: '月售 1120', time: '28分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['石磨抹茶'], menu: [
    { id: 'yy-drink-11-1', name: '抹茶拿铁', desc: '日式抹茶饮', price: 22, icon: 'fa-mortar-pestle', tone: 'a' },
    { id: 'yy-drink-11-2', name: '抹茶玄米乳', desc: '日式抹茶饮', price: 20, icon: 'fa-mortar-pestle', tone: 'b' },
    { id: 'yy-drink-11-3', name: '抹茶椰椰', desc: '日式抹茶饮', price: 23, icon: 'fa-mortar-pestle', tone: 'c' },
    { id: 'yy-drink-11-4', name: '焙茶拿铁', desc: '日式抹茶饮', price: 21, icon: 'fa-mortar-pestle', tone: 'd' }
  ] },
  { id: 'yy-drink-12', category: 'drink', name: '热带冰茶局', icon: 'fa-umbrella-beach', tone: 'b', rate: '4.6', sales: '月售 3400', time: '21分钟', dist: '0.9km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['超大杯'], menu: [
    { id: 'yy-drink-12-1', name: '百香果冰茶', desc: '水果冰茶', price: 16, icon: 'fa-umbrella-beach', tone: 'a' },
    { id: 'yy-drink-12-2', name: '菠萝青柠茶', desc: '水果冰茶', price: 17, icon: 'fa-umbrella-beach', tone: 'b' },
    { id: 'yy-drink-12-3', name: '莓果乌龙', desc: '水果冰茶', price: 18, icon: 'fa-umbrella-beach', tone: 'c' },
    { id: 'yy-drink-12-4', name: '水蜜桃茉莉', desc: '水果冰茶', price: 17, icon: 'fa-umbrella-beach', tone: 'd' }
  ] },
  { id: 'yy-drink-13', category: 'drink', name: '东方草本铺', icon: 'fa-seedling', tone: 'd', rate: '4.7', sales: '月售 760', time: '30分钟', dist: '2.2km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['温热养生'], menu: [
    { id: 'yy-drink-13-1', name: '红枣桂圆茶', desc: '养生茶饮', price: 16, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-drink-13-2', name: '陈皮雪梨汤', desc: '养生茶饮', price: 18, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-drink-13-3', name: '竹蔗茅根水', desc: '养生茶饮', price: 15, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-drink-13-4', name: '黑糖姜枣茶', desc: '养生茶饮', price: 17, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-drink-14', category: 'drink', name: '冰酿社', icon: 'fa-martini-glass-citrus', tone: 'c', rate: '4.8', sales: '月售 650', time: '32分钟', dist: '2.4km', fee: '配送 ¥6', min: '起送 ¥30', tags: ['0酒精特调'], menu: [
    { id: 'yy-drink-14-1', name: '莫吉托青柠', desc: '无酒精特调', price: 20, icon: 'fa-martini-glass-citrus', tone: 'a' },
    { id: 'yy-drink-14-2', name: '莓果日落', desc: '无酒精特调', price: 22, icon: 'fa-martini-glass-citrus', tone: 'b' },
    { id: 'yy-drink-14-3', name: '白桃乌龙特调', desc: '无酒精特调', price: 21, icon: 'fa-martini-glass-citrus', tone: 'c' },
    { id: 'yy-drink-14-4', name: '凤梨椰云', desc: '无酒精特调', price: 23, icon: 'fa-martini-glass-citrus', tone: 'd' }
  ] },
  { id: 'yy-drink-15', category: 'drink', name: '奶昔工厂', icon: 'fa-glass-water', tone: 'a', rate: '4.6', sales: '月售 1450', time: '24分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['满两杯减5'], menu: [
    { id: 'yy-drink-15-1', name: '奥利奥奶昔', desc: '浓厚奶昔', price: 20, icon: 'fa-glass-water', tone: 'a' },
    { id: 'yy-drink-15-2', name: '草莓奶昔', desc: '浓厚奶昔', price: 21, icon: 'fa-glass-water', tone: 'b' },
    { id: 'yy-drink-15-3', name: '花生香蕉奶昔', desc: '浓厚奶昔', price: 22, icon: 'fa-glass-water', tone: 'c' },
    { id: 'yy-drink-15-4', name: '香草曲奇奶昔', desc: '浓厚奶昔', price: 20, icon: 'fa-glass-water', tone: 'd' }
  ] },
  { id: 'yy-drink-16', category: 'drink', name: '冰滴时刻', icon: 'fa-droplet', tone: 'b', rate: '4.9', sales: '月售 780', time: '26分钟', dist: '1.4km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['12小时冷萃'], menu: [
    { id: 'yy-drink-16-1', name: '原味冰滴', desc: '冷萃咖啡', price: 20, icon: 'fa-droplet', tone: 'a' },
    { id: 'yy-drink-16-2', name: '柑橘冷萃', desc: '冷萃咖啡', price: 22, icon: 'fa-droplet', tone: 'b' },
    { id: 'yy-drink-16-3', name: '椰青美式', desc: '冷萃咖啡', price: 21, icon: 'fa-droplet', tone: 'c' },
    { id: 'yy-drink-16-4', name: '桂花冷萃', desc: '冷萃咖啡', price: 23, icon: 'fa-droplet', tone: 'd' }
  ] },
  { id: 'yy-drink-17', category: 'drink', name: '奶茶旧时光', icon: 'fa-glass-water', tone: 'c', rate: '4.7', sales: '月售 7200', time: '18分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥14', tags: ['珍珠免费加'], menu: [
    { id: 'yy-drink-17-1', name: '黑糖珍珠奶茶', desc: '传统珍珠奶茶', price: 14, icon: 'fa-glass-water', tone: 'a' },
    { id: 'yy-drink-17-2', name: '烤奶', desc: '传统珍珠奶茶', price: 15, icon: 'fa-glass-water', tone: 'b' },
    { id: 'yy-drink-17-3', name: '布丁奶茶', desc: '传统珍珠奶茶', price: 16, icon: 'fa-glass-water', tone: 'c' },
    { id: 'yy-drink-17-4', name: '仙草奶茶', desc: '传统珍珠奶茶', price: 16, icon: 'fa-glass-water', tone: 'd' }
  ] },
  { id: 'yy-drink-18', category: 'drink', name: '玉米罐头·谷物饮', icon: 'fa-wheat-awn', tone: 'd', rate: '4.6', sales: '月售 920', time: '24分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥16', tags: ['真材实料'], menu: [
    { id: 'yy-drink-18-1', name: '鲜榨玉米汁', desc: '粗粮饮品', price: 12, icon: 'fa-wheat-awn', tone: 'a' },
    { id: 'yy-drink-18-2', name: '山药米浆', desc: '粗粮饮品', price: 13, icon: 'fa-wheat-awn', tone: 'b' },
    { id: 'yy-drink-18-3', name: '核桃花生露', desc: '粗粮饮品', price: 14, icon: 'fa-wheat-awn', tone: 'c' },
    { id: 'yy-drink-18-4', name: '南瓜燕麦饮', desc: '粗粮饮品', price: 13, icon: 'fa-wheat-awn', tone: 'd' }
  ] },
  { id: 'yy-drink-19', category: 'drink', name: '红茶会客厅', icon: 'fa-mug-saucer', tone: 'a', rate: '4.8', sales: '月售 450', time: '35分钟', dist: '2.7km', fee: '配送 ¥6', min: '起送 ¥32', tags: ['精品茶叶'], menu: [
    { id: 'yy-drink-19-1', name: '伯爵红茶', desc: '英式红茶', price: 18, icon: 'fa-mug-saucer', tone: 'a' },
    { id: 'yy-drink-19-2', name: '英式早餐茶', desc: '英式红茶', price: 17, icon: 'fa-mug-saucer', tone: 'b' },
    { id: 'yy-drink-19-3', name: '玫瑰红茶', desc: '英式红茶', price: 19, icon: 'fa-mug-saucer', tone: 'c' },
    { id: 'yy-drink-19-4', name: '皇家奶茶', desc: '英式红茶', price: 22, icon: 'fa-mug-saucer', tone: 'd' }
  ] },
  { id: 'yy-drink-20', category: 'drink', name: '梅子事务所', icon: 'fa-bottle-droplet', tone: 'b', rate: '4.7', sales: '月售 1350', time: '23分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['酸甜开胃'], menu: [
    { id: 'yy-drink-20-1', name: '青梅绿茶', desc: '梅子饮', price: 16, icon: 'fa-bottle-droplet', tone: 'a' },
    { id: 'yy-drink-20-2', name: '紫苏梅气泡', desc: '梅子饮', price: 18, icon: 'fa-bottle-droplet', tone: 'b' },
    { id: 'yy-drink-20-3', name: '话梅柠檬水', desc: '梅子饮', price: 15, icon: 'fa-bottle-droplet', tone: 'c' },
    { id: 'yy-drink-20-4', name: '梅子冰酿', desc: '梅子饮', price: 17, icon: 'fa-bottle-droplet', tone: 'd' }
  ] },
  { id: 'yy-drink-21', category: 'drink', name: '苹果醋小站', icon: 'fa-apple-whole', tone: 'c', rate: '4.6', sales: '月售 620', time: '27分钟', dist: '1.6km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['清爽低糖'], menu: [
    { id: 'yy-drink-21-1', name: '苹果醋气泡', desc: '果醋饮品', price: 17, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-drink-21-2', name: '莓果醋饮', desc: '果醋饮品', price: 18, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-drink-21-3', name: '凤梨醋苏打', desc: '果醋饮品', price: 18, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-drink-21-4', name: '蜂蜜柚子醋', desc: '果醋饮品', price: 16, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-drink-22', category: 'drink', name: '奶盖山丘', icon: 'fa-cloud', tone: 'd', rate: '4.8', sales: '月售 3100', time: '20分钟', dist: '0.8km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['厚乳奶盖'], menu: [
    { id: 'yy-drink-22-1', name: '芝士茉莉', desc: '奶盖茶', price: 16, icon: 'fa-cloud', tone: 'a' },
    { id: 'yy-drink-22-2', name: '海盐乌龙', desc: '奶盖茶', price: 17, icon: 'fa-cloud', tone: 'b' },
    { id: 'yy-drink-22-3', name: '可可奶盖', desc: '奶盖茶', price: 18, icon: 'fa-cloud', tone: 'c' },
    { id: 'yy-drink-22-4', name: '莓果奶盖茶', desc: '奶盖茶', price: 20, icon: 'fa-cloud', tone: 'd' }
  ] },
  { id: 'yy-drink-23', category: 'drink', name: '姜汁热饮铺', icon: 'fa-fire-flame-simple', tone: 'a', rate: '4.7', sales: '月售 580', time: '29分钟', dist: '1.9km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['全线热饮'], menu: [
    { id: 'yy-drink-23-1', name: '姜汁撞奶', desc: '暖身热饮', price: 16, icon: 'fa-fire-flame-simple', tone: 'a' },
    { id: 'yy-drink-23-2', name: '黑糖姜茶', desc: '暖身热饮', price: 14, icon: 'fa-fire-flame-simple', tone: 'b' },
    { id: 'yy-drink-23-3', name: '姜汁可可', desc: '暖身热饮', price: 19, icon: 'fa-fire-flame-simple', tone: 'c' },
    { id: 'yy-drink-23-4', name: '桂圆姜枣饮', desc: '暖身热饮', price: 16, icon: 'fa-fire-flame-simple', tone: 'd' }
  ] },
  { id: 'yy-drink-24', category: 'drink', name: '冬瓜茶社', icon: 'fa-leaf', tone: 'b', rate: '4.6', sales: '月售 1750', time: '19分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['古法熬煮'], menu: [
    { id: 'yy-drink-24-1', name: '古早冬瓜茶', desc: '古早茶饮', price: 10, icon: 'fa-leaf', tone: 'a' },
    { id: 'yy-drink-24-2', name: '冬瓜柠檬', desc: '古早茶饮', price: 12, icon: 'fa-leaf', tone: 'b' },
    { id: 'yy-drink-24-3', name: '冬瓜仙草', desc: '古早茶饮', price: 13, icon: 'fa-leaf', tone: 'c' },
    { id: 'yy-drink-24-4', name: '冬瓜鲜奶', desc: '古早茶饮', price: 15, icon: 'fa-leaf', tone: 'd' }
  ] },
  { id: 'yy-drink-25', category: 'drink', name: '西米露工坊', icon: 'fa-glass-water', tone: 'c', rate: '4.8', sales: '月售 1420', time: '24分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['椰乳基底'], menu: [
    { id: 'yy-drink-25-1', name: '芒果西米露', desc: '东南亚甜饮', price: 18, icon: 'fa-glass-water', tone: 'a' },
    { id: 'yy-drink-25-2', name: '斑斓西米露', desc: '东南亚甜饮', price: 17, icon: 'fa-glass-water', tone: 'b' },
    { id: 'yy-drink-25-3', name: '红豆椰奶西米露', desc: '东南亚甜饮', price: 16, icon: 'fa-glass-water', tone: 'c' },
    { id: 'yy-drink-25-4', name: '榴莲西米露', desc: '东南亚甜饮', price: 22, icon: 'fa-glass-water', tone: 'd' }
  ] },
  { id: 'yy-drink-26', category: 'drink', name: '发酵实验室', icon: 'fa-flask', tone: 'd', rate: '4.9', sales: '月售 390', time: '38分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥35', tags: ['天然发酵'], menu: [
    { id: 'yy-drink-26-1', name: '原味康普茶', desc: '康普茶', price: 22, icon: 'fa-flask', tone: 'a' },
    { id: 'yy-drink-26-2', name: '姜柠康普茶', desc: '康普茶', price: 24, icon: 'fa-flask', tone: 'b' },
    { id: 'yy-drink-26-3', name: '莓果康普茶', desc: '康普茶', price: 25, icon: 'fa-flask', tone: 'c' },
    { id: 'yy-drink-26-4', name: '百香果康普茶', desc: '康普茶', price: 24, icon: 'fa-flask', tone: 'd' }
  ] },
  { id: 'yy-drink-27', category: 'drink', name: '冰沙海岸', icon: 'fa-snowflake', tone: 'a', rate: '4.7', sales: '月售 2250', time: '21分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['鲜果冰沙'], menu: [
    { id: 'yy-drink-27-1', name: '芒果冰沙', desc: '水果冰沙', price: 18, icon: 'fa-snowflake', tone: 'a' },
    { id: 'yy-drink-27-2', name: '西瓜冰沙', desc: '水果冰沙', price: 15, icon: 'fa-snowflake', tone: 'b' },
    { id: 'yy-drink-27-3', name: '草莓香蕉冰沙', desc: '水果冰沙', price: 20, icon: 'fa-snowflake', tone: 'c' },
    { id: 'yy-drink-27-4', name: '菠萝椰子冰沙', desc: '水果冰沙', price: 19, icon: 'fa-snowflake', tone: 'd' }
  ] },
  { id: 'yy-drink-28', category: 'drink', name: '芝麻糊先生', icon: 'fa-bowl-food', tone: 'b', rate: '4.8', sales: '月售 840', time: '26分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥18', tags: ['石磨谷物'], menu: [
    { id: 'yy-drink-28-1', name: '黑芝麻糊', desc: '中式热饮', price: 12, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-drink-28-2', name: '杏仁茶', desc: '中式热饮', price: 13, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-drink-28-3', name: '花生糊', desc: '中式热饮', price: 12, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-drink-28-4', name: '核桃露', desc: '中式热饮', price: 14, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-drink-29', category: 'drink', name: '盐汽水商店', icon: 'fa-bottle-water', tone: 'c', rate: '4.6', sales: '月售 980', time: '20分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['复古特调'], menu: [
    { id: 'yy-drink-29-1', name: '海盐柠檬汽水', desc: '复古汽水', price: 12, icon: 'fa-bottle-water', tone: 'a' },
    { id: 'yy-drink-29-2', name: '橘子汽水', desc: '复古汽水', price: 11, icon: 'fa-bottle-water', tone: 'b' },
    { id: 'yy-drink-29-3', name: '荔枝盐汽水', desc: '复古汽水', price: 13, icon: 'fa-bottle-water', tone: 'c' },
    { id: 'yy-drink-29-4', name: '酸梅气泡水', desc: '复古汽水', price: 12, icon: 'fa-bottle-water', tone: 'd' }
  ] },
  { id: 'yy-drink-30', category: 'drink', name: '花香饮集', icon: 'fa-spa', tone: 'd', rate: '4.8', sales: '月售 660', time: '30分钟', dist: '2.1km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['天然花材'], menu: [
    { id: 'yy-drink-30-1', name: '玫瑰洛神茶', desc: '花茶饮品', price: 17, icon: 'fa-spa', tone: 'a' },
    { id: 'yy-drink-30-2', name: '桂花雪梨茶', desc: '花茶饮品', price: 18, icon: 'fa-spa', tone: 'b' },
    { id: 'yy-drink-30-3', name: '菊花枸杞茶', desc: '花茶饮品', price: 16, icon: 'fa-spa', tone: 'c' },
    { id: 'yy-drink-30-4', name: '蝶豆花柠檬茶', desc: '花茶饮品', price: 19, icon: 'fa-spa', tone: 'd' }
  ] },
  { id: 'yy-market-01', category: 'market', name: '小满生活超市', icon: 'fa-basket-shopping', tone: 'a', rate: '4.8', sales: '月售 8000', time: '25分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['30分钟达'], menu: [
    { id: 'yy-market-01-1', name: '纯牛奶', desc: '综合便利', price: 12, icon: 'fa-basket-shopping', tone: 'a' },
    { id: 'yy-market-01-2', name: '鸡蛋10枚', desc: '综合便利', price: 15, icon: 'fa-basket-shopping', tone: 'b' },
    { id: 'yy-market-01-3', name: '抽纸3包', desc: '综合便利', price: 18, icon: 'fa-basket-shopping', tone: 'c' },
    { id: 'yy-market-01-4', name: '矿泉水6瓶', desc: '综合便利', price: 12, icon: 'fa-basket-shopping', tone: 'd' }
  ] },
  { id: 'yy-market-02', category: 'market', name: '深夜便利站', icon: 'fa-store', tone: 'c', rate: '4.7', sales: '月售 5200', time: '20分钟', dist: '0.5km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['24小时营业'], menu: [
    { id: 'yy-market-02-1', name: '泡面', desc: '24小时便利店', price: 6, icon: 'fa-store', tone: 'a' },
    { id: 'yy-market-02-2', name: '火腿肠', desc: '24小时便利店', price: 4, icon: 'fa-store', tone: 'b' },
    { id: 'yy-market-02-3', name: '饭团', desc: '24小时便利店', price: 9, icon: 'fa-store', tone: 'c' },
    { id: 'yy-market-02-4', name: '瓶装咖啡', desc: '24小时便利店', price: 12, icon: 'fa-store', tone: 'd' }
  ] },
  { id: 'yy-market-03', category: 'market', name: '冰箱补给社', icon: 'fa-snowflake', tone: 'b', rate: '4.6', sales: '月售 1700', time: '30分钟', dist: '1.5km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['冷链配送'], menu: [
    { id: 'yy-market-03-1', name: '速冻水饺', desc: '冷冻速食', price: 22, icon: 'fa-snowflake', tone: 'a' },
    { id: 'yy-market-03-2', name: '披萨', desc: '冷冻速食', price: 28, icon: 'fa-snowflake', tone: 'b' },
    { id: 'yy-market-03-3', name: '手抓饼', desc: '冷冻速食', price: 15, icon: 'fa-snowflake', tone: 'c' },
    { id: 'yy-market-03-4', name: '牛肉丸', desc: '冷冻速食', price: 25, icon: 'fa-snowflake', tone: 'd' }
  ] },
  { id: 'yy-market-04', category: 'market', name: '好味粮油铺', icon: 'fa-wheat-awn', tone: 'd', rate: '4.8', sales: '月售 980', time: '38分钟', dist: '2.6km', fee: '配送 ¥6', min: '起送 ¥40', tags: ['家庭囤货'], menu: [
    { id: 'yy-market-04-1', name: '五常大米5kg', desc: '米面粮油', price: 58, icon: 'fa-wheat-awn', tone: 'a' },
    { id: 'yy-market-04-2', name: '花生油1.8L', desc: '米面粮油', price: 42, icon: 'fa-wheat-awn', tone: 'b' },
    { id: 'yy-market-04-3', name: '高筋面粉2.5kg', desc: '米面粮油', price: 24, icon: 'fa-wheat-awn', tone: 'c' },
    { id: 'yy-market-04-4', name: '挂面5包', desc: '米面粮油', price: 18, icon: 'fa-wheat-awn', tone: 'd' }
  ] },
  { id: 'yy-market-05', category: 'market', name: '洁净日用馆', icon: 'fa-pump-soap', tone: 'a', rate: '4.7', sales: '月售 1250', time: '32分钟', dist: '1.8km', fee: '配送 ¥4', min: '起送 ¥28', tags: ['日用满减'], menu: [
    { id: 'yy-market-05-1', name: '洗衣液2kg', desc: '清洁用品', price: 32, icon: 'fa-pump-soap', tone: 'a' },
    { id: 'yy-market-05-2', name: '洗洁精', desc: '清洁用品', price: 12, icon: 'fa-pump-soap', tone: 'b' },
    { id: 'yy-market-05-3', name: '垃圾袋', desc: '清洁用品', price: 10, icon: 'fa-pump-soap', tone: 'c' },
    { id: 'yy-market-05-4', name: '消毒湿巾', desc: '清洁用品', price: 16, icon: 'fa-pump-soap', tone: 'd' }
  ] },
  { id: 'yy-market-06', category: 'market', name: '毛孩子补给站', icon: 'fa-paw', tone: 'c', rate: '4.9', sales: '月售 760', time: '35分钟', dist: '2.2km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['宠物专营'], menu: [
    { id: 'yy-market-06-1', name: '猫粮1kg', desc: '宠物用品', price: 48, icon: 'fa-paw', tone: 'a' },
    { id: 'yy-market-06-2', name: '狗粮1kg', desc: '宠物用品', price: 45, icon: 'fa-paw', tone: 'b' },
    { id: 'yy-market-06-3', name: '猫砂6L', desc: '宠物用品', price: 28, icon: 'fa-paw', tone: 'c' },
    { id: 'yy-market-06-4', name: '鸡肉冻干', desc: '宠物用品', price: 25, icon: 'fa-paw', tone: 'd' }
  ] },
  { id: 'yy-market-07', category: 'market', name: '宝宝安心店', icon: 'fa-baby', tone: 'b', rate: '4.8', sales: '月售 540', time: '40分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥45', tags: ['母婴精选'], menu: [
    { id: 'yy-market-07-1', name: '婴儿湿巾', desc: '母婴用品', price: 18, icon: 'fa-baby', tone: 'a' },
    { id: 'yy-market-07-2', name: '纸尿裤试用装', desc: '母婴用品', price: 25, icon: 'fa-baby', tone: 'b' },
    { id: 'yy-market-07-3', name: '儿童牛奶', desc: '母婴用品', price: 22, icon: 'fa-baby', tone: 'c' },
    { id: 'yy-market-07-4', name: '婴儿米饼', desc: '母婴用品', price: 16, icon: 'fa-baby', tone: 'd' }
  ] },
  { id: 'yy-market-08', category: 'market', name: '文具急送', icon: 'fa-pen', tone: 'd', rate: '4.7', sales: '月售 860', time: '24分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['学习补给'], menu: [
    { id: 'yy-market-08-1', name: '中性笔5支', desc: '学习办公', price: 12, icon: 'fa-pen', tone: 'a' },
    { id: 'yy-market-08-2', name: 'A4打印纸', desc: '学习办公', price: 25, icon: 'fa-pen', tone: 'b' },
    { id: 'yy-market-08-3', name: '笔记本', desc: '学习办公', price: 10, icon: 'fa-pen', tone: 'c' },
    { id: 'yy-market-08-4', name: '彩色马克笔', desc: '学习办公', price: 18, icon: 'fa-pen', tone: 'd' }
  ] },
  { id: 'yy-market-09', category: 'market', name: '花与生活', icon: 'fa-seedling', tone: 'a', rate: '4.8', sales: '月售 620', time: '45分钟', dist: '3.5km', fee: '配送 ¥8', min: '起送 ¥45', tags: ['鲜花现包'], menu: [
    { id: 'yy-market-09-1', name: '向日葵花束', desc: '鲜花绿植', price: 58, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-market-09-2', name: '香槟玫瑰花束', desc: '鲜花绿植', price: 88, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-market-09-3', name: '尤加利小束', desc: '鲜花绿植', price: 22, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-market-09-4', name: '多肉盆栽', desc: '鲜花绿植', price: 18, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-market-10', category: 'market', name: '烘焙材料局', icon: 'fa-cookie-bite', tone: 'c', rate: '4.6', sales: '月售 430', time: '36分钟', dist: '2.8km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['烘焙专营'], menu: [
    { id: 'yy-market-10-1', name: '低筋面粉', desc: '烘焙原料', price: 15, icon: 'fa-cookie-bite', tone: 'a' },
    { id: 'yy-market-10-2', name: '淡奶油', desc: '烘焙原料', price: 28, icon: 'fa-cookie-bite', tone: 'b' },
    { id: 'yy-market-10-3', name: '黄油', desc: '烘焙原料', price: 22, icon: 'fa-cookie-bite', tone: 'c' },
    { id: 'yy-market-10-4', name: '巧克力豆', desc: '烘焙原料', price: 18, icon: 'fa-cookie-bite', tone: 'd' }
  ] },
  { id: 'yy-market-11', category: 'market', name: '酒水收藏室', icon: 'fa-wine-bottle', tone: 'b', rate: '4.8', sales: '月售 1150', time: '30分钟', dist: '1.7km', fee: '配送 ¥5', min: '起送 ¥40', tags: ['年满18岁'], menu: [
    { id: 'yy-market-11-1', name: '精酿啤酒4瓶', desc: '酒水饮料', price: 48, icon: 'fa-wine-bottle', tone: 'a' },
    { id: 'yy-market-11-2', name: '梅子酒', desc: '酒水饮料', price: 68, icon: 'fa-wine-bottle', tone: 'b' },
    { id: 'yy-market-11-3', name: '气泡酒', desc: '酒水饮料', price: 72, icon: 'fa-wine-bottle', tone: 'c' },
    { id: 'yy-market-11-4', name: '苏打水6瓶', desc: '酒水饮料', price: 18, icon: 'fa-wine-bottle', tone: 'd' }
  ] },
  { id: 'yy-market-12', category: 'market', name: '家庭药箱', icon: 'fa-kit-medical', tone: 'd', rate: '4.9', sales: '月售 900', time: '22分钟', dist: '0.9km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['隐私配送'], menu: [
    { id: 'yy-market-12-1', name: '创可贴', desc: '常备护理', price: 12, icon: 'fa-kit-medical', tone: 'a' },
    { id: 'yy-market-12-2', name: '医用棉签', desc: '常备护理', price: 8, icon: 'fa-kit-medical', tone: 'b' },
    { id: 'yy-market-12-3', name: '退热贴', desc: '常备护理', price: 18, icon: 'fa-kit-medical', tone: 'c' },
    { id: 'yy-market-12-4', name: '碘伏棉棒', desc: '常备护理', price: 15, icon: 'fa-kit-medical', tone: 'd' }
  ] },
  { id: 'yy-market-13', category: 'market', name: '厨房鲜配', icon: 'fa-carrot', tone: 'a', rate: '4.7', sales: '月售 2300', time: '28分钟', dist: '1.3km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['菜品已清洗'], menu: [
    { id: 'yy-market-13-1', name: '番茄炒蛋配菜', desc: '生鲜净菜', price: 15, icon: 'fa-carrot', tone: 'a' },
    { id: 'yy-market-13-2', name: '宫保鸡丁配菜', desc: '生鲜净菜', price: 26, icon: 'fa-carrot', tone: 'b' },
    { id: 'yy-market-13-3', name: '火锅蔬菜包', desc: '生鲜净菜', price: 22, icon: 'fa-carrot', tone: 'c' },
    { id: 'yy-market-13-4', name: '葱姜蒜组合', desc: '生鲜净菜', price: 8, icon: 'fa-carrot', tone: 'd' }
  ] },
  { id: 'yy-market-14', category: 'market', name: '零食仓库', icon: 'fa-cookie', tone: 'c', rate: '4.6', sales: '月售 6800', time: '19分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['满39减8'], menu: [
    { id: 'yy-market-14-1', name: '薯片', desc: '进口与国民零食', price: 8, icon: 'fa-cookie', tone: 'a' },
    { id: 'yy-market-14-2', name: '巧克力', desc: '进口与国民零食', price: 12, icon: 'fa-cookie', tone: 'b' },
    { id: 'yy-market-14-3', name: '海苔', desc: '进口与国民零食', price: 10, icon: 'fa-cookie', tone: 'c' },
    { id: 'yy-market-14-4', name: '坚果混合包', desc: '进口与国民零食', price: 18, icon: 'fa-cookie', tone: 'd' }
  ] },
  { id: 'yy-market-15', category: 'market', name: '数码应急站', icon: 'fa-mobile-screen-button', tone: 'b', rate: '4.7', sales: '月售 580', time: '33分钟', dist: '2.1km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['应急速达'], menu: [
    { id: 'yy-market-15-1', name: '数据线', desc: '手机配件', price: 25, icon: 'fa-mobile-screen-button', tone: 'a' },
    { id: 'yy-market-15-2', name: '快充头', desc: '手机配件', price: 48, icon: 'fa-mobile-screen-button', tone: 'b' },
    { id: 'yy-market-15-3', name: '有线耳机', desc: '手机配件', price: 35, icon: 'fa-mobile-screen-button', tone: 'c' },
    { id: 'yy-market-15-4', name: '手机支架', desc: '手机配件', price: 18, icon: 'fa-mobile-screen-button', tone: 'd' }
  ] },
  { id: 'yy-market-16', category: 'market', name: '浴室补给仓', icon: 'fa-shower', tone: 'c', rate: '4.8', sales: '月售 1180', time: '28分钟', dist: '1.4km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['洗护满减'], menu: [
    { id: 'yy-market-16-1', name: '洗发水', desc: '洗护用品', price: 38, icon: 'fa-shower', tone: 'a' },
    { id: 'yy-market-16-2', name: '沐浴露', desc: '洗护用品', price: 32, icon: 'fa-shower', tone: 'b' },
    { id: 'yy-market-16-3', name: '牙膏', desc: '洗护用品', price: 15, icon: 'fa-shower', tone: 'c' },
    { id: 'yy-market-16-4', name: '毛巾', desc: '洗护用品', price: 18, icon: 'fa-shower', tone: 'd' }
  ] },
  { id: 'yy-market-17', category: 'market', name: '咖啡家庭馆', icon: 'fa-mug-saucer', tone: 'd', rate: '4.7', sales: '月售 620', time: '34分钟', dist: '2.3km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['咖啡专营'], menu: [
    { id: 'yy-market-17-1', name: '咖啡豆250g', desc: '咖啡耗材', price: 58, icon: 'fa-mug-saucer', tone: 'a' },
    { id: 'yy-market-17-2', name: '挂耳咖啡10包', desc: '咖啡耗材', price: 42, icon: 'fa-mug-saucer', tone: 'b' },
    { id: 'yy-market-17-3', name: '滤纸', desc: '咖啡耗材', price: 18, icon: 'fa-mug-saucer', tone: 'c' },
    { id: 'yy-market-17-4', name: '燕麦奶', desc: '咖啡耗材', price: 22, icon: 'fa-mug-saucer', tone: 'd' }
  ] },
  { id: 'yy-market-18', category: 'market', name: '茶叶小仓', icon: 'fa-leaf', tone: 'a', rate: '4.8', sales: '月售 480', time: '37分钟', dist: '2.8km', fee: '配送 ¥6', min: '起送 ¥40', tags: ['原产地茶叶'], menu: [
    { id: 'yy-market-18-1', name: '茉莉花茶50g', desc: '家庭茶叶', price: 28, icon: 'fa-leaf', tone: 'a' },
    { id: 'yy-market-18-2', name: '乌龙茶50g', desc: '家庭茶叶', price: 35, icon: 'fa-leaf', tone: 'b' },
    { id: 'yy-market-18-3', name: '白茶饼', desc: '家庭茶叶', price: 68, icon: 'fa-leaf', tone: 'c' },
    { id: 'yy-market-18-4', name: '冷泡茶包', desc: '家庭茶叶', price: 20, icon: 'fa-leaf', tone: 'd' }
  ] },
  { id: 'yy-market-19', category: 'market', name: '宿舍补给站', icon: 'fa-building', tone: 'b', rate: '4.6', sales: '月售 2050', time: '24分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['学生优惠'], menu: [
    { id: 'yy-market-19-1', name: '衣架10个', desc: '宿舍用品', price: 15, icon: 'fa-building', tone: 'a' },
    { id: 'yy-market-19-2', name: '拖鞋', desc: '宿舍用品', price: 18, icon: 'fa-building', tone: 'b' },
    { id: 'yy-market-19-3', name: '插线板', desc: '宿舍用品', price: 35, icon: 'fa-building', tone: 'c' },
    { id: 'yy-market-19-4', name: '收纳盒', desc: '宿舍用品', price: 22, icon: 'fa-building', tone: 'd' }
  ] },
  { id: 'yy-market-20', category: 'market', name: '户外应急铺', icon: 'fa-campground', tone: 'c', rate: '4.7', sales: '月售 360', time: '42分钟', dist: '3.2km', fee: '配送 ¥8', min: '起送 ¥45', tags: ['户外专营'], menu: [
    { id: 'yy-market-20-1', name: '便携雨衣', desc: '户外用品', price: 12, icon: 'fa-campground', tone: 'a' },
    { id: 'yy-market-20-2', name: '手电筒', desc: '户外用品', price: 28, icon: 'fa-campground', tone: 'b' },
    { id: 'yy-market-20-3', name: '驱蚊喷雾', desc: '户外用品', price: 18, icon: 'fa-campground', tone: 'c' },
    { id: 'yy-market-20-4', name: '野餐垫', desc: '户外用品', price: 38, icon: 'fa-campground', tone: 'd' }
  ] },
  { id: 'yy-market-21', category: 'market', name: '派对便利店', icon: 'fa-champagne-glasses', tone: 'd', rate: '4.8', sales: '月售 930', time: '26分钟', dist: '1.2km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['聚会急送'], menu: [
    { id: 'yy-market-21-1', name: '纸杯20只', desc: '聚会用品', price: 12, icon: 'fa-champagne-glasses', tone: 'a' },
    { id: 'yy-market-21-2', name: '扑克牌', desc: '聚会用品', price: 8, icon: 'fa-champagne-glasses', tone: 'b' },
    { id: 'yy-market-21-3', name: '生日蜡烛', desc: '聚会用品', price: 10, icon: 'fa-champagne-glasses', tone: 'c' },
    { id: 'yy-market-21-4', name: '气球套装', desc: '聚会用品', price: 22, icon: 'fa-champagne-glasses', tone: 'd' }
  ] },
  { id: 'yy-market-22', category: 'market', name: '无糖生活馆', icon: 'fa-heart-pulse', tone: 'a', rate: '4.9', sales: '月售 710', time: '31分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['低糖精选'], menu: [
    { id: 'yy-market-22-1', name: '无糖饼干', desc: '低糖食品', price: 18, icon: 'fa-heart-pulse', tone: 'a' },
    { id: 'yy-market-22-2', name: '零糖可乐6瓶', desc: '低糖食品', price: 24, icon: 'fa-heart-pulse', tone: 'b' },
    { id: 'yy-market-22-3', name: '代糖', desc: '低糖食品', price: 15, icon: 'fa-heart-pulse', tone: 'c' },
    { id: 'yy-market-22-4', name: '低脂麦片', desc: '低糖食品', price: 28, icon: 'fa-heart-pulse', tone: 'd' }
  ] },
  { id: 'yy-market-23', category: 'market', name: '世界调味铺', icon: 'fa-pepper-hot', tone: 'b', rate: '4.7', sales: '月售 440', time: '38分钟', dist: '2.9km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['异国调味'], menu: [
    { id: 'yy-market-23-1', name: '泰式甜辣酱', desc: '进口调味品', price: 18, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-market-23-2', name: '日式咖喱块', desc: '进口调味品', price: 22, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-market-23-3', name: '意面酱', desc: '进口调味品', price: 25, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-market-23-4', name: '墨西哥辣椒酱', desc: '进口调味品', price: 20, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-market-24', category: 'market', name: '手作材料屋', icon: 'fa-scissors', tone: 'c', rate: '4.8', sales: '月售 320', time: '40分钟', dist: '3.1km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['DIY专营'], menu: [
    { id: 'yy-market-24-1', name: '彩色卡纸', desc: '手工材料', price: 18, icon: 'fa-scissors', tone: 'a' },
    { id: 'yy-market-24-2', name: '黏土套装', desc: '手工材料', price: 28, icon: 'fa-scissors', tone: 'b' },
    { id: 'yy-market-24-3', name: '毛线2团', desc: '手工材料', price: 22, icon: 'fa-scissors', tone: 'c' },
    { id: 'yy-market-24-4', name: '串珠材料包', desc: '手工材料', price: 25, icon: 'fa-scissors', tone: 'd' }
  ] },
  { id: 'yy-market-25', category: 'market', name: '内衣袜品急送', icon: 'fa-socks', tone: 'd', rate: '4.6', sales: '月售 850', time: '29分钟', dist: '1.7km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['独立包装'], menu: [
    { id: 'yy-market-25-1', name: '棉袜3双', desc: '贴身衣物', price: 22, icon: 'fa-socks', tone: 'a' },
    { id: 'yy-market-25-2', name: '一次性内裤5条', desc: '贴身衣物', price: 25, icon: 'fa-socks', tone: 'b' },
    { id: 'yy-market-25-3', name: '居家拖鞋', desc: '贴身衣物', price: 20, icon: 'fa-socks', tone: 'c' },
    { id: 'yy-market-25-4', name: '保暖袜', desc: '贴身衣物', price: 18, icon: 'fa-socks', tone: 'd' }
  ] },
  { id: 'yy-market-26', category: 'market', name: '旅行小卖部', icon: 'fa-suitcase-rolling', tone: 'a', rate: '4.7', sales: '月售 570', time: '32分钟', dist: '2.1km', fee: '配送 ¥6', min: '起送 ¥32', tags: ['出行必备'], menu: [
    { id: 'yy-market-26-1', name: '分装瓶套装', desc: '旅行用品', price: 15, icon: 'fa-suitcase-rolling', tone: 'a' },
    { id: 'yy-market-26-2', name: '旅行牙具', desc: '旅行用品', price: 10, icon: 'fa-suitcase-rolling', tone: 'b' },
    { id: 'yy-market-26-3', name: 'U形枕', desc: '旅行用品', price: 28, icon: 'fa-suitcase-rolling', tone: 'c' },
    { id: 'yy-market-26-4', name: '行李牌', desc: '旅行用品', price: 12, icon: 'fa-suitcase-rolling', tone: 'd' }
  ] },
  { id: 'yy-market-27', category: 'market', name: '居家工具箱', icon: 'fa-screwdriver-wrench', tone: 'b', rate: '4.8', sales: '月售 490', time: '35分钟', dist: '2.5km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['家庭维修'], menu: [
    { id: 'yy-market-27-1', name: '螺丝刀套装', desc: '五金工具', price: 35, icon: 'fa-screwdriver-wrench', tone: 'a' },
    { id: 'yy-market-27-2', name: '卷尺', desc: '五金工具', price: 12, icon: 'fa-screwdriver-wrench', tone: 'b' },
    { id: 'yy-market-27-3', name: '强力胶', desc: '五金工具', price: 10, icon: 'fa-screwdriver-wrench', tone: 'c' },
    { id: 'yy-market-27-4', name: '电池8粒', desc: '五金工具', price: 18, icon: 'fa-screwdriver-wrench', tone: 'd' }
  ] },
  { id: 'yy-market-28', category: 'market', name: '影音零售站', icon: 'fa-headphones', tone: 'c', rate: '4.6', sales: '月售 410', time: '39分钟', dist: '2.8km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['数码配件'], menu: [
    { id: 'yy-market-28-1', name: '蓝牙耳机', desc: '影音耗材', price: 68, icon: 'fa-headphones', tone: 'a' },
    { id: 'yy-market-28-2', name: '音频转接线', desc: '影音耗材', price: 22, icon: 'fa-headphones', tone: 'b' },
    { id: 'yy-market-28-3', name: '麦克风防喷罩', desc: '影音耗材', price: 18, icon: 'fa-headphones', tone: 'c' },
    { id: 'yy-market-28-4', name: '遥控器电池', desc: '影音耗材', price: 12, icon: 'fa-headphones', tone: 'd' }
  ] },
  { id: 'yy-market-29', category: 'market', name: '节日装饰仓', icon: 'fa-gift', tone: 'd', rate: '4.7', sales: '月售 680', time: '33分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['节日限定'], menu: [
    { id: 'yy-market-29-1', name: '彩灯串', desc: '节庆用品', price: 28, icon: 'fa-gift', tone: 'a' },
    { id: 'yy-market-29-2', name: '礼品包装纸', desc: '节庆用品', price: 12, icon: 'fa-gift', tone: 'b' },
    { id: 'yy-market-29-3', name: '红包袋', desc: '节庆用品', price: 10, icon: 'fa-gift', tone: 'c' },
    { id: 'yy-market-29-4', name: '桌面装饰套装', desc: '节庆用品', price: 25, icon: 'fa-gift', tone: 'd' }
  ] },
  { id: 'yy-market-30', category: 'market', name: '有机生活市集', icon: 'fa-seedling', tone: 'a', rate: '4.9', sales: '月售 530', time: '41分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥45', tags: ['有机认证'], menu: [
    { id: 'yy-market-30-1', name: '有机鸡蛋10枚', desc: '有机食品', price: 28, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-market-30-2', name: '有机牛奶', desc: '有机食品', price: 18, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-market-30-3', name: '有机糙米1kg', desc: '有机食品', price: 26, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-market-30-4', name: '有机生菜', desc: '有机食品', price: 12, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-fruit-01', category: 'fruit', name: '鲜果每日', icon: 'fa-apple-whole', tone: 'a', rate: '4.8', sales: '月售 4200', time: '22分钟', dist: '0.7km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['坏果包赔'], menu: [
    { id: 'yy-fruit-01-1', name: '红富士苹果4个', desc: '综合鲜果', price: 18, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-fruit-01-2', name: '香蕉1kg', desc: '综合鲜果', price: 12, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-fruit-01-3', name: '橙子4个', desc: '综合鲜果', price: 20, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-fruit-01-4', name: '香梨4个', desc: '综合鲜果', price: 16, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-fruit-02', category: 'fruit', name: '西域甜果铺', icon: 'fa-sun', tone: 'd', rate: '4.9', sales: '月售 1350', time: '32分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['产地直发'], menu: [
    { id: 'yy-fruit-02-1', name: '哈密瓜半只', desc: '新疆水果', price: 28, icon: 'fa-sun', tone: 'a' },
    { id: 'yy-fruit-02-2', name: '库尔勒香梨6个', desc: '新疆水果', price: 24, icon: 'fa-sun', tone: 'b' },
    { id: 'yy-fruit-02-3', name: '西梅500g', desc: '新疆水果', price: 26, icon: 'fa-sun', tone: 'c' },
    { id: 'yy-fruit-02-4', name: '无核白葡萄500g', desc: '新疆水果', price: 30, icon: 'fa-sun', tone: 'd' }
  ] },
  { id: 'yy-fruit-03', category: 'fruit', name: '热带果园', icon: 'fa-umbrella-beach', tone: 'b', rate: '4.7', sales: '月售 1800', time: '28分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['热带精选'], menu: [
    { id: 'yy-fruit-03-1', name: '金钻凤梨', desc: '热带水果', price: 22, icon: 'fa-umbrella-beach', tone: 'a' },
    { id: 'yy-fruit-03-2', name: '芒果4个', desc: '热带水果', price: 28, icon: 'fa-umbrella-beach', tone: 'b' },
    { id: 'yy-fruit-03-3', name: '红心火龙果2个', desc: '热带水果', price: 20, icon: 'fa-umbrella-beach', tone: 'c' },
    { id: 'yy-fruit-03-4', name: '椰青2个', desc: '热带水果', price: 26, icon: 'fa-umbrella-beach', tone: 'd' }
  ] },
  { id: 'yy-fruit-04', category: 'fruit', name: '莓好时光', icon: 'fa-stroopwafel', tone: 'c', rate: '4.8', sales: '月售 760', time: '35分钟', dist: '2.6km', fee: '配送 ¥6', min: '起送 ¥38', tags: ['冷链鲜送'], menu: [
    { id: 'yy-fruit-04-1', name: '草莓500g', desc: '莓果专营', price: 32, icon: 'fa-stroopwafel', tone: 'a' },
    { id: 'yy-fruit-04-2', name: '蓝莓125g', desc: '莓果专营', price: 22, icon: 'fa-stroopwafel', tone: 'b' },
    { id: 'yy-fruit-04-3', name: '树莓125g', desc: '莓果专营', price: 28, icon: 'fa-stroopwafel', tone: 'c' },
    { id: 'yy-fruit-04-4', name: '桑葚250g', desc: '莓果专营', price: 24, icon: 'fa-stroopwafel', tone: 'd' }
  ] },
  { id: 'yy-fruit-05', category: 'fruit', name: '柑橘星球', icon: 'fa-lemon', tone: 'a', rate: '4.7', sales: '月售 2200', time: '24分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['多汁推荐'], menu: [
    { id: 'yy-fruit-05-1', name: '赣南脐橙4个', desc: '橙柚柑橘', price: 24, icon: 'fa-lemon', tone: 'a' },
    { id: 'yy-fruit-05-2', name: '蜜桔1kg', desc: '橙柚柑橘', price: 18, icon: 'fa-lemon', tone: 'b' },
    { id: 'yy-fruit-05-3', name: '红心柚半只', desc: '橙柚柑橘', price: 16, icon: 'fa-lemon', tone: 'c' },
    { id: 'yy-fruit-05-4', name: '柠檬4个', desc: '橙柚柑橘', price: 12, icon: 'fa-lemon', tone: 'd' }
  ] },
  { id: 'yy-fruit-06', category: 'fruit', name: '果切小站', icon: 'fa-bowl-food', tone: 'd', rate: '4.6', sales: '月售 5800', time: '18分钟', dist: '0.4km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['现切现送'], menu: [
    { id: 'yy-fruit-06-1', name: '缤纷果切杯', desc: '即食果切', price: 16, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-fruit-06-2', name: '西瓜果切盒', desc: '即食果切', price: 12, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-fruit-06-3', name: '凤梨芒果双拼', desc: '即食果切', price: 18, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-fruit-06-4', name: '低糖水果盒', desc: '即食果切', price: 20, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-fruit-07', category: 'fruit', name: '轻果盒子', icon: 'fa-dumbbell', tone: 'b', rate: '4.8', sales: '月售 940', time: '26分钟', dist: '1.3km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['热量标注'], menu: [
    { id: 'yy-fruit-07-1', name: '高纤水果盒', desc: '健身水果餐', price: 22, icon: 'fa-dumbbell', tone: 'a' },
    { id: 'yy-fruit-07-2', name: '高蛋白酸奶果盒', desc: '健身水果餐', price: 28, icon: 'fa-dumbbell', tone: 'b' },
    { id: 'yy-fruit-07-3', name: '低糖莓果盒', desc: '健身水果餐', price: 26, icon: 'fa-dumbbell', tone: 'c' },
    { id: 'yy-fruit-07-4', name: '牛油果能量盒', desc: '健身水果餐', price: 30, icon: 'fa-dumbbell', tone: 'd' }
  ] },
  { id: 'yy-fruit-08', category: 'fruit', name: '榴莲仓', icon: 'fa-crown', tone: 'c', rate: '4.9', sales: '月售 680', time: '40分钟', dist: '3.1km', fee: '配送 ¥8', min: '起送 ¥60', tags: ['足秤包房'], menu: [
    { id: 'yy-fruit-08-1', name: '金枕榴莲肉250g', desc: '榴莲专营', price: 58, icon: 'fa-crown', tone: 'a' },
    { id: 'yy-fruit-08-2', name: '猫山王榴莲肉200g', desc: '榴莲专营', price: 88, icon: 'fa-crown', tone: 'b' },
    { id: 'yy-fruit-08-3', name: '榴莲千层', desc: '榴莲专营', price: 28, icon: 'fa-crown', tone: 'c' },
    { id: 'yy-fruit-08-4', name: '榴莲糯米饭', desc: '榴莲专营', price: 26, icon: 'fa-crown', tone: 'd' }
  ] },
  { id: 'yy-fruit-09', category: 'fruit', name: '葡萄酒庄园', icon: 'fa-wine-glass', tone: 'a', rate: '4.7', sales: '月售 720', time: '34分钟', dist: '2.4km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['精品葡萄'], menu: [
    { id: 'yy-fruit-09-1', name: '阳光玫瑰500g', desc: '鲜食葡萄', price: 36, icon: 'fa-wine-glass', tone: 'a' },
    { id: 'yy-fruit-09-2', name: '巨峰葡萄500g', desc: '鲜食葡萄', price: 24, icon: 'fa-wine-glass', tone: 'b' },
    { id: 'yy-fruit-09-3', name: '夏黑葡萄500g', desc: '鲜食葡萄', price: 26, icon: 'fa-wine-glass', tone: 'c' },
    { id: 'yy-fruit-09-4', name: '红提500g', desc: '鲜食葡萄', price: 22, icon: 'fa-wine-glass', tone: 'd' }
  ] },
  { id: 'yy-fruit-10', category: 'fruit', name: '西瓜研究所', icon: 'fa-circle', tone: 'd', rate: '4.6', sales: '月售 3100', time: '20分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['冰镇可选'], menu: [
    { id: 'yy-fruit-10-1', name: '麒麟西瓜半只', desc: '瓜类专营', price: 24, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-fruit-10-2', name: '小糖丸西瓜1只', desc: '瓜类专营', price: 28, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-fruit-10-3', name: '哈密瓜半只', desc: '瓜类专营', price: 25, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-fruit-10-4', name: '香瓜2只', desc: '瓜类专营', price: 18, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-fruit-11', category: 'fruit', name: '奇异果屋', icon: 'fa-earth-asia', tone: 'b', rate: '4.8', sales: '月售 630', time: '38分钟', dist: '2.9km', fee: '配送 ¥7', min: '起送 ¥45', tags: ['进口精选'], menu: [
    { id: 'yy-fruit-11-1', name: '金奇异果4个', desc: '进口水果', price: 32, icon: 'fa-earth-asia', tone: 'a' },
    { id: 'yy-fruit-11-2', name: '车厘子250g', desc: '进口水果', price: 48, icon: 'fa-earth-asia', tone: 'b' },
    { id: 'yy-fruit-11-3', name: '牛油果2个', desc: '进口水果', price: 22, icon: 'fa-earth-asia', tone: 'c' },
    { id: 'yy-fruit-11-4', name: '进口青苹果4个', desc: '进口水果', price: 26, icon: 'fa-earth-asia', tone: 'd' }
  ] },
  { id: 'yy-fruit-12', category: 'fruit', name: '山野小果', icon: 'fa-mountain-sun', tone: 'c', rate: '4.7', sales: '月售 480', time: '42分钟', dist: '3.6km', fee: '配送 ¥8', min: '起送 ¥45', tags: ['时令限定'], menu: [
    { id: 'yy-fruit-12-1', name: '枇杷500g', desc: '时令小众水果', price: 30, icon: 'fa-mountain-sun', tone: 'a' },
    { id: 'yy-fruit-12-2', name: '软籽石榴2个', desc: '时令小众水果', price: 26, icon: 'fa-mountain-sun', tone: 'b' },
    { id: 'yy-fruit-12-3', name: '莲雾4个', desc: '时令小众水果', price: 28, icon: 'fa-mountain-sun', tone: 'c' },
    { id: 'yy-fruit-12-4', name: '人参果4个', desc: '时令小众水果', price: 18, icon: 'fa-mountain-sun', tone: 'd' }
  ] },
  { id: 'yy-fruit-13', category: 'fruit', name: '果篮礼遇', icon: 'fa-gift', tone: 'a', rate: '4.9', sales: '月售 350', time: '50分钟', dist: '4.0km', fee: '配送 ¥8', min: '起送 ¥68', tags: ['礼盒定制'], menu: [
    { id: 'yy-fruit-13-1', name: '探望果篮', desc: '水果礼盒', price: 88, icon: 'fa-gift', tone: 'a' },
    { id: 'yy-fruit-13-2', name: '精品果篮', desc: '水果礼盒', price: 128, icon: 'fa-gift', tone: 'b' },
    { id: 'yy-fruit-13-3', name: '商务果篮', desc: '水果礼盒', price: 168, icon: 'fa-gift', tone: 'c' },
    { id: 'yy-fruit-13-4', name: '迷你果礼盒', desc: '水果礼盒', price: 68, icon: 'fa-gift', tone: 'd' }
  ] },
  { id: 'yy-fruit-14', category: 'fruit', name: '农场直送', icon: 'fa-tractor', tone: 'd', rate: '4.6', sales: '月售 2500', time: '35分钟', dist: '2.5km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['家庭实惠装'], menu: [
    { id: 'yy-fruit-14-1', name: '苹果3kg', desc: '平价家庭装', price: 38, icon: 'fa-tractor', tone: 'a' },
    { id: 'yy-fruit-14-2', name: '橙子3kg', desc: '平价家庭装', price: 42, icon: 'fa-tractor', tone: 'b' },
    { id: 'yy-fruit-14-3', name: '香蕉2kg', desc: '平价家庭装', price: 22, icon: 'fa-tractor', tone: 'c' },
    { id: 'yy-fruit-14-4', name: '梨2.5kg', desc: '平价家庭装', price: 32, icon: 'fa-tractor', tone: 'd' }
  ] },
  { id: 'yy-fruit-15', category: 'fruit', name: '鲜果冰柜', icon: 'fa-snowflake', tone: 'b', rate: '4.7', sales: '月售 820', time: '30分钟', dist: '1.9km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['冷链配送'], menu: [
    { id: 'yy-fruit-15-1', name: '冷冻草莓500g', desc: '冷冻水果', price: 24, icon: 'fa-snowflake', tone: 'a' },
    { id: 'yy-fruit-15-2', name: '冷冻蓝莓500g', desc: '冷冻水果', price: 30, icon: 'fa-snowflake', tone: 'b' },
    { id: 'yy-fruit-15-3', name: '冷冻芒果块500g', desc: '冷冻水果', price: 26, icon: 'fa-snowflake', tone: 'c' },
    { id: 'yy-fruit-15-4', name: '巴西莓果泥4袋', desc: '冷冻水果', price: 36, icon: 'fa-snowflake', tone: 'd' }
  ] },
  { id: 'yy-fruit-16', category: 'fruit', name: '桃气果园', icon: 'fa-apple-whole', tone: 'c', rate: '4.8', sales: '月售 1150', time: '28分钟', dist: '1.6km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['香甜多汁'], menu: [
    { id: 'yy-fruit-16-1', name: '水蜜桃4个', desc: '桃李类水果', price: 28, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-fruit-16-2', name: '油桃6个', desc: '桃李类水果', price: 24, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-fruit-16-3', name: '黄桃4个', desc: '桃李类水果', price: 26, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-fruit-16-4', name: '黑布林6个', desc: '桃李类水果', price: 22, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-fruit-17', category: 'fruit', name: '枣香集', icon: 'fa-seedling', tone: 'd', rate: '4.7', sales: '月售 720', time: '32分钟', dist: '2.2km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['产地精选'], menu: [
    { id: 'yy-fruit-17-1', name: '冬枣500g', desc: '鲜枣与干果', price: 26, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-fruit-17-2', name: '椰枣250g', desc: '鲜枣与干果', price: 22, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-fruit-17-3', name: '红枣500g', desc: '鲜枣与干果', price: 20, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-fruit-17-4', name: '枣夹核桃250g', desc: '鲜枣与干果', price: 25, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-fruit-18', category: 'fruit', name: '香梨仓', icon: 'fa-apple-whole', tone: 'a', rate: '4.8', sales: '月售 980', time: '25分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['清甜润口'], menu: [
    { id: 'yy-fruit-18-1', name: '库尔勒香梨6个', desc: '梨类专营', price: 24, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-fruit-18-2', name: '秋月梨4个', desc: '梨类专营', price: 30, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-fruit-18-3', name: '皇冠梨4个', desc: '梨类专营', price: 20, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-fruit-18-4', name: '啤梨4个', desc: '梨类专营', price: 26, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-fruit-19', category: 'fruit', name: '石榴红了', icon: 'fa-gem', tone: 'b', rate: '4.9', sales: '月售 560', time: '36分钟', dist: '2.5km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['软籽石榴'], menu: [
    { id: 'yy-fruit-19-1', name: '突尼斯软籽石榴2个', desc: '石榴专营', price: 28, icon: 'fa-gem', tone: 'a' },
    { id: 'yy-fruit-19-2', name: '石榴果粒杯', desc: '石榴专营', price: 18, icon: 'fa-gem', tone: 'b' },
    { id: 'yy-fruit-19-3', name: '石榴汁', desc: '石榴专营', price: 20, icon: 'fa-gem', tone: 'c' },
    { id: 'yy-fruit-19-4', name: '石榴礼盒', desc: '石榴专营', price: 68, icon: 'fa-gem', tone: 'd' }
  ] },
  { id: 'yy-fruit-20', category: 'fruit', name: '山竹小馆', icon: 'fa-circle', tone: 'c', rate: '4.7', sales: '月售 680', time: '38分钟', dist: '2.8km', fee: '配送 ¥7', min: '起送 ¥40', tags: ['精品热带果'], menu: [
    { id: 'yy-fruit-20-1', name: '山竹500g', desc: '东南亚精品果', price: 38, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-fruit-20-2', name: '红毛丹500g', desc: '东南亚精品果', price: 28, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-fruit-20-3', name: '龙宫果500g', desc: '东南亚精品果', price: 32, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-fruit-20-4', name: '蛇皮果500g', desc: '东南亚精品果', price: 30, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-fruit-21', category: 'fruit', name: '柿柿如意', icon: 'fa-sun', tone: 'd', rate: '4.6', sales: '月售 490', time: '30分钟', dist: '1.9km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['秋季限定'], menu: [
    { id: 'yy-fruit-21-1', name: '脆柿4个', desc: '柿子专营', price: 22, icon: 'fa-sun', tone: 'a' },
    { id: 'yy-fruit-21-2', name: '软柿4个', desc: '柿子专营', price: 20, icon: 'fa-sun', tone: 'b' },
    { id: 'yy-fruit-21-3', name: '柿饼6个', desc: '柿子专营', price: 28, icon: 'fa-sun', tone: 'c' },
    { id: 'yy-fruit-21-4', name: '柿子果干', desc: '柿子专营', price: 18, icon: 'fa-sun', tone: 'd' }
  ] },
  { id: 'yy-fruit-22', category: 'fruit', name: '牛油果星球', icon: 'fa-seedling', tone: 'a', rate: '4.8', sales: '月售 760', time: '33分钟', dist: '2.1km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['轻食搭配'], menu: [
    { id: 'yy-fruit-22-1', name: '牛油果4个', desc: '牛油果专营', price: 36, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-fruit-22-2', name: '即食牛油果2个', desc: '牛油果专营', price: 22, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-fruit-22-3', name: '牛油果泥2盒', desc: '牛油果专营', price: 28, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-fruit-22-4', name: '牛油果香蕉盒', desc: '牛油果专营', price: 24, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-fruit-23', category: 'fruit', name: '苹果博物馆', icon: 'fa-apple-whole', tone: 'b', rate: '4.7', sales: '月售 1450', time: '24分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['苹果专营'], menu: [
    { id: 'yy-fruit-23-1', name: '红富士4个', desc: '多品种苹果', price: 20, icon: 'fa-apple-whole', tone: 'a' },
    { id: 'yy-fruit-23-2', name: '青苹果4个', desc: '多品种苹果', price: 22, icon: 'fa-apple-whole', tone: 'b' },
    { id: 'yy-fruit-23-3', name: '爱妃苹果4个', desc: '多品种苹果', price: 28, icon: 'fa-apple-whole', tone: 'c' },
    { id: 'yy-fruit-23-4', name: '冰糖心苹果4个', desc: '多品种苹果', price: 26, icon: 'fa-apple-whole', tone: 'd' }
  ] },
  { id: 'yy-fruit-24', category: 'fruit', name: '青梅时节', icon: 'fa-lemon', tone: 'c', rate: '4.7', sales: '月售 380', time: '40分钟', dist: '3.1km', fee: '配送 ¥7', min: '起送 ¥38', tags: ['时令鲜果'], menu: [
    { id: 'yy-fruit-24-1', name: '青梅500g', desc: '梅杏类水果', price: 22, icon: 'fa-lemon', tone: 'a' },
    { id: 'yy-fruit-24-2', name: '黄杏500g', desc: '梅杏类水果', price: 26, icon: 'fa-lemon', tone: 'b' },
    { id: 'yy-fruit-24-3', name: '西梅500g', desc: '梅杏类水果', price: 28, icon: 'fa-lemon', tone: 'c' },
    { id: 'yy-fruit-24-4', name: '梅子蜜饯', desc: '梅杏类水果', price: 18, icon: 'fa-lemon', tone: 'd' }
  ] },
  { id: 'yy-fruit-25', category: 'fruit', name: '柚香满园', icon: 'fa-circle', tone: 'd', rate: '4.8', sales: '月售 920', time: '29分钟', dist: '1.7km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['剥好可选'], menu: [
    { id: 'yy-fruit-25-1', name: '红心柚1只', desc: '柚子专营', price: 28, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-fruit-25-2', name: '白心柚1只', desc: '柚子专营', price: 24, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-fruit-25-3', name: '葡萄柚4个', desc: '柚子专营', price: 26, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-fruit-25-4', name: '柚子果肉盒', desc: '柚子专营', price: 18, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-fruit-26', category: 'fruit', name: '木瓜岛', icon: 'fa-umbrella-beach', tone: 'a', rate: '4.6', sales: '月售 540', time: '31分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['熟度可选'], menu: [
    { id: 'yy-fruit-26-1', name: '红心木瓜1只', desc: '木瓜与瓜果', price: 22, icon: 'fa-umbrella-beach', tone: 'a' },
    { id: 'yy-fruit-26-2', name: '牛奶木瓜1只', desc: '木瓜与瓜果', price: 24, icon: 'fa-umbrella-beach', tone: 'b' },
    { id: 'yy-fruit-26-3', name: '木瓜果切盒', desc: '木瓜与瓜果', price: 16, icon: 'fa-umbrella-beach', tone: 'c' },
    { id: 'yy-fruit-26-4', name: '木瓜炖奶材料包', desc: '木瓜与瓜果', price: 20, icon: 'fa-umbrella-beach', tone: 'd' }
  ] },
  { id: 'yy-fruit-27', category: 'fruit', name: '樱桃车站', icon: 'fa-circle', tone: 'b', rate: '4.9', sales: '月售 610', time: '42分钟', dist: '3.4km', fee: '配送 ¥8', min: '起送 ¥60', tags: ['冷链精品'], menu: [
    { id: 'yy-fruit-27-1', name: '国产樱桃250g', desc: '樱桃车厘子', price: 38, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-fruit-27-2', name: '进口车厘子250g', desc: '樱桃车厘子', price: 52, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-fruit-27-3', name: '黄樱桃250g', desc: '樱桃车厘子', price: 46, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-fruit-27-4', name: '樱桃礼盒', desc: '樱桃车厘子', price: 128, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-fruit-28', category: 'fruit', name: '荔枝湾', icon: 'fa-sun', tone: 'c', rate: '4.8', sales: '月售 1580', time: '27分钟', dist: '1.4km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['岭南时令'], menu: [
    { id: 'yy-fruit-28-1', name: '荔枝500g', desc: '岭南鲜果', price: 26, icon: 'fa-sun', tone: 'a' },
    { id: 'yy-fruit-28-2', name: '龙眼500g', desc: '岭南鲜果', price: 24, icon: 'fa-sun', tone: 'b' },
    { id: 'yy-fruit-28-3', name: '黄皮500g', desc: '岭南鲜果', price: 22, icon: 'fa-sun', tone: 'c' },
    { id: 'yy-fruit-28-4', name: '岭南果切盒', desc: '岭南鲜果', price: 20, icon: 'fa-sun', tone: 'd' }
  ] },
  { id: 'yy-fruit-29', category: 'fruit', name: '柠檬农场', icon: 'fa-lemon', tone: 'd', rate: '4.7', sales: '月售 830', time: '25分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['饮品搭配'], menu: [
    { id: 'yy-fruit-29-1', name: '香水柠檬4个', desc: '鲜柠专营', price: 18, icon: 'fa-lemon', tone: 'a' },
    { id: 'yy-fruit-29-2', name: '黄柠檬6个', desc: '鲜柠专营', price: 16, icon: 'fa-lemon', tone: 'b' },
    { id: 'yy-fruit-29-3', name: '青柠檬8个', desc: '鲜柠专营', price: 15, icon: 'fa-lemon', tone: 'c' },
    { id: 'yy-fruit-29-4', name: '蜂蜜柠檬材料包', desc: '鲜柠专营', price: 22, icon: 'fa-lemon', tone: 'd' }
  ] },
  { id: 'yy-fruit-30', category: 'fruit', name: '坚果果篮', icon: 'fa-seedling', tone: 'a', rate: '4.8', sales: '月售 1020', time: '30分钟', dist: '1.8km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['每日坚果'], menu: [
    { id: 'yy-fruit-30-1', name: '混合坚果250g', desc: '坚果与果干', price: 32, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-fruit-30-2', name: '芒果干200g', desc: '坚果与果干', price: 22, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-fruit-30-3', name: '无花果干200g', desc: '坚果与果干', price: 25, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-fruit-30-4', name: '每日坚果7袋', desc: '坚果与果干', price: 35, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-breakfast-01', category: 'breakfast', name: '晨光·营养早餐', icon: 'fa-egg', tone: 'd', rate: '4.7', sales: '月售 2400', time: '22分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥12', tags: ['早餐', '准时达'], menu: [
    { id: 'yy-breakfast-01-1', name: '杂粮煎饼', desc: '中式综合早餐', price: 10, icon: 'fa-egg', tone: 'a' },
    { id: 'yy-breakfast-01-2', name: '原味豆浆', desc: '中式综合早餐', price: 5, icon: 'fa-egg', tone: 'b' },
    { id: 'yy-breakfast-01-3', name: '鲜肉包2个', desc: '中式综合早餐', price: 8, icon: 'fa-egg', tone: 'c' },
    { id: 'yy-breakfast-01-4', name: '小米南瓜粥', desc: '中式综合早餐', price: 7, icon: 'fa-egg', tone: 'd' }
  ] },
  { id: 'yy-breakfast-02', category: 'breakfast', name: '包子有馅', icon: 'fa-bowl-rice', tone: 'a', rate: '4.8', sales: '月售 5200', time: '18分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥10', tags: ['买六送一'], menu: [
    { id: 'yy-breakfast-02-1', name: '鲜肉包', desc: '包子专门店', price: 3, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-breakfast-02-2', name: '香菇菜包', desc: '包子专门店', price: 3, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-breakfast-02-3', name: '梅干菜包', desc: '包子专门店', price: 4, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-breakfast-02-4', name: '红糖馒头', desc: '包子专门店', price: 3, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-breakfast-03', category: 'breakfast', name: '煎饼早安', icon: 'fa-egg', tone: 'c', rate: '4.6', sales: '月售 4100', time: '17分钟', dist: '0.4km', fee: '配送 ¥2', min: '起送 ¥10', tags: ['免费加薄脆'], menu: [
    { id: 'yy-breakfast-03-1', name: '经典煎饼果子', desc: '煎饼果子', price: 9, icon: 'fa-egg', tone: 'a' },
    { id: 'yy-breakfast-03-2', name: '火腿煎饼', desc: '煎饼果子', price: 12, icon: 'fa-egg', tone: 'b' },
    { id: 'yy-breakfast-03-3', name: '鸡柳煎饼', desc: '煎饼果子', price: 14, icon: 'fa-egg', tone: 'c' },
    { id: 'yy-breakfast-03-4', name: '全麦蔬菜煎饼', desc: '煎饼果子', price: 11, icon: 'fa-egg', tone: 'd' }
  ] },
  { id: 'yy-breakfast-04', category: 'breakfast', name: '粥见清晨', icon: 'fa-bowl-food', tone: 'b', rate: '4.8', sales: '月售 3200', time: '21分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['暖胃早餐'], menu: [
    { id: 'yy-breakfast-04-1', name: '皮蛋瘦肉粥', desc: '粥品', price: 12, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-breakfast-04-2', name: '南瓜小米粥', desc: '粥品', price: 8, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-breakfast-04-3', name: '艇仔粥', desc: '粥品', price: 15, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-breakfast-04-4', name: '香菇鸡肉粥', desc: '粥品', price: 13, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-breakfast-05', category: 'breakfast', name: '肠粉记', icon: 'fa-utensils', tone: 'a', rate: '4.7', sales: '月售 2800', time: '20分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['米浆现磨'], menu: [
    { id: 'yy-breakfast-05-1', name: '鸡蛋肠粉', desc: '广式肠粉', price: 10, icon: 'fa-utensils', tone: 'a' },
    { id: 'yy-breakfast-05-2', name: '鲜虾肠粉', desc: '广式肠粉', price: 16, icon: 'fa-utensils', tone: 'b' },
    { id: 'yy-breakfast-05-3', name: '牛肉肠粉', desc: '广式肠粉', price: 15, icon: 'fa-utensils', tone: 'c' },
    { id: 'yy-breakfast-05-4', name: '叉烧肠粉', desc: '广式肠粉', price: 14, icon: 'fa-utensils', tone: 'd' }
  ] },
  { id: 'yy-breakfast-06', category: 'breakfast', name: '豆花油条铺', icon: 'fa-mug-hot', tone: 'd', rate: '4.6', sales: '月售 3600', time: '16分钟', dist: '0.3km', fee: '配送 ¥2', min: '起送 ¥10', tags: ['传统早餐'], menu: [
    { id: 'yy-breakfast-06-1', name: '甜豆花', desc: '豆浆油条', price: 7, icon: 'fa-mug-hot', tone: 'a' },
    { id: 'yy-breakfast-06-2', name: '咸豆花', desc: '豆浆油条', price: 8, icon: 'fa-mug-hot', tone: 'b' },
    { id: 'yy-breakfast-06-3', name: '现炸油条', desc: '豆浆油条', price: 3, icon: 'fa-mug-hot', tone: 'c' },
    { id: 'yy-breakfast-06-4', name: '豆浆', desc: '豆浆油条', price: 5, icon: 'fa-mug-hot', tone: 'd' }
  ] },
  { id: 'yy-breakfast-07', category: 'breakfast', name: '贝果清晨', icon: 'fa-ring', tone: 'b', rate: '4.9', sales: '月售 1100', time: '25分钟', dist: '1.3km', fee: '配送 ¥4', min: '起送 ¥22', tags: ['低脂早餐'], menu: [
    { id: 'yy-breakfast-07-1', name: '烟熏鸡胸贝果', desc: '西式轻早餐', price: 22, icon: 'fa-ring', tone: 'a' },
    { id: 'yy-breakfast-07-2', name: '牛油果鸡蛋贝果', desc: '西式轻早餐', price: 24, icon: 'fa-ring', tone: 'b' },
    { id: 'yy-breakfast-07-3', name: '蓝莓乳酪贝果', desc: '西式轻早餐', price: 16, icon: 'fa-ring', tone: 'c' },
    { id: 'yy-breakfast-07-4', name: '美式咖啡', desc: '西式轻早餐', price: 12, icon: 'fa-ring', tone: 'd' }
  ] },
  { id: 'yy-breakfast-08', category: 'breakfast', name: '三明治公园', icon: 'fa-bread-slice', tone: 'c', rate: '4.8', sales: '月售 1850', time: '23分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['现点现做'], menu: [
    { id: 'yy-breakfast-08-1', name: '火腿芝士三明治', desc: '现做三明治', price: 16, icon: 'fa-bread-slice', tone: 'a' },
    { id: 'yy-breakfast-08-2', name: '金枪鱼三明治', desc: '现做三明治', price: 18, icon: 'fa-bread-slice', tone: 'b' },
    { id: 'yy-breakfast-08-3', name: '鸡蛋蔬菜三明治', desc: '现做三明治', price: 14, icon: 'fa-bread-slice', tone: 'c' },
    { id: 'yy-breakfast-08-4', name: '照烧鸡三明治', desc: '现做三明治', price: 20, icon: 'fa-bread-slice', tone: 'd' }
  ] },
  { id: 'yy-breakfast-09', category: 'breakfast', name: '糯米饭团社', icon: 'fa-bowl-rice', tone: 'a', rate: '4.7', sales: '月售 2650', time: '19分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['糯米现蒸'], menu: [
    { id: 'yy-breakfast-09-1', name: '经典油条饭团', desc: '中式饭团', price: 10, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-breakfast-09-2', name: '咸蛋黄肉松饭团', desc: '中式饭团', price: 14, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-breakfast-09-3', name: '卤肉饭团', desc: '中式饭团', price: 15, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-breakfast-09-4', name: '紫米素饭团', desc: '中式饭团', price: 12, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-breakfast-10', category: 'breakfast', name: '汤面清早', icon: 'fa-bowl-food', tone: 'd', rate: '4.6', sales: '月售 2300', time: '24分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['清汤现煮'], menu: [
    { id: 'yy-breakfast-10-1', name: '阳春面', desc: '早餐汤粉面', price: 12, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-breakfast-10-2', name: '雪菜肉丝面', desc: '早餐汤粉面', price: 16, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-breakfast-10-3', name: '鲜肉小馄饨', desc: '早餐汤粉面', price: 14, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-breakfast-10-4', name: '牛肉米粉', desc: '早餐汤粉面', price: 18, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-breakfast-11', category: 'breakfast', name: '蛋饼小铺', icon: 'fa-egg', tone: 'b', rate: '4.8', sales: '月售 1540', time: '20分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥14', tags: ['加蛋免费'], menu: [
    { id: 'yy-breakfast-11-1', name: '原味蛋饼', desc: '台式蛋饼', price: 10, icon: 'fa-egg', tone: 'a' },
    { id: 'yy-breakfast-11-2', name: '玉米芝士蛋饼', desc: '台式蛋饼', price: 13, icon: 'fa-egg', tone: 'b' },
    { id: 'yy-breakfast-11-3', name: '培根蛋饼', desc: '台式蛋饼', price: 15, icon: 'fa-egg', tone: 'c' },
    { id: 'yy-breakfast-11-4', name: '薯饼蛋饼', desc: '台式蛋饼', price: 14, icon: 'fa-egg', tone: 'd' }
  ] },
  { id: 'yy-breakfast-12', category: 'breakfast', name: '法式早晨', icon: 'fa-croissant', tone: 'c', rate: '4.9', sales: '月售 720', time: '30分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['每日现烤'], menu: [
    { id: 'yy-breakfast-12-1', name: '原味黄油可颂', desc: '可颂早餐', price: 12, icon: 'fa-croissant', tone: 'a' },
    { id: 'yy-breakfast-12-2', name: '火腿芝士可颂', desc: '可颂早餐', price: 20, icon: 'fa-croissant', tone: 'b' },
    { id: 'yy-breakfast-12-3', name: '杏仁可颂', desc: '可颂早餐', price: 18, icon: 'fa-croissant', tone: 'c' },
    { id: 'yy-breakfast-12-4', name: '可颂咖啡套餐', desc: '可颂早餐', price: 28, icon: 'fa-croissant', tone: 'd' }
  ] },
  { id: 'yy-breakfast-13', category: 'breakfast', name: '早餐能量碗', icon: 'fa-seedling', tone: 'a', rate: '4.8', sales: '月售 680', time: '27分钟', dist: '1.6km', fee: '配送 ¥4', min: '起送 ¥24', tags: ['健身早餐'], menu: [
    { id: 'yy-breakfast-13-1', name: '莓果酸奶碗', desc: '燕麦酸奶', price: 26, icon: 'fa-seedling', tone: 'a' },
    { id: 'yy-breakfast-13-2', name: '香蕉花生燕麦碗', desc: '燕麦酸奶', price: 24, icon: 'fa-seedling', tone: 'b' },
    { id: 'yy-breakfast-13-3', name: '奇亚籽芒果碗', desc: '燕麦酸奶', price: 28, icon: 'fa-seedling', tone: 'c' },
    { id: 'yy-breakfast-13-4', name: '隔夜燕麦杯', desc: '燕麦酸奶', price: 18, icon: 'fa-seedling', tone: 'd' }
  ] },
  { id: 'yy-breakfast-14', category: 'breakfast', name: '北方早点铺', icon: 'fa-wheat-awn', tone: 'd', rate: '4.6', sales: '月售 3000', time: '18分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥10', tags: ['北方风味'], menu: [
    { id: 'yy-breakfast-14-1', name: '咸豆腐脑', desc: '烧饼豆腐脑', price: 8, icon: 'fa-wheat-awn', tone: 'a' },
    { id: 'yy-breakfast-14-2', name: '牛肉烧饼', desc: '烧饼豆腐脑', price: 10, icon: 'fa-wheat-awn', tone: 'b' },
    { id: 'yy-breakfast-14-3', name: '韭菜盒子', desc: '烧饼豆腐脑', price: 7, icon: 'fa-wheat-awn', tone: 'c' },
    { id: 'yy-breakfast-14-4', name: '胡辣汤', desc: '烧饼豆腐脑', price: 9, icon: 'fa-wheat-awn', tone: 'd' }
  ] },
  { id: 'yy-breakfast-15', category: 'breakfast', name: '粤早茶点', icon: 'fa-dumpster', tone: 'b', rate: '4.7', sales: '月售 1950', time: '26分钟', dist: '1.4km', fee: '配送 ¥4', min: '起送 ¥20', tags: ['蒸笼现做'], menu: [
    { id: 'yy-breakfast-15-1', name: '叉烧包', desc: '蒸点早餐', price: 12, icon: 'fa-dumpster', tone: 'a' },
    { id: 'yy-breakfast-15-2', name: '糯米鸡', desc: '蒸点早餐', price: 15, icon: 'fa-dumpster', tone: 'b' },
    { id: 'yy-breakfast-15-3', name: '流沙包', desc: '蒸点早餐', price: 14, icon: 'fa-dumpster', tone: 'c' },
    { id: 'yy-breakfast-15-4', name: '豉汁排骨', desc: '蒸点早餐', price: 18, icon: 'fa-dumpster', tone: 'd' }
  ] },
  { id: 'yy-breakfast-16', category: 'breakfast', name: '重庆小面清晨店', icon: 'fa-bowl-food', tone: 'c', rate: '4.7', sales: '月售 2250', time: '22分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['辣度可选'], menu: [
    { id: 'yy-breakfast-16-1', name: '重庆小面', desc: '麻辣早餐面', price: 14, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-breakfast-16-2', name: '豌杂面', desc: '麻辣早餐面', price: 19, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-breakfast-16-3', name: '肥肠面', desc: '麻辣早餐面', price: 22, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-breakfast-16-4', name: '红糖醪糟', desc: '麻辣早餐面', price: 8, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-breakfast-17', category: 'breakfast', name: '馄饨晨铺', icon: 'fa-bowl-food', tone: 'd', rate: '4.8', sales: '月售 2800', time: '20分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['手工现包'], menu: [
    { id: 'yy-breakfast-17-1', name: '鲜肉小馄饨', desc: '手包馄饨', price: 13, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-breakfast-17-2', name: '荠菜大馄饨', desc: '手包馄饨', price: 16, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-breakfast-17-3', name: '虾仁馄饨', desc: '手包馄饨', price: 19, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-breakfast-17-4', name: '拌馄饨', desc: '手包馄饨', price: 15, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-breakfast-18', category: 'breakfast', name: '烧麦先生', icon: 'fa-bowl-rice', tone: 'a', rate: '4.7', sales: '月售 1800', time: '21分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥14', tags: ['糯米现蒸'], menu: [
    { id: 'yy-breakfast-18-1', name: '糯米烧麦4个', desc: '烧麦蒸点', price: 12, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-breakfast-18-2', name: '牛肉烧麦4个', desc: '烧麦蒸点', price: 16, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-breakfast-18-3', name: '香菇烧麦4个', desc: '烧麦蒸点', price: 13, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-breakfast-18-4', name: '蛋黄烧麦4个', desc: '烧麦蒸点', price: 15, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-breakfast-19', category: 'breakfast', name: '米粉晨间', icon: 'fa-bowl-food', tone: 'b', rate: '4.6', sales: '月售 2460', time: '23分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['鲜汤早餐'], menu: [
    { id: 'yy-breakfast-19-1', name: '桂林米粉', desc: '南方汤粉', price: 16, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-breakfast-19-2', name: '湖南牛肉粉', desc: '南方汤粉', price: 20, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-breakfast-19-3', name: '酸辣粉', desc: '南方汤粉', price: 15, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-breakfast-19-4', name: '猪脚粉', desc: '南方汤粉', price: 22, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-breakfast-20', category: 'breakfast', name: '可丽饼早安', icon: 'fa-pancakes', tone: 'c', rate: '4.8', sales: '月售 680', time: '28分钟', dist: '1.8km', fee: '配送 ¥5', min: '起送 ¥25', tags: ['甜咸可选'], menu: [
    { id: 'yy-breakfast-20-1', name: '火腿芝士可丽饼', desc: '法式薄饼', price: 20, icon: 'fa-pancakes', tone: 'a' },
    { id: 'yy-breakfast-20-2', name: '鸡蛋菠菜可丽饼', desc: '法式薄饼', price: 18, icon: 'fa-pancakes', tone: 'b' },
    { id: 'yy-breakfast-20-3', name: '香蕉巧克力可丽饼', desc: '法式薄饼', price: 19, icon: 'fa-pancakes', tone: 'c' },
    { id: 'yy-breakfast-20-4', name: '草莓奶油可丽饼', desc: '法式薄饼', price: 22, icon: 'fa-pancakes', tone: 'd' }
  ] },
  { id: 'yy-breakfast-21', category: 'breakfast', name: '土豆饼厨房', icon: 'fa-circle', tone: 'd', rate: '4.6', sales: '月售 1120', time: '20分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['现煎现送'], menu: [
    { id: 'yy-breakfast-21-1', name: '香煎土豆饼', desc: '各式早餐饼', price: 10, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-breakfast-21-2', name: '蔬菜鸡蛋饼', desc: '各式早餐饼', price: 9, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-breakfast-21-3', name: '玉米芝士饼', desc: '各式早餐饼', price: 12, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-breakfast-21-4', name: '韩式泡菜饼', desc: '各式早餐饼', price: 14, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-breakfast-22', category: 'breakfast', name: '早餐咖喱角', icon: 'fa-pepper-hot', tone: 'a', rate: '4.7', sales: '月售 420', time: '35分钟', dist: '2.6km', fee: '配送 ¥6', min: '起送 ¥30', tags: ['异国早餐'], menu: [
    { id: 'yy-breakfast-22-1', name: '土豆咖喱角', desc: '印度早餐', price: 12, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-breakfast-22-2', name: '印度煎饼', desc: '印度早餐', price: 18, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-breakfast-22-3', name: '鹰嘴豆早餐碗', desc: '印度早餐', price: 22, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-breakfast-22-4', name: '香料奶茶', desc: '印度早餐', price: 12, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-breakfast-23', category: 'breakfast', name: '欧姆蛋厨房', icon: 'fa-egg', tone: 'b', rate: '4.9', sales: '月售 740', time: '27分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥24', tags: ['高蛋白早餐'], menu: [
    { id: 'yy-breakfast-23-1', name: '芝士欧姆蛋', desc: '蛋料理早餐', price: 22, icon: 'fa-egg', tone: 'a' },
    { id: 'yy-breakfast-23-2', name: '蘑菇欧姆蛋', desc: '蛋料理早餐', price: 23, icon: 'fa-egg', tone: 'b' },
    { id: 'yy-breakfast-23-3', name: '火腿欧姆蛋', desc: '蛋料理早餐', price: 24, icon: 'fa-egg', tone: 'c' },
    { id: 'yy-breakfast-23-4', name: '番茄炒蛋吐司', desc: '蛋料理早餐', price: 18, icon: 'fa-egg', tone: 'd' }
  ] },
  { id: 'yy-breakfast-24', category: 'breakfast', name: '肉夹馍清晨铺', icon: 'fa-burger', tone: 'c', rate: '4.7', sales: '月售 2600', time: '19分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['馍饼现烤'], menu: [
    { id: 'yy-breakfast-24-1', name: '腊汁肉夹馍', desc: '陕西早餐', price: 15, icon: 'fa-burger', tone: 'a' },
    { id: 'yy-breakfast-24-2', name: '孜然牛肉夹馍', desc: '陕西早餐', price: 18, icon: 'fa-burger', tone: 'b' },
    { id: 'yy-breakfast-24-3', name: '凉皮', desc: '陕西早餐', price: 12, icon: 'fa-burger', tone: 'c' },
    { id: 'yy-breakfast-24-4', name: '小米粥', desc: '陕西早餐', price: 6, icon: 'fa-burger', tone: 'd' }
  ] },
  { id: 'yy-breakfast-25', category: 'breakfast', name: '紫米早餐社', icon: 'fa-bowl-rice', tone: 'd', rate: '4.8', sales: '月售 980', time: '24分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['粗粮早餐'], menu: [
    { id: 'yy-breakfast-25-1', name: '紫米饭团', desc: '紫米主食', price: 13, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-breakfast-25-2', name: '紫米粥', desc: '紫米主食', price: 8, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-breakfast-25-3', name: '紫米肉松卷', desc: '紫米主食', price: 12, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-breakfast-25-4', name: '紫米酸奶杯', desc: '紫米主食', price: 16, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-breakfast-26', category: 'breakfast', name: '华夫早餐车', icon: 'fa-table-cells-large', tone: 'a', rate: '4.6', sales: '月售 560', time: '29分钟', dist: '1.9km', fee: '配送 ¥5', min: '起送 ¥24', tags: ['现烤华夫'], menu: [
    { id: 'yy-breakfast-26-1', name: '培根鸡蛋华夫', desc: '咸口华夫', price: 20, icon: 'fa-table-cells-large', tone: 'a' },
    { id: 'yy-breakfast-26-2', name: '鸡胸蔬菜华夫', desc: '咸口华夫', price: 22, icon: 'fa-table-cells-large', tone: 'b' },
    { id: 'yy-breakfast-26-3', name: '牛油果华夫', desc: '咸口华夫', price: 24, icon: 'fa-table-cells-large', tone: 'c' },
    { id: 'yy-breakfast-26-4', name: '蜂蜜黄油华夫', desc: '咸口华夫', price: 16, icon: 'fa-table-cells-large', tone: 'd' }
  ] },
  { id: 'yy-breakfast-27', category: 'breakfast', name: '清晨汤包馆', icon: 'fa-dumpster', tone: 'b', rate: '4.8', sales: '月售 2150', time: '22分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['现蒸汤包'], menu: [
    { id: 'yy-breakfast-27-1', name: '鲜肉小笼8只', desc: '汤包小笼', price: 16, icon: 'fa-dumpster', tone: 'a' },
    { id: 'yy-breakfast-27-2', name: '蟹粉小笼6只', desc: '汤包小笼', price: 28, icon: 'fa-dumpster', tone: 'b' },
    { id: 'yy-breakfast-27-3', name: '虾仁小笼6只', desc: '汤包小笼', price: 22, icon: 'fa-dumpster', tone: 'c' },
    { id: 'yy-breakfast-27-4', name: '酸辣汤', desc: '汤包小笼', price: 10, icon: 'fa-dumpster', tone: 'd' }
  ] },
  { id: 'yy-breakfast-28', category: 'breakfast', name: '玉米早餐铺', icon: 'fa-wheat-awn', tone: 'c', rate: '4.7', sales: '月售 870', time: '21分钟', dist: '0.8km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['粗粮现蒸'], menu: [
    { id: 'yy-breakfast-28-1', name: '甜玉米', desc: '玉米粗粮', price: 8, icon: 'fa-wheat-awn', tone: 'a' },
    { id: 'yy-breakfast-28-2', name: '玉米鸡蛋杯', desc: '玉米粗粮', price: 12, icon: 'fa-wheat-awn', tone: 'b' },
    { id: 'yy-breakfast-28-3', name: '玉米汁', desc: '玉米粗粮', price: 10, icon: 'fa-wheat-awn', tone: 'c' },
    { id: 'yy-breakfast-28-4', name: '玉米面窝头4个', desc: '玉米粗粮', price: 10, icon: 'fa-wheat-awn', tone: 'd' }
  ] },
  { id: 'yy-breakfast-29', category: 'breakfast', name: '英式早餐盒', icon: 'fa-bacon', tone: 'd', rate: '4.8', sales: '月售 390', time: '38分钟', dist: '2.9km', fee: '配送 ¥7', min: '起送 ¥38', tags: ['周末早餐'], menu: [
    { id: 'yy-breakfast-29-1', name: '英式全餐', desc: '英式早餐', price: 38, icon: 'fa-bacon', tone: 'a' },
    { id: 'yy-breakfast-29-2', name: '培根煎蛋吐司', desc: '英式早餐', price: 24, icon: 'fa-bacon', tone: 'b' },
    { id: 'yy-breakfast-29-3', name: '焗豆香肠盒', desc: '英式早餐', price: 30, icon: 'fa-bacon', tone: 'c' },
    { id: 'yy-breakfast-29-4', name: '红茶牛奶', desc: '英式早餐', price: 12, icon: 'fa-bacon', tone: 'd' }
  ] },
  { id: 'yy-breakfast-30', category: 'breakfast', name: '蒸红薯小站', icon: 'fa-carrot', tone: 'a', rate: '4.6', sales: '月售 1450', time: '18分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥10', tags: ['健康粗粮'], menu: [
    { id: 'yy-breakfast-30-1', name: '烟薯25号', desc: '薯类早餐', price: 10, icon: 'fa-carrot', tone: 'a' },
    { id: 'yy-breakfast-30-2', name: '紫薯', desc: '薯类早餐', price: 8, icon: 'fa-carrot', tone: 'b' },
    { id: 'yy-breakfast-30-3', name: '板栗南瓜', desc: '薯类早餐', price: 12, icon: 'fa-carrot', tone: 'c' },
    { id: 'yy-breakfast-30-4', name: '红薯牛奶套餐', desc: '薯类早餐', price: 16, icon: 'fa-carrot', tone: 'd' }
  ] },
  { id: 'yy-night-01', category: 'night', name: '烟火·炭炉烧烤', icon: 'fa-fire', tone: 'c', rate: '4.6', sales: '月售 980', time: '40分钟', dist: '2.4km', fee: '配送 ¥5', min: '起送 ¥35', tags: ['满50减20', '夜宵'], menu: [
    { id: 'yy-night-01-1', name: '羊肉串10串', desc: '肉串烧烤', price: 30, icon: 'fa-fire', tone: 'a' },
    { id: 'yy-night-01-2', name: '烤五花肉', desc: '肉串烧烤', price: 26, icon: 'fa-fire', tone: 'b' },
    { id: 'yy-night-01-3', name: '烤金针菇', desc: '肉串烧烤', price: 12, icon: 'fa-fire', tone: 'c' },
    { id: 'yy-night-01-4', name: '烤馒头片', desc: '肉串烧烤', price: 8, icon: 'fa-fire', tone: 'd' }
  ] },
  { id: 'yy-night-02', category: 'night', name: '串串夜市', icon: 'fa-pepper-hot', tone: 'd', rate: '4.7', sales: '月售 2600', time: '32分钟', dist: '1.6km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['麻辣鲜香'], menu: [
    { id: 'yy-night-02-1', name: '牛肉串10串', desc: '川味串串', price: 25, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-night-02-2', name: '掌中宝6串', desc: '川味串串', price: 24, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-night-02-3', name: '土豆片', desc: '川味串串', price: 10, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-night-02-4', name: '冒脑花', desc: '川味串串', price: 22, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-night-03', category: 'night', name: '小龙虾码头', icon: 'fa-shrimp', tone: 'c', rate: '4.8', sales: '月售 1800', time: '45分钟', dist: '3.0km', fee: '配送 ¥7', min: '起送 ¥60', tags: ['买二斤送半斤'], menu: [
    { id: 'yy-night-03-1', name: '蒜蓉小龙虾', desc: '小龙虾', price: 68, icon: 'fa-shrimp', tone: 'a' },
    { id: 'yy-night-03-2', name: '十三香小龙虾', desc: '小龙虾', price: 68, icon: 'fa-shrimp', tone: 'b' },
    { id: 'yy-night-03-3', name: '麻辣小龙虾', desc: '小龙虾', price: 72, icon: 'fa-shrimp', tone: 'c' },
    { id: 'yy-night-03-4', name: '凉面', desc: '小龙虾', price: 8, icon: 'fa-shrimp', tone: 'd' }
  ] },
  { id: 'yy-night-04', category: 'night', name: '深夜粥铺', icon: 'fa-bowl-food', tone: 'a', rate: '4.7', sales: '月售 2100', time: '35分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['暖胃夜宵'], menu: [
    { id: 'yy-night-04-1', name: '鲜虾砂锅粥', desc: '砂锅粥', price: 32, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-night-04-2', name: '艇仔粥', desc: '砂锅粥', price: 18, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-night-04-3', name: '皮蛋瘦肉粥', desc: '砂锅粥', price: 14, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-night-04-4', name: '咸骨菜干粥', desc: '砂锅粥', price: 16, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-night-05', category: 'night', name: '炸物俱乐部', icon: 'fa-drumstick-bite', tone: 'b', rate: '4.6', sales: '月售 5200', time: '24分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['第二份半价'], menu: [
    { id: 'yy-night-05-1', name: '香辣炸鸡', desc: '炸鸡小食', price: 24, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-night-05-2', name: '无骨鸡柳', desc: '炸鸡小食', price: 18, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-night-05-3', name: '薯条', desc: '炸鸡小食', price: 12, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-night-05-4', name: '芝士球', desc: '炸鸡小食', price: 15, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-night-06', category: 'night', name: '卤味档口', icon: 'fa-drumstick-bite', tone: 'd', rate: '4.8', sales: '月售 3400', time: '25分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥22', tags: ['称重卤味'], menu: [
    { id: 'yy-night-06-1', name: '卤鸭脖', desc: '现捞卤味', price: 18, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-night-06-2', name: '卤鸡爪', desc: '现捞卤味', price: 16, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-night-06-3', name: '卤牛肉', desc: '现捞卤味', price: 28, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-night-06-4', name: '香辣藕片', desc: '现捞卤味', price: 10, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-night-07', category: 'night', name: '炒粉大排档', icon: 'fa-bowl-rice', tone: 'c', rate: '4.6', sales: '月售 4800', time: '22分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['锅气现炒'], menu: [
    { id: 'yy-night-07-1', name: '干炒牛河', desc: '炒粉炒饭', price: 22, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-night-07-2', name: '火腿蛋炒饭', desc: '炒粉炒饭', price: 18, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-night-07-3', name: '海鲜炒面', desc: '炒粉炒饭', price: 24, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-night-07-4', name: '炒米粉', desc: '炒粉炒饭', price: 16, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-night-08', category: 'night', name: '深夜拉面馆', icon: 'fa-bowl-food', tone: 'b', rate: '4.8', sales: '月售 1500', time: '34分钟', dist: '1.9km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['营业至凌晨3点'], menu: [
    { id: 'yy-night-08-1', name: '豚骨拉面', desc: '日式拉面', price: 30, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-night-08-2', name: '地狱辣拉面', desc: '日式拉面', price: 32, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-night-08-3', name: '叉烧拌面', desc: '日式拉面', price: 28, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-night-08-4', name: '唐扬鸡块', desc: '日式拉面', price: 18, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-night-09', category: 'night', name: '海鲜烧烤摊', icon: 'fa-fish-fins', tone: 'a', rate: '4.7', sales: '月售 1120', time: '42分钟', dist: '2.8km', fee: '配送 ¥7', min: '起送 ¥45', tags: ['海鲜现烤'], menu: [
    { id: 'yy-night-09-1', name: '烤生蚝6只', desc: '烤海鲜', price: 36, icon: 'fa-fish-fins', tone: 'a' },
    { id: 'yy-night-09-2', name: '烤扇贝4只', desc: '烤海鲜', price: 32, icon: 'fa-fish-fins', tone: 'b' },
    { id: 'yy-night-09-3', name: '锡纸花甲', desc: '烤海鲜', price: 28, icon: 'fa-fish-fins', tone: 'c' },
    { id: 'yy-night-09-4', name: '烤鱿鱼', desc: '烤海鲜', price: 22, icon: 'fa-fish-fins', tone: 'd' }
  ] },
  { id: 'yy-night-10', category: 'night', name: '鸭货江湖', icon: 'fa-feather', tone: 'd', rate: '4.7', sales: '月售 3900', time: '23分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥20', tags: ['越啃越香'], menu: [
    { id: 'yy-night-10-1', name: '鸭锁骨', desc: '辣卤鸭货', price: 18, icon: 'fa-feather', tone: 'a' },
    { id: 'yy-night-10-2', name: '鸭翅', desc: '辣卤鸭货', price: 16, icon: 'fa-feather', tone: 'b' },
    { id: 'yy-night-10-3', name: '鸭舌', desc: '辣卤鸭货', price: 25, icon: 'fa-feather', tone: 'c' },
    { id: 'yy-night-10-4', name: '海带结', desc: '辣卤鸭货', price: 9, icon: 'fa-feather', tone: 'd' }
  ] },
  { id: 'yy-night-11', category: 'night', name: '月下酒馆菜', icon: 'fa-martini-glass', tone: 'c', rate: '4.8', sales: '月售 640', time: '38分钟', dist: '2.5km', fee: '配送 ¥6', min: '起送 ¥40', tags: ['深夜小酌'], menu: [
    { id: 'yy-night-11-1', name: '芥末章鱼', desc: '下酒小菜', price: 22, icon: 'fa-martini-glass', tone: 'a' },
    { id: 'yy-night-11-2', name: '盐水毛豆', desc: '下酒小菜', price: 12, icon: 'fa-martini-glass', tone: 'b' },
    { id: 'yy-night-11-3', name: '日式炸豆腐', desc: '下酒小菜', price: 18, icon: 'fa-martini-glass', tone: 'c' },
    { id: 'yy-night-11-4', name: '烤鸡软骨', desc: '下酒小菜', price: 24, icon: 'fa-martini-glass', tone: 'd' }
  ] },
  { id: 'yy-night-12', category: 'night', name: '泡面博物馆', icon: 'fa-bowl-food', tone: 'b', rate: '4.6', sales: '月售 1900', time: '20分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['全球泡面'], menu: [
    { id: 'yy-night-12-1', name: '韩式芝士火鸡面', desc: '豪华泡面', price: 18, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-night-12-2', name: '港式餐蛋面', desc: '豪华泡面', price: 20, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-night-12-3', name: '冬阴功海鲜面', desc: '豪华泡面', price: 24, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-night-12-4', name: '番茄肥牛泡面', desc: '豪华泡面', price: 22, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-night-13', category: 'night', name: '夜猫甜汤', icon: 'fa-moon', tone: 'a', rate: '4.8', sales: '月售 1300', time: '26分钟', dist: '1.2km', fee: '配送 ¥4', min: '起送 ¥18', tags: ['营业至凌晨2点'], menu: [
    { id: 'yy-night-13-1', name: '红豆沙', desc: '深夜糖水', price: 14, icon: 'fa-moon', tone: 'a' },
    { id: 'yy-night-13-2', name: '绿豆沙', desc: '深夜糖水', price: 13, icon: 'fa-moon', tone: 'b' },
    { id: 'yy-night-13-3', name: '桃胶炖奶', desc: '深夜糖水', price: 18, icon: 'fa-moon', tone: 'c' },
    { id: 'yy-night-13-4', name: '芋圆烧仙草', desc: '深夜糖水', price: 17, icon: 'fa-moon', tone: 'd' }
  ] },
  { id: 'yy-night-14', category: 'night', name: '铁板夜食', icon: 'fa-fire-burner', tone: 'd', rate: '4.7', sales: '月售 1450', time: '33分钟', dist: '1.8km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['铁板现炒'], menu: [
    { id: 'yy-night-14-1', name: '铁板鱿鱼', desc: '铁板料理', price: 25, icon: 'fa-fire-burner', tone: 'a' },
    { id: 'yy-night-14-2', name: '铁板豆腐', desc: '铁板料理', price: 16, icon: 'fa-fire-burner', tone: 'b' },
    { id: 'yy-night-14-3', name: '铁板牛肉', desc: '铁板料理', price: 32, icon: 'fa-fire-burner', tone: 'c' },
    { id: 'yy-night-14-4', name: '铁板炒面', desc: '铁板料理', price: 18, icon: 'fa-fire-burner', tone: 'd' }
  ] },
  { id: 'yy-night-15', category: 'night', name: '深夜披萨房', icon: 'fa-pizza-slice', tone: 'c', rate: '4.7', sales: '月售 980', time: '36分钟', dist: '2.2km', fee: '配送 ¥6', min: '起送 ¥35', tags: ['夜宵套餐'], menu: [
    { id: 'yy-night-15-1', name: '6寸培根披萨', desc: '小尺寸披萨', price: 28, icon: 'fa-pizza-slice', tone: 'a' },
    { id: 'yy-night-15-2', name: '6寸榴莲披萨', desc: '小尺寸披萨', price: 32, icon: 'fa-pizza-slice', tone: 'b' },
    { id: 'yy-night-15-3', name: '6寸海鲜披萨', desc: '小尺寸披萨', price: 34, icon: 'fa-pizza-slice', tone: 'c' },
    { id: 'yy-night-15-4', name: '烤鸡翅6只', desc: '小尺寸披萨', price: 22, icon: 'fa-pizza-slice', tone: 'd' }
  ] },
  { id: 'yy-night-16', category: 'night', name: '烤冷面夜车', icon: 'fa-fire-burner', tone: 'd', rate: '4.6', sales: '月售 4600', time: '18分钟', dist: '0.5km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['街头夜宵'], menu: [
    { id: 'yy-night-16-1', name: '经典烤冷面', desc: '街头小吃', price: 10, icon: 'fa-fire-burner', tone: 'a' },
    { id: 'yy-night-16-2', name: '双蛋烤冷面', desc: '街头小吃', price: 13, icon: 'fa-fire-burner', tone: 'b' },
    { id: 'yy-night-16-3', name: '火鸡面烤冷面', desc: '街头小吃', price: 15, icon: 'fa-fire-burner', tone: 'c' },
    { id: 'yy-night-16-4', name: '芝士烤冷面', desc: '街头小吃', price: 16, icon: 'fa-fire-burner', tone: 'd' }
  ] },
  { id: 'yy-night-17', category: 'night', name: '生煎夜铺', icon: 'fa-dumpster', tone: 'a', rate: '4.7', sales: '月售 2850', time: '22分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥15', tags: ['出锅现送'], menu: [
    { id: 'yy-night-17-1', name: '鲜肉生煎8只', desc: '生煎锅贴', price: 18, icon: 'fa-dumpster', tone: 'a' },
    { id: 'yy-night-17-2', name: '虾仁生煎6只', desc: '生煎锅贴', price: 22, icon: 'fa-dumpster', tone: 'b' },
    { id: 'yy-night-17-3', name: '牛肉锅贴10只', desc: '生煎锅贴', price: 20, icon: 'fa-dumpster', tone: 'c' },
    { id: 'yy-night-17-4', name: '酸辣汤', desc: '生煎锅贴', price: 10, icon: 'fa-dumpster', tone: 'd' }
  ] },
  { id: 'yy-night-18', category: 'night', name: '关东煮月台', icon: 'fa-bowl-food', tone: 'b', rate: '4.8', sales: '月售 3300', time: '19分钟', dist: '0.6km', fee: '配送 ¥2', min: '起送 ¥15', tags: ['暖汤夜食'], menu: [
    { id: 'yy-night-18-1', name: '关东煮十件套', desc: '日式煮物', price: 25, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-night-18-2', name: '萝卜魔芋套餐', desc: '日式煮物', price: 16, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-night-18-3', name: '福袋鱼丸套餐', desc: '日式煮物', price: 22, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-night-18-4', name: '乌冬面', desc: '日式煮物', price: 18, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-night-19', category: 'night', name: '锡纸宇宙', icon: 'fa-fire', tone: 'c', rate: '4.7', sales: '月售 1950', time: '29分钟', dist: '1.5km', fee: '配送 ¥4', min: '起送 ¥25', tags: ['蒜香浓郁'], menu: [
    { id: 'yy-night-19-1', name: '锡纸花甲粉', desc: '锡纸料理', price: 26, icon: 'fa-fire', tone: 'a' },
    { id: 'yy-night-19-2', name: '锡纸金针菇', desc: '锡纸料理', price: 16, icon: 'fa-fire', tone: 'b' },
    { id: 'yy-night-19-3', name: '锡纸肥牛', desc: '锡纸料理', price: 28, icon: 'fa-fire', tone: 'c' },
    { id: 'yy-night-19-4', name: '锡纸脑花', desc: '锡纸料理', price: 24, icon: 'fa-fire', tone: 'd' }
  ] },
  { id: 'yy-night-20', category: 'night', name: '臭豆腐研究所', icon: 'fa-cubes-stacked', tone: 'd', rate: '4.6', sales: '月售 5100', time: '20分钟', dist: '0.7km', fee: '配送 ¥2', min: '起送 ¥12', tags: ['长沙风味'], menu: [
    { id: 'yy-night-20-1', name: '黑色经典臭豆腐', desc: '长沙小吃', price: 12, icon: 'fa-cubes-stacked', tone: 'a' },
    { id: 'yy-night-20-2', name: '灌汁臭豆腐', desc: '长沙小吃', price: 15, icon: 'fa-cubes-stacked', tone: 'b' },
    { id: 'yy-night-20-3', name: '大香肠', desc: '长沙小吃', price: 10, icon: 'fa-cubes-stacked', tone: 'c' },
    { id: 'yy-night-20-4', name: '糖油粑粑', desc: '长沙小吃', price: 9, icon: 'fa-cubes-stacked', tone: 'd' }
  ] },
  { id: 'yy-night-21', category: 'night', name: '鸡架夜市', icon: 'fa-drumstick-bite', tone: 'a', rate: '4.7', sales: '月售 2480', time: '24分钟', dist: '1.0km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['下酒推荐'], menu: [
    { id: 'yy-night-21-1', name: '熏拌鸡架', desc: '东北鸡架', price: 18, icon: 'fa-drumstick-bite', tone: 'a' },
    { id: 'yy-night-21-2', name: '炸鸡架', desc: '东北鸡架', price: 20, icon: 'fa-drumstick-bite', tone: 'b' },
    { id: 'yy-night-21-3', name: '甜辣鸡架', desc: '东北鸡架', price: 21, icon: 'fa-drumstick-bite', tone: 'c' },
    { id: 'yy-night-21-4', name: '麻辣鸡脖', desc: '东北鸡架', price: 15, icon: 'fa-drumstick-bite', tone: 'd' }
  ] },
  { id: 'yy-night-22', category: 'night', name: '烤鱼小馆·深夜版', icon: 'fa-fish-fins', tone: 'b', rate: '4.8', sales: '月售 1750', time: '39分钟', dist: '2.5km', fee: '配送 ¥6', min: '起送 ¥45', tags: ['单人小份'], menu: [
    { id: 'yy-night-22-1', name: '香辣烤鱼', desc: '单人烤鱼', price: 42, icon: 'fa-fish-fins', tone: 'a' },
    { id: 'yy-night-22-2', name: '蒜香烤鱼', desc: '单人烤鱼', price: 42, icon: 'fa-fish-fins', tone: 'b' },
    { id: 'yy-night-22-3', name: '豆豉烤鱼', desc: '单人烤鱼', price: 44, icon: 'fa-fish-fins', tone: 'c' },
    { id: 'yy-night-22-4', name: '烤鱼配菜包', desc: '单人烤鱼', price: 12, icon: 'fa-fish-fins', tone: 'd' }
  ] },
  { id: 'yy-night-23', category: 'night', name: '冷面深夜店', icon: 'fa-bowl-food', tone: 'c', rate: '4.6', sales: '月售 1600', time: '25分钟', dist: '1.2km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['酸甜清爽'], menu: [
    { id: 'yy-night-23-1', name: '东北冷面', desc: '东北冷面', price: 18, icon: 'fa-bowl-food', tone: 'a' },
    { id: 'yy-night-23-2', name: '烤肉拌冷面', desc: '东北冷面', price: 22, icon: 'fa-bowl-food', tone: 'b' },
    { id: 'yy-night-23-3', name: '荞麦冷面', desc: '东北冷面', price: 20, icon: 'fa-bowl-food', tone: 'c' },
    { id: 'yy-night-23-4', name: '辣白菜', desc: '东北冷面', price: 8, icon: 'fa-bowl-food', tone: 'd' }
  ] },
  { id: 'yy-night-24', category: 'night', name: '炒蛤蜊大排档', icon: 'fa-shrimp', tone: 'd', rate: '4.7', sales: '月售 920', time: '37分钟', dist: '2.3km', fee: '配送 ¥6', min: '起送 ¥38', tags: ['海鲜夜市'], menu: [
    { id: 'yy-night-24-1', name: '辣炒花蛤', desc: '贝类小炒', price: 28, icon: 'fa-shrimp', tone: 'a' },
    { id: 'yy-night-24-2', name: '蒜蓉蛏子', desc: '贝类小炒', price: 32, icon: 'fa-shrimp', tone: 'b' },
    { id: 'yy-night-24-3', name: '爆炒田螺', desc: '贝类小炒', price: 26, icon: 'fa-shrimp', tone: 'c' },
    { id: 'yy-night-24-4', name: '海鲜炒饭', desc: '贝类小炒', price: 24, icon: 'fa-shrimp', tone: 'd' }
  ] },
  { id: 'yy-night-25', category: 'night', name: '夜行汉堡屋', icon: 'fa-burger', tone: 'a', rate: '4.8', sales: '月售 2200', time: '26分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥22', tags: ['营业至凌晨4点'], menu: [
    { id: 'yy-night-25-1', name: '双层牛肉堡', desc: '深夜汉堡', price: 30, icon: 'fa-burger', tone: 'a' },
    { id: 'yy-night-25-2', name: '脆鸡堡', desc: '深夜汉堡', price: 22, icon: 'fa-burger', tone: 'b' },
    { id: 'yy-night-25-3', name: '鳕鱼堡', desc: '深夜汉堡', price: 24, icon: 'fa-burger', tone: 'c' },
    { id: 'yy-night-25-4', name: '芝士薯条', desc: '深夜汉堡', price: 16, icon: 'fa-burger', tone: 'd' }
  ] },
  { id: 'yy-night-26', category: 'night', name: '月光章鱼烧', icon: 'fa-circle', tone: 'b', rate: '4.7', sales: '月售 1850', time: '21分钟', dist: '0.8km', fee: '配送 ¥3', min: '起送 ¥16', tags: ['现烤小丸子'], menu: [
    { id: 'yy-night-26-1', name: '原味章鱼烧', desc: '日式街头小食', price: 14, icon: 'fa-circle', tone: 'a' },
    { id: 'yy-night-26-2', name: '芝士章鱼烧', desc: '日式街头小食', price: 17, icon: 'fa-circle', tone: 'b' },
    { id: 'yy-night-26-3', name: '芥末章鱼烧', desc: '日式街头小食', price: 15, icon: 'fa-circle', tone: 'c' },
    { id: 'yy-night-26-4', name: '大阪烧', desc: '日式街头小食', price: 20, icon: 'fa-circle', tone: 'd' }
  ] },
  { id: 'yy-night-27', category: 'night', name: '夜半汤饭', icon: 'fa-bowl-rice', tone: 'c', rate: '4.8', sales: '月售 780', time: '34分钟', dist: '2.0km', fee: '配送 ¥5', min: '起送 ¥30', tags: ['暖胃汤饭'], menu: [
    { id: 'yy-night-27-1', name: '牛肉汤饭', desc: '韩式汤饭', price: 30, icon: 'fa-bowl-rice', tone: 'a' },
    { id: 'yy-night-27-2', name: '泡菜汤饭', desc: '韩式汤饭', price: 26, icon: 'fa-bowl-rice', tone: 'b' },
    { id: 'yy-night-27-3', name: '猪骨汤饭', desc: '韩式汤饭', price: 32, icon: 'fa-bowl-rice', tone: 'c' },
    { id: 'yy-night-27-4', name: '辣炒年糕', desc: '韩式汤饭', price: 18, icon: 'fa-bowl-rice', tone: 'd' }
  ] },
  { id: 'yy-night-28', category: 'night', name: '酸辣夜食铺', icon: 'fa-pepper-hot', tone: 'd', rate: '4.6', sales: '月售 2650', time: '23分钟', dist: '0.9km', fee: '配送 ¥3', min: '起送 ¥16', tags: ['酸辣开胃'], menu: [
    { id: 'yy-night-28-1', name: '酸辣粉', desc: '酸辣小吃', price: 15, icon: 'fa-pepper-hot', tone: 'a' },
    { id: 'yy-night-28-2', name: '酸汤水饺', desc: '酸辣小吃', price: 18, icon: 'fa-pepper-hot', tone: 'b' },
    { id: 'yy-night-28-3', name: '酸辣土豆粉', desc: '酸辣小吃', price: 17, icon: 'fa-pepper-hot', tone: 'c' },
    { id: 'yy-night-28-4', name: '狼牙土豆', desc: '酸辣小吃', price: 12, icon: 'fa-pepper-hot', tone: 'd' }
  ] },
  { id: 'yy-night-29', category: 'night', name: '芝士焗夜', icon: 'fa-cheese', tone: 'a', rate: '4.7', sales: '月售 660', time: '32分钟', dist: '1.9km', fee: '配送 ¥5', min: '起送 ¥28', tags: ['芝士爱好者'], menu: [
    { id: 'yy-night-29-1', name: '芝士焗红薯', desc: '焗烤小食', price: 18, icon: 'fa-cheese', tone: 'a' },
    { id: 'yy-night-29-2', name: '芝士焗饭', desc: '焗烤小食', price: 28, icon: 'fa-cheese', tone: 'b' },
    { id: 'yy-night-29-3', name: '芝士焗蘑菇', desc: '焗烤小食', price: 20, icon: 'fa-cheese', tone: 'c' },
    { id: 'yy-night-29-4', name: '芝士玉米杯', desc: '焗烤小食', price: 15, icon: 'fa-cheese', tone: 'd' }
  ] },
  { id: 'yy-night-30', category: 'night', name: '炭火烤饼摊', icon: 'fa-bread-slice', tone: 'b', rate: '4.6', sales: '月售 1380', time: '25分钟', dist: '1.1km', fee: '配送 ¥3', min: '起送 ¥18', tags: ['炭火现烤'], menu: [
    { id: 'yy-night-30-1', name: '孜然羊肉烤饼', desc: '烤饼夹肉', price: 20, icon: 'fa-bread-slice', tone: 'a' },
    { id: 'yy-night-30-2', name: '香辣鸡肉烤饼', desc: '烤饼夹肉', price: 18, icon: 'fa-bread-slice', tone: 'b' },
    { id: 'yy-night-30-3', name: '梅干菜烤饼', desc: '烤饼夹肉', price: 12, icon: 'fa-bread-slice', tone: 'c' },
    { id: 'yy-night-30-4', name: '红糖烤饼', desc: '烤饼夹肉', price: 10, icon: 'fa-bread-slice', tone: 'd' }
  ] }
]

// 订单数据（仅真实订单，无示例）
var YUMYUM_ORDERS = []

function showYumYumHomePage(user) {
  var existing = document.getElementById('yumyum-home-page')
  if (existing) existing.remove()

  yumyumState.user = user
  yumyumState.tab = 'home'

  var page = document.createElement('div')
  page.id = 'yumyum-home-page'
  page.className = 'full-page yumyum-home-page'
  page.innerHTML =
    '<div class="yh-screen" id="yh-screen"></div>' +
    yhTabbarHTML('home')

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindYumYumTabbar(page)
  yhRenderTab(page, 'home')
  yhRefreshOrderBadge()

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
    if (t.clientX - startX > 80 && Math.abs(t.clientY - startY) < 100) closeYumYumHomePage()
  }, { passive: true })
}

// ===== 底部导航栏 =====
var YUMYUM_TABS = [
  { key: 'home',   label: '首页', icon: 'fa-utensils' },
  { key: 'orders', label: '订单', icon: 'fa-receipt' },
  { key: 'mine',   label: '我的', icon: 'fa-user' }
]

function yhTabbarHTML(active) {
  // 角标初始不渲染，进入后由 yhRefreshOrderBadge 按真实订单异步填充
  var items = YUMYUM_TABS.map(function(t) {
    return '<button class="yh-tab' + (t.key === active ? ' active' : '') + '" data-tab="' + t.key + '" type="button">' +
        '<span class="yh-tab-ico"><i class="fa-solid ' + t.icon + '"></i></span>' +
        '<span class="yh-tab-label">' + t.label + '</span>' +
      '</button>'
  }).join('')
  return '<nav class="yh-tabbar">' + items + '</nav>'
}

// 刷新订单 tab 角标：真实进行中 + 示例进行中
async function yhRefreshOrderBadge() {
  var page = document.getElementById('yumyum-home-page')
  if (!page) return
  var tab = page.querySelector('.yh-tab[data-tab="orders"] .yh-tab-ico')
  if (!tab) return
  var uid = yumyumState.user && yumyumState.user.id
  var n = 0
  if (uid) {
    var orders = await yhGetOrders(uid)
    n = orders.filter(function(o) { return yhOrderStatus(o).state !== 'done' }).length
  }
  var existing = tab.querySelector('.yh-tab-badge')
  if (n > 0) {
    var txt = n > 99 ? '99+' : ('' + n)
    if (existing) existing.textContent = txt
    else tab.insertAdjacentHTML('beforeend', '<span class="yh-tab-badge">' + txt + '</span>')
  } else if (existing) {
    existing.remove()
  }
}

function bindYumYumTabbar(page) {
  page.querySelectorAll('.yh-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.dataset.tab
      if (tab === yumyumState.tab) return
      yumyumState.tab = tab
      page.querySelectorAll('.yh-tab').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tab === tab)
      })
      yhRenderTab(page, tab)
    })
  })
}

function yhGoTab(tab) {
  var page = document.getElementById('yumyum-home-page')
  if (!page) return
  yumyumState.tab = tab
  page.querySelectorAll('.yh-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab)
  })
  yhRenderTab(page, tab)
}

// ===== 标签渲染分发 =====
function yhRenderTab(page, tab) {
  // 切换标签时清掉订单列表的自动刷新定时器，避免泄漏
  if (page._yhOrdersTimer) { clearInterval(page._yhOrdersTimer); page._yhOrdersTimer = null }
  var screen = page.querySelector('#yh-screen')
  screen.scrollTop = 0
  if (tab === 'home') yhRenderHome(screen)
  else if (tab === 'orders') yhRenderOrders(screen)
  else if (tab === 'mine') yhRenderMine(screen)
}

// ===== 首页 =====
function yhShopHTML(s) {
  var tags = s.tags.map(function(t) {
    return '<span class="yh-shop-tag">' + yhEsc(t) + '</span>'
  }).join('')
  return '<article class="yh-shop" data-id="' + s.id + '">' +
      '<div class="yh-shop-img tone-' + s.tone + '"><i class="fa-solid ' + s.icon + '"></i></div>' +
      '<div class="yh-shop-info">' +
        '<div class="yh-shop-name">' + yhEsc(s.name) + '</div>' +
        '<div class="yh-shop-meta">' +
          '<span class="yh-shop-rate"><i class="fa-solid fa-star"></i>' + s.rate + '</span>' +
          '<span>' + s.sales + '</span>' +
          '<span class="yh-dot"></span>' +
          '<span>' + s.time + '</span>' +
        '</div>' +
        '<div class="yh-shop-deliver"><em>' + s.fee + '</em> · ' + s.min + ' · ' + s.dist + '</div>' +
        '<div class="yh-shop-tags">' + tags + '</div>' +
      '</div>' +
    '</article>'
}

function yhRenderHome(screen) {
  var cats = YUMYUM_CATS.map(function(c) {
    return '<button class="yh-cat" type="button" data-cat="' + c.cat + '" data-label="' + c.label + '">' +
        '<span class="yh-cat-ico"><i class="fa-solid ' + c.icon + '"></i></span>' +
        '<span class="yh-cat-label">' + c.label + '</span>' +
      '</button>'
  }).join('')

  var promos = YUMYUM_PROMOS.map(function(p) {
    return '<button class="yh-promo" type="button">' +
        '<div class="yh-promo-img tone-' + p.tone + '"><i class="fa-solid ' + p.icon + '"></i></div>' +
        '<div class="yh-promo-body">' +
          '<div class="yh-promo-title">' + yhEsc(p.title) + '</div>' +
          '<span class="yh-promo-tag">' + yhEsc(p.tag) + '</span>' +
        '</div>' +
      '</button>'
  }).join('')

  // 首次进入时随机抽取并记住，之后重渲染（切标签/重进）保持不变，只有“换一批”才更新
  if (!yumyumState.homeShopIds) {
    yumyumState.homeShopIds = yhPickRandomShops(YUMYUM_SHOPS, 8, []).map(function(s) { return s.id })
  }
  var homeShops = yhShopsByIds(yumyumState.homeShopIds)
  var shops = homeShops.map(yhShopHTML).join('')

  screen.innerHTML =
    '<header class="yh-topbar">' +
      '<button class="yh-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<button class="yh-loc" type="button"><i class="fa-solid fa-location-dot"></i><span>当前位置</span><i class="fa-solid fa-angle-down yh-loc-caret"></i></button>' +
      '<div class="yh-search"><i class="fa-solid fa-magnifying-glass"></i><span>搜索美食 / 商家</span></div>' +
      '<button class="yh-top-ic" type="button" aria-label="消息"><i class="fa-solid fa-bell"></i></button>' +
    '</header>' +
    '<div class="yh-scroll">' +
      '<section class="yh-banner">' +
        '<div class="yh-banner-text">' +
          '<span class="yh-banner-kicker">YUMYUM 外卖</span>' +
          '<h2>好饭马上到<br>30分钟新鲜直达</h2>' +
          '<span class="yh-banner-sub">精选附近好店 · 准时必达</span>' +
        '</div>' +
        '<div class="yh-banner-art"><i class="fa-solid fa-drumstick-bite"></i></div>' +
      '</section>' +
      '<section class="yh-cats">' + cats + '</section>' +
      '<section class="yh-section-head"><h3>限时优惠</h3><span>今日特价</span></section>' +
      '<div class="yh-promo-row">' + promos + '</div>' +
      '<section class="yh-section-head"><h3>附近好店</h3><button class="yh-refresh" type="button"><i class="fa-solid fa-arrows-rotate"></i>换一批</button></section>' +
      '<section class="yh-shop-list" id="yh-home-shop-list">' + shops + '</section>' +
    '</div>'

  screen.querySelector('.yh-back').addEventListener('click', closeYumYumHomePage)
  screen.querySelector('.yh-search').addEventListener('click', function() { yumyumToast('搜索暂未开放') })
  screen.querySelector('.yh-loc').addEventListener('click', function() { yumyumToast('定位暂未开放') })
  screen.querySelector('.yh-top-ic').addEventListener('click', function() { yumyumToast('暂无新消息') })
  screen.querySelectorAll('.yh-promo').forEach(function(el) {
    el.addEventListener('click', function() { yumyumToast('该功能暂未开放') })
  })
  screen.querySelectorAll('.yh-cat').forEach(function(el) {
    el.addEventListener('click', function() {
      showYumYumCategoryPage(el.dataset.cat, el.dataset.label)
    })
  })

  // 附近好店：当前展示与“换一批”
  var homeList = screen.querySelector('#yh-home-shop-list')
  function bindHomeShops() {
    homeList.querySelectorAll('.yh-shop').forEach(function(el) {
      el.addEventListener('click', function() {
        var shop = yhFindShop(el.dataset.id)
        if (shop) showYumYumShopPage(shop)
      })
    })
  }
  bindHomeShops()
  screen.querySelector('.yh-refresh').addEventListener('click', function() {
    var next = yhPickRandomShops(YUMYUM_SHOPS, 8, yumyumState.homeShopIds)
    yumyumState.homeShopIds = next.map(function(s) { return s.id })
    homeList.innerHTML = next.map(yhShopHTML).join('')
    bindHomeShops()
  })
}

// ===== 分类店铺列表页（点击首页分类图标进入，每次展示 8 家，可“换一批”随机刷新） =====
function showYumYumCategoryPage(catKey, catLabel) {
  var existing = document.getElementById('yumyum-category-page')
  if (existing) existing.remove()

  var pool = yhShopsByCategory(catKey)
  // 首次进入该分类时随机抽取并记住，再次进入保持不变，只有“换一批”才更新
  if (!yumyumState.catShopIds[catKey]) {
    yumyumState.catShopIds[catKey] = yhPickRandomShops(pool, 8, []).map(function(s) { return s.id })
  }
  var current = yhShopsByIds(yumyumState.catShopIds[catKey])

  var page = document.createElement('div')
  page.id = 'yumyum-category-page'
  page.className = 'full-page yumyum-category-page'
  page.innerHTML =
    '<header class="yh-shop-topbar">' +
      '<button class="yh-cat-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="yh-shop-topname">' + yhEsc(catLabel || '分类') + '</div>' +
      '<button class="yh-cat-refresh" type="button" aria-label="换一批"><i class="fa-solid fa-arrows-rotate"></i></button>' +
    '</header>' +
    '<div class="yh-cat-scroll">' +
      '<section class="yh-section-head"><h3>为你推荐</h3><button class="yh-refresh yh-refresh-main" type="button"><i class="fa-solid fa-arrows-rotate"></i>换一批</button></section>' +
      '<section class="yh-shop-list" id="yh-cat-shop-list"></section>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  var listEl = page.querySelector('#yh-cat-shop-list')
  function paint(shops) {
    listEl.innerHTML = shops.map(yhShopHTML).join('')
    listEl.querySelectorAll('.yh-shop').forEach(function(el) {
      el.addEventListener('click', function() {
        var shop = yhFindShop(el.dataset.id)
        if (shop) showYumYumShopPage(shop)
      })
    })
  }
  paint(current)

  function refresh() {
    var next = yhPickRandomShops(pool, 8, yumyumState.catShopIds[catKey])
    yumyumState.catShopIds[catKey] = next.map(function(s) { return s.id })
    paint(next)
    page.querySelector('.yh-cat-scroll').scrollTop = 0
  }
  page.querySelector('.yh-cat-refresh').addEventListener('click', refresh)
  page.querySelector('.yh-refresh-main').addEventListener('click', refresh)
  page.querySelector('.yh-cat-back').addEventListener('click', closeYumYumCategoryPage)
  yhBindEdgeBack(page, closeYumYumCategoryPage)
}

function closeYumYumCategoryPage() {
  var page = document.getElementById('yumyum-category-page')
  if (!page) return
  if (window.closePage) window.closePage('yumyum-category-page')
  else page.remove()
}

// ===== 订单 =====
function yhRenderOrders(screen) {
  var filters = [
    { key: 'all',   label: '全部' },
    { key: 'going', label: '进行中' },
    { key: 'done',  label: '已完成' }
  ]
  var chips = filters.map(function(f) {
    return '<button class="yh-filter' + (f.key === yumyumState.orderFilter ? ' active' : '') + '" data-filter="' + f.key + '" type="button">' + f.label + '</button>'
  }).join('')

  screen.innerHTML =
    '<header class="yh-topbar yh-topbar-plain"><h1 class="yh-page-title">订单</h1></header>' +
    '<div class="yh-filterbar">' + chips + '</div>' +
    '<div class="yh-scroll" id="yh-order-scroll"></div>'

  // 真实订单 → 卡片展示结构
  function mapReal(o) {
    var st = yhOrderStatus(o)
    var done = st.state === 'done'
    var itemNames = o.items.map(function(it) { return it.name }).join('、')
    var itemsText = o.items.length > 1 ? (o.items[0].name + ' 等' + o.count + '件') : (itemNames + ' x' + o.count)
    return {
      order: o, id: o.id, shop: o.shopName, icon: o.shopIcon, tone: o.shopTone,
      items: itemsText, count: o.count, price: o.total, time: yhFormatTime(o.createdAt),
      filterState: done ? 'done' : 'going', done: done, stateLabel: st.label
    }
  }

  function actionsHTML(o) {
    return o.done
      ? '<button class="yh-order-btn" type="button" data-act="detail">查看订单</button>' +
        '<button class="yh-order-btn primary" type="button" data-act="reorder">再来一单</button>'
      : '<button class="yh-order-btn" type="button" data-act="detail">联系骑手</button>' +
        '<button class="yh-order-btn primary" type="button" data-act="detail">查看配送</button>'
  }

  function cardHTML(o) {
    return '<article class="yh-order is-real" data-id="' + yhEsc(o.id) + '">' +
        '<div class="yh-order-top">' +
          '<span class="yh-order-shop">' + yhEsc(o.shop) + '<i class="fa-solid fa-angle-right"></i></span>' +
          '<span class="yh-order-status' + (o.done ? ' done' : '') + '">' + yhEsc(o.stateLabel) + '</span>' +
        '</div>' +
        '<div class="yh-order-body">' +
          '<div class="yh-order-img tone-' + o.tone + '"><i class="fa-solid ' + o.icon + '"></i></div>' +
          '<div class="yh-order-detail">' +
            '<div class="yh-order-items">' + yhEsc(o.items) + '</div>' +
            '<div class="yh-order-time">' + yhEsc(o.time) + '</div>' +
          '</div>' +
          '<div class="yh-order-amount">' +
            '<div class="yh-order-price"><em>¥</em>' + o.price + '</div>' +
            '<div class="yh-order-count">共' + o.count + '件</div>' +
          '</div>' +
        '</div>' +
        '<div class="yh-order-foot">' + actionsHTML(o) + '</div>' +
      '</article>'
  }

  function bindFoot(card, o) {
    card.querySelectorAll('[data-act="detail"]').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); showYumYumOrderPage(o.order) })
    })
    card.querySelectorAll('[data-act="reorder"]').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); yumyumToast('该功能暂未开放') })
    })
  }

  function filterList(reals) {
    return yumyumState.orderFilter === 'all'
      ? reals
      : reals.filter(function(o) { return o.filterState === yumyumState.orderFilter })
  }

  function viewSig(list) {
    var byId = {}
    list.forEach(function(x) { byId[x.id] = { done: x.done, label: x.stateLabel } })
    return { ids: list.map(function(x) { return x.id }), byId: byId }
  }

  // 整列渲染（结构变化时调用）
  function renderList(list) {
    var box = screen.querySelector('#yh-order-scroll')
    if (!box) return
    if (!list.length) {
      box.innerHTML =
        '<div class="yh-empty">' +
          '<i class="fa-solid fa-receipt"></i>' +
          '<p>暂无相关订单</p>' +
        '</div>'
      screen._lastView = viewSig(list)
      return
    }
    box.innerHTML = '<section class="yh-order-list">' + list.map(cardHTML).join('') + '</section>'
    box.querySelectorAll('.yh-order').forEach(function(card) {
      var item = list.filter(function(x) { return x.id === card.dataset.id })[0]
      if (!item) return
      card.querySelector('.yh-order-shop').addEventListener('click', function(e) { e.stopPropagation(); showYumYumOrderPage(item.order) })
      card.addEventListener('click', function() { showYumYumOrderPage(item.order) })
      bindFoot(card, item)
    })
    screen._lastView = viewSig(list)
  }

  // 单卡就地更新（状态变化但不影响列表成员时调用，避免整列重绘闪烁）
  function patchCard(item) {
    var box = screen.querySelector('#yh-order-scroll')
    if (!box) return
    var card = box.querySelector('.yh-order[data-id="' + (window.CSS && CSS.escape ? CSS.escape(item.id) : item.id) + '"]')
    if (!card) return
    var status = card.querySelector('.yh-order-status')
    status.textContent = item.stateLabel
    status.classList.toggle('done', item.done)
    var foot = card.querySelector('.yh-order-foot')
    foot.innerHTML = actionsHTML(item)
    bindFoot(card, item)
  }

  // 拉取并刷新；full=true 强制整列重绘（筛选切换/成员变化）
  async function refresh(full) {
    var box = screen.querySelector('#yh-order-scroll')
    if (!box) return
    var uid = yumyumState.user && yumyumState.user.id
    var reals = uid ? (await yhGetOrders(uid)).map(mapReal) : []
    var list = filterList(reals)
    var prev = screen._lastView
    var sameMembership = !full && prev && prev.ids.length === list.length &&
      prev.ids.every(function(id, i) { return id === list[i].id })
    if (!sameMembership) {
      renderList(list)
    } else {
      list.forEach(function(item) {
        var was = prev.byId[item.id]
        if (!was || was.done !== item.done || was.label !== item.stateLabel) patchCard(item)
      })
      screen._lastView = viewSig(list)
    }
    yhRefreshOrderBadge()
  }

  screen.querySelectorAll('.yh-filter').forEach(function(chip) {
    chip.addEventListener('click', function() {
      yumyumState.orderFilter = chip.dataset.filter
      screen.querySelectorAll('.yh-filter').forEach(function(c) {
        c.classList.toggle('active', c.dataset.filter === yumyumState.orderFilter)
      })
      refresh(true)
    })
  })

  // 启动列表自动刷新（订单状态随时间推进时就地更新）
  var homePage = document.getElementById('yumyum-home-page')
  if (homePage) {
    if (homePage._yhOrdersTimer) clearInterval(homePage._yhOrdersTimer)
    homePage._yhOrdersTimer = setInterval(function() {
      if (!screen.querySelector('#yh-order-scroll')) return
      refresh(false)
    }, 3000)
  }

  refresh(true)
}

// ===== 我的 =====
function yhRenderMine(screen) {
  var user = yumyumState.user || {}
  var name = user.nick || user.name || 'YumYum 用户'
  var avatar = user.avatar || ''
  var avatarHTML = avatar
    ? '<img class="yh-mine-avatar" src="' + yhEsc(avatar) + '" alt="">'
    : '<div class="yh-mine-avatar yh-mine-avatar-ph"><i class="fa-solid fa-user"></i></div>'

  var orders = [
    { icon: 'fa-coins',        label: '待支付' },
    { icon: 'fa-truck-fast',   label: '配送中' },
    { icon: 'fa-star',         label: '待评价' }
  ]
  var ordersHTML = orders.map(function(o) {
    return '<button class="yh-order-cell" type="button">' +
        '<i class="fa-solid ' + o.icon + '"></i><span>' + o.label + '</span>' +
      '</button>'
  }).join('')

  var voucherCount = yhAvailableVouchers().length

  var tools = [
    { icon: 'fa-heart',         label: '我的收藏' },
    { icon: 'fa-location-dot',  label: '收货地址' },
    { icon: 'fa-wallet',        label: '我的钱包' },
    { icon: 'fa-headset',       label: '联系客服' },
    { icon: 'fa-gear',          label: '设置' }
  ]
  var toolsHTML = tools.map(function(t) {
    return '<button class="yh-tool-row" type="button">' +
        '<span class="yh-tool-left"><i class="fa-solid ' + t.icon + '"></i>' + t.label + '</span>' +
        '<i class="fa-solid fa-angle-right yh-tool-arrow"></i>' +
      '</button>'
  }).join('')

  screen.innerHTML =
    '<div class="yh-scroll">' +
      '<section class="yh-mine-head">' +
        avatarHTML +
        '<div class="yh-mine-id">' +
          '<div class="yh-mine-name">' + yhEsc(name) + '</div>' +
          '<div class="yh-mine-sub">查看并编辑个人资料</div>' +
        '</div>' +
        '<button class="yh-mine-setting" type="button" aria-label="设置"><i class="fa-solid fa-gear"></i></button>' +
      '</section>' +
      '<section class="yh-mine-stats">' +
        '<button class="yh-stat" type="button"><strong>¥0.00</strong><span>余额</span></button>' +
        '<button class="yh-stat" id="yh-stat-voucher" type="button"><strong>' + voucherCount + '</strong><span>红包</span></button>' +
        '<button class="yh-stat" type="button"><strong>1280</strong><span>积分</span></button>' +
      '</section>' +
      '<section class="yh-panel">' +
        '<div class="yh-panel-head"><h3>我的订单</h3><button class="yh-panel-more" type="button">全部订单 <i class="fa-solid fa-angle-right"></i></button></div>' +
        '<div class="yh-order-grid">' + ordersHTML + '</div>' +
      '</section>' +
      '<section class="yh-panel yh-tools">' + toolsHTML + '</section>' +
    '</div>'

  screen.querySelector('.yh-panel-more').addEventListener('click', function() { yhGoTab('orders') })
  screen.querySelectorAll('.yh-order-cell').forEach(function(el) {
    el.addEventListener('click', function() { yhGoTab('orders') })
  })
  screen.querySelector('#yh-stat-voucher').addEventListener('click', function(e) {
    e.stopPropagation()
    openYumYumVouchersPage()
  })
  screen.querySelectorAll('.yh-tool-row, .yh-mine-setting, .yh-stat:not(#yh-stat-voucher)').forEach(function(el) {
    el.addEventListener('click', function() { yumyumToast('该功能暂未开放') })
  })
}

function closeYumYumHomePage() {
  var page = document.getElementById('yumyum-home-page')
  if (!page) return
  if (page._yhOrdersTimer) { clearInterval(page._yhOrdersTimer); page._yhOrdersTimer = null }
  if (window.closePage) {
    window.closePage('yumyum-home-page')
  } else {
    page.remove()
  }
}

// ===== 我的红包 / 神券页 =====
function openYumYumVouchersPage() {
  var existing = document.getElementById('yumyum-vouchers-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'yumyum-vouchers-page'
  page.className = 'full-page yumyum-vouchers-page'
  page.innerHTML =
    '<header class="yh-shop-topbar">' +
      '<button class="yh-vc-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="yh-shop-topname">我的红包</div>' +
      '<span style="width:34px"></span>' +
    '</header>' +
    '<div class="yh-vc-scroll" id="yh-vc-scroll"></div>'

  if (window.openPage) window.openPage(page)
  else (document.getElementById('app') || document.body).appendChild(page)

  yhRenderVouchersPage(page)
  page.querySelector('.yh-vc-back').addEventListener('click', closeYumYumVouchersPage)
  yhBindEdgeBack(page, closeYumYumVouchersPage)
}

function closeYumYumVouchersPage() {
  var page = document.getElementById('yumyum-vouchers-page')
  if (!page) return
  if (window.closePage) window.closePage('yumyum-vouchers-page')
  else page.remove()
}

function yhVoucherCardHTML(v, opts) {
  opts = opts || {}
  var used = opts.used
  var inflateBtn = ''
  if (opts.daily) {
    inflateBtn = v.inflated
      ? '<span class="yh-vc-inflate is-done">已膨胀</span>'
      : '<button class="yh-vc-inflate" type="button" data-inflate="' + v.id + '">膨胀</button>'
  }
  var corner = opts.daily ? '<span class="yh-vc-corner">' + YUMYUM_VOUCHER_SVG + '</span>' : ''
  return '<div class="yh-vc-card' + (used ? ' is-used' : '') + (v.inflated ? ' is-inflated' : '') + '">' +
      corner +
      '<div class="yh-vc-amt"><em>¥</em><strong>' + v.value + '</strong></div>' +
      '<div class="yh-vc-info">' +
        '<div class="yh-vc-cond">' + yhVoucherCond(v.threshold) + '</div>' +
        '<div class="yh-vc-tag">' + (opts.daily ? '<span>当天到期</span>' : '<span>YUM红包 · 长期有效</span>') + '</div>' +
      '</div>' +
      inflateBtn +
    '</div>'
}

function yhRenderVouchersPage(page) {
  var data = yhLoadVouchers()
  var used = data.usedIds
  var scroll = page.querySelector('#yh-vc-scroll')

  var dailyHTML = data.daily.list.map(function(v) {
    return yhVoucherCardHTML(v, { daily: true, used: used.indexOf(v.id) !== -1 })
  }).join('')
  var fixedHTML = data.fixed.map(function(v) {
    return yhVoucherCardHTML(v, { daily: false, used: used.indexOf(v.id) !== -1 })
  }).join('')

  scroll.innerHTML =
    '<section class="yh-vc-section">' +
      '<div class="yh-vc-sec-head"><h3>今日神券</h3><span>每日 5 张 · 当天到期 · 可膨胀一次</span></div>' +
      '<div class="yh-vc-list">' + dailyHTML + '</div>' +
    '</section>' +
    '<section class="yh-vc-section">' +
      '<div class="yh-vc-sec-head"><h3>我的红包</h3><span>长期有效</span></div>' +
      '<div class="yh-vc-list">' + fixedHTML + '</div>' +
    '</section>'

  scroll.querySelectorAll('[data-inflate]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var v = yhInflateVoucher(btn.getAttribute('data-inflate'))
      if (v) yumyumToast('膨胀成功！已涨至 ¥' + v.value)
      yhRenderVouchersPage(page)
    })
  })
}

// 通用：左缘右滑返回手势
function yhBindEdgeBack(page, onBack) {
  var startX = 0, startY = 0, tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) { startX = t.clientX; startY = t.clientY; tracking = true }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    if (t.clientX - startX > 80 && Math.abs(t.clientY - startY) < 100) onBack()
  }, { passive: true })
}

// ===== 店铺详情页 =====
function showYumYumShopPage(shop) {
  var existing = document.getElementById('yumyum-shop-page')
  if (existing) existing.remove()

  yhEnterShopCart(shop)

  var page = document.createElement('div')
  page.id = 'yumyum-shop-page'
  page.className = 'full-page yumyum-shop-page'
  page._shop = shop
  page.innerHTML =
    '<header class="yh-shop-topbar">' +
      '<button class="yh-shop-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="yh-shop-topname">' + yhEsc(shop.name) + '</div>' +
      '<button class="yh-shop-top-ic" type="button" aria-label="分享"><i class="fa-solid fa-ellipsis"></i></button>' +
    '</header>' +
    '<div class="yh-shop-scroll" id="yh-shop-scroll">' +
      '<section class="yh-shophead">' +
        '<div class="yh-shophead-img tone-' + shop.tone + '"><i class="fa-solid ' + shop.icon + '"></i></div>' +
        '<div class="yh-shophead-info">' +
          '<div class="yh-shophead-name">' +
            '<span class="yh-shophead-name-text">' + yhEsc(shop.name) + '</span>' +
            '<button class="yh-fav" type="button" aria-label="收藏"><i class="fa-regular fa-heart"></i></button>' +
          '</div>' +
          '<div class="yh-shophead-meta">' +
            '<span class="yh-shop-rate"><i class="fa-solid fa-star"></i>' + shop.rate + '</span>' +
            '<span>' + shop.sales + '</span><span class="yh-dot"></span><span>' + shop.time + '</span>' +
          '</div>' +
          '<div class="yh-shophead-deliver"><em>' + shop.fee + '</em> · ' + shop.min + ' · ' + shop.dist + '</div>' +
        '</div>' +
      '</section>' +
      '<section class="yh-menu-head"><h3>点餐</h3><span>共' + (shop.menu || []).length + '款</span></section>' +
      '<section class="yh-menu-list" id="yh-menu-list"></section>' +
    '</div>' +
    yhCartbarHTML(shop)

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  yhRenderMenu(page, shop)
  page.querySelector('.yh-shop-back').addEventListener('click', closeYumYumShopPage)
  page.querySelector('.yh-shop-top-ic').addEventListener('click', function() { yumyumToast('该功能暂未开放') })
  var favBtn = page.querySelector('.yh-fav')
  favBtn.addEventListener('click', function() {
    var on = favBtn.classList.toggle('active')
    var ic = favBtn.querySelector('i')
    ic.classList.toggle('fa-solid', on)
    ic.classList.toggle('fa-regular', !on)
  })
  page.querySelector('.yh-cartbar-go').addEventListener('click', function() {
    var t = yhCartTotal(shop)
    if (t.count <= 0) { yumyumToast('请先选择商品'); return }
    var min = yhFeeNumber(shop.min)
    if (t.amount < min) { yumyumToast('还差¥' + (min - t.amount) + '起送'); return }
    closeYumYumShopPage()
    showYumYumCheckoutPage(shop)
  })

  yhBindEdgeBack(page, closeYumYumShopPage)
}

function yhMenuRowHTML(item) {
  var qty = yumyumState.cart[item.id] || 0
  var stepper = '<div class="yh-step">' +
    (qty > 0
      ? '<button class="yh-step-minus" type="button" data-id="' + item.id + '" aria-label="减少"><i class="fa-solid fa-minus"></i></button>' +
        '<span class="yh-step-qty">' + qty + '</span>'
      : '') +
    '<button class="yh-step-plus" type="button" data-id="' + item.id + '" aria-label="增加"><i class="fa-solid fa-plus"></i></button>' +
  '</div>'
  return '<article class="yh-menu-item" data-id="' + item.id + '">' +
      '<div class="yh-menu-img tone-' + item.tone + '"><i class="fa-solid ' + item.icon + '"></i></div>' +
      '<div class="yh-menu-info">' +
        '<div class="yh-menu-name">' + yhEsc(item.name) + '</div>' +
        '<div class="yh-menu-desc">' + yhEsc(item.desc) + '</div>' +
        '<div class="yh-menu-foot">' +
          '<div class="yh-menu-price"><em>¥</em>' + item.price + '</div>' +
          stepper +
        '</div>' +
      '</div>' +
    '</article>'
}

function yhRenderMenu(page, shop) {
  var list = page.querySelector('#yh-menu-list')
  list.innerHTML = (shop.menu || []).map(yhMenuRowHTML).join('')
  list.querySelectorAll('.yh-step-plus').forEach(function(btn) {
    btn.addEventListener('click', function() { yhChangeQty(page, shop, btn.dataset.id, 1) })
  })
  list.querySelectorAll('.yh-step-minus').forEach(function(btn) {
    btn.addEventListener('click', function() { yhChangeQty(page, shop, btn.dataset.id, -1) })
  })
}

function yhChangeQty(page, shop, itemId, delta) {
  var cur = yumyumState.cart[itemId] || 0
  var next = Math.max(0, cur + delta)
  if (next === 0) delete yumyumState.cart[itemId]
  else yumyumState.cart[itemId] = next
  // 重渲染该行
  var row = page.querySelector('.yh-menu-item[data-id="' + itemId + '"]')
  var item = (shop.menu || []).filter(function(m) { return m.id === itemId })[0]
  if (row && item) {
    row.outerHTML = yhMenuRowHTML(item)
    var fresh = page.querySelector('.yh-menu-item[data-id="' + itemId + '"]')
    var plus = fresh.querySelector('.yh-step-plus')
    if (plus) plus.addEventListener('click', function() { yhChangeQty(page, shop, itemId, 1) })
    var minus = fresh.querySelector('.yh-step-minus')
    if (minus) minus.addEventListener('click', function() { yhChangeQty(page, shop, itemId, -1) })
  }
  yhUpdateCartbar(page, shop)
}

function yhCartbarHTML(shop) {
  var t = yhCartTotal(shop)
  var empty = t.count <= 0
  var min = yhFeeNumber(shop.min)
  var belowMin = !empty && t.amount < min
  var goLabel = belowMin ? ('还差¥' + (min - t.amount) + '起送') : '下单'
  return '<div class="yh-cartbar' + (empty ? ' empty' : '') + (belowMin ? ' below-min' : '') + '">' +
      '<div class="yh-cartbar-cart">' +
        '<i class="fa-solid fa-basket-shopping"></i>' +
        '<span class="yh-cartbar-badge"' + (empty ? ' hidden' : '') + '>' + t.count + '</span>' +
      '</div>' +
      '<div class="yh-cartbar-price"><span class="yh-cartbar-total"><em>¥</em>' + t.amount + '</span><span class="yh-cartbar-fee">另需' + shop.fee + '</span></div>' +
      '<button class="yh-cartbar-go" type="button">' + goLabel + '</button>' +
    '</div>'
}

function yhUpdateCartbar(page, shop) {
  var bar = page.querySelector('.yh-cartbar')
  if (!bar) return
  var go = bar.querySelector('.yh-cartbar-go')
  var newBar = document.createElement('div')
  newBar.innerHTML = yhCartbarHTML(shop)
  bar.replaceWith(newBar.firstChild)
  var fresh = page.querySelector('.yh-cartbar')
  fresh.querySelector('.yh-cartbar-go').addEventListener('click', function() {
    var t = yhCartTotal(shop)
    if (t.count <= 0) { yumyumToast('请先选择商品'); return }
    var min = yhFeeNumber(shop.min)
    if (t.amount < min) { yumyumToast('还差¥' + (min - t.amount) + '起送'); return }
    closeYumYumShopPage()
    showYumYumCheckoutPage(shop)
  })
}

function closeYumYumShopPage() {
  var page = document.getElementById('yumyum-shop-page')
  if (!page) return
  if (window.closePage) window.closePage('yumyum-shop-page')
  else page.remove()
}

// ===== 下单（确认订单）页 =====
function yhPad2(n) { return n < 10 ? '0' + n : '' + n }

function yhParseMinutes(timeStr) {
  var m = ('' + timeStr).match(/\d+/)
  return m ? parseInt(m[0]) : 30
}

function yhFeeNumber(feeStr) {
  var m = ('' + feeStr).match(/\d+/)
  return m ? parseInt(m[0]) : 0
}

// 随机预计送达分钟：80% 落在 20–40，20% 落在 40–60
function yhRandomEtaMinutes() {
  return Math.random() < 0.8
    ? 20 + Math.floor(Math.random() * 21)
    : 40 + Math.floor(Math.random() * 21)
}

// ===== 订单持久化（db.config，仿 taobao） =====
var YUMYUM_ORDER_PREFIX = 'yumyum_orders_'
function yhOrderKey(uid) { return YUMYUM_ORDER_PREFIX + uid }

async function yhGetOrders(uid) {
  try {
    var row = await db.config.get(yhOrderKey(uid))
    return row && Array.isArray(row.value) ? row.value : []
  } catch (e) { return [] }
}

async function yhSaveOrders(uid, orders) {
  await db.config.put({ key: yhOrderKey(uid), value: orders })
}

async function yhPutOrder(uid, order) {
  var orders = await yhGetOrders(uid)
  var idx = orders.findIndex(function(o) { return o.id === order.id })
  if (idx >= 0) orders[idx] = order
  else orders.unshift(order)
  await yhSaveOrders(uid, orders)
}

// 订单状态（按当前时间即时计算）
function yhOrderStatus(o) {
  var now = Date.now()
  if (now < o.state1EndAt) return { state: 'state1', step: 1, label: '商家接单 · 备餐中' }
  if (now < o.actualDeliverAt) return { state: 'state2', step: 2, label: '骑手配送中' }
  return { state: 'done', step: 3, label: '已送达 · 订单完成' }
}

// 支付方式文案
function yhPayLabel(id) {
  return { yum: 'YUM支付', wx: '微信支付', hb: '花呗支付', bank: '银行卡支付' }[id] || '微信支付'
}

// 格式化时间：今天/昨天 HH:MM 或 M月D日 HH:MM
function yhFormatTime(ts) {
  var d = new Date(ts)
  var now = new Date()
  var hm = yhPad2(d.getHours()) + ':' + yhPad2(d.getMinutes())
  var sameDay = d.toDateString() === now.toDateString()
  var yest = new Date(now.getTime() - 86400000)
  if (sameDay) return '今天 ' + hm
  if (d.toDateString() === yest.toDateString()) return '昨天 ' + hm
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
}

// 真实扣款（仿 taobao tbPayOrder）
async function yhPayOrder(order, method, uid) {
  uid = parseInt(uid, 10)
  if (!uid) return { ok: false, msg: '暂无可用支付账号' }
  var amount = Math.round((Number(order.total) || 0) * 100) / 100
  var desc = 'YumYum 外卖订单'
  if (method === 'hb') {
    if (!window.huabeiSpend) return { ok: false, msg: '花呗不可用' }
    var h = await window.huabeiSpend(uid, amount, desc)
    return h || { ok: false, msg: '花呗支付失败' }
  }
  if (method === 'yum') return { ok: false, msg: 'YUM 余额不足' }
  // wx / bank
  var row = await db.config.get('wechat_wallet_' + uid)
  var wd = row ? row.value : null
  if (!wd || wd.wechatBalance === undefined) return { ok: false, msg: '请先在微信支付中生成账户余额' }
  var field = method === 'bank' ? 'checkingBalance' : 'wechatBalance'
  var source = method === 'bank' ? 'checking' : 'wechat'
  if ((Number(wd[field]) || 0) < amount) return { ok: false, msg: method === 'bank' ? '银行卡余额不足' : '微信零钱不足' }
  wd[field] = Math.round(((Number(wd[field]) || 0) - amount) * 100) / 100
  await db.config.put({ key: 'wechat_wallet_' + uid, value: wd })
  await db.finance.add({ charId: uid, amount: amount, desc: desc, type: 'expense', source: source, createdAt: Date.now() })
  return { ok: true }
}

function showYumYumCheckoutPage(shop) {
  var existing = document.getElementById('yumyum-checkout-page')
  if (existing) existing.remove()

  var minutes = yhRandomEtaMinutes()
  var eta = new Date(Date.now() + minutes * 60000)

  var page = document.createElement('div')
  page.id = 'yumyum-checkout-page'
  page.className = 'full-page yumyum-checkout-page'
  page._shop = shop
  page._etaText = '预计 ' + yhPad2(eta.getHours()) + ':' + yhPad2(eta.getMinutes()) + ' 送达（约' + minutes + '分钟）'
  page._etaMinutes = minutes
  page._etaAt = eta.getTime()
  page._remark = ''
  page._utensils = '无需餐具'
  page._pay = 'wx'
  page._voucherId = null
  page.innerHTML =
    '<header class="yh-shop-topbar">' +
      '<button class="yh-ck-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="yh-shop-topname">确认订单</div>' +
      '<span style="width:34px"></span>' +
    '</header>' +
    '<div class="yh-ck-scroll" id="yh-ck-scroll"></div>' +
    '<div class="yh-ck-bar">' +
      '<div class="yh-ck-bar-total">合计 <span><em>¥</em><strong id="yh-ck-bar-amt">0</strong></span></div>' +
      '<div class="yh-ck-bar-actions">' +
        '<button class="yh-ck-act gift" type="button">帮TA下单</button>' +
        '<button class="yh-ck-act proxy" type="button">找TA代付</button>' +
        '<button class="yh-ck-act pay" type="button">付款</button>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  yhRenderCheckout(page, shop)

  page.querySelector('.yh-ck-back').addEventListener('click', closeYumYumCheckoutPage)

  // 帮TA下单（赠送）：下单人先付款，立即生成完整订单，再选好友发送赠送卡片
  page.querySelector('.yh-ck-act.gift').addEventListener('click', async function() {
    var giftBtn = this
    if (!yumyumState.address) { yumyumToast('请先添加收货地址'); return }
    var uid = yumyumState.user && yumyumState.user.id
    if (!uid) { yumyumToast('请先登录'); return }

    var order = yhBuildOrder(page, shop)
    if (!order) { yumyumToast('购物车为空'); return }

    giftBtn.disabled = true
    var r = await yhPayOrder(order, page._pay, uid)
    giftBtn.disabled = false
    if (!r || !r.ok) { yumyumToast(r && r.msg ? r.msg : '支付失败'); return }

    if (page._voucherId) yhUseVoucher(page._voucherId)
    await yhPutOrder(uid, order)
    yumyumState.cart = {}
    yumyumState.cartShopId = null
    yhRefreshOrderBadge()

    showYumYumFriendPicker({
      title: '选择赠送好友',
      empty: '暂无微信好友',
      onPick: async function(friend) {
        await yhSendYumDeal(order, friend, 'gift')
        closeYumYumCheckoutPage()
        yumyumToast('礼物已送出')
      }
    })
  })

  // 找TA代付：构建仅含商品的订单（不扣款、不入列表、不生成时间线），选好友发送代付请求
  page.querySelector('.yh-ck-act.proxy').addEventListener('click', async function() {
    if (!yumyumState.address) { yumyumToast('请先添加收货地址'); return }
    var uid = yumyumState.user && yumyumState.user.id
    if (!uid) { yumyumToast('请先登录'); return }

    var base = yhBuildOrderItems(page, shop)
    if (!base) { yumyumToast('购物车为空'); return }
    base.etaMinutes = page._etaMinutes || yhRandomEtaMinutes()

    showYumYumFriendPicker({
      title: '发送代付请求',
      empty: '暂无微信好友',
      onPick: async function(friend) {
        await yhSendYumDeal(base, friend, 'pay')
        yumyumState.cart = {}
        yumyumState.cartShopId = null
        closeYumYumCheckoutPage()
        yumyumToast('代付请求已发送')
      }
    })
  })
  page.querySelector('.yh-ck-act.pay').addEventListener('click', async function() {
    var payBtn = this
    if (!yumyumState.address) { yumyumToast('请先添加收货地址'); return }
    var user = yumyumState.user
    var uid = user && user.id
    if (!uid) { yumyumToast('请先登录'); return }

    var order = yhBuildOrder(page, shop)
    if (!order) { yumyumToast('购物车为空'); return }

    payBtn.disabled = true
    var r = await yhPayOrder(order, page._pay, uid)
    payBtn.disabled = false
    if (!r || !r.ok) { yumyumToast(r && r.msg ? r.msg : '支付失败'); return }

    if (page._voucherId) yhUseVoucher(page._voucherId)
    await yhPutOrder(uid, order)
    yumyumState.cart = {}
    yumyumState.cartShopId = null
    closeYumYumCheckoutPage()
    yumyumToast('支付成功')
    yhRefreshOrderBadge()
    showYumYumOrderPage(order)
  })

  yhBindEdgeBack(page, closeYumYumCheckoutPage)
}

function yhRenderCheckout(page, shop) {
  var scroll = page.querySelector('#yh-ck-scroll')
  var items = yhCartItems(shop)
  var goods = items.reduce(function(s, r) { return s + r.item.price * r.qty }, 0)
  var deliverFee = yhFeeNumber(shop.fee)
  var packFee = items.length // 每款 ¥1 打包费

  // 可用红包/神券（商品额达门槛）
  var usableVouchers = yhAvailableVouchers().filter(function(v) { return goods >= v.threshold })
  var picked = null
  if (page._voucherId) {
    picked = usableVouchers.filter(function(v) { return v.id === page._voucherId })[0] || null
    if (!picked) page._voucherId = null
  }
  var voucherVal = picked ? picked.value : 0
  var couponText = picked
    ? '-¥' + voucherVal
    : (usableVouchers.length ? usableVouchers.length + '张可用' : '暂无可用红包')

  var total = Math.max(0, goods + deliverFee + packFee - voucherVal)

  // 地址卡
  var addr = yumyumState.address
  var addrHTML = addr
    ? '<button class="yh-addr-card filled" id="yh-addr-card" type="button">' +
        '<i class="fa-solid fa-location-dot yh-addr-pin"></i>' +
        '<div class="yh-addr-body">' +
          '<div class="yh-addr-detail">' + yhEsc(addr.detail) + '</div>' +
          '<div class="yh-addr-person">' + yhEsc(addr.name) + ' ' + yhEsc(addr.phone) + '</div>' +
        '</div>' +
        '<i class="fa-solid fa-angle-right yh-addr-arrow"></i>' +
      '</button>'
    : '<button class="yh-addr-card empty" id="yh-addr-card" type="button">' +
        '<i class="fa-solid fa-location-dot yh-addr-pin"></i>' +
        '<div class="yh-addr-body"><div class="yh-addr-add">添加收货地址</div><div class="yh-addr-hint">请填写收件人与详细地址</div></div>' +
        '<i class="fa-solid fa-angle-right yh-addr-arrow"></i>' +
      '</button>'

  var itemsHTML = items.map(function(r) {
    return '<div class="yh-ck-item">' +
        '<div class="yh-ck-item-img tone-' + r.item.tone + '"><i class="fa-solid ' + r.item.icon + '"></i></div>' +
        '<div class="yh-ck-item-name">' + yhEsc(r.item.name) + '</div>' +
        '<div class="yh-ck-item-qty">×' + r.qty + '</div>' +
        '<div class="yh-ck-item-price"><em>¥</em>' + (r.item.price * r.qty) + '</div>' +
      '</div>'
  }).join('')

  var pays = [
    { id: 'yum',  label: 'YUM支付',  svg: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M736.853333 477.013333a34.133333 34.133333 0 0 1-34.986666 33.28h-153.6v64h121.6a35.84 35.84 0 0 1 34.986666 34.986667v3.84a34.133333 34.133333 0 0 1-34.986666 32.853333h-122.026667v149.333334a35.84 35.84 0 0 1-72.106667 0v-149.333334H353.706667a32.426667 32.426667 0 0 1-33.706667-32.853333v-3.84a34.56 34.56 0 0 1 33.706667-34.986667h122.453333V512H321.706667a34.133333 34.133333 0 0 1-34.133334-33.706667v-3.413333a34.56 34.56 0 0 1 34.133334-34.56h166.4L367.786667 318.72a36.266667 36.266667 0 0 1 51.2-51.2L512 360.106667l92.586667-92.586667a35.84 35.84 0 1 1 50.773333 50.773333l-118.186667 117.76h166.826667a36.693333 36.693333 0 0 1 34.986667 35.84zM512 0a512 512 0 1 0 512 512A512 512 0 0 0 512 0z" fill="#5E5C5C"></path></svg>' },
    { id: 'wx',   label: '微信支付', svg: '<svg viewBox="0 0 1325 1024" xmlns="http://www.w3.org/2000/svg"><path d="M548.141176 617.411765c-3.011765 3.011765-9.035294 3.011765-13.552941 3.011764-10.541176 0-19.576471-6.023529-24.094117-15.058823l-3.011765-3.011765-76.8-167.152941c-1.505882-3.011765-1.505882-3.011765-1.505882-6.023529 0-7.529412 6.023529-15.058824 15.058823-15.058824 3.011765 0 6.023529 1.505882 9.035294 3.011765l90.352941 64.752941c6.023529 4.517647 15.058824 7.529412 22.588236 7.529412 4.517647 0 9.035294-1.505882 15.058823-3.011765l426.164706-188.235294C929.129412 209.317647 804.141176 150.588235 662.588235 150.588235c-231.905882 0-421.647059 156.611765-421.647059 349.364706 0 105.411765 57.223529 198.776471 146.070589 262.02353 7.529412 4.517647 12.047059 13.552941 12.047059 22.588235 0 3.011765-1.505882 6.023529-1.505883 9.035294-7.529412 25.6-18.070588 67.764706-19.57647 70.776471-1.505882 3.011765-3.011765 7.529412-3.011765 10.541176 0 7.529412 6.023529 15.058824 15.058823 15.058824 3.011765 0 6.023529-1.505882 9.035295-3.011765l93.364705-52.705882c7.529412-3.011765 15.058824-6.023529 22.588236-6.02353 4.517647 0 9.035294 1.505882 12.047059 3.011765 43.670588 12.047059 88.847059 19.576471 137.035294 19.57647 231.905882 0 421.647059-156.611765 421.647058-349.364705 0-58.729412-16.564706-112.941176-48.188235-161.129412L549.647059 614.4l-1.505883 3.011765z" fill="#3BCA72"></path></svg>' },
    { id: 'hb',   label: '花呗支付', svg: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M537.739636 266.472727c43.962182 9.821091 86.178909-8.215273 94.324364-40.261818 8.145455-32.046545-20.898909-65.978182-64.837818-75.799273-44.008727-9.821091-86.202182 8.238545-94.324364 40.285091-8.145455 32.069818 20.875636 65.978182 64.837818 75.799273z" fill="#108EE9"></path><path d="M949.294545 337.640727a488.331636 488.331636 0 0 0-32.628363-72.541091 469.713455 469.713455 0 0 0-145.152-160.069818 554.496 554.496 0 0 0-30.999273-18.688L740.072727 86.109091c-108.334545-58.786909-163.84-45.847273-162.909091-1.768727 0.674909 32.954182 30.72 41.099636 57.344 53.899636 90.554182 43.403636 139.403636 110.149818 114.571637 164.305455-22.807273 49.687273-107.566545 67.234909-195.374546 35.537454-89.832727-32.418909-207.685818-109.661091-223.534545-22.528-13.381818 73.611636 99.211636 76.008727 216.529454 196.421818 50.269091 51.572364 63.208727 141.335273 33.815273 213.457455-63.232 108.916364-244.410182 83.456-326.562909-5.445818-94.370909-102.097455-82.082909-208.500364-77.218909-234.682182 11.450182-52.782545 32.162909-95.883636 48.221091-121.949091 16.290909-28.741818 24.669091-47.802182 24.366545-70.888727-0.465455-37.236364-26.461091-61.719273-62.557091-63.883637-43.054545-2.56-74.938182 24.529455-93.556363 64.558546A485.748364 485.748364 0 0 0 57.250909 602.088727c0.349091 1.978182 0.628364 3.956364 1.024 5.957818 2.094545 10.472727 4.794182 20.712727 7.912727 30.673455l-0.069818-0.046545s4.352 17.058909 14.754909 40.261818c3.351273 8.424727 6.749091 16.872727 10.472728 25.018182a3.723636 3.723636 0 0 0-0.302546-0.302546l0.744727 1.233455c101.562182 219.904 351.581091 328.564364 579.211637 243.758545C912.523636 858.647273 1037.149091 585.076364 949.294545 337.640727z" fill="#108EE9"></path></svg>' },
    { id: 'bank', label: '银行卡支付', svg: '<svg viewBox="0 0 1325 1024" xmlns="http://www.w3.org/2000/svg"><path d="M164.141176 90.352941H1159.529412c42.164706 0 75.294118 33.129412 75.294117 73.788235V858.352941c0 40.658824-33.129412 73.788235-73.788235 73.788235H164.141176C123.482353 933.647059 90.352941 900.517647 90.352941 859.858824V164.141176C90.352941 123.482353 123.482353 90.352941 164.141176 90.352941z" fill="#243747"></path><path d="M339.154824 512.361412a198.776471 198.776471 0 1 0 397.552941 0 198.776471 198.776471 0 1 0-397.552941 0Z" fill="#E61C24"></path><path d="M586.119529 512.361412a198.776471 198.776471 0 1 0 397.552942 0 198.776471 198.776471 0 1 0-397.552942 0Z" fill="#F99F1B"></path><path d="M661.413647 357.255529c-48.188235 37.647059-75.294118 94.870588-75.294118 155.105883s27.105882 117.458824 75.294118 155.105882c48.188235-37.647059 75.294118-94.870588 75.294118-155.105882s-27.105882-117.458824-75.294118-155.105883z" fill="#F26622"></path></svg>' },
  ]
  var paysHTML = pays.map(function(p) {
    var on = page._pay === p.id
    return '<button class="yh-ck-pay-row" type="button" data-pay="' + p.id + '">' +
        '<span class="yh-ck-pay-icon">' + p.svg + '</span>' +
        '<span class="yh-ck-pay-label">' + yhEsc(p.label) + '</span>' +
        '<span class="yh-ck-pay-radio' + (on ? ' is-on' : '') + '">' + (on ? '<i class="fa-solid fa-check"></i>' : '') + '</span>' +
      '</button>'
  }).join('')

  scroll.innerHTML =
    '<section class="yh-ck-eta"><i class="fa-solid fa-clock"></i><span>' + yhEsc(page._etaText) + '</span></section>' +
    addrHTML +
    '<section class="yh-ck-card">' +
      '<div class="yh-ck-card-head"><div class="yh-ck-shopname"><i class="fa-solid ' + shop.icon + '"></i>' + yhEsc(shop.name) + '</div></div>' +
      '<div class="yh-ck-items">' + itemsHTML + '</div>' +
      '<div class="yh-ck-fee"><span>配送费</span><span><em>¥</em>' + deliverFee + '</span></div>' +
      '<div class="yh-ck-fee"><span>打包费</span><span><em>¥</em>' + packFee + '</span></div>' +
      '<button class="yh-ck-fee yh-ck-fee-coupon' + (picked ? ' is-used' : '') + '" id="yh-ck-coupon" type="button"><span>YUM红包</span><span class="yh-ck-coupon-val">' + couponText + ' <i class="fa-solid fa-angle-right"></i></span></button>' +
      '<div class="yh-ck-fee yh-ck-fee-total"><span>合计</span><span class="yh-ck-fee-amt"><em>¥</em>' + total + '</span></div>' +
    '</section>' +
    '<section class="yh-ck-card yh-ck-meta">' +
      '<button class="yh-ck-meta-row yh-ck-meta-btn" id="yh-ck-remark" type="button"><span>备注</span><span class="yh-ck-meta-val">' + (page._remark ? yhEsc(page._remark) : '选填') + ' <i class="fa-solid fa-angle-right"></i></span></button>' +
      '<button class="yh-ck-meta-row yh-ck-meta-btn" id="yh-ck-utensils" type="button"><span>餐具</span><span class="yh-ck-meta-val">' + yhEsc(page._utensils) + ' <i class="fa-solid fa-angle-right"></i></span></button>' +
    '</section>' +
    '<section class="yh-ck-card yh-ck-pay">' +
      '<div class="yh-ck-card-head"><div class="yh-ck-shopname"><i class="fa-solid fa-wallet"></i>支付方式</div></div>' +
      paysHTML +
    '</section>'

  page.querySelector('#yh-ck-bar-amt').textContent = total

  scroll.querySelector('#yh-addr-card').addEventListener('click', function() {
    showYumYumAddressSheet(function() { yhRenderCheckout(page, shop) })
  })

  scroll.querySelector('#yh-ck-coupon').addEventListener('click', function() {
    if (!usableVouchers.length) { yumyumToast('暂无可用红包'); return }
    showYumYumVoucherSheet(usableVouchers, page._voucherId, function(id) {
      page._voucherId = id
      yhRenderCheckout(page, shop)
    })
  })

  scroll.querySelector('#yh-ck-remark').addEventListener('click', function() {
    showYumYumRemarkSheet(page._remark, function(val) {
      page._remark = val
      yhRenderCheckout(page, shop)
    })
  })

  scroll.querySelector('#yh-ck-utensils').addEventListener('click', function() {
    showYumYumUtensilsSheet(page._utensils, function(val) {
      page._utensils = val
      yhRenderCheckout(page, shop)
    })
  })

  scroll.querySelectorAll('.yh-ck-pay-row').forEach(function(btn) {
    btn.addEventListener('click', function() {
      page._pay = btn.getAttribute('data-pay')
      yhRenderCheckout(page, shop)
    })
  })
}

// 备注弹层
function showYumYumRemarkSheet(current, onSaved) {
  var existing = document.getElementById('yh-sheet-overlay')
  if (existing) existing.remove()
  var app = document.getElementById('app') || document.body

  var overlay = document.createElement('div')
  overlay.id = 'yh-sheet-overlay'
  overlay.className = 'yh-addr-overlay'
  overlay.innerHTML =
    '<div class="yh-addr-sheet">' +
      '<div class="yh-addr-sheet-head"><span>订单备注</span><button class="yh-addr-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="yh-addr-field"><label>备注</label><textarea class="yh-addr-input yh-addr-textarea" id="yh-remark-input" rows="3" maxlength="50" placeholder="口味、偏好等（选填）">' + yhEsc(current || '') + '</textarea></div>' +
      '<button class="yh-addr-save" id="yh-remark-save" type="button">保存</button>' +
    '</div>'
  app.appendChild(overlay)
  requestAnimationFrame(function() { overlay.classList.add('show') })

  function close() {
    overlay.classList.remove('show')
    setTimeout(function() { overlay.remove() }, 220)
  }
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close() })
  overlay.querySelector('.yh-addr-close').addEventListener('click', close)
  overlay.querySelector('#yh-remark-save').addEventListener('click', function() {
    var val = overlay.querySelector('#yh-remark-input').value.trim()
    close()
    if (onSaved) onSaved(val)
  })
}

// 餐具弹层
function showYumYumUtensilsSheet(current, onSaved) {
  var existing = document.getElementById('yh-sheet-overlay')
  if (existing) existing.remove()
  var app = document.getElementById('app') || document.body

  var opts = ['无需餐具', '1份', '2份', '3份', '按餐量提供']
  var optsHTML = opts.map(function(o) {
    var on = current === o
    return '<button class="yh-opt-row" type="button" data-opt="' + yhEsc(o) + '"><span>' + yhEsc(o) + '</span>' +
      (on ? '<i class="fa-solid fa-check yh-opt-check"></i>' : '') + '</button>'
  }).join('')

  var overlay = document.createElement('div')
  overlay.id = 'yh-sheet-overlay'
  overlay.className = 'yh-addr-overlay'
  overlay.innerHTML =
    '<div class="yh-addr-sheet">' +
      '<div class="yh-addr-sheet-head"><span>餐具数量</span><button class="yh-addr-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="yh-opt-list">' + optsHTML + '</div>' +
    '</div>'
  app.appendChild(overlay)
  requestAnimationFrame(function() { overlay.classList.add('show') })

  function close() {
    overlay.classList.remove('show')
    setTimeout(function() { overlay.remove() }, 220)
  }
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close() })
  overlay.querySelector('.yh-addr-close').addEventListener('click', close)
  overlay.querySelectorAll('.yh-opt-row').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var val = btn.getAttribute('data-opt')
      close()
      if (onSaved) onSaved(val)
    })
  })
}

// 红包/神券选择弹层
function showYumYumVoucherSheet(vouchers, currentId, onPick) {
  var existing = document.getElementById('yh-sheet-overlay')
  if (existing) existing.remove()
  var app = document.getElementById('app') || document.body

  var rowsHTML = vouchers.map(function(v) {
    var on = currentId === v.id
    return '<button class="yh-opt-row yh-vc-pick-row" type="button" data-id="' + v.id + '">' +
        '<span class="yh-vc-pick-amt"><em>¥</em>' + v.value + '</span>' +
        '<span class="yh-vc-pick-cond">' + yhVoucherCond(v.threshold) + '</span>' +
        (on ? '<i class="fa-solid fa-check yh-opt-check"></i>' : '') +
      '</button>'
  }).join('')
  var noneOn = !currentId
  rowsHTML += '<button class="yh-opt-row" type="button" data-id=""><span>不使用红包</span>' +
    (noneOn ? '<i class="fa-solid fa-check yh-opt-check"></i>' : '') + '</button>'

  var overlay = document.createElement('div')
  overlay.id = 'yh-sheet-overlay'
  overlay.className = 'yh-addr-overlay'
  overlay.innerHTML =
    '<div class="yh-addr-sheet">' +
      '<div class="yh-addr-sheet-head"><span>选择红包</span><button class="yh-addr-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="yh-opt-list">' + rowsHTML + '</div>' +
    '</div>'
  app.appendChild(overlay)
  requestAnimationFrame(function() { overlay.classList.add('show') })

  function close() {
    overlay.classList.remove('show')
    setTimeout(function() { overlay.remove() }, 220)
  }
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close() })
  overlay.querySelector('.yh-addr-close').addEventListener('click', close)
  overlay.querySelectorAll('[data-id]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-id') || null
      close()
      if (onPick) onPick(id)
    })
  })
}

function closeYumYumCheckoutPage() {
  var page = document.getElementById('yumyum-checkout-page')
  if (!page) return
  if (window.closePage) window.closePage('yumyum-checkout-page')
  else page.remove()
}

// 由结算页构建订单基础字段（商品/金额/地址，不含订单号与时间线）
function yhBuildOrderItems(page, shop) {
  var rows = yhCartItems(shop)
  if (!rows.length) return null

  var goods = rows.reduce(function(s, r) { return s + r.item.price * r.qty }, 0)
  var deliverFee = yhFeeNumber(shop.fee)
  var packFee = rows.length

  var usableVouchers = yhAvailableVouchers().filter(function(v) { return goods >= v.threshold })
  var picked = page._voucherId
    ? (usableVouchers.filter(function(v) { return v.id === page._voucherId })[0] || null)
    : null
  var voucherVal = picked ? picked.value : 0
  var total = Math.max(0, goods + deliverFee + packFee - voucherVal)

  var addr = yumyumState.address || {}
  return {
    ownerUid: (yumyumState.user && yumyumState.user.id) || null,
    shopId: shop.id,
    shopName: shop.name,
    shopIcon: shop.icon,
    shopTone: shop.tone,
    items: rows.map(function(r) {
      return { name: r.item.name, icon: r.item.icon, tone: r.item.tone, price: r.item.price, qty: r.qty }
    }),
    count: rows.reduce(function(s, r) { return s + r.qty }, 0),
    goods: goods,
    deliverFee: deliverFee,
    packFee: packFee,
    voucherId: page._voucherId || null,
    voucherVal: voucherVal,
    total: total,
    payMethod: page._pay,
    address: { name: addr.name || '', phone: addr.phone || '', detail: addr.detail || '' },
    remark: page._remark || '',
    utensils: page._utensils || '无需餐具'
  }
}

// 补全订单号 + 三状态时间模型（以 fromTs 为起点，默认 now）
function yhFinalizeOrderTimeline(order, fromTs, etaMinutes) {
  var createdAt = fromTs || Date.now()
  etaMinutes = etaMinutes || order.etaMinutes || yhRandomEtaMinutes()
  var state1Min = 2 + Math.floor(Math.random() * 9)        // 2–10 分钟
  var offsetMin = Math.floor(Math.random() * 21) - 10       // -10 ~ +10 分钟
  var estDeliverAt = createdAt + etaMinutes * 60000
  var state1EndAt = createdAt + state1Min * 60000
  var actualDeliverAt = estDeliverAt + offsetMin * 60000
  if (actualDeliverAt < state1EndAt + 180000) actualDeliverAt = state1EndAt + 180000

  if (!order.id) order.id = 'yum_order_' + createdAt + '_' + Math.floor(Math.random() * 1000)
  order.createdAt = createdAt
  order.etaMinutes = etaMinutes
  order.estDeliverAt = estDeliverAt
  order.state1EndAt = state1EndAt
  order.actualDeliverAt = actualDeliverAt
  return order
}

// 由结算页构建真实订单对象（含三状态时间模型）
function yhBuildOrder(page, shop) {
  var base = yhBuildOrderItems(page, shop)
  if (!base) return null
  return yhFinalizeOrderTimeline(base, Date.now(), page._etaMinutes)
}

// ===== 代付 / 赠送：好友选择 + 发送到微信 =====
async function yhGetFriendList(ownerUid) {
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

async function showYumYumFriendPicker(opts) {
  opts = opts || {}
  var ownerUid = yumyumState.user && yumyumState.user.id
  if (!ownerUid) { yumyumToast('请先登录'); return }
  var friends = await yhGetFriendList(ownerUid)
  var overlay = document.createElement('div')
  overlay.className = 'yh-modal-overlay'
  var modal = document.createElement('div')
  modal.className = 'yh-friend-sheet'
  var rows = friends.length ? friends.map(function(f) {
    var name = f.wechatName || f.nick || f.name || '好友'
    var avatar = (f.wechatAvatar || f.avatar)
      ? '<img src="' + yhEsc(f.wechatAvatar || f.avatar) + '" alt="">'
      : '<span>' + yhEsc(String(name).slice(0, 1)) + '</span>'
    return '<button class="yh-friend-row" data-id="' + f.id + '" type="button">' +
        '<div class="yh-friend-avatar">' + avatar + '</div>' +
        '<div class="yh-friend-name">' + yhEsc(name) + '</div>' +
        '<i class="fa-solid fa-angle-right"></i>' +
      '</button>'
  }).join('') : '<div class="yh-friend-empty">' + yhEsc(opts.empty || '暂无好友') + '</div>'
  modal.innerHTML =
    '<div class="yh-sheet-handle"></div>' +
    '<div class="yh-friend-head"><h2>' + yhEsc(opts.title || '选择微信好友') + '</h2><button class="yh-friend-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="yh-friend-list">' + rows + '</div>'
  var host = document.getElementById('app') || document.body
  host.appendChild(overlay)
  host.appendChild(modal)
  requestAnimationFrame(function() { overlay.classList.add('show'); modal.classList.add('show') })
  function close() {
    overlay.classList.remove('show')
    modal.classList.remove('show')
    setTimeout(function() { overlay.remove(); modal.remove() }, 180)
  }
  overlay.addEventListener('click', close)
  modal.querySelector('.yh-friend-close').addEventListener('click', close)
  modal.querySelectorAll('.yh-friend-row').forEach(function(row) {
    row.addEventListener('click', async function() {
      var friend = friends.find(function(f) { return String(f.id) === row.dataset.id })
      if (!friend) return
      close()
      if (opts.onPick) await opts.onPick(friend)
    })
  })
}

// 组装 YumYum 代付/赠送 deal 并发送到与好友的微信聊天
async function yhSendYumDeal(order, friend, type) {
  var dealType = type === 'gift' ? 'gift' : 'pay'
  var ownerUid = order.ownerUid || (yumyumState.user && yumyumState.user.id)
  var titleItem = order.items && order.items.length ? order.items[0].name : 'YumYum 外卖'
  var title = order.items && order.items.length > 1 ? titleItem + ' 等' + order.items.length + '件' : titleItem
  var deal = {
    dealType: dealType,
    siteName: 'YumYum',
    title: title,
    shopName: order.shopName || '',
    shopIcon: order.shopIcon || 'fa-bowl-food',
    shopTone: order.shopTone || 'a',
    total: order.total,
    items: (order.items || []).map(function(it) {
      return { name: it.name, qty: it.qty, price: it.price, icon: it.icon, tone: it.tone }
    }),
    address: order.address || null,
    remark: order.remark || '',
    voucherId: order.voucherId || null,
    etaMinutes: order.etaMinutes || null,
    payMethod: order.payMethod || null,
    ownerUid: ownerUid,
    origin: 'app'
  }
  if (dealType === 'gift') {
    deal.orderId = order.id
    deal.etaMinutes = order.etaMinutes
    deal.estDeliverAt = order.estDeliverAt
    deal.state1EndAt = order.state1EndAt
    deal.actualDeliverAt = order.actualDeliverAt
    deal.createdAt = order.createdAt
  }
  var content = typeof window.buildYumDealMessageContent === 'function'
    ? window.buildYumDealMessageContent(deal)
    : '__YUMDEAL__' + JSON.stringify(deal)
  var chat = await db.chats.where('[ownerUid+charId]').equals([ownerUid, friend.id]).first()
  if (!chat) {
    var chatId = await db.chats.add({ charId: friend.id, ownerUid: ownerUid, createdAt: Date.now(), unread: 0 })
    chat = { id: chatId, charId: friend.id, ownerUid: ownerUid }
  }
  var totalText = (Math.round((Number(order.total) || 0) * 100) / 100).toString()
  var lastMessage = (dealType === 'gift' ? '[外卖赠送] ' : '[外卖代付] ') + (order.shopName || title) + ' ¥' + totalText
  await db.messages.add({ chatId: chat.id, charId: friend.id, role: 'user', content: content, createdAt: Date.now() })
  await db.chats.update(chat.id, { updatedAt: Date.now(), lastMessage: lastMessage })
}

// 代付被好友付款时调用：以 deal payload 落地真实订单并生成时间线，返回补全字段供卡片回写
window.yumyumFinalizeProxyOrder = async function(deal) {
  if (!deal || !deal.ownerUid) return null
  var ownerUid = parseInt(deal.ownerUid, 10)
  var order = {
    ownerUid: ownerUid,
    shopId: deal.shopId || null,
    shopName: deal.shopName || '',
    shopIcon: deal.shopIcon || 'fa-bowl-food',
    shopTone: deal.shopTone || 'a',
    items: (deal.items || []).map(function(it) {
      return { name: it.name, icon: it.icon, tone: it.tone, price: it.price, qty: it.qty }
    }),
    count: (deal.items || []).reduce(function(s, it) { return s + (it.qty || 0) }, 0),
    total: deal.total,
    voucherId: deal.voucherId || null,
    payMethod: deal.payMethod || 'proxy',
    address: deal.address || { name: '', phone: '', detail: '' },
    remark: deal.remark || '',
    utensils: '无需餐具',
    proxyPaid: true
  }
  yhFinalizeOrderTimeline(order, Date.now(), deal.etaMinutes)
  await yhPutOrder(ownerUid, order)
  if (deal.voucherId) { try { yhUseVoucher(deal.voucherId) } catch (e) {} }
  yhRefreshOrderBadge()
  return {
    orderId: order.id,
    createdAt: order.createdAt,
    etaMinutes: order.etaMinutes,
    estDeliverAt: order.estDeliverAt,
    state1EndAt: order.state1EndAt,
    actualDeliverAt: order.actualDeliverAt
  }
}

// ===== 订单详情 / 等待页 =====
function showYumYumOrderPage(order) {
  var existing = document.getElementById('yumyum-order-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'yumyum-order-page'
  page.className = 'full-page yumyum-order-page'
  page.innerHTML =
    '<header class="yh-shop-topbar">' +
      '<button class="yh-od-back" type="button" aria-label="返回"><i class="fa-solid fa-angle-left"></i></button>' +
      '<div class="yh-shop-topname">订单详情</div>' +
      '<span style="width:34px"></span>' +
    '</header>' +
    '<div class="yh-od-scroll" id="yh-od-scroll"></div>'

  if (window.openPage) window.openPage(page)
  else (document.getElementById('app') || document.body).appendChild(page)

  yhRenderOrderDetail(page, order)

  function stop() {
    if (page._yumTimer) { clearInterval(page._yumTimer); page._yumTimer = null }
  }
  function back() { stop(); closeYumYumOrderPage() }

  page.querySelector('.yh-od-back').addEventListener('click', back)
  yhBindEdgeBack(page, back)

  // 实时刷新状态/倒计时：只增量更新状态区，不重绘整页（送达完成后停表）
  page._yumTimer = setInterval(function() {
    if (!document.getElementById('yumyum-order-page')) { stop(); return }
    yhUpdateOrderHero(page, order)
    if (yhOrderStatus(order).state === 'done') stop()
  }, 1000)
}

function closeYumYumOrderPage() {
  var page = document.getElementById('yumyum-order-page')
  if (!page) return
  if (page._yumTimer) { clearInterval(page._yumTimer); page._yumTimer = null }
  if (window.closePage) window.closePage('yumyum-order-page')
  else page.remove()
}

// 状态区副标题：倒计时 / 已延迟 / 即将送达 / 已送达
function yhOrderHeroSub(order, st) {
  if (st.state === 'done') {
    var ad = new Date(order.actualDeliverAt)
    return '已于 ' + yhPad2(ad.getHours()) + ':' + yhPad2(ad.getMinutes()) + ' 送达'
  }
  var estD = new Date(order.estDeliverAt)
  var estText = '预计 ' + yhPad2(estD.getHours()) + ':' + yhPad2(estD.getMinutes()) + ' 送达'
  var diffMin = Math.ceil((order.estDeliverAt - Date.now()) / 60000)
  if (diffMin > 0) return estText + ' · 还有约 ' + diffMin + ' 分钟'
  var lateMin = Math.floor((Date.now() - order.estDeliverAt) / 60000)
  if (lateMin >= 1) return estText + ' · 已延迟 ' + lateMin + ' 分钟'
  return estText + ' · 即将送达'
}

// 状态区内部 HTML（标题 + 副标题 + 进度 + 骑手行）
function yhHeroInnerHTML(order, st) {
  var sub = yhOrderHeroSub(order, st)
  var steps = [
    { k: 1, label: '备餐', icon: 'fa-utensils' },
    { k: 2, label: '配送', icon: 'fa-motorcycle' },
    { k: 3, label: '送达', icon: 'fa-house-circle-check' }
  ]
  var stepsHTML = steps.map(function(s, i) {
    var cls = s.k < st.step ? ' done' : (s.k === st.step ? ' active' : '')
    var line = i < steps.length - 1 ? '<span class="yh-od-step-line' + (s.k < st.step ? ' done' : '') + '"></span>' : ''
    return '<div class="yh-od-step' + cls + '"><span class="yh-od-step-dot"><i class="fa-solid ' + s.icon + '"></i></span><span class="yh-od-step-tx">' + s.label + '</span></div>' + line
  }).join('')
  var riderHTML = st.state === 'state2'
    ? '<div class="yh-od-rider"><i class="fa-solid fa-helmet-safety"></i><span>骑手正在为您配送，请保持电话畅通</span></div>'
    : ''
  return '<div class="yh-od-hero-title">' + st.label + '</div>' +
    '<div class="yh-od-hero-sub">' + sub + '</div>' +
    '<div class="yh-od-steps">' + stepsHTML + '</div>' +
    riderHTML
}

// 仅更新状态区（自动刷新用，避免整页重绘闪烁与滚动跳动）
function yhUpdateOrderHero(page, order) {
  var hero = page.querySelector('#yh-od-hero')
  if (!hero) return
  var st = yhOrderStatus(order)
  var sub = yhOrderHeroSub(order, st)
  if (page._odStep !== st.step) {
    // 阶段切换 → 重建状态区一小块（标题/进度/骑手/配色）
    hero.className = 'yh-od-hero state-' + st.state
    hero.innerHTML = yhHeroInnerHTML(order, st)
    page._odStep = st.step
    page._odSub = sub
  } else if (page._odSub !== sub) {
    // 仅倒计时/延迟文字变化 → 只改这一行，不闪
    var subEl = hero.querySelector('.yh-od-hero-sub')
    if (subEl) subEl.textContent = sub
    page._odSub = sub
  }
}

function yhRenderOrderDetail(page, order) {
  var scroll = page.querySelector('#yh-od-scroll')
  if (!scroll) return
  var st = yhOrderStatus(order)

  // 商品明细（复用结算卡样式）
  var itemsHTML = order.items.map(function(it) {
    return '<div class="yh-ck-item">' +
        '<div class="yh-ck-item-img tone-' + it.tone + '"><i class="fa-solid ' + it.icon + '"></i></div>' +
        '<div class="yh-ck-item-name">' + yhEsc(it.name) + '</div>' +
        '<div class="yh-ck-item-qty">×' + it.qty + '</div>' +
        '<div class="yh-ck-item-price"><em>¥</em>' + (it.price * it.qty) + '</div>' +
      '</div>'
  }).join('')
  var voucherRow = order.voucherVal
    ? '<div class="yh-ck-fee"><span>YUM红包</span><span>-<em>¥</em>' + order.voucherVal + '</span></div>'
    : ''

  var addr = order.address || {}
  var addrHTML = (addr.detail || addr.name)
    ? '<section class="yh-ck-card yh-od-addr">' +
        '<i class="fa-solid fa-location-dot yh-addr-pin"></i>' +
        '<div class="yh-addr-body">' +
          '<div class="yh-addr-detail">' + yhEsc(addr.detail || '') + '</div>' +
          '<div class="yh-addr-person">' + yhEsc(addr.name || '') + ' ' + yhEsc(addr.phone || '') + '</div>' +
        '</div>' +
      '</section>'
    : ''

  function infoRow(label, val) {
    return '<div class="yh-od-info-row"><span class="yh-od-info-k">' + label + '</span><span class="yh-od-info-v">' + val + '</span></div>'
  }
  var metaHTML = infoRow('订单号', yhEsc(order.id)) +
    infoRow('下单时间', yhFormatTime(order.createdAt)) +
    infoRow('支付方式', yhEsc(yhPayLabel(order.payMethod))) +
    infoRow('实付金额', '<strong><em>¥</em>' + order.total + '</strong>') +
    (order.remark ? infoRow('备注', yhEsc(order.remark)) : '') +
    infoRow('餐具', yhEsc(order.utensils || '无需餐具'))

  scroll.innerHTML =
    '<section class="yh-od-hero state-' + st.state + '" id="yh-od-hero">' +
      yhHeroInnerHTML(order, st) +
    '</section>' +
    addrHTML +
    '<section class="yh-ck-card">' +
      '<div class="yh-ck-card-head"><div class="yh-ck-shopname"><i class="fa-solid ' + order.shopIcon + '"></i>' + yhEsc(order.shopName) + '</div></div>' +
      '<div class="yh-ck-items">' + itemsHTML + '</div>' +
      '<div class="yh-ck-fee"><span>配送费</span><span><em>¥</em>' + order.deliverFee + '</span></div>' +
      '<div class="yh-ck-fee"><span>打包费</span><span><em>¥</em>' + order.packFee + '</span></div>' +
      voucherRow +
      '<div class="yh-ck-fee yh-ck-fee-total"><span>合计</span><span class="yh-ck-fee-amt"><em>¥</em>' + order.total + '</span></div>' +
    '</section>' +
    '<section class="yh-ck-card yh-od-info">' +
      '<div class="yh-ck-card-head"><div class="yh-ck-shopname"><i class="fa-solid fa-receipt"></i>订单信息</div></div>' +
      metaHTML +
    '</section>'

  // 记录当前状态基线，供自动刷新做差异判断
  page._odStep = st.step
  page._odSub = yhOrderHeroSub(order, st)
}

// ===== 地址弹层（添加收件人 + 地址） =====
function showYumYumAddressSheet(onSaved) {
  var existing = document.getElementById('yh-addr-overlay')
  if (existing) existing.remove()
  var app = document.getElementById('app') || document.body

  var addr = yumyumState.address || {}
  var overlay = document.createElement('div')
  overlay.id = 'yh-addr-overlay'
  overlay.className = 'yh-addr-overlay'
  overlay.innerHTML =
    '<div class="yh-addr-sheet">' +
      '<div class="yh-addr-sheet-head"><span>收货地址</span><button class="yh-addr-close" type="button" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="yh-addr-field"><label>收件人</label><input class="yh-addr-input" id="yh-addr-name" type="text" placeholder="请输入收件人姓名" value="' + yhEsc(addr.name || '') + '"></div>' +
      '<div class="yh-addr-field"><label>手机号</label><input class="yh-addr-input" id="yh-addr-phone" type="tel" inputmode="numeric" maxlength="11" placeholder="请输入手机号" value="' + yhEsc(addr.phone || '') + '"></div>' +
      '<div class="yh-addr-field"><label>详细地址</label><textarea class="yh-addr-input yh-addr-textarea" id="yh-addr-detail" rows="3" placeholder="街道、楼栋、门牌号等">' + yhEsc(addr.detail || '') + '</textarea></div>' +
      '<button class="yh-addr-save" id="yh-addr-save" type="button">保存</button>' +
    '</div>'
  app.appendChild(overlay)

  requestAnimationFrame(function() { overlay.classList.add('show') })

  function close() {
    overlay.classList.remove('show')
    setTimeout(function() { overlay.remove() }, 220)
  }

  overlay.addEventListener('click', function(e) { if (e.target === overlay) close() })
  overlay.querySelector('.yh-addr-close').addEventListener('click', close)
  var phoneInput = overlay.querySelector('#yh-addr-phone')
  phoneInput.addEventListener('input', function() { this.value = this.value.replace(/\D/g, '').slice(0, 11) })

  overlay.querySelector('#yh-addr-save').addEventListener('click', function() {
    var name = overlay.querySelector('#yh-addr-name').value.trim()
    var phone = phoneInput.value.trim()
    var detail = overlay.querySelector('#yh-addr-detail').value.trim()
    if (!name) { yumyumToast('请输入收件人姓名'); return }
    if (!/^1\d{10}$/.test(phone)) { yumyumToast('请输入正确的手机号'); return }
    if (!detail) { yumyumToast('请输入详细地址'); return }
    yumyumState.address = { name: name, phone: phone, detail: detail }
    close()
    yumyumToast('地址已保存')
    if (onSaved) onSaved()
  })
}

function startYumYumCountdown(btn) {
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

function closeYumYumLoginPage() {
  var page = document.getElementById('yumyum-login-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('yumyum-login-page')
  } else {
    page.remove()
  }
}

function yumyumToast(msg) {
  if (window.toast) window.toast(msg)
}
