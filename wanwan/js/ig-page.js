// ig-page.js — 仿 Instagram 页面

var IG_SESSION_UID_KEY = 'wanwan_ig_uid'
var IG_FORUM_SETTINGS_KEY = 'igForumSettings'
var IG_COMMENT_AVATAR_STORE_KEY = 'wanwan_ig_comment_avatars'
var IG_GENERATED_FEED_PREFIX = 'wanwan_ig_generated_feed_'
var IG_HIDDEN_POSTS_PREFIX = 'wanwan_ig_hidden_posts_'
var IG_IMAGE_STORE_PREFIX = 'wanwan_ig_post_image_'
var IG_IMAGE_REF_PREFIX = 'wanwan-ig-image://'
var IG_POST_COMMENTS_PREFIX = 'wanwan_ig_post_comments_'
var IG_PROFILE_PREFIX = 'wanwan_ig_profile_'
var IG_DM_THREAD_PREFIX = 'wanwan_ig_dm_'
var IG_INITIAL_POST_ID = 'initial-couple-comments'
var igGeneratedFeedMemory = {}
var IG_COMMENT_AVATAR_POOL = [
  'img/ava-00.jpg',
  'img/ava-01.jpg',
  'img/ava-02.jpg',
  'img/ava-03.jpg',
  'img/ava-04.jpg',
  'img/soc_01.jpg',
  'img/soc_02.jpg',
  'img/soc_03.jpg',
  'img/soc_04.jpg'
]
var igCommentAvatarCache = null

window.showIGPage = async function() {
  var user = await getIGSessionUser()
  if (!user) {
    showIGLoginPage()
    return
  }
  await hydrateIGGeneratedFeedPosts(user)
  renderIGPage(user)
}

function renderIGPage(user) {
  var existing = document.getElementById('ig-page')
  if (existing) {
    stopIGPostTimeUpdater(existing)
    existing.remove()
  }

  var page = document.createElement('div')
  page.id = 'ig-page'
  page.className = 'full-page'
  page.dataset.igUid = user.id
  page._igUser = user

  page.innerHTML =
    '<div class="ig-topbar">' +
      '<div class="ig-topbar-inner">' +
        '<div class="ig-topbar-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-27.750945 -13.120125 240.50819 78.72075"><path d="M9.5263.182C5.7383 1.7671 1.573 6.2405.2583 11.8671-1.4097 18.99 5.525 21.998 6.0916 21.0166c.6667-1.164-1.2466-1.5547-1.6373-5.248-.5027-4.776 1.712-10.112 4.5067-12.4534.5213-.428.496.176.496 1.2894 0 2.008-.112 19.9733-.112 23.724 0 5.0773-.208 6.676-.592 8.2546-.3774 1.6054-.988 2.688-.528 3.1094.5213.4653 2.736-.6427 4.02-2.4347 1.536-2.1467 2.0773-4.7267 2.1773-7.5267.1133-3.372.1067-8.7333.1133-11.7853 0-2.8067.044-11.012-.044-15.952C14.4663.786 11.1063-.4794 9.5263.182m174.644 26.6547c-.5414 0-.7987.5666-1.0067 1.5173-.7173 3.316-1.472 4.064-2.448 4.064-1.088 0-2.064-1.6413-2.3213-4.9267-.1947-2.58-.164-7.3373.088-12.0693.0507-.9693-.2147-1.9307-2.82-2.8813-1.1254-.4027-2.756-1.0067-3.5667.956-2.2973 5.532-3.1907 9.936-3.4053 11.7173-.005.0933-.1187.1067-.1387-.1067-.1307-1.4293-.4333-4.028-.4707-9.4906-.0133-1.056-.2333-1.9694-1.416-2.712-.7613-.4774-3.0773-1.3334-3.9146-.32-.7174.8306-1.5534 3.0586-2.428 5.7013-.7054 2.152-1.196 3.612-1.196 3.612s.005-5.8027.0187-8.0053c0-.8307-.5667-1.1067-.736-1.1574-.7747-.2266-2.304-.5973-2.9453-.5973-.7987 0-.988.4467-.988 1.0947 0 .0813-.132 7.632-.132 12.912v.7426c-.4347 2.4294-1.868 5.7267-3.4227 5.7267-1.5547 0-2.2907-1.3787-2.2907-7.6707 0-3.6693.1134-5.2666.164-7.9226.0307-1.5294.0933-2.7054.088-2.976-.0133-.812-1.4293-1.228-2.084-1.3787-.66-.1573-1.2333-.208-1.6853-.1893-.6293.0386-1.076.4533-1.076 1.0333v.88c-.812-1.2827-2.128-2.1773-3.008-2.4347-2.3533-.6986-4.8147-.076-6.6707 2.516-1.472 2.0654-2.36 4.3987-2.7053 7.7534-.2587 2.4546-.176 4.94.2827 7.0413-.5534 2.372-1.5734 3.348-2.6867 3.348-1.624 0-2.7933-2.644-2.6613-7.2187.0947-3.0066.692-5.1146 1.352-8.1733.284-1.3027.0507-1.9813-.5214-2.6427-.5226-.592-1.6426-.9-3.2466-.5293-1.14.2707-2.7814.56-4.2734.7813 0 0 .088-.36.164-.9946.384-3.3294-3.2346-3.0587-4.3866-1.9947-.692.6347-1.164 1.384-1.34 2.7307-.2827 2.14 1.46 3.1466 1.46 3.1466-.572 2.6174-1.9694 6.04-3.4227 8.5134-.7747 1.328-1.3667 2.304-2.1333 3.348-.007-.384-.007-.7747-.007-1.1574-.0133-5.5066.056-9.8413.088-11.4026.032-1.5294.0947-2.6747.0947-2.9454-.0133-.592-.3587-.824-1.0894-1.1013-.6413-.2507-1.4026-.4333-2.1893-.4973-.988-.0747-1.592.4533-1.5733 1.076v.8373c-.8174-1.2827-2.1334-2.1773-3.0014-2.4347-2.36-.6986-4.82-.076-6.676 2.516-1.4666 2.0654-2.436 4.9534-2.7133 7.7214-.2507 2.5933-.2067 4.7826.1453 6.6333-.3773 1.8493-1.4533 3.788-2.6733 3.788-1.5547 0-2.4427-1.3787-2.4427-7.6707 0-3.6693.1134-5.2666.1707-7.9226.0307-1.5294.088-2.7054.0813-2.976-.0067-.812-1.4213-1.228-2.0826-1.3787-.6854-.1627-1.284-.2133-1.7374-.1893-.604.0506-1.0253.5853-1.0253.9946v.9187c-.8173-1.2827-2.1333-2.1773-3.008-2.4347-2.3533-.6986-4.7947-.0626-6.664 2.516-1.22 1.6814-2.208 3.5494-2.7173 7.6907-.1387 1.196-.208 2.3147-.2014 3.36-.4853 2.9693-2.6306 6.3933-4.38 6.3933-1.032 0-2.0133-1.9893-2.0133-6.236 0-5.6506.352-13.7053.4147-14.4853 0 0 2.2146-.0387 2.6493-.044 1.1013-.0067 2.108.0187 3.5747-.0573.7426-.0373 1.4533-2.6867.6853-3.02-.34-.1454-2.7813-.2774-3.7507-.296-.8173-.0187-3.0773-.188-3.0773-.188s.2027-5.3427.2467-5.9027c.0373-.4787-.5667-.7173-.9187-.8627-.8507-.364-1.612-.5346-2.5053-.7173-1.252-.2573-1.812-.0053-1.9187 1.044-.164 1.5933-.252 6.2627-.252 6.2627-.9187 0-4.0333-.184-4.9467-.184-.848 0-1.768 3.6506-.5906 3.6946 1.3533.0507 3.7.1014 5.26.144 0 0-.0694 8.188-.0694 10.7107v.78c-.8613 4.4733-3.876 6.8907-3.876 6.8907.648-2.964-.6733-5.1854-3.064-7.06-.8813-.6987-2.6173-2.0147-4.5626-3.4427 0 0 1.1266-1.1133 2.1266-3.3413.7054-1.58.7374-3.3974-1-3.7947-2.8693-.66-5.2293 1.448-5.94 3.7-.5413 1.7373-.2573 3.0333.8174 4.3733l.2453.3027c-.6413 1.2453-1.5347 2.9253-2.284 4.228-2.0947 3.6187-3.6747 6.476-4.864 6.476-.956 0-.944-2.9013-.944-5.62 0-2.3413.176-5.8707.3147-9.52.044-1.2027-.56-1.8947-1.572-2.5173-.6174-.3774-1.9267-1.12-2.688-1.12-1.132 0-4.4174.1506-7.5187 9.1173-.3907 1.1333-1.1587 3.1907-1.1587 3.1907l.0694-10.7854c0-.252-.132-.4906-.44-.6613-.5227-.2827-1.9254-.8613-3.1587-.8613-.5987 0-.8947.2773-.8947.824l-.1 16.864c0 1.284.0307 2.7813.1574 3.436.1253.6546.3333 1.1893.5853 1.5093.252.3093.5467.548 1.0253.6547.4467.0946 2.9067.4026 3.0334-.5347.1573-1.1267.1626-2.34 1.4533-6.8893 2.0133-7.0734 4.632-10.5214 5.8653-11.7494.22-.2133.4654-.2266.452.1267-.056 1.5533-.2386 5.424-.364 8.7147-.3333 8.816 1.264 10.4453 3.5614 10.4453 1.7493 0 4.216-1.7427 6.8653-6.1467 1.6547-2.7506 3.2533-5.4373 4.4107-7.3813.7933.7413 1.6986 1.5413 2.5986 2.3973 2.096 1.9814 2.7814 3.8694 2.3227 5.6574-.3467 1.3706-1.6613 2.78-3.996 1.4093-.68-.3973-.9693-.7053-1.6547-1.1587-.3653-.2453-.932-.3146-1.2653-.0626-.8813.6613-1.3787 1.4973-1.668 2.536-.2707 1.0133.7427 1.5413 1.7933 2.0066.9.4094 2.8387.768 4.0774.812 4.8266.164 8.6906-2.328 11.3773-8.7466.4853 5.544 2.5293 8.684 6.0853 8.684 2.384 0 4.7694-3.0774 5.8147-6.104.2947 1.2333.7413 2.3026 1.3147 3.216 2.744 4.3413 8.0666 3.4106 10.7346-.2774.8307-1.1453.9574-1.5546.9574-1.5546.3893 3.4813 3.196 4.7066 4.8013 4.7066 1.8053 0 3.656-.8546 4.9573-3.788.1574.3214.3214.624.5107.9134 2.7373 4.3413 8.06 3.4106 10.7347-.2774.12-.1826.2333-.3333.3266-.4786l.0827 2.2906s-1.5293 1.3974-2.4666 2.2587c-4.1214 3.7827-7.256 6.652-7.488 9.9867-.2894 4.26 3.1586 5.84 5.776 6.0466 2.7693.2214 5.148-1.308 6.6066-3.46 1.284-1.888 2.128-5.9466 2.0654-9.9613-.0253-1.6107-.064-3.6493-.1014-5.8453 1.4534-1.6734 3.0894-3.8014 4.588-6.292 1.6414-2.7067 3.3907-6.3507 4.284-9.188 0 0 1.5294.0133 3.1534-.088.5226-.032.6733.076.572.4533-.1134.4587-2.0507 7.9413-.2827 12.9253 1.2147 3.4094 3.9387 4.5107 5.5627 4.5107 1.8933 0 3.7066-1.4347 4.6746-3.5613.12.2333.24.4653.3787.68 2.7373 4.3413 8.0413 3.404 10.7347-.2774.6106-.836.9506-1.5546.9506-1.5546.5787 3.6066 3.3854 4.72 4.9894 4.72 1.68 0 3.2653-.6854 4.556-3.732.0507 1.3413.132 2.436.2706 2.7813.0813.2147.56.4787.9.6107 1.5347.5666 3.096.296 3.668.176.4027-.0814.7174-.396.756-1.2267.112-2.1773.0427-5.8333.704-8.5573 1.1134-4.556 2.1454-6.324 2.636-7.1987.272-.492.5854-.5733.592-.0573.0187 1.0506.076 4.1346.5094 8.288.3093 3.0453.7306 4.8506 1.0573 5.424.9187 1.6293 2.064 1.7053 2.9893 1.7053.592 0 1.8254-.164 1.7174-1.2027-.056-.5026.0387-3.6306 1.1266-8.1226.7174-2.9387 1.9067-5.588 2.3347-6.5574.164-.3586.2333-.0813.2333-.0253-.0947 2.02-.296 8.6333.5214 12.2453 1.1213 4.9027 4.348 5.4494 5.4746 5.4494 2.3974 0 4.368-1.8254 5.028-6.632.164-1.1587-.076-2.052-.7866-2.052M83.558 23.8672c-.132 2.5414-.6294 4.6694-1.4214 6.2107-1.448 2.8-4.2973 3.6813-5.5506-.352-.912-2.9133-.604-6.8907-.22-9.0373.5533-3.184 1.9573-5.436 4.1466-5.2294 2.24.2214 3.3347 3.1094 3.0454 8.408m21.9549.0374c-.1254 2.3973-.748 4.8133-1.428 6.1733-1.4027 2.8187-4.336 3.7-5.5507-.352-.8293-2.776-.6347-6.356-.22-8.6093.536-2.932 1.8253-5.6574 4.148-5.6574 2.2587 0 3.372 2.48 3.0507 8.4454m.5733 16.3853c-.032 4.3867-.7173 8.2253-2.1907 9.3453-2.1013 1.5854-4.9266.3894-4.3413-2.8066.516-2.832 2.964-5.72 6.5387-9.2507 0 0 .012.8053-.007 2.712m37.907-16.36c-.1267 2.6373-.712 4.6947-1.4347 6.148-1.404 2.8187-4.3107 3.6933-5.5507-.352-.6733-2.2093-.7053-5.8973-.22-8.9733.4907-3.1347 1.8694-5.5 4.1467-5.2934 2.252.2147 3.304 3.1094 3.0587 8.4707" fill="#262626"/></svg></div>' +
        '<div class="ig-topbar-actions">' +
          '<button class="ig-topbar-btn">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 11h-8V3a1 1 0 1 0-2 0v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2Z"></path></svg>' +
          '</button>' +
          '<button class="ig-topbar-btn">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="ig-main">' + buildIGHomeHTML(user) + '</div>' +

    '<div class="ig-bottombar">' +
      buildIGBottomBar(user) +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  var topbarInner = page.querySelector('.ig-topbar-inner')
  if (topbarInner) page._igHomeTopbarHTML = topbarInner.innerHTML
  bindIGHomeTopbar(page)
  startIGPostTimeUpdater(page)

  // 返回手势
  var startX = 0
  var startY = 0
  var tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) {
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    var dx = t.clientX - startX
    var dy = Math.abs(t.clientY - startY)
    if (dx > 80 && dy < 100) {
      closeIGPage()
    }
  }, { passive: true })

  // 底栏点击
  var items = page.querySelectorAll('.ig-bottombar-item')
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      setIGActiveTab(page, user, item.dataset.tab)
    })
  })

  bindIGContentEvents(page)
}

function buildIGHomeHTML(user) {
  var profile = getIGProfileSync(user)
  var generatedPosts = loadIGGeneratedFeedPosts(user)
  var hiddenPostIds = getIGHiddenPostIds(user)
  var initialPost = getIGInitialPost()
  return '<div class="ig-stories">' +
      '<div class="ig-story-item ig-story-own">' +
        '<div class="ig-story-ring">' +
          '<div class="ig-story-avatar">' + getIGProfileAvatarHTML(user, profile) + '</div>' +
          '<div class="ig-story-add"><i class="fa fa-plus"></i></div>' +
        '</div>' +
        '<span class="ig-story-name">Your story</span>' +
      '</div>' +
    '</div>' +

    '<div class="ig-feed">' +
      generatedPosts.map(function(post, index) {
        return buildIGPost(post, {
          postId: getIGGeneratedPostId(post, index),
          commentsEnabled: true,
          user: user,
          profile: profile
        })
      }).join('') +
      (hiddenPostIds.indexOf(IG_INITIAL_POST_ID) === -1
        ? buildIGPost(initialPost, {
          postId: IG_INITIAL_POST_ID,
          commentsEnabled: true,
          user: user,
          profile: profile
        })
        : '') +
    '</div>'
}

function getIGInitialPost() {
  return {
    id: IG_INITIAL_POST_ID,
    avatar: 'img/soc_01.jpg',
    username: 'YYYYoo',
    authorId: null,
    location: 'Shanghai',
    image: 'img/blank_img1.jpg',
    imageText: '两双手，十指相扣。背景是车窗外模糊的夜景灯光，画面暖调。',
    caption: 'with u',
    likedBy: 'kovoiii_',
    likes: 38,
    comments: 5,
    reposts: 2,
    time: 'May 15'
  }
}

function buildIGProfileHTML(user, profile) {
  profile = profile || getIGProfileSync(user)
  var name = profile.name
  var account = profile.account
  var bio = profile.bio
  var profilePosts = getIGProfilePosts(user)
  return '<div class="ig-profile-page">' +
    '<div class="ig-profile-hero">' +
      '<div class="ig-profile-top">' +
        '<div class="ig-profile-avatar">' + getIGAvatarHTML({ avatar: profile.avatar, name: profile.name, nick: profile.name }, profile.name) + '</div>' +
        '<div class="ig-profile-summary">' +
          '<div class="ig-profile-name">' + igEscape(name) + '</div>' +
          '<div class="ig-profile-stats">' +
            buildIGProfileStat(profilePosts.length, 'Posts') +
            buildIGProfileStat(profile.followers, 'Followers') +
            buildIGProfileStat(profile.following, 'Following') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ig-profile-account">@' + igEscape(account) + '</div>' +
      (bio ? '<div class="ig-profile-bio">' + igEscape(bio) + '</div>' : '') +
      '<div class="ig-profile-actions">' +
        '<button class="ig-profile-action" type="button" data-ig-profile-action="edit">Edit Profile</button>' +
        '<button class="ig-profile-action" type="button">Share Profile</button>' +
      '</div>' +
    '</div>' +
    '<div class="ig-profile-tabs">' +
      '<button class="ig-profile-tab active" type="button" data-profile-tab="posts" aria-label="Posts">' + getIGProfileGridSvg() + '</button>' +
      '<button class="ig-profile-tab" type="button" data-profile-tab="reels" aria-label="Reels">' + getIGProfilePersonSvg() + '</button>' +
    '</div>' +
    '<div class="ig-profile-tab-panel" data-active-tab="posts">' +
      buildIGProfilePostsHTML(profilePosts) +
    '</div>' +
  '</div>'
}

function buildIGProfileStat(value, label) {
  return '<div class="ig-profile-stat"><strong>' + igEscape(value) + '</strong><span>' + igEscape(label) + '</span></div>'
}

function buildIGProfilePostsHTML(posts) {
  posts = Array.isArray(posts) ? posts : []
  if (!posts.length) {
    return '<div class="ig-profile-empty">' +
      '<div class="ig-profile-empty-icon"><i class="fa-solid fa-panorama"></i></div>' +
      '<div class="ig-profile-empty-title">No Posts Yet</div>' +
    '</div>'
  }
  return '<div class="ig-profile-posts-grid">' + posts.map(function(item) {
    var images = normalizeIGPostImages(item.post)
    var first = images[0] || { src: '', desc: '' }
    var many = images.length > 1
    return '<button class="ig-profile-post-thumb" type="button" data-post-id="' + igEscape(item.postId) + '" aria-label="打开帖子">' +
      (first.src ? '<img src="' + igEscape(first.src) + '" alt="' + igEscape(first.desc || item.post.caption || '') + '">' : '<span><i class="fa-regular fa-image"></i></span>') +
      (many ? '<i class="fa-solid fa-clone ig-profile-post-stack"></i>' : '') +
    '</button>'
  }).join('') + '</div>'
}

function getIGProfileGridSvg() {
  return '<svg class="ig-profile-tab-svg" viewBox="0 0 1064 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M220.03712 0c22.719147 0 41.915733 7.509333 57.767253 22.528 15.7696 15.018667 23.67488 33.355093 23.67488 54.96832v131.781973c0 21.599573-7.90528 39.936-23.67488 54.96832-15.837867 15.03232-35.048107 22.555307-57.780906 22.555307H81.455787c-22.678187 0-41.915733-7.522987-57.726294-22.555307S0 230.877867 0 209.291947V77.482667C0 55.883093 7.90528 37.546667 23.71584 22.514347 39.512747 7.522987 58.763947 0 81.442133 0h138.581334z m384.16384 0c22.69184 0 41.956693 7.509333 57.739947 22.528 15.837867 15.018667 23.71584 33.355093 23.71584 54.96832v131.781973c0 21.599573-7.891627 39.936-23.71584 54.96832-15.783253 15.03232-35.048107 22.555307-57.739947 22.555307h-141.038933c-22.664533 0-41.915733-7.522987-57.726294-22.555307s-23.71584-33.368747-23.71584-54.954666V77.482667c0-21.613227 7.90528-39.936 23.71584-54.981974C421.23264 7.522987 440.497493 0 463.17568 0h141.038933z m379.275947 0c22.719147 0 41.984 7.509333 57.767253 22.528C1057.05472 37.546667 1064.96 55.86944 1064.96 77.482667v131.781973c0 21.599573-7.90528 39.936-23.71584 54.96832-15.783253 15.03232-35.048107 22.555307-57.767253 22.555307H842.478933c-22.69184 0-41.94304-7.522987-57.7536-22.555307-15.796907-15.03232-23.702187-33.368747-23.702186-54.954667V77.482667c0-21.613227 7.918933-39.936 23.71584-54.981974C800.535893 7.522987 819.787093 0 842.478933 0h140.997974zM220.03712 363.124053c22.719147 0 41.915733 7.509333 57.767253 22.528 15.7696 15.018667 23.67488 33.34144 23.67488 54.913707v131.863893c0 21.558613-7.90528 39.881387-23.67488 54.913707-15.837867 15.045973-35.048107 22.555307-57.780906 22.555307H81.455787c-22.678187 0-41.915733-7.509333-57.726294-22.555307C7.90528 612.324693 0 593.988267 0 572.429653v-131.863893c0-21.572267 7.90528-39.881387 23.71584-54.92736 15.796907-14.99136 35.048107-22.514347 57.726293-22.514347h138.581334z m384.16384 0c22.69184 0 41.956693 7.509333 57.739947 22.528 15.837867 15.018667 23.71584 33.34144 23.71584 54.913707v131.863893c0 21.558613-7.891627 39.881387-23.71584 54.913707-15.783253 15.045973-35.048107 22.555307-57.739947 22.555307h-141.038933c-22.664533 0-41.915733-7.509333-57.726294-22.555307-15.81056-15.018667-23.71584-33.355093-23.71584-54.913707v-131.863893c0-21.572267 7.90528-39.881387 23.71584-54.92736 15.796907-14.99136 35.06176-22.514347 57.739947-22.514347h141.038933z m379.275947 0c22.719147 0 41.984 7.509333 57.767253 22.528 15.81056 15.018667 23.71584 33.34144 23.71584 54.913707v131.863893c0 21.558613-7.90528 39.881387-23.71584 54.913707-15.783253 15.045973-35.048107 22.555307-57.767253 22.555307H842.478933c-22.69184 0-41.94304-7.509333-57.7536-22.555307-15.796907-15.018667-23.702187-33.355093-23.702186-54.913707v-131.863893c0-21.572267 7.918933-39.881387 23.71584-54.92736 15.796907-14.99136 35.048107-22.514347 57.739946-22.514347h140.997974zM220.03712 726.234453c22.719147 0 41.915733 7.509333 57.767253 22.528 15.7696 15.059627 23.67488 33.327787 23.67488 54.941014v131.836586c0 21.558613-7.90528 39.881387-23.67488 54.913707-15.837867 15.03232-35.048107 22.555307-57.780906 22.555307H81.455787c-22.678187 0-41.915733-7.509333-57.726294-22.555307C7.90528 975.42144 0 957.098667 0 935.540053v-131.836586c0-21.613227 7.90528-39.881387 23.71584-54.92736 15.796907-15.018667 35.048107-22.541653 57.726293-22.541654h138.581334z m384.16384 0c22.69184 0 41.956693 7.509333 57.739947 22.528 15.837867 15.059627 23.71584 33.327787 23.71584 54.941014v131.836586c0 21.558613-7.891627 39.881387-23.71584 54.913707-15.783253 15.03232-35.048107 22.555307-57.739947 22.555307h-141.038933c-22.664533 0-41.915733-7.509333-57.726294-22.555307-15.81056-15.03232-23.71584-33.355093-23.71584-54.913707v-131.836586c0-21.613227 7.90528-39.881387 23.71584-54.92736 15.796907-15.018667 35.06176-22.541653 57.739947-22.541654h141.038933z m379.275947 0c22.719147 0 41.984 7.509333 57.767253 22.528C1057.05472 763.835733 1064.96 782.103893 1064.96 803.71712v131.836587c0 21.558613-7.90528 39.881387-23.71584 54.913706-15.783253 15.03232-35.048107 22.555307-57.767253 22.555307H842.478933c-22.69184 0-41.94304-7.509333-57.7536-22.555307-15.796907-15.03232-23.702187-33.355093-23.702186-54.913706v-131.836587c0-21.613227 7.918933-39.881387 23.71584-54.92736 15.796907-15.018667 35.048107-22.541653 57.739946-22.541653h140.997974z"></path></svg>'
}

function getIGProfilePersonSvg() {
  return '<svg class="ig-profile-tab-svg ig-profile-video-svg" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="ig-profile-video-bg" d="M0 512C2.323692 342.291692 31.796513 201.780513 117.970051 117.970051 201.780513 31.796513 342.291692 2.323692 512 0c169.708308 2.323692 310.219487 31.796513 394.029949 117.970051C992.203487 201.780513 1021.676308 342.291692 1024 512c-2.323692 169.708308-31.796513 310.219487-117.970051 394.029949C822.219487 992.203487 681.708308 1021.676308 512 1024c-169.708308-2.323692-310.219487-31.796513-394.029949-117.970051C31.796513 822.219487 2.323692 681.708308 0 512z"></path><path class="ig-profile-video-triangle" d="M692.854154 461.640205L399.570051 296.172308C361.682051 274.79959 315.076923 302.578872 315.076923 346.532103v330.935794c0 43.953231 46.605128 71.732513 84.48 50.359795l293.284103-165.467897c38.951385-21.976615 38.951385-78.742974 0-100.71959z"></path></svg>'
}

async function setIGActiveTab(page, user, tab) {
  // 离开 Reels 时停止其播放循环
  if (page._igrStop) { page._igrStop(); page._igrStop = null }
  var items = page.querySelectorAll('.ig-bottombar-item')
  items.forEach(function(i) {
    i.classList.remove('active')
    var itemTab = i.dataset.tab
    if (igBottomBarSvgs[itemTab]) {
      i.innerHTML = igBottomBarSvgs[itemTab].inactive
    }
  })

  var activeItem = page.querySelector('.ig-bottombar-item[data-tab="' + tab + '"]')
  if (activeItem) {
    activeItem.classList.add('active')
    if (igBottomBarSvgs[tab]) {
      activeItem.innerHTML = igBottomBarSvgs[tab].active
    }
  }

  // Reels 标签：顶栏/底栏切换为黑色主题
  page.classList.toggle('igr-mode', tab === 'reels')

  var main = page.querySelector('.ig-main')
  if (!main) return
  if (tab === 'profile') {
    var profile = await loadIGProfile(user)
    main.innerHTML = buildIGProfileHTML(user, profile)
  } else if (tab === 'reels') {
    main.innerHTML = window.buildIGReelsFeedHTML ? window.buildIGReelsFeedHTML(page, user) : ''
  } else if (tab === 'dm') {
    main.innerHTML = '<div class="ig-dm-loading"></div>'
    buildIGDMHTML(user).then(function(html) {
      var active = page.querySelector('.ig-bottombar-item.active')
      if (active && active.dataset.tab === 'dm') {
        main.innerHTML = html
        bindIGDMEvents(page, user)
      }
    })
  } else {
    main.innerHTML = buildIGHomeHTML(user)
  }
  updateIGTopbarForTab(page, user, tab, tab === 'profile' ? profile : null)
  bindIGContentEvents(page)
  if (tab === 'reels' && window.bindIGReelsFeed) window.bindIGReelsFeed(page, user)
}

function bindIGContentEvents(page) {
  var editProfileBtn = page.querySelector('[data-ig-profile-action="edit"]')
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showIGEditProfilePage(page)
    })
  }

  // 帖子爱心点击（只有赞有激活效果）
  var likeButtons = page.querySelectorAll('.ig-post-action.ig-like')
  likeButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var liked = button.dataset.liked === '1'
      var count = parseInt(button.dataset.count) || 0
      var newCount = liked ? count - 1 : count + 1
      button.dataset.liked = liked ? '0' : '1'
      button.dataset.count = newCount
      button.classList.toggle('liked', !liked)
      button.innerHTML = getIGHeartSvg(!liked)
      var countEl = button.nextElementSibling
      if (countEl && countEl.classList.contains('ig-like-count')) {
        countEl.textContent = newCount
      }
    })
  })

  // 评论面板
  var commentButtons = page.querySelectorAll('.ig-post-action.ig-comment')
  commentButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      if (button.disabled || button.dataset.commentsEnabled !== '1') return
      var post = button.closest('.ig-post')
      if (!post || !post.dataset.postId) return
      showIGCommentsSheet(page, post.dataset.postId)
    })
  })

  page.querySelectorAll('.ig-post-more').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var post = button.closest('.ig-post')
      if (!post) return
      showIGPostMenu(page, post, button)
    })
  })

  // 帖子图片翻页
  page.querySelectorAll('.ig-post-carousel-btn').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var imageWrap = button.closest('.ig-post-image')
      if (!imageWrap) return
      var dir = button.dataset.dir === 'next' ? 1 : -1
      setIGPostCarouselIndex(imageWrap, getIGPostCarouselIndex(imageWrap) + dir)
    })
  })

  // 点击帖子图片查看大图
  var postImages = page.querySelectorAll('.ig-post-image')
  postImages.forEach(function(imageWrap) {
    hydrateIGPostCarouselElement(imageWrap)
    imageWrap.addEventListener('click', function(e) {
      if (e.target.closest('.ig-post-carousel-btn')) return
      if (typeof showMomentImageViewModal === 'function') {
        var current = getIGPostCarouselCurrentImage(imageWrap)
        showMomentImageViewModal(current.src || '', current.desc || '')
        raiseIGImageViewSheet()
      }
    })
    imageWrap.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      imageWrap.click()
    })
  })

  bindIGProfilePanelEvents(page)

  // 个人页 Posts / Reels 子标签切换
  page.querySelectorAll('.ig-profile-tab').forEach(function(tabBtn) {
    tabBtn.addEventListener('click', function() {
      var which = tabBtn.dataset.profileTab
      if (!which) return
      var tabs = page.querySelectorAll('.ig-profile-tab')
      tabs.forEach(function(t) { t.classList.toggle('active', t === tabBtn) })
      var panel = page.querySelector('.ig-profile-tab-panel')
      if (!panel) return
      var user = page._igUser
      panel.dataset.activeTab = which
      if (which === 'reels') {
        panel.innerHTML = window.buildIGProfileReelsHTML ? window.buildIGProfileReelsHTML(user) : ''
      } else {
        panel.innerHTML = buildIGProfilePostsHTML(getIGProfilePosts(user))
      }
      bindIGProfilePanelEvents(page)
    })
  })
}

// 个人页面板内（Posts/Reels 缩略图）的点击绑定，切换标签时复用
function bindIGProfilePanelEvents(page) {
  page.querySelectorAll('.ig-profile-post-thumb').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var user = page._igUser
      if (!user) return
      showIGProfilePostsPage(user, page)
    })
  })

  page.querySelectorAll('.ig-profile-reel-thumb').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var user = page._igUser
      var reelId = button.dataset.reelId
      var reels = window.loadIGReels ? window.loadIGReels(user) : []
      var reel = reels.filter(function(r) { return r && r.id === reelId })[0]
      if (reel && window.openIGReelPlayer) window.openIGReelPlayer(reel)
    })
  })
}

function showIGProfilePostsPage(user, parentPage) {
  user = user || (parentPage && parentPage._igUser)
  if (!user) return
  var existing = document.getElementById('ig-profile-posts-page')
  if (existing) {
    stopIGPostTimeUpdater(existing)
    existing.remove()
  }

  var page = document.createElement('div')
  page.id = 'ig-profile-posts-page'
  page.className = 'full-page ig-profile-posts-page'
  page.dataset.igView = 'profile-posts'
  page._igUser = user
  page._igParentPage = parentPage || document.getElementById('ig-page') || null
  var postsHTML = buildIGProfilePostsFeedHTML(user)
  page.innerHTML =
    '<div class="ig-profile-posts-topbar">' +
      '<button class="ig-profile-posts-back" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
      '<div class="ig-profile-posts-title">Posts</div>' +
      '<div class="ig-profile-posts-spacer"></div>' +
    '</div>' +
    '<div class="ig-profile-posts-main">' + postsHTML + '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindIGProfilePostsPage(page)
  bindIGContentEvents(page)
  startIGPostTimeUpdater(page)
  resetIGProfilePostsPageScroll(page)
}

function buildIGProfilePostsFeedHTML(user) {
  try {
    var profile = getIGProfileSync(user)
    var posts = getIGProfilePosts(user)
    if (!posts.length) {
      return buildIGProfilePostsEmptyHTML('No Posts Yet')
    }
    return '<div class="ig-feed ig-profile-posts-feed">' + posts.map(function(item) {
      return buildIGPost(item.post, {
        postId: item.postId,
        commentsEnabled: true,
        user: user,
        profile: profile
      })
    }).join('') + '</div>'
  } catch (err) {
    console.error('[IG] failed to render profile posts page', err)
    return buildIGProfilePostsEmptyHTML('Posts unavailable')
  }
}

function buildIGProfilePostsEmptyHTML(title) {
  return '<div class="ig-profile-posts-empty">' +
    '<div class="ig-profile-empty-icon"><i class="fa-solid fa-panorama"></i></div>' +
    '<div class="ig-profile-empty-title">' + igEscape(title || 'No Posts Yet') + '</div>' +
  '</div>'
}

function bindIGProfilePostsPage(page) {
  var back = page.querySelector('.ig-profile-posts-back')
  if (back) {
    back.addEventListener('click', function() {
      closeIGProfilePostsPage()
    })
  }

  var startX = 0
  var startY = 0
  var tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) {
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    var dx = t.clientX - startX
    var dy = Math.abs(t.clientY - startY)
    if (dx > 80 && dy < 100) {
      closeIGProfilePostsPage()
    }
  }, { passive: true })
}

function closeIGProfilePostsPage() {
  var page = document.getElementById('ig-profile-posts-page')
  if (!page) return
  stopIGPostTimeUpdater(page)
  var parentPage = page._igParentPage || document.getElementById('ig-page')
  if (parentPage && page._igUser) {
    refreshIGProfilePage(parentPage, page._igUser)
  }
  if (window.closePage) {
    window.closePage('ig-profile-posts-page')
  } else {
    page.remove()
  }
}

function resetIGProfilePostsPageScroll(page) {
  if (!page) return
  requestAnimationFrame(function() {
    var feed = page.querySelector('.ig-profile-posts-feed')
    if (!feed) return
    feed.scrollTop = 0
  })
}

function getIGPostCarouselIndex(imageWrap) {
  var index = parseInt(imageWrap.dataset.activeIndex || '0')
  return Number.isFinite(index) ? index : 0
}

function getIGPostCarouselItems(imageWrap) {
  if (imageWrap && Array.isArray(imageWrap._igImages)) return imageWrap._igImages
  try {
    var raw = imageWrap.dataset.images || '[]'
    var parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function hydrateIGPostCarouselElement(imageWrap) {
  if (!imageWrap || imageWrap._igImages) return
  var id = imageWrap.dataset.igImagesId
  if (id && window._igCarouselImageStore && Array.isArray(window._igCarouselImageStore[id])) {
    imageWrap._igImages = window._igCarouselImageStore[id]
  }
}

function getIGPostCarouselCurrentImage(imageWrap) {
  var items = getIGPostCarouselItems(imageWrap)
  var index = getIGPostCarouselIndex(imageWrap)
  return items[index] || { src: imageWrap.dataset.image || '', desc: imageWrap.dataset.imageText || '' }
}

function setIGPostCarouselIndex(imageWrap, nextIndex) {
  var items = getIGPostCarouselItems(imageWrap)
  if (!items.length) return
  var max = items.length - 1
  var index = Math.max(0, Math.min(max, nextIndex))
  imageWrap.dataset.activeIndex = String(index)
  var img = imageWrap.querySelector('.ig-post-carousel-img')
  var current = items[index] || {}
  if (img) {
    img.src = current.src || ''
    img.alt = current.desc || ''
  }
  imageWrap.querySelectorAll('.ig-carousel-dot').forEach(function(dot, i) {
    dot.classList.toggle('active', i === index)
  })
  var prev = imageWrap.querySelector('.ig-post-carousel-btn[data-dir="prev"]')
  var next = imageWrap.querySelector('.ig-post-carousel-btn[data-dir="next"]')
  if (prev) prev.disabled = index <= 0
  if (next) next.disabled = index >= max
}

function updateIGTopbarForTab(page, user, tab, profile) {
  if (tab === 'profile') {
    renderIGProfileTopbar(page, user, profile)
  } else if (tab === 'reels') {
    renderIGReelsTopbar(page)
  } else if (tab === 'dm') {
    renderIGDMTopbar(page, user)
  } else {
    renderIGHomeTopbar(page)
  }
}

function renderIGDMTopbar(page, user) {
  var inner = page.querySelector('.ig-topbar-inner')
  if (!inner) return
  inner.classList.add('is-profile')
  var account = getIGProfileSync(user).account || getIGUserName(user)
  inner.innerHTML =
    '<span class="ig-topbar-left" aria-hidden="true"></span>' +
    '<div class="ig-dm-username ig-topbar-title">' + igEscape(account) + '</div>' +
    '<button class="ig-topbar-btn ig-topbar-right ig-dm-compose-btn" type="button" aria-label="New message">' +
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>' +
    '</button>'
}

function renderIGReelsTopbar(page) {
  var inner = page.querySelector('.ig-topbar-inner')
  if (!inner) return
  inner.classList.add('is-profile')
  inner.innerHTML =
    '<button class="ig-topbar-btn ig-topbar-left" type="button" aria-label="Create">' + getIGTopbarPlusSvg() + '</button>' +
    '<div class="ig-topbar-title">Reels</div>' +
    '<button class="ig-topbar-btn ig-topbar-right" type="button" aria-label="Menu">' + getIGTopbarMenuSvg() + '</button>'
  var plusBtn = inner.querySelector('.ig-topbar-left')
  if (plusBtn) {
    plusBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showIGReelsCreateMenu(page)
    })
  }
}

function renderIGHomeTopbar(page) {
  var inner = page.querySelector('.ig-topbar-inner')
  if (!inner || !page._igHomeTopbarHTML) return
  inner.classList.remove('is-profile')
  inner.innerHTML = page._igHomeTopbarHTML
  bindIGHomeTopbar(page)
}

function bindIGHomeTopbar(page) {
  var logo = page.querySelector('.ig-topbar-logo')
  if (!logo) return
  logo.style.cursor = 'pointer'
  logo.addEventListener('click', closeIGPage)

  var actionBtns = page.querySelectorAll('.ig-topbar-actions .ig-topbar-btn')
  var plusBtn = actionBtns[0]
  var heartBtn = actionBtns[1]
  if (plusBtn) {
    plusBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showIGCreateMenu(page)
    })
  }
  if (heartBtn) {
    heartBtn.addEventListener('click', function() {
      if (window.showIGForumPage) window.showIGForumPage()
    })
  }
}

function renderIGProfileTopbar(page, user, profile) {
  var inner = page.querySelector('.ig-topbar-inner')
  if (!inner) return
  profile = profile || getIGProfileSync(user)
  var account = profile.account || (user && user.identity && user.identity.account) || getIGUserName(user)
  inner.classList.add('is-profile')
  inner.innerHTML =
    '<button class="ig-topbar-btn ig-topbar-left" type="button" aria-label="Create">' + getIGTopbarPlusSvg() + '</button>' +
    '<div class="ig-topbar-title">' + igEscape(account) + '</div>' +
    '<button class="ig-topbar-btn ig-topbar-right" type="button" aria-label="Menu">' + getIGTopbarMenuSvg() + '</button>'
  var plusBtn = inner.querySelector('.ig-topbar-left')
  var menuBtn = inner.querySelector('.ig-topbar-right')
  if (plusBtn) {
    plusBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showIGProfileCreateSheet(page)
    })
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      showIGAccountSwitcher(page)
    })
  }
}

function showIGCreateMenu(page) {
  closeIGCreateMenu(page)
  var menu = document.createElement('div')
  menu.className = 'ig-create-popover'
  menu.innerHTML =
    '<button class="ig-create-option" type="button" data-action="publish">' +
      '<i class="fa-solid fa-circle-plus"></i>' +
      '<span>发布帖子</span>' +
    '</button>' +
    '<button class="ig-create-option" type="button" data-action="generate">' +
      '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
      '<span>生成帖子</span>' +
    '</button>'
  page.appendChild(menu)
  requestAnimationFrame(function() {
    menu.classList.add('show')
  })

  var close = function(e) {
    if (menu.contains(e.target)) return
    closeIGCreateMenu(page)
    document.removeEventListener('click', close, true)
  }
  setTimeout(function() {
    document.addEventListener('click', close, true)
  }, 0)

  menu.querySelector('[data-action="publish"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGCreateMenu(page)
    showIGComposePage()
  })
  menu.querySelector('[data-action="generate"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGCreateMenu(page)
    showIGGenerateConfirm(page)
  })
}

function closeIGCreateMenu(page) {
  var old = page && page.querySelector('.ig-create-popover')
  if (old) old.remove()
}

function showIGReelsCreateMenu(page) {
  closeIGCreateMenu(page)
  var menu = document.createElement('div')
  menu.className = 'ig-create-popover ig-create-popover-left'
  menu.innerHTML =
    '<button class="ig-create-option" type="button" data-action="publish-reels">' +
      '<i class="fa-solid fa-circle-plus"></i>' +
      '<span>发布Reels</span>' +
    '</button>' +
    '<button class="ig-create-option" type="button" data-action="generate-reels">' +
      '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
      '<span>生成Reels</span>' +
    '</button>'
  page.appendChild(menu)
  requestAnimationFrame(function() {
    menu.classList.add('show')
  })

  var close = function(e) {
    if (menu.contains(e.target)) return
    closeIGCreateMenu(page)
    document.removeEventListener('click', close, true)
  }
  setTimeout(function() {
    document.addEventListener('click', close, true)
  }, 0)

  menu.querySelector('[data-action="publish-reels"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGCreateMenu(page)
    if (window.showIGReelsComposePage) window.showIGReelsComposePage()
  })
  menu.querySelector('[data-action="generate-reels"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGCreateMenu(page)
    window.toast && window.toast('生成Reels功能开发中')
  })
}

function showIGPostMenu(page, post, button) {
  closeIGPostMenu(page)
  var menu = document.createElement('div')
  menu.className = 'ig-post-menu-popover'
  menu.innerHTML =
    '<button class="ig-post-menu-option" type="button" data-action="generate-comment">' +
      '<i class="fa-solid fa-wand-magic-sparkles"></i>' +
      '<span>生成评论</span>' +
    '</button>' +
    '<button class="ig-post-menu-option ig-post-menu-delete" type="button" data-action="delete-post">' +
      '<i class="fa-regular fa-trash-can"></i>' +
      '<span>删除帖子</span>' +
    '</button>'
  page.appendChild(menu)
  positionIGPostMenu(menu, button)
  requestAnimationFrame(function() {
    menu.classList.add('show')
  })

  var close = function(e) {
    if (menu.contains(e.target) || button.contains(e.target)) return
    closeWithListener()
  }
  var closeWithListener = function() {
    closeIGPostMenu(page)
    document.removeEventListener('click', close, true)
  }
  setTimeout(function() {
    document.addEventListener('click', close, true)
  }, 0)

  menu.querySelector('[data-action="generate-comment"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeWithListener()
    requestIGPostCommentGeneration(page, post.dataset.postId)
  })
  menu.querySelector('[data-action="delete-post"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeWithListener()
    deleteIGPost(page, post.dataset.postId)
  })
}

function positionIGPostMenu(menu, button) {
  var page = button.closest('#ig-page')
  var pageRect = page ? page.getBoundingClientRect() : { top: 0, left: 0, right: window.innerWidth }
  var rect = button.getBoundingClientRect()
  var right = Math.max(10, pageRect.right - rect.right)
  var top = Math.max(8, rect.bottom - pageRect.top + 4)
  menu.style.top = top + 'px'
  menu.style.right = right + 'px'
}

function closeIGPostMenu(page) {
  var old = page && page.querySelector('.ig-post-menu-popover')
  if (old) old.remove()
}

function showIGComposePage() {
  var existing = document.getElementById('ig-compose-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-compose-page'
  page.className = 'full-page'
  page.innerHTML =
    '<div class="igc-topbar">' +
      '<div class="igc-topbar-inner">' +
        '<button class="igc-topbar-btn igc-back" type="button" aria-label="返回">' +
          '<i class="fa fa-angle-left"></i>' +
        '</button>' +
        '<div class="igc-topbar-title">新帖子</div>' +
        '<button class="igc-publish" type="button">发布</button>' +
      '</div>' +
    '</div>' +
    '<div class="igc-scroll">' +
      '<div class="igc-photo-panel">' +
        '<div class="igc-preview" data-empty="1" data-active-index="0">' +
          '<i class="fa-regular fa-image"></i>' +
        '</div>' +
        '<div class="igc-media-meta">' +
          '<span class="igc-media-count">0/9</span>' +
          '<button class="igc-remove-current" type="button" hidden><i class="fa-solid fa-trash"></i><span>删除当前</span></button>' +
        '</div>' +
        '<div class="igc-photo-actions">' +
          '<button class="igc-photo-action" type="button" data-action="camera">' +
            '<i class="fa-solid fa-camera"></i>' +
            '<span>拍摄照片</span>' +
          '</button>' +
          '<button class="igc-photo-action" type="button" data-action="gallery">' +
            '<i class="fa-solid fa-image"></i>' +
            '<span>选择图片</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<label class="igc-field igc-field-story">' +
        '<span class="igc-field-label">My Story</span>' +
        '<div class="igc-textarea-wrap">' +
          '<textarea class="igc-textarea" placeholder="写下你的故事..." rows="3"></textarea>' +
        '</div>' +
      '</label>' +
      '<label class="igc-field">' +
        '<span class="igc-field-label">Hashtag</span>' +
        '<div class="igc-input-wrap">' +
          '<i class="fa-solid fa-hashtag"></i>' +
          '<input class="igc-input" type="text" placeholder="输入话题标签">' +
        '</div>' +
      '</label>' +
      '<label class="igc-field">' +
        '<span class="igc-field-label">Location</span>' +
        '<div class="igc-input-wrap">' +
          '<i class="fa-solid fa-location-dot"></i>' +
          '<input class="igc-input" type="text" placeholder="添加位置">' +
        '</div>' +
      '</label>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  page._igComposeImages = []
  bindIGComposePage(page)
}

function bindIGComposePage(page) {
  var backBtn = page.querySelector('.igc-back')
  var publishBtn = page.querySelector('.igc-publish')
  var cameraBtn = page.querySelector('[data-action="camera"]')
  var galleryBtn = page.querySelector('[data-action="gallery"]')
  var preview = page.querySelector('.igc-preview')
  var removeBtn = page.querySelector('.igc-remove-current')

  if (backBtn) {
    backBtn.addEventListener('click', closeIGComposePage)
  }
  if (publishBtn) {
    publishBtn.addEventListener('click', function() {
      publishIGComposePost(page)
    })
  }
  if (cameraBtn) {
    cameraBtn.addEventListener('click', function() {
      showIGComposeCameraSheet(page)
    })
  }
  if (galleryBtn) {
    galleryBtn.addEventListener('click', function() {
      showIGComposeGallerySheet(page)
    })
  }
  if (preview) {
    preview.addEventListener('click', function(e) {
      if (e.target.closest('.igc-preview-nav')) return
      var item = getIGComposeActiveImage(page)
      if (item && item.src && typeof showMomentImageViewModal === 'function') {
        showMomentImageViewModal(item.src, item.desc || '')
        raiseIGImageViewSheet()
      }
    })
    preview.addEventListener('click', function(e) {
      var nav = e.target.closest('.igc-preview-nav')
      if (!nav) return
      e.preventDefault()
      e.stopPropagation()
      var dir = nav.dataset.dir === 'next' ? 1 : -1
      setIGComposeActiveIndex(page, getIGComposeActiveIndex(page) + dir)
    })
  }
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      removeIGComposeActiveImage(page)
    })
  }
  renderIGComposeImages(page)
}

function showIGComposeCameraSheet(page) {
  var modal = openIGCenterModal(
    '<div class="sheet-title">拍摄照片</div>' +
    '<div style="padding:0 16px 8px">' +
      '<textarea class="igc-sheet-textarea" id="igc-camera-desc" rows="3" placeholder="描述照片内容（如：自拍、风景照…）"></textarea>' +
    '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-pill btn-full" id="igc-camera-confirm" type="button">拍摄</button>' +
    '</div>'
  )
  modal.sheet.querySelector('#igc-camera-confirm').addEventListener('click', function() {
    var desc = modal.sheet.querySelector('#igc-camera-desc').value.trim()
    if (!desc) { window.toast && window.toast('请填写照片描述'); return }
    var placeholders = ['img/blank_img1.jpg', 'img/blank_img2.jpg', 'img/blank_img3.jpg', 'img/blank_img4.jpg', 'img/blank_img5.jpg', 'img/blank_img6.jpg']
    var src = placeholders[Math.floor(Math.random() * placeholders.length)]
    addIGComposeImage(page, src, desc)
    modal.close()
  })
  setTimeout(function() {
    var ta = modal.sheet.querySelector('#igc-camera-desc')
    if (ta) ta.focus()
  }, 80)
}

function showIGComposeGallerySheet(page) {
  if (window.showImagePicker) {
    window.showImagePicker(function(imageUrl) {
      if (!imageUrl) return
      showIGComposeImageConfirm(page, imageUrl)
    })
    setTimeout(function() {
      var pickerOverlay = document.querySelector('.img-picker-overlay')
      var pickerModal = document.querySelector('.img-picker-modal')
      if (pickerOverlay) pickerOverlay.style.zIndex = '10040'
      if (pickerModal) pickerModal.style.zIndex = '10041'
    }, 0)
  } else {
    window.toast && window.toast('图片选择器不可用')
  }
}

function showIGComposeImageConfirm(page, src) {
  var modal = openIGCenterModal(
    '<div class="sheet-title">确认图片</div>' +
    '<div class="igc-confirm-preview">' +
      '<img src="' + igEscape(src) + '" alt="选中图片">' +
    '</div>' +
    '<div style="padding:0 16px 8px">' +
      '<textarea class="igc-sheet-textarea" id="igc-gallery-desc" rows="2" placeholder="图片描述（可选）"></textarea>' +
    '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-pill btn-full" id="igc-gallery-confirm" type="button">确认</button>' +
    '</div>'
  )
  modal.overlay.style.zIndex = '10050'
  modal.sheet.style.zIndex = '10051'
  modal.sheet.querySelector('#igc-gallery-confirm').addEventListener('click', function() {
    var desc = modal.sheet.querySelector('#igc-gallery-desc').value.trim()
    addIGComposeImage(page, src, desc)
    modal.close()
  })
}

function getIGComposeImages(page) {
  if (!Array.isArray(page._igComposeImages)) page._igComposeImages = []
  return page._igComposeImages
}

function getIGComposeActiveIndex(page) {
  var preview = page.querySelector('.igc-preview')
  var index = parseInt(preview && preview.dataset.activeIndex || '0')
  return Number.isFinite(index) ? index : 0
}

function getIGComposeActiveImage(page) {
  var images = getIGComposeImages(page)
  return images[getIGComposeActiveIndex(page)] || null
}

function setIGComposeActiveIndex(page, nextIndex) {
  var images = getIGComposeImages(page)
  if (!images.length) return
  var index = Math.max(0, Math.min(images.length - 1, nextIndex))
  var preview = page.querySelector('.igc-preview')
  if (!preview) return
  preview.dataset.activeIndex = String(index)
  renderIGComposeImages(page)
}

function addIGComposeImage(page, src, desc) {
  var images = getIGComposeImages(page)
  if (images.length >= 9) {
    window.toast && window.toast('最多添加 9 张图片')
    return
  }
  images.push({ src: src, desc: desc || '' })
  var preview = page.querySelector('.igc-preview')
  if (preview) preview.dataset.activeIndex = String(images.length - 1)
  renderIGComposeImages(page)
}

function removeIGComposeActiveImage(page) {
  var images = getIGComposeImages(page)
  if (!images.length) return
  var index = getIGComposeActiveIndex(page)
  images.splice(index, 1)
  var preview = page.querySelector('.igc-preview')
  if (preview) preview.dataset.activeIndex = String(Math.max(0, Math.min(index, images.length - 1)))
  renderIGComposeImages(page)
}

function renderIGComposeImages(page) {
  var preview = page.querySelector('.igc-preview')
  var countEl = page.querySelector('.igc-media-count')
  var removeBtn = page.querySelector('.igc-remove-current')
  var images = getIGComposeImages(page)
  if (countEl) countEl.textContent = images.length + '/9'
  if (removeBtn) removeBtn.hidden = !images.length
  if (!preview) return
  if (!images.length) {
    preview.dataset.empty = '1'
    preview.dataset.activeIndex = '0'
    preview.innerHTML = '<i class="fa-regular fa-image"></i>'
    return
  }

  preview.dataset.empty = '0'
  var index = Math.max(0, Math.min(getIGComposeActiveIndex(page), images.length - 1))
  preview.dataset.activeIndex = String(index)
  var item = images[index]
  var nav = images.length > 1
    ? '<button class="igc-preview-nav igc-preview-prev" type="button" data-dir="prev" aria-label="上一张"' + (index <= 0 ? ' disabled' : '') + '><i class="fa fa-angle-left"></i></button>' +
      '<button class="igc-preview-nav igc-preview-next" type="button" data-dir="next" aria-label="下一张"' + (index >= images.length - 1 ? ' disabled' : '') + '><i class="fa fa-angle-right"></i></button>' +
      '<div class="igc-preview-dots">' + images.map(function(_, i) {
        return '<span class="igc-preview-dot' + (i === index ? ' active' : '') + '"></span>'
      }).join('') + '</div>' +
      '<div class="igc-preview-page">' + (index + 1) + '/' + images.length + '</div>'
    : ''
  preview.innerHTML = '<img src="' + igEscape(item.src) + '" alt="' + igEscape(item.desc || 'Selected photo') + '">' + nav
}

async function publishIGComposePost(page) {
  if (!page || page.dataset.publishing === '1') return
  var images = getIGComposeImages(page).filter(function(item) { return item && item.src })
  var caption = page.querySelector('.igc-textarea') ? page.querySelector('.igc-textarea').value.trim() : ''
  var hashtag = page.querySelector('.igc-input-wrap .igc-input') ? page.querySelector('.igc-input-wrap .igc-input').value.trim() : ''
  var inputs = page.querySelectorAll('.igc-input')
  var location = inputs[1] ? inputs[1].value.trim() : ''
  if (!images.length) {
    window.toast && window.toast('请先添加图片')
    return
  }

  var user = await getIGSessionUser()
  if (!user) {
    window.toast && window.toast('请先登录')
    return
  }

  page.dataset.publishing = '1'
  try {
    var tagText = hashtag
      ? String(hashtag).split(/[\s,，#]+/).map(function(tag) {
        tag = tag.trim().replace(/^#/, '')
        return tag ? '#' + tag : ''
      }).filter(Boolean).join(' ')
      : ''
    var post = {
      location: location,
      images: images,
      image: images[0].src,
      imageText: images[0].desc || '',
      caption: [caption, tagText].filter(Boolean).join('\n'),
      likedBy: '',
      likes: 0,
      comments: 0,
      reposts: 0,
      time: 'now',
      authorId: user.id,
      createdAt: Date.now()
    }
    await saveIGGeneratedFeedPosts(user, [post].concat(loadIGGeneratedFeedPosts(user)).slice(0, 60))
    closeIGComposePage()
    var igPage = document.getElementById('ig-page')
    if (igPage) {
      igPage._igUser = user
      renderIGGeneratedFeed(igPage, user)
    }
    window.toast && window.toast('已发布')
  } catch (e) {
    console.error('发布 Instagram 帖子失败：', e)
    window.toast && window.toast('发布失败')
  } finally {
    page.dataset.publishing = '0'
  }
}

function closeIGComposePage() {
  var page = document.getElementById('ig-compose-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('ig-compose-page')
  } else {
    page.remove()
  }
}

function showIGGenerateConfirm(page) {
  var modal = openIGCenterModal(
    '<div class="sheet-title">生成帖子</div>' +
    '<div class="ig-generate-confirm-text">根据 Instagram 账号关联好友，参与角色，热门话题等等生成 10 条帖子。是否继续？</div>' +
    '<div class="sheet-actions ig-generate-actions">' +
      '<button class="btn-pill ig-generate-cancel" id="ig-generate-cancel" type="button">取消</button>' +
      '<button class="btn-pill btn-full ig-generate-confirm" id="ig-generate-confirm" type="button">确认生成</button>' +
    '</div>'
  )
  modal.sheet.querySelector('#ig-generate-cancel').addEventListener('click', modal.close)
  modal.sheet.querySelector('#ig-generate-confirm').addEventListener('click', async function() {
    modal.close()
    await generateIGFeedPosts(page)
  })
}

function openIGCenterModal(html) {
  var app = document.getElementById('app') || document.body
  var overlay = typeof createOverlay === 'function' ? createOverlay() : document.createElement('div')
  overlay.className = overlay.className || 'sheet-overlay'
  var sheet = typeof createSheet === 'function' ? createSheet(html) : document.createElement('div')
  if (typeof createSheet !== 'function') {
    sheet.className = 'center-modal'
    sheet.innerHTML = html
  }
  overlay.style.zIndex = '10030'
  sheet.style.zIndex = '10031'
  app.appendChild(overlay)
  app.appendChild(sheet)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
  function close() {
    overlay.classList.remove('show')
    sheet.classList.remove('show')
    setTimeout(function() {
      if (overlay.parentNode) overlay.remove()
      if (sheet.parentNode) sheet.remove()
    }, 200)
  }
  overlay.addEventListener('click', close)
  return { overlay: overlay, sheet: sheet, close: close }
}

function getIGTopbarPlusSvg() {
  return '<svg class="ig-topbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11h-8V3a1 1 0 1 0-2 0v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2Z"></path></svg>'
}

function getIGTopbarMenuSvg() {
  return '<svg class="ig-topbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 6.5a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 6.5a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Z"></path></svg>'
}

function showIGProfileCreateSheet(page) {
  closeIGProfileCreateSheet(true)
  var app = document.getElementById('app') || document.body
  var overlay = document.createElement('div')
  overlay.className = 'ig-profile-create-overlay'
  overlay.innerHTML =
    '<div class="ig-profile-create-backdrop"></div>' +
    '<section class="ig-profile-create-sheet" role="dialog" aria-modal="true" aria-label="发布">' +
      '<div class="ig-profile-create-handle"></div>' +
      '<div class="ig-profile-create-header">' +
        '<div class="ig-profile-create-title">发布</div>' +
        '<button class="ig-profile-create-close" type="button" aria-label="关闭"><i class="fa fa-xmark"></i></button>' +
      '</div>' +
      '<div class="ig-profile-create-list">' +
        '<button class="ig-profile-create-option" type="button" data-action="post">' +
          '<span class="ig-profile-create-icon"><i class="fa-solid fa-inbox"></i></span>' +
          '<span class="ig-profile-create-main">' +
            '<span class="ig-profile-create-name">Post</span>' +
            '<span class="ig-profile-create-desc">发布图片和文字动态</span>' +
          '</span>' +
          '<span class="ig-profile-create-arrow"><i class="fa fa-angle-right"></i></span>' +
        '</button>' +
        '<button class="ig-profile-create-option" type="button" data-action="reel">' +
          '<span class="ig-profile-create-icon"><i class="fa-solid fa-clapperboard"></i></span>' +
          '<span class="ig-profile-create-main">' +
            '<span class="ig-profile-create-name">Reel</span>' +
            '<span class="ig-profile-create-desc">发布短视频 Reels</span>' +
          '</span>' +
          '<span class="ig-profile-create-arrow"><i class="fa fa-angle-right"></i></span>' +
        '</button>' +
      '</div>' +
    '</section>'
  app.appendChild(overlay)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
  })

  overlay.querySelector('.ig-profile-create-backdrop').addEventListener('click', function() {
    closeIGProfileCreateSheet()
  })
  overlay.querySelector('.ig-profile-create-close').addEventListener('click', function() {
    closeIGProfileCreateSheet()
  })
  overlay.querySelector('[data-action="post"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGProfileCreateSheet(true)
    showIGComposePage()
  })
  overlay.querySelector('[data-action="reel"]').addEventListener('click', function(e) {
    e.preventDefault()
    e.stopPropagation()
    closeIGProfileCreateSheet(true)
    if (window.showIGReelsComposePage) {
      window.showIGReelsComposePage()
    } else if (window.toast) {
      window.toast('Reels 发布功能不可用')
    }
  })
}

function closeIGProfileCreateSheet(immediate) {
  var overlay = document.querySelector('.ig-profile-create-overlay')
  if (!overlay) return
  if (immediate) {
    overlay.remove()
    return
  }
  overlay.classList.remove('show')
  setTimeout(function() {
    if (overlay.parentNode) overlay.remove()
  }, 220)
}

async function showIGAccountSwitcher(page) {
  closeIGAccountSwitcher(true)
  var app = document.getElementById('app') || document.body
  var overlay = document.createElement('div')
  overlay.className = 'ig-account-switcher-overlay'
  overlay.innerHTML =
    '<div class="ig-account-switcher-backdrop"></div>' +
    '<section class="ig-account-switcher-sheet" role="dialog" aria-modal="true" aria-label="切换账号">' +
      '<div class="ig-account-switcher-handle"></div>' +
      '<div class="ig-account-switcher-header">' +
        '<div class="ig-account-switcher-title">切换账号</div>' +
        '<button class="ig-account-switcher-close" type="button" aria-label="关闭"><i class="fa fa-xmark"></i></button>' +
      '</div>' +
      '<div class="ig-account-switcher-list">' +
        '<div class="ig-account-switcher-loading"><i class="fa fa-spinner fa-spin"></i></div>' +
      '</div>' +
    '</section>'
  app.appendChild(overlay)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
  })

  overlay.querySelector('.ig-account-switcher-backdrop').addEventListener('click', function() {
    closeIGAccountSwitcher()
  })
  overlay.querySelector('.ig-account-switcher-close').addEventListener('click', function() {
    closeIGAccountSwitcher()
  })

  var list = overlay.querySelector('.ig-account-switcher-list')
  var currentUser = page && page._igUser
  var users = await getIGUserList()
  if (!overlay.parentNode || !list) return
  if (!users.length) {
    list.innerHTML =
      '<div class="ig-account-switcher-empty">' +
        '<div>暂无 USER 账号</div>' +
        '<span>请先在角色档案里创建 USER 类型角色</span>' +
      '</div>'
    return
  }

  list.innerHTML = users.map(function(user) {
    var profile = getIGProfileSync(user)
    var name = profile.name || getIGUserName(user)
    var account = profile.account || (user.identity && user.identity.account) || ''
    var isCurrent = currentUser && String(currentUser.id) === String(user.id)
    return '<button class="ig-account-switcher-user' + (isCurrent ? ' active' : '') + '" type="button" data-uid="' + igEscape(user.id) + '">' +
      '<span class="ig-account-switcher-avatar">' + getIGProfileAvatarHTML(user, profile) + '</span>' +
      '<span class="ig-account-switcher-main">' +
        '<span class="ig-account-switcher-name">' + igEscape(name) + '</span>' +
        '<span class="ig-account-switcher-account">' + (account ? '@' + igEscape(account) : '微信用户') + '</span>' +
      '</span>' +
      '<span class="ig-account-switcher-mark">' +
        (isCurrent ? '<i class="fa fa-check"></i>' : '<i class="fa fa-angle-right"></i>') +
      '</span>' +
    '</button>'
  }).join('')

  list.querySelectorAll('.ig-account-switcher-user').forEach(function(row) {
    row.addEventListener('click', async function() {
      var uid = parseInt(row.dataset.uid)
      var user = users.find(function(item) { return parseInt(item.id) === uid })
      if (!user) return
      if (currentUser && String(currentUser.id) === String(user.id)) {
        closeIGAccountSwitcher()
        return
      }
      setIGSessionUser(user)
      closeIGAccountSwitcher(true)
      closeIGSecondaryPages()
      await hydrateIGGeneratedFeedPosts(user)
      renderIGPage(user)
    })
  })
}

function closeIGAccountSwitcher(immediate) {
  var overlay = document.querySelector('.ig-account-switcher-overlay')
  if (!overlay) return
  if (immediate) {
    overlay.remove()
    return
  }
  overlay.classList.remove('show')
  setTimeout(function() {
    if (overlay.parentNode) overlay.remove()
  }, 220)
}

function closeIGSecondaryPages() {
  [
    'ig-profile-posts-page',
    'ig-edit-profile-page',
    'ig-compose-page',
    'ig-forum-page'
  ].forEach(function(id) {
    var node = document.getElementById(id)
    if (node) node.remove()
  })
}

function showIGLoginPage() {
  var existing = document.getElementById('ig-login-page')
  if (existing) existing.remove()
  var igPage = document.getElementById('ig-page')
  if (igPage) igPage.remove()

  var page = document.createElement('div')
  page.id = 'ig-login-page'
  page.className = 'full-page ig-login-page'
  page.innerHTML =
    '<button class="ig-login-close" type="button" aria-label="返回"><i class="fa fa-angle-left"></i></button>' +
    '<div class="ig-login-shell">' +
      '<div class="ig-login-logo">' + getIGLoginIconSvg() + '</div>' +
      '<div class="ig-login-wordmark">' + getIGLoginWordmarkSvg() + '</div>' +
      '<div class="ig-login-subtitle">选择微信账号继续</div>' +
      '<button class="ig-login-wechat" id="ig-login-wechat" type="button">' +
        getIGWeChatSvg() +
        '<span>通过微信登录</span>' +
      '</button>' +
      '<div class="ig-login-divider"><span></span><em>OR</em><span></span></div>' +
      '<div class="ig-login-users" id="ig-login-users" hidden></div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  page.querySelector('.ig-login-close').addEventListener('click', function() {
    closeIGLoginPage()
  })
  page.querySelector('#ig-login-wechat').addEventListener('click', function() {
    renderIGLoginUsers(page)
  })
}

async function renderIGLoginUsers(page) {
  var list = page.querySelector('#ig-login-users')
  if (!list) return
  list.hidden = false
  list.innerHTML = '<div class="ig-login-loading"><i class="fa fa-spinner fa-spin"></i></div>'
  var users = await getIGUserList()
  if (!users.length) {
    list.innerHTML =
      '<div class="ig-login-empty">' +
        '<div>暂无 USER 账号</div>' +
        '<span>请先在角色档案里创建 USER 类型角色</span>' +
      '</div>'
    return
  }
  list.innerHTML = users.map(function(user) {
    var name = getIGUserName(user)
    var account = user.identity && user.identity.account ? '@' + user.identity.account : '微信用户'
    return '<button class="ig-login-user" type="button" data-uid="' + igEscape(user.id) + '">' +
      '<span class="ig-login-user-avatar">' + getIGAvatarHTML(user) + '</span>' +
      '<span class="ig-login-user-main">' +
        '<span class="ig-login-user-name">' + igEscape(name) + '</span>' +
        '<span class="ig-login-user-account">' + igEscape(account) + '</span>' +
      '</span>' +
      '<i class="fa fa-angle-right"></i>' +
    '</button>'
  }).join('')

  list.querySelectorAll('.ig-login-user').forEach(function(row) {
    row.addEventListener('click', async function() {
      var uid = parseInt(row.dataset.uid)
      var user = users.find(function(item) { return parseInt(item.id) === uid })
      if (!user) return
      setIGSessionUser(user)
      closeIGLoginPage(true)
      await hydrateIGGeneratedFeedPosts(user)
      renderIGPage(user)
    })
  })
}

function closeIGLoginPage(immediate) {
  var page = document.getElementById('ig-login-page')
  if (!page) return
  if (immediate) {
    page.remove()
  } else if (window.closePage) {
    window.closePage('ig-login-page')
  } else {
    page.remove()
  }
}

function closeIGPage() {
  var page = document.getElementById('ig-page')
  if (!page) return
  stopIGPostTimeUpdater(page)
  if (window.closePage) {
    window.closePage('ig-page')
  } else {
    page.remove()
  }
}

async function showIGEditProfilePage(parentPage) {
  var user = parentPage && parentPage._igUser ? parentPage._igUser : await getIGSessionUser()
  if (!user) {
    window.toast && window.toast('请先登录')
    return
  }
  var profile = await loadIGProfile(user)
  var existing = document.getElementById('ig-edit-profile-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-edit-profile-page'
  page.className = 'full-page ig-edit-profile-page'
  page._igUser = user
  page._igParentPage = parentPage || null
  page._igEditAvatar = profile.avatar || ''
  page.innerHTML =
    '<div class="ig-edit-topbar">' +
      '<button class="ig-edit-topbar-btn" type="button" data-ig-edit-action="cancel">Cancel</button>' +
      '<div class="ig-edit-topbar-title">Edit profile</div>' +
      '<button class="ig-edit-topbar-btn ig-edit-save" type="button" data-ig-edit-action="save">Done</button>' +
    '</div>' +
    '<div class="ig-edit-scroll">' +
      '<div class="ig-edit-avatar-block">' +
        '<button class="ig-edit-avatar-btn" type="button" data-ig-edit-action="avatar">' +
          getIGAvatarHTML({ avatar: profile.avatar, name: profile.name, nick: profile.name }, profile.name) +
        '</button>' +
        '<button class="ig-edit-avatar-link" type="button" data-ig-edit-action="avatar">Change profile photo</button>' +
      '</div>' +
      '<div class="ig-edit-form">' +
        buildIGEditField('Name', 'name', profile.name, 'text') +
        buildIGEditField('Username', 'account', profile.account, 'text') +
        buildIGEditTextarea('Bio', 'bio', profile.bio) +
        buildIGEditField('Followers', 'followers', profile.followers, 'number') +
        buildIGEditField('Following', 'following', profile.following, 'number') +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }
  bindIGEditProfilePage(page)
}

function buildIGEditField(label, key, value, type) {
  return '<label class="ig-edit-field">' +
    '<span class="ig-edit-label">' + igEscape(label) + '</span>' +
    '<input class="ig-edit-input" type="' + igEscape(type || 'text') + '" data-ig-edit-field="' + igEscape(key) + '" value="' + igEscape(value) + '" autocomplete="off" autocorrect="off" autocapitalize="off">' +
  '</label>'
}

function buildIGEditTextarea(label, key, value) {
  return '<label class="ig-edit-field ig-edit-field-bio">' +
    '<span class="ig-edit-label">' + igEscape(label) + '</span>' +
    '<textarea class="ig-edit-textarea" data-ig-edit-field="' + igEscape(key) + '" rows="3">' + igEscape(value) + '</textarea>' +
  '</label>'
}

function bindIGEditProfilePage(page) {
  page.querySelector('[data-ig-edit-action="cancel"]').addEventListener('click', closeIGEditProfilePage)
  page.querySelector('[data-ig-edit-action="save"]').addEventListener('click', function() {
    saveIGEditProfilePage(page)
  })
  page.querySelectorAll('[data-ig-edit-action="avatar"]').forEach(function(button) {
    button.addEventListener('click', function() {
      chooseIGEditAvatar(page)
    })
  })
}

function chooseIGEditAvatar(page) {
  if (!window.showImagePicker) {
    window.toast && window.toast('图片选择器不可用')
    return
  }
  window.showImagePicker(function(imageUrl) {
    if (!imageUrl) return
    page._igEditAvatar = imageUrl
    var avatarBtn = page.querySelector('.ig-edit-avatar-btn')
    var name = getIGEditFieldValue(page, 'name') || getIGUserName(page._igUser)
    if (avatarBtn) avatarBtn.innerHTML = getIGAvatarHTML({ avatar: imageUrl, name: name, nick: name }, name)
  })
  raiseIGImagePicker()
  setTimeout(raiseIGImagePicker, 80)
}

function raiseIGImagePicker() {
  var pickerOverlay = document.querySelector('.img-picker-overlay')
  var pickerModal = document.querySelector('.img-picker-modal')
  if (pickerOverlay) pickerOverlay.style.zIndex = '10080'
  if (pickerModal) pickerModal.style.zIndex = '10081'
}

function getIGEditFieldValue(page, key) {
  var field = page.querySelector('[data-ig-edit-field="' + key + '"]')
  return field ? field.value.trim() : ''
}

async function saveIGEditProfilePage(page) {
  var user = page._igUser
  if (!user) return
  var account = getIGEditFieldValue(page, 'account').replace(/^@+/, '').trim()
  var name = getIGEditFieldValue(page, 'name')
  var bio = getIGEditFieldValue(page, 'bio')
  var followers = normalizeIGProfileCount(getIGEditFieldValue(page, 'followers'), '102')
  var following = normalizeIGProfileCount(getIGEditFieldValue(page, 'following'), '66')
  if (!name) {
    window.toast && window.toast('请输入昵称')
    return
  }
  if (!account) {
    window.toast && window.toast('请输入 ID')
    return
  }
  var profile = {
    name: name,
    account: account,
    bio: bio,
    followers: followers,
    following: following,
    avatar: page._igEditAvatar || ''
  }
  await saveIGProfile(user, profile)
  var parentPage = page._igParentPage || document.getElementById('ig-page')
  if (parentPage) {
    parentPage._igUser = user
    updateIGBottomBarAvatar(parentPage, user)
    refreshIGVisiblePageAfterProfileSave(parentPage, user)
  }
  closeIGEditProfilePage()
  window.toast && window.toast('已保存')
}

function normalizeIGProfileCount(value, fallback) {
  var num = parseInt(String(value || '').replace(/[^\d]/g, ''), 10)
  if (!Number.isFinite(num) || num < 0) return fallback
  return String(num)
}

async function refreshIGProfilePage(page, user) {
  var activeItem = page.querySelector('.ig-bottombar-item.active')
  if (!activeItem || activeItem.dataset.tab !== 'profile') return
  var main = page.querySelector('.ig-main')
  if (!main) return
  var profile = await loadIGProfile(user)
  main.innerHTML = buildIGProfileHTML(user, profile)
  renderIGProfileTopbar(page, user, profile)
  bindIGContentEvents(page)
}

function refreshIGVisiblePageAfterProfileSave(page, user) {
  if (!page || !user) return
  renderIGGeneratedFeed(page, user)

  var postsPage = document.getElementById('ig-profile-posts-page')
  if (postsPage && postsPage._igUser && String(postsPage._igUser.id) === String(user.id)) {
    postsPage._igUser = user
    var postsMain = postsPage.querySelector('.ig-profile-posts-main')
    if (postsMain) {
      postsMain.innerHTML = buildIGProfilePostsFeedHTML(user)
      bindIGContentEvents(postsPage)
    }
  }
}

function closeIGEditProfilePage() {
  var page = document.getElementById('ig-edit-profile-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('ig-edit-profile-page')
  } else {
    page.remove()
  }
}

function updateIGBottomBarAvatar(page, user) {
  var avatar = page && page.querySelector('.ig-bottombar-avatar')
  if (avatar) avatar.innerHTML = getIGProfileAvatarHTML(user)
}

window.showIGForumPage = function() {
  var existing = document.getElementById('ig-forum-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-forum-page'
  page.className = 'full-page'
  page.innerHTML =
    '<div class="igf-topbar">' +
      '<div class="igf-topbar-inner">' +
        '<button class="igf-topbar-btn igf-back" type="button" aria-label="返回">' +
          '<i class="fa fa-angle-left"></i>' +
        '</button>' +
        '<div class="igf-topbar-title">论坛设定</div>' +
        '<div class="igf-topbar-spacer"></div>' +
      '</div>' +
    '</div>' +
    '<div class="igf-scroll">' +
      buildIGForumWorldSection() +
      buildIGForumSettingsSection() +
      '<div class="igf-footer-note">论坛设定将影响 Instagram 内所有互动内容的生成风格与世界观背景。</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  bindIGForumEvents(page)
  hydrateIGForumSettings(page)
}

function buildIGForumWorldSection() {
  return '<div class="igf-section">' +
    '<div class="igf-section-header">' +
      '<span class="igf-section-title">世界观设定</span>' +
    '</div>' +
    '<button class="igf-world-card" type="button" data-world="instagram">' +
      '<span class="igf-world-icon">' +
        '<i class="fa-solid fa-earth-americas"></i>' +
      '</span>' +
      '<span class="igf-world-info">' +
        '<span class="igf-world-name">Instagram</span>' +
        '<span class="igf-world-desc">基础世界观</span>' +
      '</span>' +
      '<i class="fa fa-angle-right igf-world-chevron"></i>' +
    '</button>' +
  '</div>'
}

function buildIGForumSettingsSection() {
  return '<div class="igf-section">' +
    '<div class="igf-section-header">' +
      '<span class="igf-section-title">论坛配置</span>' +
    '</div>' +
    '<div class="igf-setting-list">' +
      buildIGForumSettingRow('members', 'fa fa-users', '参与角色', '未设定') +
      buildIGForumSettingRow('topics', 'fa fa-hashtag', '热门话题', '未设定') +
      buildIGForumSettingRow('npc-generator', 'fa fa-wand-magic-sparkles', 'NPC生成器', 'AI生成论坛NPC') +
    '</div>' +
  '</div>'
}

function buildIGForumSettingRow(key, icon, label, value) {
  return '<button class="igf-setting-row" type="button" data-setting="' + igEscape(key) + '">' +
    '<span class="igf-setting-icon"><i class="' + igEscape(icon) + '"></i></span>' +
    '<span class="igf-setting-body">' +
      '<span class="igf-setting-label">' + igEscape(label) + '</span>' +
      '<span class="igf-setting-value">' + igEscape(value) + '</span>' +
    '</span>' +
    '<i class="fa fa-angle-right igf-setting-chevron"></i>' +
  '</button>'
}

function bindIGForumEvents(page) {
  var backBtn = page.querySelector('.igf-back')
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      closeIGForumPage()
    })
  }

  var world = page.querySelector('.igf-world-card')
  if (world) {
    world.addEventListener('click', function() {
      window.toast && window.toast('当前世界观：Instagram')
    })
  }

  page.querySelectorAll('.igf-setting-row').forEach(function(row) {
    row.addEventListener('click', function() {
      handleIGForumSetting(row.dataset.setting, page)
    })
  })

  var startX = 0
  var startY = 0
  var tracking = false
  page.addEventListener('touchstart', function(e) {
    var t = e.touches[0]
    if (t.clientX < 25) {
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }
  }, { passive: true })
  page.addEventListener('touchend', function(e) {
    if (!tracking) return
    tracking = false
    var t = e.changedTouches[0]
    var dx = t.clientX - startX
    var dy = Math.abs(t.clientY - startY)
    if (dx > 80 && dy < 100) {
      closeIGForumPage()
    }
  }, { passive: true })
}

function handleIGForumSetting(setting, page) {
  if (setting === 'npc-generator') {
    if (typeof showNPCGenerateModal === 'function') {
      showNPCGenerateModal(page)
    } else if (window.toast) {
      window.toast('NPC生成器不可用')
    }
    return
  }

  if (setting === 'members') {
    showIGForumMembersSheet(page)
    return
  }

  if (setting === 'topics') {
    showIGForumTopicsSheet(page)
    return
  }

  window.toast && window.toast('该项配置暂未开放')
}

function closeIGForumPage() {
  var page = document.getElementById('ig-forum-page')
  if (!page) return
  if (window.closePage) {
    window.closePage('ig-forum-page')
  } else {
    page.remove()
  }
}

async function generateIGFeedPosts(page) {
  if (!page || page.dataset.igGenerating === '1') return
  if (!window.callAI) {
    window.toast && window.toast('请先配置 API')
    return
  }

  var user = page._igUser || await getIGSessionUser()
  var loading = showIGGeneratingModal()
  page.dataset.igGenerating = '1'
  try {
    var context = await buildIGFeedPromptContext(user)
    loading.setStatus('AI 正在生成帖子...')
    var prompt = buildIGFeedGenerationPrompt(context)
    var raw = await window.callAI([{ role: 'user', content: prompt }], {
      temperature: await window.getAITemperaturePreset('insPost')
    })
    var items = ensureIGGeneratedPostItems(parseIGGeneratedPosts(raw), context)
    if (!items.length) throw new Error('AI 未返回可用帖子')

    loading.setStatus('正在整理图片...')
    var posts = []
    for (var i = 0; i < items.length; i++) {
      posts.push(await normalizeIGGeneratedPost(items[i], context, i))
    }
    await saveIGGeneratedFeedPosts(user, posts.concat(loadIGGeneratedFeedPosts(user)).slice(0, 60))
    renderIGGeneratedFeed(page, user)
    loading.close()
    window.toast && window.toast('帖子已生成')
  } catch (e) {
    loading.close()
    console.error('生成 Instagram Feed 帖子失败：', e)
    window.toast && window.toast('生成失败：' + (e.message || '请检查 API 设置'))
  } finally {
    page.dataset.igGenerating = '0'
  }
}

function showIGGeneratingModal() {
  var modal = openIGCenterModal(
    '<div class="sheet-title">生成帖子</div>' +
    '<div class="ig-generate-loading">' +
      '<i class="fa fa-spinner fa-spin"></i>' +
      '<span id="ig-generate-status">准备生成...</span>' +
    '</div>'
  )
  return {
    setStatus: function(text) {
      var el = modal.sheet.querySelector('#ig-generate-status')
      if (el) el.textContent = text
    },
    close: modal.close
  }
}

async function buildIGFeedPromptContext(user) {
  var settings = await loadIGForumSettings()
  var memberIds = settings.members || []
  var chars = memberIds.length && window.db && db.characters
    ? (await db.characters.bulkGet(memberIds)).filter(Boolean)
    : []
  chars = chars.slice(0, 10)
  var topics = settings.topics || []
  var postPlan = buildIGFeedPostPlan(chars, topics)
  var chatContextMap = await buildIGFeedRecentChatContextMap(user, chars)
  var ownerUid = user && user.id ? parseInt(user.id) : null
  var bilingualMap = await buildIGBilingualMap(ownerUid, chars)
  var loreCtx = ''
  if (window.getLorebookContext) {
    try {
      loreCtx = await window.getLorebookContext(chars[0] && chars[0].id, [])
    } catch (e) {
      loreCtx = ''
    }
  }
  return {
    user: user,
    characters: chars,
    topics: topics,
    postPlan: postPlan,
    chatContextMap: chatContextMap,
    bilingualMap: bilingualMap,
    loreCtx: String(loreCtx || '').trim()
  }
}

function buildIGFeedGenerationPrompt(context) {
  var hasWorldSetting = !!context.loreCtx
  var baseRule = buildIGFeedBaseRule(context, hasWorldSetting)
  var charContext = buildIGFeedCharContext(context.characters, context.user, context.bilingualMap)
  var chatContext = buildIGFeedRecentChatPrompt(context.characters, context.chatContextMap)
  var postPlanRule = buildIGFeedPostPlanRule(context)
  var topicsRule = buildIGFeedTopicsRule(context.topics)

  return '你正在为一个 Instagram 风格的社交平台生成精致生活动态。\n\n' +
    baseRule + '\n\n' +
    '【平台调性】这是 Instagram——精致、美学、视觉优先的平台。\n' +
    '- 文案要求：简短精炼（1-3句），可用 emoji 点缀，避免长篇大论\n' +
    (hasWorldSetting ? '' : '- 图片风格：精修感、滤镜感、构图讲究\n- 内容类型：美食探店、穿搭OOTD、旅行风景、健身打卡、宠物日常、情侣日常、工作花絮\n- 语气：轻松自然但有品味，不要太接地气也不要太文艺\n') +
    '\n以下是参与发帖的角色（你必须仔细阅读每个角色的完整设定，确保角色帖子内容、语气、行为方式与角色人设一致）：\n' +
    charContext + '\n\n' +
    chatContext +
    postPlanRule +
    topicsRule +
    '\n【情感关联要求】\n' +
    '角色的帖子可以选择：\n' +
    '- 自然地与用户产生关联——可以是给用户看的暗示、跟用户约会后的分享、想念用户时的日常记录。切入点必须自然，不要强行cue。\n' +
    '- 自我分享生活，展示角色日常的一面。\n\n' +
    '请严格按上方发帖槽位生成 10 条帖子，输出纯 JSON 数组：\n' +
    '[\n' +
    '  {\n' +
    '    "author": "发帖人昵称",\n' +
    '    "authorId": 角色ID（角色帖为数字，路人帖为 null）,\n' +
    '    "time": "3h / 1d / May 28",\n' +
    '    "content": "文案正文（简短精炼，可带emoji）",\n' +
    '    "translation": "外语翻译，中文留空",\n' +
    '    "hashtags": ["OOTD", "dailylife"],\n' +
    '    "imageKeywords": ["aesthetic coffee shop interior warm light"],\n' +
    '    "imageDescs": ["暖色调咖啡店内部，木质桌面上一杯拉花拿铁，窗外是午后阳光"],\n' +
    '    "location": "Shanghai, China",\n' +
    '    "likes": 2847,\n' +
    '    "comments": 56\n' +
    '  }\n' +
    ']'
}

function buildIGFeedBaseRule(context, hasWorldSetting) {
  var user = context.user || {}
  var userName = getIGUserName(user)
  var lines = [
    '【基础规则】',
    hasWorldSetting ? '世界观设定：\n' + context.loreCtx : '世界观设定：以现实生活逻辑为准。',
    '语言规则：如果角色人设没有明确要求使用外语，正文优先使用中文；如果正文使用外语，translation 字段填写中文翻译；中文正文的 translation 必须为空字符串。例外：若某角色块内标注了【双语强制要求】，该角色必须遵循其指定语言 + 中文翻译，优先级高于本条默认规则。',
    '隔离规则：只基于下方参与角色、用户信息、世界观和热门话题生成，不要引用未提供的角色或聊天记录。',
    '字数限制：每条 content 控制在 1-3 句，避免长段落。',
    '授权规则：这是用户主动触发的虚构社交平台内容生成，只输出帖子 JSON，不要输出解释、免责声明或 Markdown。',
    '当前登录用户：' + userName + (user.description ? '；用户设定：' + user.description : '')
  ]
  return lines.join('\n')
}

function buildIGFeedCharContext(chars, user, bilingualMap) {
  if (!Array.isArray(chars) || !chars.length) {
    return '（未选择参与角色。本次 10 条帖子全部由随机 Instagram 路人用户发布，authorId 必须为 null。）'
  }
  return chars.map(function(c) {
    var rel = getIGRelationText(c, user && user.id)
    return [
      '---',
      '角色ID：' + c.id,
      '昵称：' + (c.nick || c.name || '未命名'),
      '姓名：' + (c.name || ''),
      '类型：' + (c.type || ''),
      '性别：' + (c.gender || ''),
      '身份/职业：' + (c.role || ''),
      '与用户关系：' + rel,
      'description / 人设：\n' + (c.description || '(未设定)'),
      'systemPrompt：\n' + (c.systemPrompt || c.prompt || '(未设定)'),
      '其他完整字段：\n' + JSON.stringify(c),
      buildIGBilingualNote(bilingualMap && bilingualMap[c.id])
    ].filter(Boolean).join('\n')
  }).join('\n')
}

function buildIGFeedRecentChatPrompt(chars, chatContextMap) {
  if (!Array.isArray(chars) || !chars.length) return ''
  var blocks = chars.map(function(c) {
    return chatContextMap && chatContextMap[c.id] ? chatContextMap[c.id] : ''
  }).filter(Boolean)
  return blocks.length ? blocks.join('\n\n') + '\n\n' : ''
}

function buildIGFeedPostPlan(chars, topics) {
  var slots = []
  var selectedChars = Array.isArray(chars) ? chars.slice(0, 10) : []
  selectedChars.forEach(function(c) {
    slots.push({
      kind: 'character',
      authorId: parseInt(c.id),
      authorName: c.nick || c.name || '角色'
    })
  })
  while (slots.length < 10) {
    slots.push({ kind: 'bystander', authorId: null, authorName: '随机 Instagram 路人用户' })
  }
  slots = shuffleIGArray(slots).slice(0, 10)

  var cleanTopics = Array.isArray(topics) ? topics.map(function(t) {
    return String(t || '').trim().replace(/^#/, '')
  }).filter(Boolean) : []
  if (cleanTopics.length) {
    var topicCount = Math.min(slots.length, 1 + Math.floor(Math.random() * 2))
    var topicIndexes = shuffleIGArray(slots.map(function(_, i) { return i })).slice(0, topicCount)
    topicIndexes.forEach(function(index, i) {
      slots[index].topic = cleanTopics[i % cleanTopics.length]
    })
  }
  return slots
}

function buildIGFeedPostPlanRule(context) {
  var slots = Array.isArray(context.postPlan) ? context.postPlan : []
  var lines = [
    '【发帖数量与作者槽位】',
    '必须生成且只生成 10 条帖子，并严格按下列 10 个槽位顺序输出。',
    '角色槽位：每个被选择角色只生成 1 条，authorId 必须填写对应数字 ID。',
    '路人槽位：使用随机 Instagram 用户昵称和生活内容，authorId 必须为 null。',
    '不要额外增加任何角色帖；不要把路人帖的 authorId 写成 0、空字符串或随机数字。'
  ]
  slots.forEach(function(slot, index) {
    var topic = slot.topic ? '；必须围绕热门话题 #' + slot.topic + '，hashtags 必须包含 "' + slot.topic + '"' : ''
    if (slot.kind === 'character') {
      lines.push((index + 1) + '. 角色帖：authorId=' + slot.authorId + '，作者=' + slot.authorName + topic)
    } else {
      lines.push((index + 1) + '. 路人帖：authorId=null，作者=随机 Instagram 用户' + topic)
    }
  })
  return lines.join('\n') + '\n\n'
}

function buildIGFeedTopicsRule(topics) {
  if (!Array.isArray(topics) || !topics.length) return ''
  return '【热门话题】当前平台的热门话题如下：\n' +
    topics.map(function(t) { return '- #' + t }).join('\n') +
    '\n\n要求：\n' +
    '- 10 条帖子中必须有 1-2 条帖子的内容围绕上述热门话题展开\n' +
    '- 这 1-2 条帖子的 hashtags 中必须包含对应的热门话题标签\n' +
    '- 其余帖子正常生成，不强制包含热门话题\n\n'
}

async function buildIGFeedRecentChatContextMap(user, chars) {
  var map = {}
  if (!window.db || !db.chats || !db.messages || !Array.isArray(chars) || !chars.length) return map
  var ownerUid = user && user.id ? parseInt(user.id) : null
  if (!Number.isFinite(ownerUid)) return map
  for (var i = 0; i < chars.length; i++) {
    var c = chars[i]
    var block = await buildIGFeedRecentChatContextForChar(ownerUid, user, c)
    if (block) map[c.id] = block
  }
  return map
}

async function findIGCharChat(ownerUid, charId) {
  try {
    return await db.chats.where('[ownerUid+charId]').equals([ownerUid, charId]).first()
  } catch (e) {
    var rows = await db.chats.where('charId').equals(charId).toArray()
    return rows.find(function(row) { return parseInt(row.ownerUid) === ownerUid })
  }
}

// charId -> 微信双语设置（只收录 enabled 的角色）
async function buildIGBilingualMap(ownerUid, chars) {
  var map = {}
  if (typeof getChatBilingualSettings !== 'function' || !window.db || !db.chats ||
      !Number.isFinite(ownerUid) || !Array.isArray(chars)) return map
  for (var i = 0; i < chars.length; i++) {
    var chat = await findIGCharChat(ownerUid, chars[i].id)
    if (!chat) continue
    var cfg = await getChatBilingualSettings(chat.id)
    if (cfg && cfg.enabled) map[chars[i].id] = cfg
  }
  return map
}

// 注入到单个角色块的强制双语说明（正文用设置语言，翻译固定中文）
function buildIGBilingualNote(cfg) {
  if (!cfg || !cfg.enabled || typeof getChatBilingualLangLabel !== 'function') return ''
  var srcLabel = getChatBilingualLangLabel(cfg.sourceLang)
  return '【双语强制要求·最高优先级】该角色已开启双语模式：本条 content 必须使用' + srcLabel +
    '撰写（禁止使用中文或其他外语），translation 字段必须填写对应的中文翻译、不得留空。'
}

async function buildIGFeedRecentChatContextForChar(ownerUid, user, char, limit) {
  var chat = await findIGCharChat(ownerUid, char.id)
  if (!chat) return ''
  var rows = []
  try {
    var online = await db.messages.where('chatId').equals(chat.id).sortBy('createdAt')
    online.forEach(function(m) {
      var normalized = normalizeIGChatMessageForPrompt(m, user, char, 'wechat')
      if (normalized) rows.push(normalized)
    })
  } catch (e2) {}
  if (db.offlineChats) {
    try {
      var offline = await db.offlineChats.where('charId').equals(char.id).toArray()
      offline
        .filter(function(m) { return parseInt(m.ownerUid) === ownerUid && parseInt(m.chatId) === parseInt(chat.id) })
        .forEach(function(m) {
          var normalized = normalizeIGChatMessageForPrompt(m, user, char, 'miss-you')
          if (normalized) rows.push(normalized)
        })
    } catch (e3) {}
  }
  rows = rows
    .filter(function(row) { return row.content })
    .sort(function(a, b) { return (a.createdAt || 0) - (b.createdAt || 0) })
    .slice(-(limit || 30))
  if (!rows.length) return ''
  var charName = char.nick || char.name || '角色'
  return '【' + charName + ' 的近期聊天记录】\n' + rows.map(function(row) {
    return '[' + formatIGPromptTime(row.createdAt) + '] ' + row.sender + ': ' + row.content
  }).join('\n')
}

function normalizeIGChatMessageForPrompt(msg, user, char, source) {
  if (!msg) return null
  if (msg.type === 'image') return null
  var content = String(msg.content || '').trim()
  if (!content) return null
  var parsed = typeof parseMsgType === 'function' ? parseMsgType(content, '') : null
  if (parsed && (parsed.type === 'real-photo' || parsed.type === 'image')) return null
  if (/^__IMG__/.test(content)) return null
  var sender = msg.role === 'user'
    ? getIGUserName(user)
    : (char.nick || char.name || '角色')
  var clean = source === 'miss-you' ? stripIGMissYouStatus(content) : content
  clean = clean.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return {
    createdAt: msg.createdAt || 0,
    sender: sender,
    content: clean.slice(0, 500)
  }
}

function stripIGMissYouStatus(content) {
  return String(content || '').replace(/<status>[\s\S]*?<\/status>/i, '').trim()
}

function formatIGPromptTime(ts) {
  var date = new Date(ts || Date.now())
  if (Number.isNaN(date.getTime())) date = new Date()
  var pad = function(n) { return String(n).padStart(2, '0') }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function shuffleIGArray(arr) {
  var copy = Array.isArray(arr) ? arr.slice() : []
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function getIGRelationText(char, userId) {
  var rels = char && Array.isArray(char.relations) ? char.relations : []
  var rel = rels.find(function(r) { return String(r.charId) === String(userId) })
  if (!rel) return '(未设定)'
  return (rel.type || '关系') + (rel.desc ? '（' + rel.desc + '）' : '')
}

function parseIGGeneratedPosts(raw) {
  var parsed = null
  if (Array.isArray(raw)) parsed = raw
  if (!parsed && typeof raw === 'string') {
    var text = raw.trim()
    try { parsed = JSON.parse(text) } catch (e) {}
    if (!parsed) {
      var fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
      if (fenced) {
        try { parsed = JSON.parse((fenced[1] || '').trim()) } catch (e2) {}
      }
    }
    if (!parsed) {
      var start = text.indexOf('[')
      var end = text.lastIndexOf(']')
      if (start !== -1 && end > start) {
        try { parsed = JSON.parse(text.slice(start, end + 1)) } catch (e3) {}
      }
    }
  }
  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.posts)) parsed = parsed.posts
  return Array.isArray(parsed) ? parsed.slice(0, 10) : []
}

function ensureIGGeneratedPostItems(items, context) {
  var list = Array.isArray(items) ? items.slice(0, 10) : []
  var slots = Array.isArray(context.postPlan) ? context.postPlan : []
  while (list.length < 10) list.push({})
  return list.slice(0, 10).map(function(item, index) {
    var slot = slots[index] || { kind: 'bystander', authorId: null }
    var next = Object.assign({}, item || {})
    next.authorId = slot.kind === 'character' ? slot.authorId : null
    if (slot.kind === 'character') {
      var char = context.characters.find(function(c) { return parseInt(c.id) === parseInt(slot.authorId) })
      if (char) next.author = char.nick || char.name || next.author
    } else if (!String(next.author || '').trim()) {
      next.author = buildIGRandomBystanderUsername(index)
    }
    if (slot.topic) {
      var tags = Array.isArray(next.hashtags) ? next.hashtags.slice() : []
      var exists = tags.some(function(tag) {
        return String(tag || '').replace(/^#/, '').toLowerCase() === String(slot.topic).toLowerCase()
      })
      if (!exists) tags.unshift(slot.topic)
      next.hashtags = tags
      if (!String(next.content || '').trim()) next.content = '最近大家都在聊 #' + slot.topic + '，我也想记录一下今天。'
    }
    if (!String(next.content || '').trim()) next.content = slot.kind === 'character' ? '今天也想发一张生活切片。' : 'tiny moments lately.'
    return next
  })
}

function buildIGRandomBystanderUsername(index) {
  var prefixes = ['mika', 'nora', 'luna', 'kai', 'yuki', 'lily', 'noah', 'sora', 'ami', 'ren']
  var suffixes = ['daily', 'film', 'room', 'studio', 'log', 'diary', 'gram', 'vibes', 'notes', 'days']
  return prefixes[index % prefixes.length] + '_' + suffixes[Math.floor(Math.random() * suffixes.length)] + Math.floor(10 + Math.random() * 90)
}

async function normalizeIGGeneratedPost(item, context, index) {
  var hasAuthorId = item.authorId !== null && item.authorId !== undefined && item.authorId !== ''
  var authorId = hasAuthorId ? parseInt(item.authorId) : null
  var author = Number.isFinite(authorId)
    ? (context.characters.find(function(c) { return parseInt(c.id) === authorId }) || {})
    : {}
  var content = String(item.content || '').trim()
  var translation = String(item.translation || '').trim()
  var hashtags = Array.isArray(item.hashtags) ? item.hashtags : []
  var caption = [content, translation ? '「' + translation + '」' : '', hashtags.map(function(tag) {
    return '#' + String(tag).replace(/^#/, '').trim()
  }).filter(function(tag) { return tag.length > 1 }).join(' ')].filter(Boolean).join('\n')
  var imageDescs = Array.isArray(item.imageDescs) ? item.imageDescs : []
  var imageKeywords = Array.isArray(item.imageKeywords) ? item.imageKeywords : []
  var imageText = imageDescs[0] || imageKeywords[0] || content
  var image = await generateIGPostImage(imageText, index)
  return {
    avatar: author.avatar || '',
    username: item.author || author.nick || author.name || 'Instagram user',
    location: item.location || '',
    image: image,
    imageText: imageText,
    caption: caption,
    likedBy: '',
    likes: normalizeIGMetric(item.likes, 100 + Math.floor(Math.random() * 900)),
    comments: normalizeIGMetric(item.comments, 5 + Math.floor(Math.random() * 60)),
    reposts: Math.floor(Math.random() * 12),
    time: item.time || 'now',
    authorId: Number.isFinite(authorId) ? authorId : null,
    generatedAt: Date.now()
  }
}

async function generateIGPostImage(prompt, index) {
  if (window.generateImage) {
    try {
      return await window.generateImage('Instagram feed photo, refined aesthetic, high quality, square composition. ' + prompt, { size: '1024x1024' })
    } catch (e) {
      console.warn('Instagram 图片生成失败，使用占位图：', e)
    }
  }
  var fallbacks = ['img/blank_img1.jpg', 'img/blank_img2.jpg', 'img/blank_img3.jpg', 'img/blank_img4.jpg', 'img/blank_img5.jpg', 'img/blank_img6.jpg']
  return fallbacks[index % fallbacks.length]
}

function normalizeIGMetric(value, fallback) {
  var num = parseInt(String(value == null ? '' : value).replace(/[^\d]/g, ''))
  return Number.isFinite(num) ? num : fallback
}

function getIGGeneratedFeedKey(user) {
  return IG_GENERATED_FEED_PREFIX + (user && user.id ? user.id : 'default')
}

function getIGHiddenPostsKey(user) {
  return IG_HIDDEN_POSTS_PREFIX + (user && user.id ? user.id : 'default')
}

function getIGHiddenPostIds(user) {
  try {
    var raw = localStorage.getItem(getIGHiddenPostsKey(user))
    var parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(function(id) { return String(id) }) : []
  } catch (e) {
    return []
  }
}

function saveIGHiddenPostIds(user, ids) {
  try {
    var safeIds = Array.isArray(ids) ? ids.map(function(id) { return String(id) }).filter(Boolean) : []
    localStorage.setItem(getIGHiddenPostsKey(user), JSON.stringify(safeIds))
  } catch (e) {}
}

function getIGGeneratedPostId(post, index) {
  if (post && post.id) return String(post.id)
  var created = post && (post.createdAt || post.generatedAt) ? String(post.createdAt || post.generatedAt) : ''
  var basis = [
    created,
    post && post.authorId != null ? post.authorId : '',
    post && post.username ? post.username : '',
    post && post.image ? post.image : '',
    post && post.caption ? post.caption : '',
    index
  ].join('|')
  return 'generated-' + hashIGString(basis)
}

function ensureIGGeneratedPostsHaveStableIds(posts) {
  var changed = false
  var list = (Array.isArray(posts) ? posts : []).map(function(post, index) {
    var copy = Object.assign({}, post || {})
    if (!copy.id) {
      copy.id = getIGGeneratedPostId(copy, index)
      changed = true
    }
    return copy
  })
  return { posts: list, changed: changed }
}

function hashIGString(value) {
  var hash = 0
  var str = String(value || '')
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function loadIGGeneratedFeedPosts(user) {
  var key = getIGGeneratedFeedKey(user)
  if (Array.isArray(igGeneratedFeedMemory[key])) return igGeneratedFeedMemory[key]
  try {
    var raw = localStorage.getItem(key)
    var parsed = raw ? JSON.parse(raw) : []
    var normalized = ensureIGGeneratedPostsHaveStableIds(Array.isArray(parsed) ? parsed : [])
    igGeneratedFeedMemory[key] = normalized.posts
    if (normalized.changed) {
      try { localStorage.setItem(key, JSON.stringify(normalized.posts)) } catch (e2) {}
    }
    return normalized.posts
  } catch (e) {
    return []
  }
}

function getIGProfilePosts(user) {
  var posts = loadIGGeneratedFeedPosts(user)
  return posts.map(function(post, index) {
    return {
      post: post,
      postId: getIGGeneratedPostId(post, index),
      index: index
    }
  }).filter(function(item) {
    var post = item.post || {}
    return post.authorId != null && post.authorId !== '' && user && String(post.authorId) === String(user.id)
  })
}

function parseIGProfileThumbImages(raw) {
  try {
    var parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map(normalizeIGPostImageItem).filter(function(item) { return item.src }) : []
  } catch (e) {
    return []
  }
}

async function hydrateIGGeneratedFeedPosts(user) {
  if (!window.db || !db.config) return loadIGGeneratedFeedPosts(user)
  var posts = loadIGGeneratedFeedPosts(user)
  var changed = false
  for (var i = 0; i < posts.length; i++) {
    var hydrated = await hydrateIGPostImages(posts[i])
    if (hydrated !== posts[i]) {
      posts[i] = hydrated
      changed = true
    }
  }
  if (changed) {
    igGeneratedFeedMemory[getIGGeneratedFeedKey(user)] = posts
  }
  return posts
}

async function hydrateIGPostImages(post) {
  if (!post || typeof post !== 'object') return post
  var changed = false
  var copy = Object.assign({}, post)
  if (isIGImageRef(copy.image)) {
    var src = await loadIGStoredImage(copy.image)
    if (src) {
      copy.image = src
      changed = true
    }
  }
  if (Array.isArray(copy.images)) {
    var images = []
    for (var i = 0; i < copy.images.length; i++) {
      var item = normalizeIGPostImageItem(copy.images[i])
      if (isIGImageRef(item.src)) {
        var imageSrc = await loadIGStoredImage(item.src)
        if (imageSrc) {
          item.src = imageSrc
          changed = true
        }
      }
      images.push(item)
    }
    copy.images = images
  }
  return changed ? copy : post
}

function persistIGPostImage(src, ref) {
  if (!src || !ref || !window.db || !db.config) return Promise.resolve()
  return db.config.put({
    key: getIGImageStoreKey(ref),
    value: src
  }).catch(function(e) {
    console.warn('保存 Instagram 图片失败：', e)
  })
}

async function loadIGStoredImage(ref) {
  if (!isIGImageRef(ref) || !window.db || !db.config) return ''
  try {
    var row = await db.config.get(getIGImageStoreKey(ref))
    return row && row.value ? String(row.value) : ''
  } catch (e) {
    return ''
  }
}

function getIGImageStoreKey(ref) {
  return IG_IMAGE_STORE_PREFIX + String(ref || '').replace(IG_IMAGE_REF_PREFIX, '')
}

function getIGImageRef(user, postId, imageIndex) {
  return IG_IMAGE_REF_PREFIX + [
    user && user.id ? user.id : 'default',
    postId || 'post',
    imageIndex
  ].map(function(part) {
    return encodeURIComponent(String(part))
  }).join('_')
}

function isIGImageRef(src) {
  return String(src || '').indexOf(IG_IMAGE_REF_PREFIX) === 0
}

function shouldStoreIGImageExternally(src) {
  src = String(src || '')
  return /^data:image\//i.test(src) && src.length > 100000
}

async function saveIGGeneratedFeedPosts(user, posts) {
  var key = getIGGeneratedFeedKey(user)
  var stable = ensureIGGeneratedPostsHaveStableIds(posts)
  var safePosts = stable.posts
  igGeneratedFeedMemory[key] = safePosts
  var imageWrites = []
  try {
    var persisted = safePosts.map(function(post, index) {
      var copy = Object.assign({}, post)
      var postId = getIGGeneratedPostId(copy, index)
      if (shouldStoreIGImageExternally(copy.image)) {
        var imageRef = getIGImageRef(user, postId, 'main')
        imageWrites.push(persistIGPostImage(copy.image, imageRef))
        copy.image = imageRef
      }
      if (Array.isArray(copy.images)) {
        copy.images = copy.images.map(function(image, imageIndex) {
          var item = normalizeIGPostImageItem(image)
          if (shouldStoreIGImageExternally(item.src)) {
            var ref = getIGImageRef(user, postId, imageIndex)
            imageWrites.push(persistIGPostImage(item.src, ref))
            item.src = ref
          }
          return item
        }).filter(function(item) { return item.src }).slice(0, 9)
      }
      return copy
    })
    if (imageWrites.length) await Promise.all(imageWrites)
    localStorage.setItem(key, JSON.stringify(persisted))
  } catch (e) {}
}

function renderIGGeneratedFeed(page, user) {
  if (page.dataset.igView === 'profile-posts') {
    var postsMain = page.querySelector('.ig-profile-posts-main')
    if (!postsMain) return
    postsMain.innerHTML = buildIGProfilePostsFeedHTML(user)
    bindIGContentEvents(page)
    return
  }

  var main = page.querySelector('.ig-main')
  if (!main) return
  var activeItem = page.querySelector('.ig-bottombar-item.active')
  var tab = activeItem ? activeItem.dataset.tab : 'home'
  if (tab === 'profile') {
    var profile = getIGProfileSync(user)
    main.innerHTML = buildIGProfileHTML(user, profile)
    renderIGProfileTopbar(page, user, profile)
  } else {
    main.innerHTML = buildIGHomeHTML(user)
    renderIGHomeTopbar(page)
  }
  bindIGContentEvents(page)
}

function findIGPostById(user, postId) {
  if (String(postId) === IG_INITIAL_POST_ID) return getIGInitialPost()
  var posts = loadIGGeneratedFeedPosts(user)
  for (var i = 0; i < posts.length; i++) {
    if (getIGGeneratedPostId(posts[i], i) === String(postId)) {
      return Object.assign({ _generatedIndex: i }, posts[i])
    }
  }
  return null
}

function updateIGGeneratedPostById(user, postId, patch) {
  var posts = loadIGGeneratedFeedPosts(user)
  var changed = false
  var next = posts.map(function(post, index) {
    if (getIGGeneratedPostId(post, index) !== String(postId)) return post
    changed = true
    return Object.assign({}, post, patch || {})
  })
  if (changed) saveIGGeneratedFeedPosts(user, next)
  return changed
}

async function requestIGPostCommentGeneration(page, postId) {
  if (!page || !postId) return
  var user = page._igUser || await getIGSessionUser()
  var existing = await getIGExistingCommentsForPost(user, postId)
  if (existing.length) {
    showIGCommentRegenerateChoice(page, postId, existing)
    return
  }
  generateIGPostComments(page, postId, { mode: 'replace' })
}

function showIGCommentRegenerateChoice(page, postId, existingComments) {
  var modal = openIGCenterModal(
    '<div class="sheet-title">生成评论</div>' +
    '<div class="ig-generate-confirm-text">这条帖子已经有评论。你可以继续生成新评论，或删除当前评论后重新生成。</div>' +
    '<div class="sheet-actions ig-generate-actions ig-comment-choice-actions">' +
      '<button class="btn-pill ig-generate-cancel" id="ig-comment-choice-cancel" type="button">取消</button>' +
      '<button class="btn-pill ig-generate-confirm" id="ig-comment-choice-continue" type="button">继续生成</button>' +
      '<button class="btn-pill btn-full ig-generate-confirm" id="ig-comment-choice-replace" type="button">删除并重新生成</button>' +
    '</div>'
  )
  modal.sheet.querySelector('#ig-comment-choice-cancel').addEventListener('click', modal.close)
  modal.sheet.querySelector('#ig-comment-choice-continue').addEventListener('click', function() {
    modal.close()
    generateIGPostComments(page, postId, { mode: 'append', existingComments: existingComments || [] })
  })
  modal.sheet.querySelector('#ig-comment-choice-replace').addEventListener('click', function() {
    modal.close()
    generateIGPostComments(page, postId, { mode: 'replace' })
  })
}

async function generateIGPostComments(page, postId, options) {
  options = options || {}
  if (!page || !postId || page.dataset.igCommentGenerating === '1') return
  if (!window.callAI) {
    window.toast && window.toast('请先配置 API')
    return
  }
  var user = page._igUser || await getIGSessionUser()
  var post = findIGPostById(user, postId)
  post = await hydrateIGPostImages(post)
  if (!user || !post) {
    window.toast && window.toast('找不到帖子')
    return
  }

  var loading = showIGCommentGeneratingModal()
  page.dataset.igCommentGenerating = '1'
  try {
    loading.setStatus('正在整理评论上下文...')
    var context = await buildIGCommentPromptContext(user, post)
    var existingComments = Array.isArray(options.existingComments) ? options.existingComments : []
    if (options.mode === 'append' && !existingComments.length) {
      existingComments = await getIGExistingCommentsForPost(user, postId)
    }
    if (options.mode === 'append' && existingComments.length) {
      context.existingComments = existingComments
      context.isContinuingComments = true
    }
    loading.setStatus('AI 正在生成评论...')
    var raw = await window.callAI([buildIGCommentGenerationMessage(context)], {
      temperature: await window.getAITemperaturePreset('insComment')
    })
    var parsed = parseIGGeneratedComments(raw)
    var finalTotal = context.isUserPost ? getIGParsedCommentTargetCount(parsed) : context.totalCount
    var itemContext = Object.assign({}, context, {
      totalCount: finalTotal,
      characters: context.characters.slice(0, finalTotal)
    })
    var items = context.isUserPost ? trimIGUserPostComments(parsed, itemContext) : parsed.items
    items = ensureIGGeneratedCommentItems(items, itemContext)
    var comments = options.mode === 'append' && existingComments.length
      ? mergeIGGeneratedComments(existingComments, items, itemContext)
      : assembleIGCommentThreads(items, itemContext)
    var likedBy = pickIGLikedByName(post, user, comments, context.friends)

    await saveIGPostComments(user, postId, {
      generatedAt: Date.now(),
      comments: comments
    })

    var postPatch = { likedBy: likedBy || post.likedBy || '' }
    if (context.isUserPost) {
      postPatch.likes = normalizeIGMetric(parsed.likes, 20 + Math.floor(Math.random() * 120))
      postPatch.comments = countIGCommentTreeItems(comments)
    }
    updateIGGeneratedPostById(user, postId, postPatch)

    loading.close()
    renderIGGeneratedFeed(page, user)
    await showIGCommentsSheet(page, postId)
    window.toast && window.toast(options.mode === 'append' ? '评论已继续生成' : '评论已生成')
  } catch (e) {
    loading.close()
    console.error('生成 Instagram 评论失败：', e)
    window.toast && window.toast('生成失败：' + (e.message || '请检查 API 设置'))
  } finally {
    page.dataset.igCommentGenerating = '0'
  }
}

async function getIGExistingCommentsForPost(user, postId) {
  var stored = await loadIGPostComments(user || {}, postId)
  var comments = stored && Array.isArray(stored.comments) ? stored.comments : []
  if (!comments.length && String(postId) === IG_INITIAL_POST_ID) comments = igCommentsData
  return cloneIGComments(comments)
}

function cloneIGComments(comments) {
  try {
    return JSON.parse(JSON.stringify(Array.isArray(comments) ? comments : []))
  } catch (e) {
    return []
  }
}

function showIGCommentGeneratingModal() {
  var modal = openIGCenterModal(
    '<div class="sheet-title">生成评论</div>' +
    '<div class="ig-generate-loading">' +
      '<i class="fa fa-spinner fa-spin"></i>' +
      '<span id="ig-comment-generate-status">准备生成...</span>' +
    '</div>'
  )
  return {
    setStatus: function(text) {
      var el = modal.sheet.querySelector('#ig-comment-generate-status')
      if (el) el.textContent = text
    },
    close: modal.close
  }
}

function getIGCommentGenerateCount(post, user) {
  var isUserPost = post && post.authorId !== null && post.authorId !== undefined && parseInt(post.authorId) === parseInt(user && user.id)
  if (isUserPost) return 20
  var count = parseInt(post && post.comments) || 0
  if (count <= 0) return 10
  return Math.min(count, 20)
}

async function getIGFriendsForComments(user) {
  if (!window.db || !db.characters) return []
  var ids = []
  try {
    if (typeof getFriendIds === 'function') {
      ids = await getFriendIds(user.id)
    } else if (db.config) {
      var row = await db.config.get('friends_' + user.id)
      ids = row && Array.isArray(row.value) ? row.value : []
    }
  } catch (e) {
    ids = []
  }
  ids = ids.map(function(id) { return parseInt(id) }).filter(Number.isFinite).filter(function(id) {
    return parseInt(id) !== parseInt(user.id)
  })
  if (!ids.length) return []
  try {
    return (await db.characters.bulkGet(ids)).filter(Boolean).filter(function(c) {
      return parseInt(c.id) !== parseInt(user.id)
    })
  } catch (e2) {
    return []
  }
}

// ===== DM 私信会话存储 =====
function getIGDMThreadKey(user, friendId) {
  return IG_DM_THREAD_PREFIX + (user && user.id ? user.id : 'default') + '_' + friendId
}

function loadIGDMThread(user, friendId) {
  try {
    var raw = localStorage.getItem(getIGDMThreadKey(user, friendId))
    var arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function saveIGDMThread(user, friendId, messages) {
  try {
    localStorage.setItem(getIGDMThreadKey(user, friendId), JSON.stringify(messages || []))
  } catch (e) {}
  if (window.db && db.config) {
    db.config.put({ key: getIGDMThreadKey(user, friendId), value: messages || [] })
  }
}

function getIGDMHandle(friend) {
  if (friend && friend.identity && friend.identity.account) {
    return String(friend.identity.account).replace(/^@+/, '')
  }
  var name = getIGUserName(friend)
  return String(name).toLowerCase().replace(/\s+/g, '_')
}

async function buildIGDMHTML(user) {
  var friends = await getIGFriendsForComments(user)

  // 拆分：有会话记录的（Messages）与无会话记录的（Accounts to message）
  var threaded = []
  var suggested = []
  friends.forEach(function(friend) {
    var msgs = loadIGDMThread(user, friend.id)
    if (msgs.length) {
      threaded.push({ friend: friend, last: msgs[msgs.length - 1], time: msgs[msgs.length - 1].time || 0 })
    } else {
      suggested.push(friend)
    }
  })
  threaded.sort(function(a, b) { return b.time - a.time })

  var searchHTML =
    '<div class="ig-dm-search-wrap">' +
      '<div class="ig-dm-search">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="22" y2="22"></line></svg>' +
        '<span>Search</span>' +
      '</div>' +
    '</div>'

  var selfItem =
    '<div class="ig-dm-rail-item is-self">' +
      '<div class="ig-dm-rail-avatar-shell">' +
        '<div class="ig-dm-rail-avatar">' + getIGProfileAvatarHTML(user) + '</div>' +
      '</div>' +
      '<div class="ig-dm-rail-name">Your note</div>' +
    '</div>'

  var railFriends = friends.map(function(friend) {
    var name = getIGUserName(friend)
    return '<div class="ig-dm-rail-item" data-ig-dm-friend="' + friend.id + '">' +
        '<div class="ig-dm-rail-avatar-shell">' +
          '<div class="ig-dm-rail-avatar">' + getIGAvatarHTML(friend, name) + '</div>' +
        '</div>' +
        '<div class="ig-dm-rail-name">' + igEscape(name) + '</div>' +
      '</div>'
  }).join('')

  var railHTML = '<div class="ig-dm-rail">' + selfItem + railFriends + '</div>'

  // Messages 板块（仅当有会话记录时显示，位于 Accounts to message 上方）
  var messagesHTML = ''
  if (threaded.length) {
    var threadRows = threaded.map(function(item) {
      var friend = item.friend
      var name = getIGUserName(friend)
      var preview = item.last && item.last.text ? item.last.text : ''
      return '<div class="ig-dm-row" data-ig-dm-friend="' + friend.id + '">' +
          '<div class="ig-dm-row-avatar">' + getIGAvatarHTML(friend, name) + '</div>' +
          '<div class="ig-dm-row-text">' +
            '<div class="ig-dm-row-name">' + igEscape(name) + '</div>' +
            (preview ? '<div class="ig-dm-row-sub">' + igEscape(preview) + '</div>' : '') +
          '</div>' +
        '</div>'
    }).join('')
    messagesHTML =
      '<div class="ig-dm-section">' +
        '<div class="ig-dm-section-title">Messages</div>' +
        '<div class="ig-dm-list">' + threadRows + '</div>' +
      '</div>'
  }

  // Accounts to message 板块
  var suggestRows = suggested.map(function(friend) {
    var name = getIGUserName(friend)
    return '<div class="ig-dm-row" data-ig-dm-friend="' + friend.id + '">' +
        '<div class="ig-dm-row-avatar">' + getIGAvatarHTML(friend, name) + '</div>' +
        '<div class="ig-dm-row-text">' +
          '<div class="ig-dm-row-name">' + igEscape(name) + '</div>' +
          '<div class="ig-dm-row-sub">Suggested</div>' +
        '</div>' +
      '</div>'
  }).join('')

  var suggestHTML = ''
  if (suggested.length) {
    suggestHTML =
      '<div class="ig-dm-section">' +
        '<div class="ig-dm-section-title">Accounts to message</div>' +
        '<div class="ig-dm-list">' + suggestRows + '</div>' +
      '</div>'
  } else if (!friends.length) {
    suggestHTML =
      '<div class="ig-dm-section">' +
        '<div class="ig-dm-section-title">Accounts to message</div>' +
        '<div class="ig-dm-list"><div class="ig-dm-empty">暂无好友</div></div>' +
      '</div>'
  }

  return '<div class="ig-dm-page">' + searchHTML + railHTML + messagesHTML + suggestHTML + '</div>'
}

function bindIGDMEvents(page, user) {
  var rows = page.querySelectorAll('[data-ig-dm-friend]')
  rows.forEach(function(row) {
    row.addEventListener('click', async function() {
      var fid = parseInt(row.dataset.igDmFriend)
      if (!Number.isFinite(fid)) return
      var friend = window.getCharacter ? await window.getCharacter(fid) : await db.characters.get(fid)
      if (friend) showIGDMThread(user, friend, page)
    })
  })
}

// ===== DM 会话详情页 =====
var IG_DM_SVGS = {
  back: '<i class="fa fa-angle-left"></i>',
  phone: '<i class="fa fa-phone"></i>',
  video: '<i class="fa fa-video"></i>',
  camera: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
  send: '<i class="fa-solid fa-paper-plane"></i>'
}

function renderIGDMThreadMessages(container, user, friend) {
  var msgs = loadIGDMThread(user, friend.id)
  var name = getIGUserName(friend)
  if (!msgs.length) {
    container.innerHTML = ''
    return
  }
  var html = ''
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i]
    var prevSame = i > 0 && msgs[i - 1].fromMe === m.fromMe
    var nextSame = i < msgs.length - 1 && msgs[i + 1].fromMe === m.fromMe
    // 同一发送者连续消息的分组位置：单条 / 首条 / 中间 / 末条
    var pos = !prevSame && !nextSame ? 'single' : (!prevSame ? 'first' : (nextSame ? 'middle' : 'last'))
    var rowCls = 'ig-dm-msg-row ' + (m.fromMe ? 'out' : 'in') + (prevSame ? '' : ' group-start')
    var bubble = '<div class="ig-dm-bubble ' + (m.fromMe ? 'out' : 'in') + ' pos-' + pos + '">' + igEscape(m.text) + '</div>'
    if (m.fromMe) {
      html += '<div class="' + rowCls + '">' + bubble + '</div>'
    } else {
      // 仅在该好友连续消息的最后一条显示头像
      var isLastOfGroup = !nextSame
      html += '<div class="' + rowCls + '">' +
          '<div class="ig-dm-msg-avatar">' + (isLastOfGroup ? getIGAvatarHTML(friend, name) : '') + '</div>' +
          bubble +
        '</div>'
    }
  }
  container.innerHTML = html
  container.scrollTop = container.scrollHeight
}

function showIGDMThread(user, friend, igPage) {
  var name = getIGUserName(friend)
  var handle = getIGDMHandle(friend)
  var existing = document.getElementById('ig-dm-thread-page')
  if (existing) existing.remove()

  var page = document.createElement('div')
  page.id = 'ig-dm-thread-page'
  page.className = 'full-page ig-dm-thread-page'

  page.innerHTML =
    '<div class="ig-dm-thread-header">' +
      '<button class="ig-dm-thread-back" type="button" aria-label="Back">' + IG_DM_SVGS.back + '</button>' +
      '<div class="ig-dm-thread-avatar">' + getIGAvatarHTML(friend, name) + '</div>' +
      '<div class="ig-dm-thread-id">' +
        '<div class="ig-dm-thread-name">' + igEscape(name) + '</div>' +
        '<div class="ig-dm-thread-handle">' + igEscape(handle) + '</div>' +
      '</div>' +
      '<div class="ig-dm-thread-actions">' +
        '<button class="ig-dm-thread-btn" type="button" aria-label="Audio call">' + IG_DM_SVGS.phone + '</button>' +
        '<button class="ig-dm-thread-btn" type="button" aria-label="Video call">' + IG_DM_SVGS.video + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="ig-dm-thread-messages" id="ig-dm-thread-messages"></div>' +
    '<div class="ig-dm-composer">' +
      '<div class="ig-dm-composer-bar">' +
        '<button class="ig-dm-composer-camera" type="button" aria-label="Magic">' + IG_DM_SVGS.camera + '</button>' +
        '<input class="ig-dm-composer-input" id="ig-dm-composer-input" placeholder="Message..." autocomplete="off">' +
        '<button class="ig-dm-composer-send" id="ig-dm-composer-send" type="button" aria-label="Send">' + IG_DM_SVGS.send + '</button>' +
      '</div>' +
    '</div>'

  if (window.openPage) {
    window.openPage(page)
  } else {
    var app = document.getElementById('app') || document.body
    app.appendChild(page)
  }

  var msgContainer = page.querySelector('#ig-dm-thread-messages')
  renderIGDMThreadMessages(msgContainer, user, friend)

  var input = page.querySelector('#ig-dm-composer-input')
  var sendBtn = page.querySelector('#ig-dm-composer-send')

  function sendMessage() {
    var text = input.value.trim()
    if (!text) return
    var msgs = loadIGDMThread(user, friend.id)
    msgs.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), fromMe: true, text: text, time: Date.now() })
    saveIGDMThread(user, friend.id, msgs)
    input.value = ''
    renderIGDMThreadMessages(msgContainer, user, friend)
    input.focus()
  }
  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage() }
  })

  page.querySelector('.ig-dm-thread-back').addEventListener('click', function() {
    if (window.closePage) window.closePage('ig-dm-thread-page')
    else page.remove()
    // 返回后刷新私信列表，使 Messages 板块出现
    if (igPage && document.body.contains(igPage)) {
      setIGActiveTab(igPage, user, 'dm')
    }
  })
}

async function pickIGCommentParticipants(user, post) {
  var totalCount = getIGCommentGenerateCount(post, user)
  var friends = await getIGFriendsForComments(user)
  var postAuthorId = post && post.authorId
  var isUserPost = postAuthorId !== null && postAuthorId !== undefined && parseInt(postAuthorId) === parseInt(user.id)
  var isCharPost = postAuthorId !== null && postAuthorId !== undefined && parseInt(postAuthorId) !== parseInt(user.id)
  var isBystanderPost = postAuthorId === null || postAuthorId === undefined
  var picked = []
  var relatedChars = []
  var relationMap = {}

  if (isBystanderPost) {
    var maxBystander = Math.floor(friends.length / 2)
    picked = shuffleIGArray(friends).slice(0, Math.floor(Math.random() * (maxBystander + 1)))
  } else {
    var min = Math.ceil(friends.length * 0.2)
    var max = Math.floor(friends.length * 0.8)
    var count = max >= min ? min + Math.floor(Math.random() * (max - min + 1)) : friends.length
    picked = shuffleIGArray(friends).slice(0, count)

    if (isCharPost && window.db && db.characters) {
      var postChar = null
      try { postChar = await db.characters.get(parseInt(postAuthorId)) } catch (e) {}
      var rels = postChar && Array.isArray(postChar.relations) ? postChar.relations : []
      var relationCharIds = rels.map(function(r) {
        return parseInt(r.charId)
      }).filter(Number.isFinite).filter(function(id) {
        return id !== parseInt(user.id)
      })
      rels.forEach(function(r) {
        relationMap[String(r.charId)] = (r.type || '关系') + (r.desc ? '（' + r.desc + '）' : '')
      })
      try {
        relatedChars = (await db.characters.bulkGet(relationCharIds)).filter(Boolean)
      } catch (e2) {
        relatedChars = []
      }
      if (relatedChars.length > 4) relatedChars = shuffleIGArray(relatedChars).slice(0, 4)
      var pickedIds = new Set(picked.map(function(c) { return parseInt(c.id) }))
      relatedChars.forEach(function(c) {
        if (!pickedIds.has(parseInt(c.id))) {
          picked.push(c)
          pickedIds.add(parseInt(c.id))
        }
      })
    }
  }

  if (picked.length > totalCount) {
    var relatedIds = new Set(relatedChars.map(function(c) { return parseInt(c.id) }))
    var priority = picked.filter(function(c) { return relatedIds.has(parseInt(c.id)) })
    var rest = picked.filter(function(c) { return !relatedIds.has(parseInt(c.id)) })
    picked = priority.concat(shuffleIGArray(rest)).slice(0, totalCount)
  }

  return {
    characters: picked,
    friends: friends,
    relatedChars: relatedChars,
    relationMap: relationMap,
    injectChat: !isBystanderPost,
    totalCount: totalCount,
    isUserPost: isUserPost,
    isCharPost: isCharPost,
    isBystanderPost: isBystanderPost
  }
}

async function buildIGCommentPromptContext(user, post) {
  var participants = await pickIGCommentParticipants(user, post)
  var ownerUid = user && user.id ? parseInt(user.id) : null
  var chatContextMap = await buildIGCommentChatContext(ownerUid, user, participants.characters, participants.injectChat)
  var bilingualMap = await buildIGBilingualMap(ownerUid, participants.characters)
  var loreCtx = ''
  if (window.getLorebookContext) {
    try {
      var loreCharId = participants.characters[0] && participants.characters[0].id
      loreCtx = await window.getLorebookContext(loreCharId || post.authorId || user.id, [])
    } catch (e) {
      loreCtx = ''
    }
  }
  return Object.assign({}, participants, {
    user: user,
    post: post,
    chatContextMap: chatContextMap,
    bilingualMap: bilingualMap,
    loreCtx: String(loreCtx || '').trim()
  })
}

async function buildIGCommentChatContext(ownerUid, user, chars, injectChat) {
  var map = {}
  if (!injectChat || !Number.isFinite(ownerUid) || !Array.isArray(chars)) return map
  for (var i = 0; i < chars.length; i++) {
    var block = await buildIGFeedRecentChatContextForChar(ownerUid, user, chars[i], 20)
    if (block) map[chars[i].id] = block
  }
  return map
}

function buildIGCommentGenerationPrompt(context) {
  var user = context.user || {}
  var post = context.post || {}
  var userName = getIGUserName(user)
  var totalCount = context.totalCount || 10
  var charCount = Math.min(context.characters.length, totalCount)
  var bystanderCount = Math.max(0, totalCount - charCount)
  var imagePromptParts = buildIGCommentImagePromptParts(post)
  var imageDescs = imagePromptParts.imageDescs
  var charSlots = context.characters.slice(0, charCount).map(function(c) {
    return (c.nick || c.name || '角色') + '(authorId=' + c.id + ')'
  }).join('、') || '无'
  var existingCommentRule = context.isContinuingComments
    ? '【现有评论，必须先阅读】\n' +
      buildIGExistingCommentsText(context.existingComments) + '\n' +
      '本次是在已有评论基础上继续生成。新评论可以是普通评论，也可以回复上方现有评论；如果回复现有评论，replyToAuthor 必须与现有评论用户名完全一致。\n\n'
    : ''
  var baseRule = [
    '【基础规则】',
    context.loreCtx ? '世界观设定：\n' + context.loreCtx : '世界观设定：以现实生活逻辑为准。',
    '语言规则：如果评论使用外语，translation 字段填写中文翻译；中文评论的 translation 必须为空字符串。例外：若某角色块内标注了【双语强制要求】，该角色必须遵循其指定语言 + 中文翻译，优先级高于本条默认规则。',
    '禁止规则：绝对不可以生成用户（' + userName + '）的评论，用户不是评论者。',
    '授权规则：这是用户主动触发的虚构社交平台内容生成，只输出评论 JSON，不要输出解释、免责声明或 Markdown。',
    '当前登录用户：' + userName + '（仅作为帖子发帖人/被评论对象的上下文，不参与评论）'
  ].join('\n')
  var charRule = buildIGCommentCharRule(context)
  var userPostRule = context.isUserPost
    ? '\n【同步生成帖子数据】\n这是用户自己发布的帖子，还没有点赞数和评论数。请在输出的 JSON 顶层额外提供 likes 和 comments 字段。\ncomments 的值决定最终保留的评论条数（角色评论全部保留，多余的路人评论会被裁剪）。\nlikes 应该是一个合理的数字。\n\n输出格式（注意根是对象，不是数组）：\n{\n  "likes": 128,\n  "comments": 15,\n  "items": [ ...评论数组... ]\n}\n'
    : '\n输出纯 JSON 数组。\n'

  return '你正在为 Instagram 帖子生成评论。\n\n' +
    baseRule + '\n\n' +
    '帖子信息：\n' +
    '发帖人：' + (post.username || post.author || 'Instagram user') + '（authorId: ' + (post.authorId == null ? 'null' : post.authorId) + '）\n' +
    '内容：' + (post.caption || post.content || '') + '\n' +
    '图片描述：' + (imageDescs.join('；') || '(无)') + '\n' +
    imagePromptParts.imageText +
    '位置：' + (post.location || '(无)') + '\n\n' +
    existingCommentRule +
    '【Instagram 评论风格】\n' +
    '- 以夸赞、羡慕、互动为主，语气自然，像真实社交平台评论。\n' +
    '- 角色评论必须结合角色人设和与用户/发帖人的关系，语气贴合角色个性。\n' +
    '- 可以有少量英文评论，但必须提供中文 translation。\n' +
    '- 评论之间可以有回复互动，replyToAuthor 和 replyToContent 不为空。\n' +
    '- 禁止生成用户（' + userName + '）的评论。\n\n' +
    charRule + '\n\n' +
    '【评论槽位】\n' +
    '必须生成 ' + totalCount + ' 条评论：\n' +
    '- 角色评论 ' + charCount + ' 条：' + charSlots + '\n' +
    '- 路人评论 ' + bystanderCount + ' 条：使用随机 Instagram 用户昵称，authorId 为 null\n' +
    '（charCount + bystanderCount = totalCount）\n' +
    userPostRule + '\n' +
    '评论对象格式（每条评论）：\n' +
    '{\n' +
    '  "author": "评论人昵称",\n' +
    '  "authorId": 角色ID（角色评论为数字，路人评论为 null）, \n' +
    '  "time": "2h",\n' +
    '  "content": "评论内容",\n' +
    '  "translation": "外语翻译，中文留空",\n' +
    '  "likes": 23,\n' +
    '  "replyToAuthor": "被回复人昵称，顶级评论留空",\n' +
    '  "replyToContent": "被回复的评论内容，顶级评论留空"\n' +
    '}'
}

function buildIGExistingCommentsText(comments) {
  var lines = []
  ;(Array.isArray(comments) ? comments : []).forEach(function(comment) {
    appendIGExistingCommentLine(lines, comment, '')
    ;(comment && Array.isArray(comment.replies) ? comment.replies : []).forEach(function(reply) {
      appendIGExistingCommentLine(lines, reply, comment && comment.username ? ' 回复 ' + comment.username : '')
    })
  })
  if (!lines.length) return '- (暂无现有评论)'
  return lines.slice(0, 60).join('\n')
}

function appendIGExistingCommentLine(lines, comment, replyText) {
  if (!comment) return
  var username = String(comment.username || comment.author || '').trim()
  var text = String(comment.text || comment.content || '').trim()
  if (!username && !text) return
  lines.push('- ' + (username || 'unknown') + (replyText || '') + '：' + (text || '(空评论)'))
}

function buildIGCommentGenerationMessage(context) {
  var prompt = buildIGCommentGenerationPrompt(context)
  var imageParts = buildIGCommentImagePromptParts(context && context.post)
  if (!imageParts.imageContentParts.length) return { role: 'user', content: prompt }
  return {
    role: 'user',
    content: [{ type: 'text', text: prompt }].concat(imageParts.imageContentParts)
  }
}

function buildIGCommentImagePromptParts(post) {
  var images = normalizeIGPostImages(post)
  var imageContentParts = []
  var imageTextParts = []
  var imageDescs = []
  images.forEach(function(img, idx) {
    var src = String(img.src || '').trim()
    var desc = String(img.desc || '').trim()
    var label = '第 ' + (idx + 1) + ' 张图片'
    var isVisual = /^data:image\//i.test(src) || /^https?:\/\//i.test(src)
    if (desc) imageDescs.push(label + '：' + desc)
    if (isVisual) {
      imageContentParts.push({ type: 'image_url', image_url: { url: src } })
      if (desc) imageContentParts.push({ type: 'text', text: label + '的图片重点补充：' + desc })
    } else if (src || desc) {
      imageTextParts.push(label + '：' + (desc || '非远程/非 data 图片，无法直接传给模型读取'))
    }
  })
  if (!imageDescs.length && post && post.imageText) imageDescs = [String(post.imageText)]
  var imageText = images.length
    ? '图片读取：附带 ' + imageContentParts.filter(function(part) { return part.type === 'image_url' }).length + ' 张可由模型直接查看的 image_url。' +
      (imageTextParts.length ? '无法直接查看的图片仅使用文字说明：' + imageTextParts.join('；') : '') + '\n'
    : ''
  return {
    imageContentParts: imageContentParts,
    imageText: imageText,
    imageDescs: imageDescs
  }
}

function buildIGCommentCharRule(context) {
  var chars = context.characters || []
  if (!chars.length) return '【参与评论的角色】\n无。本次评论全部由随机 Instagram 路人用户发布，authorId 必须为 null。'
  var postAuthorId = context.post && context.post.authorId
  return '【参与评论的角色】\n以下角色已被选中参与评论（每个角色生成 1 条评论）：\n' + chars.map(function(c) {
    var relToPostAuthor = postAuthorId != null && parseInt(postAuthorId) !== parseInt(context.user.id)
      ? (context.relationMap[String(c.id)] || getIGRelationText(c, postAuthorId))
      : ''
    return [
      '---',
      '角色ID：' + c.id,
      '昵称：' + (c.nick || c.name || '未命名'),
      '性别：' + (c.gender || ''),
      '身份/职业：' + (c.role || ''),
      '与用户关系：' + getIGRelationText(c, context.user && context.user.id),
      relToPostAuthor ? '与发帖人关系：' + relToPostAuthor : '',
      '人设：\n' + (c.description || '(未设定)'),
      'systemPrompt：\n' + (c.systemPrompt || c.prompt || '(未设定)'),
      context.chatContextMap && context.chatContextMap[c.id] ? context.chatContextMap[c.id] : '',
      buildIGBilingualNote(context.bilingualMap && context.bilingualMap[c.id])
    ].filter(Boolean).join('\n')
  }).join('\n')
}

function parseIGGeneratedComments(raw) {
  var parsed = null
  if (raw && typeof raw === 'object') parsed = raw
  if (!parsed && typeof raw === 'string') {
    var text = raw.trim()
    try { parsed = JSON.parse(text) } catch (e) {}
    if (!parsed) {
      var fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
      if (fenced) {
        try { parsed = JSON.parse((fenced[1] || '').trim()) } catch (e2) {}
      }
    }
    if (!parsed) {
      var objStart = text.indexOf('{')
      var objEnd = text.lastIndexOf('}')
      if (objStart !== -1 && objEnd > objStart) {
        try { parsed = JSON.parse(text.slice(objStart, objEnd + 1)) } catch (e3) {}
      }
    }
    if (!parsed) {
      var arrStart = text.indexOf('[')
      var arrEnd = text.lastIndexOf(']')
      if (arrStart !== -1 && arrEnd > arrStart) {
        try { parsed = JSON.parse(text.slice(arrStart, arrEnd + 1)) } catch (e4) {}
      }
    }
  }
  if (Array.isArray(parsed)) return { items: parsed }
  if (parsed && Array.isArray(parsed.items)) return parsed
  if (parsed && Array.isArray(parsed.comments)) return { items: parsed.comments, likes: parsed.likes, comments: parsed.comments.length }
  return { items: [] }
}

function trimIGUserPostComments(aiResult, context) {
  var targetCount = getIGParsedCommentTargetCount(aiResult)
  var items = Array.isArray(aiResult && aiResult.items) ? aiResult.items.slice() : []
  if (items.length <= targetCount) return items
  var charItems = items.filter(function(c) { return c.authorId !== null && c.authorId !== undefined && c.authorId !== '' })
  var bystanderItems = items.filter(function(c) { return c.authorId === null || c.authorId === undefined || c.authorId === '' })
  var keepBystander = Math.max(0, targetCount - charItems.length)
  return charItems.concat(shuffleIGArray(bystanderItems).slice(0, keepBystander))
}

function getIGParsedCommentTargetCount(aiResult) {
  var count = normalizeIGMetric(aiResult && aiResult.comments, 10)
  if (count <= 0) count = 10
  return Math.min(count, 20)
}

function ensureIGGeneratedCommentItems(items, context) {
  var list = Array.isArray(items) ? items.slice() : []
  var chars = (context.characters || []).slice(0, context.totalCount || 10)
  chars.forEach(function(c, index) {
    var existing = list.find(function(item) { return parseInt(item && item.authorId) === parseInt(c.id) })
    if (existing) {
      existing.author = c.nick || c.name || existing.author
      existing.authorId = parseInt(c.id)
      return
    }
    list.splice(index, 0, {
      author: c.nick || c.name || '角色',
      authorId: parseInt(c.id),
      time: 'now',
      content: '太好看了。',
      translation: '',
      likes: Math.floor(Math.random() * 12),
      replyToAuthor: '',
      replyToContent: ''
    })
  })
  while (list.length < (context.totalCount || 10)) {
    list.push({
      author: buildIGRandomBystanderUsername(list.length),
      authorId: null,
      time: 'now',
      content: '好喜欢这张。',
      translation: '',
      likes: Math.floor(Math.random() * 20),
      replyToAuthor: '',
      replyToContent: ''
    })
  }
  return list.slice(0, context.totalCount || 10)
}

function assembleIGCommentThreads(items, context) {
  var normalized = (Array.isArray(items) ? items : []).map(function(item) {
    return normalizeIGGeneratedComment(item, context)
  }).filter(Boolean)
  var tops = []
  normalized.forEach(function(item) {
    if (!item.replyToAuthor) {
      tops.push(item)
      return
    }
    var parent = null
    for (var i = tops.length - 1; i >= 0; i--) {
      if (String(tops[i].username || '').toLowerCase() === String(item.replyToAuthor || '').toLowerCase()) {
        parent = tops[i]
        break
      }
    }
    if (!parent) {
      item.replyToAuthor = ''
      item.mention = ''
      tops.push(item)
      return
    }
    parent.replies = parent.replies || []
    item.mention = parent.username
    delete item.replyToAuthor
    delete item.replyToContent
    parent.replies.push(item)
  })
  return tops
}

function mergeIGGeneratedComments(existingComments, items, context) {
  var tops = cloneIGComments(existingComments)
  var normalized = (Array.isArray(items) ? items : []).map(function(item) {
    return normalizeIGGeneratedComment(item, context)
  }).filter(Boolean)
  normalized.forEach(function(item) {
    if (!item.replyToAuthor) {
      tops.push(item)
      return
    }
    var parent = findIGCommentParentByAuthor(tops, item.replyToAuthor)
    if (!parent) {
      item.replyToAuthor = ''
      item.mention = ''
      tops.push(item)
      return
    }
    parent.replies = parent.replies || []
    item.mention = parent.username
    delete item.replyToAuthor
    delete item.replyToContent
    parent.replies.push(item)
  })
  return tops
}

function findIGCommentParentByAuthor(comments, author) {
  var target = String(author || '').toLowerCase()
  if (!target) return null
  for (var i = (comments || []).length - 1; i >= 0; i--) {
    var comment = comments[i]
    if (String(comment && comment.username || '').toLowerCase() === target) return comment
  }
  return null
}

function countIGCommentTreeItems(comments) {
  var count = 0
  ;(Array.isArray(comments) ? comments : []).forEach(function(comment) {
    count += 1
    count += Array.isArray(comment && comment.replies) ? comment.replies.length : 0
  })
  return count
}

function normalizeIGGeneratedComment(item, context) {
  if (!item || typeof item !== 'object') return null
  var authorId = item.authorId === null || item.authorId === undefined || item.authorId === '' ? null : parseInt(item.authorId)
  if (Number.isFinite(authorId) && parseInt(authorId) === parseInt(context.user && context.user.id)) return null
  var char = Number.isFinite(authorId)
    ? (context.characters || []).find(function(c) { return parseInt(c.id) === authorId })
    : null
  var username = char ? (char.nick || char.name || item.author) : (item.author || item.username || buildIGRandomBystanderUsername(Math.floor(Math.random() * 100)))
  var text = String(item.content || item.text || '').trim() || '好喜欢这张。'
  return {
    username: username,
    authorId: Number.isFinite(authorId) ? authorId : null,
    avatar: char && char.avatar ? char.avatar : '',
    time: String(item.time || 'now'),
    text: text,
    translation: String(item.translation || '').trim(),
    likes: normalizeIGMetric(item.likes, Math.floor(Math.random() * 20)),
    replyToAuthor: String(item.replyToAuthor || '').trim(),
    replyToContent: String(item.replyToContent || '').trim(),
    replies: []
  }
}

function pickIGLikedByName(post, user, comments, friends) {
  var isUserPost = post && post.authorId !== null && post.authorId !== undefined && parseInt(post.authorId) === parseInt(user && user.id)
  if (isUserPost && Array.isArray(friends) && friends.length) {
    var friend = friends[Math.floor(Math.random() * friends.length)]
    return friend.nick || friend.name || 'someone'
  }
  var flat = []
  ;(comments || []).forEach(function(c) {
    flat.push(c)
    ;(c.replies || []).forEach(function(r) { flat.push(r) })
  })
  if (flat.length) {
    var comment = flat[Math.floor(Math.random() * flat.length)]
    return comment.username || comment.author || 'someone'
  }
  return ''
}

function getIGPostCommentsKey(user, postId) {
  return IG_POST_COMMENTS_PREFIX + (user && user.id ? user.id : 'default') + '_' + postId
}

function loadIGPostCommentsFromLocal(user, postId) {
  try {
    var raw = localStorage.getItem(getIGPostCommentsKey(user, postId))
    var parsed = raw ? JSON.parse(raw) : null
    return parsed && Array.isArray(parsed.comments) ? parsed : null
  } catch (e) {
    return null
  }
}

async function loadIGPostComments(user, postId) {
  var local = loadIGPostCommentsFromLocal(user, postId)
  if (local && local.comments.length) return local
  if (window.db && db.config) {
    try {
      var row = await db.config.get(getIGPostCommentsKey(user, postId))
      var value = row && row.value
      if (value && Array.isArray(value.comments)) {
        try {
          localStorage.setItem(getIGPostCommentsKey(user, postId), JSON.stringify(value))
        } catch (e2) {}
        return value
      }
    } catch (e) {}
  }
  return local || null
}

async function saveIGPostComments(user, postId, data) {
  var safeData = data || { comments: [] }
  try {
    localStorage.setItem(getIGPostCommentsKey(user, postId), JSON.stringify(safeData))
  } catch (e) {}
  if (window.db && db.config) {
    try {
      await db.config.put({
        key: getIGPostCommentsKey(user, postId),
        value: safeData
      })
    } catch (e2) {}
  }
}

async function deleteIGPost(page, postId) {
  if (!page || !postId) return
  var user = page._igUser || await getIGSessionUser()
  if (!user) return
  if (postId === IG_INITIAL_POST_ID) {
    var hiddenIds = getIGHiddenPostIds(user)
    if (hiddenIds.indexOf(postId) === -1) {
      hiddenIds.push(postId)
      saveIGHiddenPostIds(user, hiddenIds)
    }
    renderIGGeneratedFeed(page, user)
    refreshIGProfilePage(document.getElementById('ig-page'), user)
    window.toast && window.toast('帖子已删除')
    return
  }

  var posts = loadIGGeneratedFeedPosts(user)
  var nextPosts = posts.filter(function(post, index) {
    return getIGGeneratedPostId(post, index) !== postId
  })
  if (nextPosts.length === posts.length) return
  await saveIGGeneratedFeedPosts(user, nextPosts)
  renderIGGeneratedFeed(page, user)
  refreshIGProfilePage(document.getElementById('ig-page'), user)
  window.toast && window.toast('帖子已删除')
}

async function loadIGForumSettings() {
  var fallback = { members: [], topics: [] }
  if (!window.db || !db.config) return fallback
  try {
    var row = await db.config.get(IG_FORUM_SETTINGS_KEY)
    var value = row && row.value && typeof row.value === 'object' ? row.value : {}
    return {
      members: Array.isArray(value.members) ? value.members.map(function(id) { return parseInt(id) }).filter(Number.isFinite) : [],
      topics: Array.isArray(value.topics) ? value.topics.map(function(item) { return String(item).trim() }).filter(Boolean) : []
    }
  } catch (e) {
    return fallback
  }
}

async function saveIGForumSettings(settings) {
  if (!window.db || !db.config) return
  await db.config.put({
    key: IG_FORUM_SETTINGS_KEY,
    value: {
      members: Array.isArray(settings.members) ? settings.members : [],
      topics: Array.isArray(settings.topics) ? settings.topics : []
    }
  })
}

async function hydrateIGForumSettings(page) {
  var settings = await loadIGForumSettings()
  updateIGForumSettingSummary(page, settings)
}

function updateIGForumSettingSummary(page, settings) {
  if (!page) return
  var membersRow = page.querySelector('.igf-setting-row[data-setting="members"] .igf-setting-value')
  var topicsRow = page.querySelector('.igf-setting-row[data-setting="topics"] .igf-setting-value')
  if (membersRow) {
    var memberCount = Array.isArray(settings.members) ? settings.members.length : 0
    membersRow.textContent = memberCount ? memberCount + ' 个角色' : '未设定'
  }
  if (topicsRow) {
    var topics = Array.isArray(settings.topics) ? settings.topics : []
    topicsRow.textContent = topics.length ? topics.slice(0, 2).join('、') + (topics.length > 2 ? ' 等' : '') : '未设定'
  }
}

async function showIGForumMembersSheet(page) {
  if (!window.db || !db.characters) {
    window.toast && window.toast('角色数据不可用')
    return
  }
  var settings = await loadIGForumSettings()
  var user = await getIGSessionUser()
  if (!user) {
    window.toast && window.toast('请先登录 Instagram 账号')
    return
  }
  var chars = await getIGFriendsForComments(user)
  var selected = new Set((settings.members || []).map(function(id) { return String(id) }))
  var rows = chars.length ? chars.map(function(c) {
    var name = c.nick || c.name || '未命名'
    var typeLabel = c.type === 'user' ? 'USER' : (c.type === 'npc' ? 'NPC' : 'CHAR')
    return '<label class="igf-picker-row">' +
      '<input type="checkbox" class="igf-member-check" value="' + igEscape(c.id) + '"' + (selected.has(String(c.id)) ? ' checked' : '') + '>' +
      '<span class="igf-picker-avatar">' + getIGAvatarHTML(c) + '</span>' +
      '<span class="igf-picker-main">' +
        '<span class="igf-picker-name">' + igEscape(name) + '</span>' +
        '<span class="igf-picker-meta">' + igEscape(typeLabel) + '</span>' +
      '</span>' +
    '</label>'
  }).join('') : '<div class="igf-picker-empty">暂无可选角色</div>'

  var modal = openIGForumSheet(
    '<div class="sheet-title">参与角色</div>' +
    '<div class="igf-picker-list">' + rows + '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-pill btn-full" id="igf-save-members" type="button">保存</button>' +
    '</div>'
  )
  modal.sheet.querySelector('#igf-save-members').addEventListener('click', async function() {
    settings.members = Array.from(modal.sheet.querySelectorAll('.igf-member-check:checked')).map(function(input) {
      return parseInt(input.value)
    }).filter(Number.isFinite)
    await saveIGForumSettings(settings)
    updateIGForumSettingSummary(page, settings)
    modal.close()
    window.toast && window.toast('参与角色已保存')
  })
}

async function showIGForumTopicsSheet(page) {
  var settings = await loadIGForumSettings()
  var modal = openIGForumSheet(
    '<div class="sheet-title">热门话题</div>' +
    '<div class="igf-topic-editor">' +
      '<textarea class="input-field igf-topic-input" id="igf-topic-input" rows="7" placeholder="每行一个话题">' + igEscape((settings.topics || []).join('\n')) + '</textarea>' +
    '</div>' +
    '<div class="sheet-actions">' +
      '<button class="btn-pill btn-full" id="igf-save-topics" type="button">保存</button>' +
    '</div>'
  )
  modal.sheet.querySelector('#igf-save-topics').addEventListener('click', async function() {
    var input = modal.sheet.querySelector('#igf-topic-input')
    settings.topics = String(input.value || '').split(/\n+/).map(function(line) {
      return line.trim().replace(/^#/, '')
    }).filter(Boolean)
    await saveIGForumSettings(settings)
    updateIGForumSettingSummary(page, settings)
    modal.close()
    window.toast && window.toast('热门话题已保存')
  })
}

function openIGForumSheet(html) {
  var app = document.getElementById('app') || document.body
  var overlay = typeof createOverlay === 'function' ? createOverlay() : document.createElement('div')
  overlay.className = overlay.className || 'sheet-overlay'
  var sheet = typeof createSheet === 'function' ? createSheet(html) : document.createElement('div')
  if (typeof createSheet !== 'function') {
    sheet.className = 'center-modal'
    sheet.innerHTML = html
  }
  overlay.style.zIndex = '10020'
  sheet.style.zIndex = '10021'
  app.appendChild(overlay)
  app.appendChild(sheet)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
    sheet.classList.add('show')
  })
  function close() {
    overlay.classList.remove('show')
    sheet.classList.remove('show')
    setTimeout(function() {
      if (overlay.parentNode) overlay.remove()
      if (sheet.parentNode) sheet.remove()
    }, 200)
  }
  overlay.addEventListener('click', close)
  return { overlay: overlay, sheet: sheet, close: close }
}

async function getIGUserList() {
  if (!window.db || !db.characters) return []
  try {
    return await db.characters.where('type').equals('user').toArray()
  } catch (e) {
    return (await db.characters.toArray()).filter(function(user) { return user.type === 'user' })
  }
}

function getIGProfileKey(user) {
  return IG_PROFILE_PREFIX + (user && user.id ? user.id : 'default')
}

function getIGDefaultProfile(user) {
  var account = user && user.identity && user.identity.account ? user.identity.account : 'wanwan_user'
  return {
    name: getIGUserName(user),
    account: String(account).replace(/^@+/, ''),
    bio: 'Poured all my heart to you',
    followers: '102',
    following: '66',
    avatar: user && user.avatar ? user.avatar : ''
  }
}

function normalizeIGProfile(user, value) {
  var defaults = getIGDefaultProfile(user)
  value = value && typeof value === 'object' ? value : {}
  return {
    name: String(value.name || defaults.name).trim() || defaults.name,
    account: String(value.account || defaults.account).trim().replace(/^@+/, '') || defaults.account,
    bio: value.bio == null ? defaults.bio : String(value.bio),
    followers: normalizeIGProfileCount(value.followers == null ? defaults.followers : value.followers, defaults.followers),
    following: normalizeIGProfileCount(value.following == null ? defaults.following : value.following, defaults.following),
    avatar: value.avatar == null ? defaults.avatar : String(value.avatar)
  }
}

function getIGProfileSync(user) {
  var key = getIGProfileKey(user)
  try {
    var raw = localStorage.getItem(key)
    return normalizeIGProfile(user, raw ? JSON.parse(raw) : null)
  } catch (e) {
    return getIGDefaultProfile(user)
  }
}

async function loadIGProfile(user) {
  var localProfile = getIGProfileSync(user)
  if (window.db && db.config) {
    try {
      var row = await db.config.get(getIGProfileKey(user))
      if (row && row.value) {
        var profile = normalizeIGProfile(user, row.value)
        try {
          localStorage.setItem(getIGProfileKey(user), JSON.stringify(profile))
        } catch (e2) {}
        return profile
      }
    } catch (e) {}
  }
  return localProfile
}

async function saveIGProfile(user, profile) {
  var safeProfile = normalizeIGProfile(user, profile)
  try {
    localStorage.setItem(getIGProfileKey(user), JSON.stringify(safeProfile))
  } catch (e) {}
  if (window.db && db.config) {
    await db.config.put({
      key: getIGProfileKey(user),
      value: safeProfile
    })
  }
  return safeProfile
}

async function getIGSessionUser() {
  var stored = localStorage.getItem(IG_SESSION_UID_KEY)
  if (!stored) return null
  var uid = parseInt(stored)
  if (!Number.isFinite(uid)) {
    localStorage.removeItem(IG_SESSION_UID_KEY)
    return null
  }
  var user = window.getCharacter ? await window.getCharacter(uid) : await db.characters.get(uid)
  if (!user || user.type !== 'user') {
    localStorage.removeItem(IG_SESSION_UID_KEY)
    return null
  }
  return user
}

function setIGSessionUser(user) {
  if (!user || user.type !== 'user') return
  localStorage.setItem(IG_SESSION_UID_KEY, user.id)
}

function getIGUserName(user) {
  return (user && (user.nick || user.name)) || '微信用户'
}

function getIGAvatarHTML(user, fallbackName) {
  var name = fallbackName || getIGUserName(user)
  if (user && user.avatar) return '<img src="' + igEscape(user.avatar) + '" alt="' + igEscape(name) + '">'
  return '<span>' + igEscape(getIGDefaultAvatarInitial(user, fallbackName)) + '</span>'
}

function getIGProfileAvatarHTML(user, profile) {
  profile = profile || getIGProfileSync(user)
  return getIGAvatarHTML({ avatar: profile.avatar, name: profile.name, nick: profile.name }, profile.name)
}

function getIGDefaultAvatarInitial(user, fallbackName) {
  var name = (user && user.name) || fallbackName || (user && user.nick) || '?'
  return String(name || '?').slice(0, 1)
}

function getIGRandomCommentAvatar() {
  return IG_COMMENT_AVATAR_POOL[Math.floor(Math.random() * IG_COMMENT_AVATAR_POOL.length)] || 'img/ava-00.jpg'
}

function getIGCommentAvatarHTML(comment) {
  var avatar = getIGStableCommentAvatar(comment)
  var name = comment && comment.username ? comment.username : ''
  return '<img src="' + igEscape(avatar) + '" alt="' + igEscape(name) + '">'
}

function getIGStableCommentAvatar(comment) {
  if (comment && comment.avatar) return comment.avatar

  var key = getIGCommentAvatarKey(comment)
  var cache = getIGCommentAvatarCache()
  if (cache[key] && IG_COMMENT_AVATAR_POOL.indexOf(cache[key]) !== -1) {
    return cache[key]
  }

  cache[key] = getIGRandomCommentAvatar()
  saveIGCommentAvatarCache(cache)
  return cache[key]
}

function getIGCommentAvatarKey(comment) {
  if (!comment) return 'unknown'
  return [
    comment.username || '',
    comment.time || '',
    comment.mention || '',
    comment.text || ''
  ].join('|')
}

function getIGCommentAvatarCache() {
  if (igCommentAvatarCache) return igCommentAvatarCache
  try {
    igCommentAvatarCache = JSON.parse(localStorage.getItem(IG_COMMENT_AVATAR_STORE_KEY) || '{}') || {}
  } catch (e) {
    igCommentAvatarCache = {}
  }
  return igCommentAvatarCache
}

function saveIGCommentAvatarCache(cache) {
  igCommentAvatarCache = cache || {}
  try {
    localStorage.setItem(IG_COMMENT_AVATAR_STORE_KEY, JSON.stringify(igCommentAvatarCache))
  } catch (e) {}
}

function getIGLoginIconSvg() {
  return '<svg class="ig-login-icon-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 130.024 129.989" aria-hidden="true"><defs><radialGradient fy="578.088" fx="158.429" gradientTransform="matrix(0 -1.98198 1.8439 0 -1031.399 454.004)" gradientUnits="userSpaceOnUse" xlink:href="#ig-login-gradient-a" r="65" cy="578.088" cx="158.429" id="ig-login-gradient-c"/><radialGradient fy="473.455" fx="147.694" gradientTransform="matrix(.17394 .86872 -3.5818 .71718 1648.351 -458.493)" gradientUnits="userSpaceOnUse" xlink:href="#ig-login-gradient-b" r="65" cy="473.455" cx="147.694" id="ig-login-gradient-d"/><linearGradient id="ig-login-gradient-b"><stop stop-color="#3771c8" offset="0"/><stop offset=".128" stop-color="#3771c8"/><stop stop-opacity="0" stop-color="#60f" offset="1"/></linearGradient><linearGradient id="ig-login-gradient-a"><stop stop-color="#fd5" offset="0"/><stop stop-color="#fd5" offset=".1"/><stop stop-color="#ff543e" offset=".5"/><stop stop-color="#c837ab" offset="1"/></linearGradient></defs><path d="M65.033 0C37.891 0 29.953.028 28.41.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468-4.125 4.282-6.625 9.55-7.53 15.812-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28a27.22 27.22 0 0017.75-14.53c1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624-4.3-4.108-9.56-6.608-15.829-7.512C102.338.157 101.733.027 86.193 0z" fill="url(#ig-login-gradient-c)"/><path d="M65.033 0C37.891 0 29.953.028 28.41.156c-5.57.463-9.036 1.34-12.812 3.22-2.91 1.445-5.205 3.12-7.47 5.468-4.125 4.282-6.625 9.55-7.53 15.812-.44 3.04-.568 3.66-.594 19.188-.01 5.176 0 11.988 0 21.125 0 27.12.03 35.05.16 36.59.45 5.42 1.3 8.83 3.1 12.56 3.44 7.14 10.01 12.5 17.75 14.5 2.68.69 5.64 1.07 9.44 1.25 1.61.07 18.02.12 34.44.12 16.42 0 32.84-.02 34.41-.1 4.4-.207 6.955-.55 9.78-1.28a27.22 27.22 0 0017.75-14.53c1.765-3.64 2.66-7.18 3.065-12.317.088-1.12.125-18.977.125-36.81 0-17.836-.04-35.66-.128-36.78-.41-5.22-1.305-8.73-3.127-12.44-1.495-3.037-3.155-5.305-5.565-7.624-4.3-4.108-9.56-6.608-15.829-7.512C102.338.157 101.733.027 86.193 0z" fill="url(#ig-login-gradient-d)"/><path d="M65.003 17c-13.036 0-14.672.057-19.792.29-5.11.234-8.598 1.043-11.65 2.23-3.157 1.226-5.835 2.866-8.503 5.535-2.67 2.668-4.31 5.346-5.54 8.502-1.19 3.053-2 6.542-2.23 11.65C17.06 50.327 17 51.964 17 65s.058 14.667.29 19.787c.235 5.11 1.044 8.598 2.23 11.65 1.227 3.157 2.867 5.835 5.536 8.503 2.667 2.67 5.345 4.314 8.5 5.54 3.054 1.187 6.543 1.996 11.652 2.23 5.12.233 6.755.29 19.79.29 13.037 0 14.668-.057 19.788-.29 5.11-.234 8.602-1.043 11.656-2.23 3.156-1.226 5.83-2.87 8.497-5.54 2.67-2.668 4.31-5.346 5.54-8.502 1.18-3.053 1.99-6.542 2.23-11.65.23-5.12.29-6.752.29-19.788 0-13.036-.06-14.672-.29-19.792-.24-5.11-1.05-8.598-2.23-11.65-1.23-3.157-2.87-5.835-5.54-8.503-2.67-2.67-5.34-4.31-8.5-5.535-3.06-1.187-6.55-1.996-11.66-2.23-5.12-.233-6.75-.29-19.79-.29zm-4.306 8.65c1.278-.002 2.704 0 4.306 0 12.816 0 14.335.046 19.396.276 4.68.214 7.22.996 8.912 1.653 2.24.87 3.837 1.91 5.516 3.59 1.68 1.68 2.72 3.28 3.592 5.52.657 1.69 1.44 4.23 1.653 8.91.23 5.06.28 6.58.28 19.39s-.05 14.33-.28 19.39c-.214 4.68-.996 7.22-1.653 8.91-.87 2.24-1.912 3.835-3.592 5.514-1.68 1.68-3.275 2.72-5.516 3.59-1.69.66-4.232 1.44-8.912 1.654-5.06.23-6.58.28-19.396.28-12.817 0-14.336-.05-19.396-.28-4.68-.216-7.22-.998-8.913-1.655-2.24-.87-3.84-1.91-5.52-3.59-1.68-1.68-2.72-3.276-3.592-5.517-.657-1.69-1.44-4.23-1.653-8.91-.23-5.06-.276-6.58-.276-19.398s.046-14.33.276-19.39c.214-4.68.996-7.22 1.653-8.912.87-2.24 1.912-3.84 3.592-5.52 1.68-1.68 3.28-2.72 5.52-3.592 1.692-.66 4.233-1.44 8.913-1.655 4.428-.2 6.144-.26 15.09-.27zm29.928 7.97a5.76 5.76 0 105.76 5.758c0-3.18-2.58-5.76-5.76-5.76zm-25.622 6.73c-13.613 0-24.65 11.037-24.65 24.65 0 13.613 11.037 24.645 24.65 24.645C78.616 89.645 89.65 78.613 89.65 65S78.615 40.35 65.002 40.35zm0 8.65c8.836 0 16 7.163 16 16 0 8.836-7.164 16-16 16-8.837 0-16-7.164-16-16 0-8.837 7.163-16 16-16z" fill="#fff"/></svg>'
}

function getIGLoginWordmarkSvg() {
  return '<svg class="ig-login-wordmark-svg" viewBox="-27.750945 -13.120125 240.50819 78.72075" aria-label="Instagram"><path d="M9.5263.182C5.7383 1.7671 1.573 6.2405.2583 11.8671-1.4097 18.99 5.525 21.998 6.0916 21.0166c.6667-1.164-1.2466-1.5547-1.6373-5.248-.5027-4.776 1.712-10.112 4.5067-12.4534.5213-.428.496.176.496 1.2894 0 2.008-.112 19.9733-.112 23.724 0 5.0773-.208 6.676-.592 8.2546-.3774 1.6054-.988 2.688-.528 3.1094.5213.4653 2.736-.6427 4.02-2.4347 1.536-2.1467 2.0773-4.7267 2.1773-7.5267.1133-3.372.1067-8.7333.1133-11.7853 0-2.8067.044-11.012-.044-15.952C14.4663.786 11.1063-.4794 9.5263.182m174.644 26.6547c-.5414 0-.7987.5666-1.0067 1.5173-.7173 3.316-1.472 4.064-2.448 4.064-1.088 0-2.064-1.6413-2.3213-4.9267-.1947-2.58-.164-7.3373.088-12.0693.0507-.9693-.2147-1.9307-2.82-2.8813-1.1254-.4027-2.756-1.0067-3.5667.956-2.2973 5.532-3.1907 9.936-3.4053 11.7173-.005.0933-.1187.1067-.1387-.1067-.1307-1.4293-.4333-4.028-.4707-9.4906-.0133-1.056-.2333-1.9694-1.416-2.712-.7613-.4774-3.0773-1.3334-3.9146-.32-.7174.8306-1.5534 3.0586-2.428 5.7013-.7054 2.152-1.196 3.612-1.196 3.612s.005-5.8027.0187-8.0053c0-.8307-.5667-1.1067-.736-1.1574-.7747-.2266-2.304-.5973-2.9453-.5973-.7987 0-.988.4467-.988 1.0947 0 .0813-.132 7.632-.132 12.912v.7426c-.4347 2.4294-1.868 5.7267-3.4227 5.7267-1.5547 0-2.2907-1.3787-2.2907-7.6707 0-3.6693.1134-5.2666.164-7.9226.0307-1.5294.0933-2.7054.088-2.976-.0133-.812-1.4293-1.228-2.084-1.3787-.66-.1573-1.2333-.208-1.6853-.1893-.6293.0386-1.076.4533-1.076 1.0333v.88c-.812-1.2827-2.128-2.1773-3.008-2.4347-2.3533-.6986-4.8147-.076-6.6707 2.516-1.472 2.0654-2.36 4.3987-2.7053 7.7534-.2587 2.4546-.176 4.94.2827 7.0413-.5534 2.372-1.5734 3.348-2.6867 3.348-1.624 0-2.7933-2.644-2.6613-7.2187.0947-3.0066.692-5.1146 1.352-8.1733.284-1.3027.0507-1.9813-.5214-2.6427-.5226-.592-1.6426-.9-3.2466-.5293-1.14.2707-2.7814.56-4.2734.7813 0 0 .088-.36.164-.9946.384-3.3294-3.2346-3.0587-4.3866-1.9947-.692.6347-1.164 1.384-1.34 2.7307-.2827 2.14 1.46 3.1466 1.46 3.1466-.572 2.6174-1.9694 6.04-3.4227 8.5134-.7747 1.328-1.3667 2.304-2.1333 3.348-.007-.384-.007-.7747-.007-1.1574-.0133-5.5066.056-9.8413.088-11.4026.032-1.5294.0947-2.6747.0947-2.9454-.0133-.592-.3587-.824-1.0894-1.1013-.6413-.2507-1.4026-.4333-2.1893-.4973-.988-.0747-1.592.4533-1.5733 1.076v.8373c-.8174-1.2827-2.1334-2.1773-3.0014-2.4347-2.36-.6986-4.82-.076-6.676 2.516-1.4666 2.0654-2.436 4.9534-2.7133 7.7214-.2507 2.5933-.2067 4.7826.1453 6.6333-.3773 1.8493-1.4533 3.788-2.6733 3.788-1.5547 0-2.4427-1.3787-2.4427-7.6707 0-3.6693.1134-5.2666.1707-7.9226.0307-1.5294.088-2.7054.0813-2.976-.0067-.812-1.4213-1.228-2.0826-1.3787-.6854-.1627-1.284-.2133-1.7374-.1893-.604.0506-1.0253.5853-1.0253.9946v.9187c-.8173-1.2827-2.1333-2.1773-3.008-2.4347-2.3533-.6986-4.7947-.0626-6.664 2.516-1.22 1.6814-2.208 3.5494-2.7173 7.6907-.1387 1.196-.208 2.3147-.2014 3.36-.4853 2.9693-2.6306 6.3933-4.38 6.3933-1.032 0-2.0133-1.9893-2.0133-6.236 0-5.6506.352-13.7053.4147-14.4853 0 0 2.2146-.0387 2.6493-.044 1.1013-.0067 2.108.0187 3.5747-.0573.7426-.0373 1.4533-2.6867.6853-3.02-.34-.1454-2.7813-.2774-3.7507-.296-.8173-.0187-3.0773-.188-3.0773-.188s.2027-5.3427.2467-5.9027c.0373-.4787-.5667-.7173-.9187-.8627-.8507-.364-1.612-.5346-2.5053-.7173-1.252-.2573-1.812-.0053-1.9187 1.044-.164 1.5933-.252 6.2627-.252 6.2627-.9187 0-4.0333-.184-4.9467-.184-.848 0-1.768 3.6506-.5906 3.6946 1.3533.0507 3.7.1014 5.26.144 0 0-.0694 8.188-.0694 10.7107v.78c-.8613 4.4733-3.876 6.8907-3.876 6.8907.648-2.964-.6733-5.1854-3.064-7.06-.8813-.6987-2.6173-2.0147-4.5626-3.4427 0 0 1.1266-1.1133 2.1266-3.3413.7054-1.58.7374-3.3974-1-3.7947-2.8693-.66-5.2293 1.448-5.94 3.7-.5413 1.7373-.2573 3.0333.8174 4.3733l.2453.3027c-.6413 1.2453-1.5347 2.9253-2.284 4.228-2.0947 3.6187-3.6747 6.476-4.864 6.476-.956 0-.944-2.9013-.944-5.62 0-2.3413.176-5.8707.3147-9.52.044-1.2027-.56-1.8947-1.572-2.5173-.6174-.3774-1.9267-1.12-2.688-1.12-1.132 0-4.4174.1506-7.5187 9.1173-.3907 1.1333-1.1587 3.1907-1.1587 3.1907l.0694-10.7854c0-.252-.132-.4906-.44-.6613-.5227-.2827-1.9254-.8613-3.1587-.8613-.5987 0-.8947.2773-.8947.824l-.1 16.864c0 1.284.0307 2.7813.1574 3.436.1253.6546.3333 1.1893.5853 1.5093.252.3093.5467.548 1.0253.6547.4467.0946 2.9067.4026 3.0334-.5347.1573-1.1267.1626-2.34 1.4533-6.8893 2.0133-7.0734 4.632-10.5214 5.8653-11.7494.22-.2133.4654-.2266.452.1267-.056 1.5533-.2386 5.424-.364 8.7147-.3333 8.816 1.264 10.4453 3.5614 10.4453 1.7493 0 4.216-1.7427 6.8653-6.1467 1.6547-2.7506 3.2533-5.4373 4.4107-7.3813.7933.7413 1.6986 1.5413 2.5986 2.3973 2.096 1.9814 2.7814 3.8694 2.3227 5.6574-.3467 1.3706-1.6613 2.78-3.996 1.4093-.68-.3973-.9693-.7053-1.6547-1.1587-.3653-.2453-.932-.3146-1.2653-.0626-.8813.6613-1.3787 1.4973-1.668 2.536-.2707 1.0133.7427 1.5413 1.7933 2.0066.9.4094 2.8387.768 4.0774.812 4.8266.164 8.6906-2.328 11.3773-8.7466.4853 5.544 2.5293 8.684 6.0853 8.684 2.384 0 4.7694-3.0774 5.8147-6.104.2947 1.2333.7413 2.3026 1.3147 3.216 2.744 4.3413 8.0666 3.4106 10.7346-.2774.8307-1.1453.9574-1.5546.9574-1.5546.3893 3.4813 3.196 4.7066 4.8013 4.7066 1.8053 0 3.656-.8546 4.9573-3.788.1574.3214.3214.624.5107.9134 2.7373 4.3413 8.06 3.4106 10.7347-.2774.12-.1826.2333-.3333.3266-.4786l.0827 2.2906s-1.5293 1.3974-2.4666 2.2587c-4.1214 3.7827-7.256 6.652-7.488 9.9867-.2894 4.26 3.1586 5.84 5.776 6.0466 2.7693.2214 5.148-1.308 6.6066-3.46 1.284-1.888 2.128-5.9466 2.0654-9.9613-.0253-1.6107-.064-3.6493-.1014-5.8453 1.4534-1.6734 3.0894-3.8014 4.588-6.292 1.6414-2.7067 3.3907-6.3507 4.284-9.188 0 0 1.5294.0133 3.1534-.088.5226-.032.6733.076.572.4533-.1134.4587-2.0507 7.9413-.2827 12.9253 1.2147 3.4094 3.9387 4.5107 5.5627 4.5107 1.8933 0 3.7066-1.4347 4.6746-3.5613.12.2333.24.4653.3787.68 2.7373 4.3413 8.0413 3.404 10.7347-.2774.6106-.836.9506-1.5546.9506-1.5546.5787 3.6066 3.3854 4.72 4.9894 4.72 1.68 0 3.2653-.6854 4.556-3.732.0507 1.3413.132 2.436.2706 2.7813.0813.2147.56.4787.9.6107 1.5347.5666 3.096.296 3.668.176.4027-.0814.7174-.396.756-1.2267.112-2.1773.0427-5.8333.704-8.5573 1.1134-4.556 2.1454-6.324 2.636-7.1987.272-.492.5854-.5733.592-.0573.0187 1.0506.076 4.1346.5094 8.288.3093 3.0453.7306 4.8506 1.0573 5.424.9187 1.6293 2.064 1.7053 2.9893 1.7053.592 0 1.8254-.164 1.7174-1.2027-.056-.5026.0387-3.6306 1.1266-8.1226.7174-2.9387 1.9067-5.588 2.3347-6.5574.164-.3586.2333-.0813.2333-.0253-.0947 2.02-.296 8.6333.5214 12.2453 1.1213 4.9027 4.348 5.4494 5.4746 5.4494 2.3974 0 4.368-1.8254 5.028-6.632.164-1.1587-.076-2.052-.7866-2.052M83.558 23.8672c-.132 2.5414-.6294 4.6694-1.4214 6.2107-1.448 2.8-4.2973 3.6813-5.5506-.352-.912-2.9133-.604-6.8907-.22-9.0373.5533-3.184 1.9573-5.436 4.1466-5.2294 2.24.2214 3.3347 3.1094 3.0454 8.408m21.9549.0374c-.1254 2.3973-.748 4.8133-1.428 6.1733-1.4027 2.8187-4.336 3.7-5.5507-.352-.8293-2.776-.6347-6.356-.22-8.6093.536-2.932 1.8253-5.6574 4.148-5.6574 2.2587 0 3.372 2.48 3.0507 8.4454m.5733 16.3853c-.032 4.3867-.7173 8.2253-2.1907 9.3453-2.1013 1.5854-4.9266.3894-4.3413-2.8066.516-2.832 2.964-5.72 6.5387-9.2507 0 0 .012.8053-.007 2.712m37.907-16.36c-.1267 2.6373-.712 4.6947-1.4347 6.148-1.404 2.8187-4.3107 3.6933-5.5507-.352-.6733-2.2093-.7053-5.8973-.22-8.9733.4907-3.1347 1.8694-5.5 4.1467-5.2934 2.252.2147 3.304 3.1094 3.0587 8.4707" fill="#262626"/></svg>'
}

function getIGWeChatSvg() {
  return '<svg class="ig-login-wechat-svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M385.2 167.6c6.4 0 12.6.3 18.8 1.1C387.4 90.3 303.3 32 207.7 32 100.5 32 13 104.8 13 197.4c0 53.4 29.3 97.5 77.9 131.6l-19.3 58.6 68.1-34.1c24.4 4.8 43.8 9.7 68.2 9.7 6.2 0 12.1-.3 18.3-.8-3.9-12.9-6.2-26.6-6.2-40.8-.1-84.9 72.9-154 165.2-154zM280.7 114.7c14.5 0 24.2 9.7 24.2 24.4 0 14.5-9.7 24.2-24.2 24.2-14.8 0-29.3-9.7-29.3-24.2.1-14.7 14.6-24.4 29.3-24.4zm-136.4 48.6c-14.5 0-29.3-9.7-29.3-24.2 0-14.8 14.8-24.4 29.3-24.4 14.8 0 24.4 9.7 24.4 24.4 0 14.6-9.6 24.2-24.4 24.2zM563 319.4c0-77.9-77.9-141.3-165.4-141.3-92.7 0-165.4 63.4-165.4 141.3s72.8 141.3 165.4 141.3c19.3 0 38.9-5.1 58.6-9.9l53.4 29.3-14.8-48.6C534 402.1 563 363.2 563 319.4zM343.9 294.9c-9.7 0-19.3-9.7-19.3-19.4 0-9.9 9.7-19.6 19.3-19.6 14.8 0 24.4 9.7 24.4 19.6 0 9.7-9.6 19.4-24.4 19.4zm107.1 0c-9.7 0-19.3-9.7-19.3-19.4 0-9.9 9.7-19.6 19.3-19.6 14.8 0 24.4 9.7 24.4 19.6.1 9.7-9.5 19.4-24.4 19.4z"></path></svg>'
}

function igEscape(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function igFormatCaption(str) {
  return igEscape(str).replace(/(^|\s)(#[A-Za-z0-9_\u4e00-\u9fa5]+)/g, '$1<span class="ig-hashtag">$2</span>')
}

function getIGHeartSvg(solid) {
  return solid
    ? '<svg viewBox="0 0 48 48" width="24" height="24" fill="currentColor"><path d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.1 1 1.7 1.5 1.5 1.4 3.3 2.8 5.1 4.2 2.8 2.1 5.7 3.9 6.4 3.9.8 0 7.7-4.5 11.5-7.4C42.3 30.2 48 25.4 48 17.6c0-8-6-14.5-13.4-14.5z"></path></svg>'
    : '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"></path></svg>'
}

function getIGCommentSvg() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path></svg>'
}

function getIGRepostSvg() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19.998 9.497a1 1 0 0 0-1 1v4.228a3.274 3.274 0 0 1-3.27 3.27h-5.313l1.791-1.787a1 1 0 0 0-1.412-1.416L7.29 18.287a1.004 1.004 0 0 0-.294.707v.001c0 .023.012.042.013.065a.923.923 0 0 0 .281.643l3.502 3.504a1 1 0 0 0 1.414-1.414l-1.797-1.798h5.318a5.276 5.276 0 0 0 5.27-5.27v-4.228a1 1 0 0 0-1-1Zm-6.41-3.496-1.795 1.795a1 1 0 1 0 1.414 1.414l3.5-3.5a1.003 1.003 0 0 0 0-1.417l-3.5-3.5a1 1 0 0 0-1.414 1.414l1.794 1.794H8.27A5.277 5.277 0 0 0 3 9.271V13.5a1 1 0 0 0 2 0V9.271a3.275 3.275 0 0 1 3.271-3.27Z"></path></svg>'
}

function getIGSendSvg() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"></line></svg>'
}

var igCommentsData = [
  {
    avatar: '',
    username: 'kovoiii_',
    time: 'May 15',
    text: '这也太甜了吧 死前谈一个这样的',
    likes: 7,
    replies: [
      {
        avatar: '',
        username: 'mimizz',
        time: 'May 16',
        mention: 'kovoiii_',
        text: '接',
        likes: 2
      }
    ]
  },
  {
    avatar: '',
    username: 'lunar.mei',
    time: 'May 17',
    text: '夜里开车牵手的感觉 光是想想就心动了',
    likes: 5
  },
  {
    avatar: '',
    username: 'rinnng',
    time: 'May 18',
    text: 'with u is crazy cute',
    translation: '和你在一起真的甜到不行',
    likes: 12
  },
  {
    avatar: '',
    username: 'thequietone',
    time: 'May 19',
    text: 'this looks like a movie still',
    translation: '这看起来像电影截图',
    likes: 4
  }
]

async function showIGCommentsSheet(page, postId) {
  var oldSheet = page.querySelector('.ig-comments-overlay')
  if (oldSheet) oldSheet.remove()
  var user = page._igUser || {}
  var stored = await loadIGPostComments(user, postId)
  var comments = stored && Array.isArray(stored.comments) ? stored.comments : []
  if (!comments.length && String(postId) === IG_INITIAL_POST_ID) comments = igCommentsData
  var listHTML = comments.length
    ? comments.map(buildIGCommentThread).join('')
    : '<div class="ig-comments-empty">' +
        '<div class="ig-comments-empty-title">暂无评论</div>' +
        '<button class="ig-comments-generate" type="button">生成评论</button>' +
      '</div>'

  var overlay = document.createElement('div')
  overlay.className = 'ig-comments-overlay'
  overlay.dataset.postId = postId || ''
  overlay.innerHTML =
    '<div class="ig-comments-backdrop"></div>' +
    '<section class="ig-comments-sheet" role="dialog" aria-modal="true" aria-label="Comments">' +
      '<div class="ig-comments-handle"></div>' +
      '<div class="ig-comments-header">' +
        '<div class="ig-comments-title">Comments</div>' +
      '</div>' +
      '<div class="ig-comments-list">' +
        listHTML +
      '</div>' +
      '<div class="ig-comments-composer">' +
        '<div class="ig-comments-input-row">' +
          '<div class="ig-comments-me">' + getIGProfileAvatarHTML(page._igUser) + '</div>' +
          '<div class="ig-comments-input-pill">' +
            '<span>What do you think of this?</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>'

  page.appendChild(overlay)
  requestAnimationFrame(function() {
    overlay.classList.add('show')
  })

  overlay.querySelector('.ig-comments-backdrop').addEventListener('click', function() {
    closeIGCommentsSheet(overlay)
  })

  var generateButton = overlay.querySelector('.ig-comments-generate')
  if (generateButton) {
    generateButton.addEventListener('click', function() {
      closeIGCommentsSheet(overlay)
      requestIGPostCommentGeneration(page, postId)
    })
  }

  overlay.querySelectorAll('.ig-comment-like').forEach(function(button) {
    button.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()
      var liked = button.dataset.liked === '1'
      var count = parseInt(button.dataset.count) || 0
      var newCount = liked ? Math.max(0, count - 1) : count + 1
      button.dataset.liked = liked ? '0' : '1'
      button.dataset.count = String(newCount)
      button.classList.toggle('liked', !liked)
      button.innerHTML = getIGHeartSvg(!liked)
      var countEl = button.nextElementSibling
      if (countEl && countEl.classList.contains('ig-comment-like-count')) {
        countEl.textContent = newCount ? String(newCount) : ''
        countEl.classList.toggle('is-empty', !newCount)
      }
    })
  })

  overlay.querySelectorAll('.ig-comments-replies-toggle').forEach(function(button) {
    button.addEventListener('click', function() {
      var thread = button.closest('.ig-comment-thread')
      if (!thread) return
      var expanded = thread.classList.toggle('replies-open')
      button.querySelector('.ig-comments-toggle-text').textContent = expanded ? 'Hide Replies' : 'View Replies'
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    })
  })

  overlay.querySelectorAll('.ig-comment-translate').forEach(function(button) {
    button.addEventListener('click', function() {
      var row = button.closest('.ig-comment-row')
      if (!row) return
      var textEl = row.querySelector('.ig-comment-text')
      if (!textEl) return
      var showingTranslation = button.dataset.state === 'translation'
      textEl.textContent = showingTranslation ? (textEl.dataset.original || '') : (textEl.dataset.translation || '')
      button.dataset.state = showingTranslation ? 'original' : 'translation'
      button.textContent = showingTranslation ? 'Translation' : 'Original'
    })
  })
}

function closeIGCommentsSheet(overlay) {
  overlay.classList.remove('show')
  setTimeout(function() {
    if (overlay.parentNode) overlay.remove()
  }, 220)
}

function buildIGCommentThread(comment) {
  var replies = comment.replies || []
  return '<div class="ig-comment-thread">' +
    buildIGCommentRow(comment, false) +
    (replies.length ? '<button class="ig-comments-replies-toggle" type="button" aria-expanded="false">' +
      '<span class="ig-comments-replies-line"></span>' +
      '<span class="ig-comments-toggle-text">View Replies</span>' +
    '</button>' +
    '<div class="ig-comments-replies">' +
      replies.map(function(reply) { return buildIGCommentRow(reply, true) }).join('') +
    '</div>' : '') +
  '</div>'
}

function buildIGCommentRow(comment, isReply) {
  var likes = normalizeIGMetric(comment && comment.likes, 0)
  var likeCount = '<div class="ig-comment-like-count' + (likes ? '' : ' is-empty') + '">' + (likes ? igEscape(likes) : '') + '</div>'
  var mention = comment.mention ? '<span class="ig-comment-mention">@' + igEscape(comment.mention) + '</span> ' : ''
  var translation = String(comment.translation || '').trim()
  var textAttrs = translation
    ? ' data-original="' + igEscape(comment.text) + '" data-translation="' + igEscape(translation) + '"'
    : ''
  var actions = '<div class="ig-comment-actions">' +
    '<button class="ig-comment-reply" type="button">Reply</button>' +
    (translation ? '<button class="ig-comment-translate" type="button" data-state="original">Translation</button>' : '') +
  '</div>'

  return '<div class="ig-comment-row' + (isReply ? ' ig-comment-reply-row' : '') + '">' +
    '<div class="ig-comment-avatar">' + getIGCommentAvatarHTML(comment) + '</div>' +
    '<div class="ig-comment-body">' +
      '<div class="ig-comment-copy">' +
        '<span class="ig-comment-username">' + igEscape(comment.username) + '</span> ' +
        '<span class="ig-comment-time">' + igEscape(comment.time) + '</span>' +
        '<div class="ig-comment-text"' + textAttrs + '>' + mention + igEscape(comment.text) + '</div>' +
      '</div>' +
      actions +
    '</div>' +
    '<button class="ig-comment-like" type="button" aria-label="Like comment" data-liked="0" data-count="' + likes + '">' + getIGHeartSvg(false) + '</button>' +
    likeCount +
  '</div>'
}

function getIGBookmarkSvg() {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></polygon></svg>'
}

function raiseIGImageViewSheet() {
  var app = document.getElementById('app')
  if (!app) return
  var overlays = app.querySelectorAll('.sheet-overlay')
  var sheets = app.querySelectorAll('.wc-center-modal')
  var overlay = overlays[overlays.length - 1]
  var sheet = sheets[sheets.length - 1]
  if (overlay) overlay.style.zIndex = '10000'
  if (sheet) sheet.style.zIndex = '10001'
}

function resolveIGPostAuthor(post, user, profile) {
  post = post || {}
  var fallbackUsername = post.username || post.author || 'Instagram user'
  var fallbackAvatar = post.avatar || ''
  var postAuthorId = post.authorId
  var userId = user && user.id
  if (postAuthorId !== null && postAuthorId !== undefined && postAuthorId !== '' &&
      userId !== null && userId !== undefined && userId !== '' &&
      String(postAuthorId) === String(userId)) {
    profile = profile || getIGProfileSync(user)
    return {
      username: profile.account || getIGUserName(user),
      avatar: profile.avatar || ''
    }
  }
  return {
    username: fallbackUsername,
    avatar: fallbackAvatar
  }
}

function getIGPostCreatedAt(post) {
  var createdAt = Number(post && post.createdAt)
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null
  return Number.isNaN(new Date(createdAt).getTime()) ? null : createdAt
}

function isIGCurrentUserPost(post, user) {
  if (!post || !user || getIGPostCreatedAt(post) === null) return false
  if (post.authorId === null || post.authorId === undefined || post.authorId === '') return false
  return String(post.authorId) === String(user.id)
}

function formatIGOwnPostTime(createdAt, now) {
  var timestamp = Number(createdAt)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''

  var currentTime = Number(now)
  if (!Number.isFinite(currentTime)) currentTime = Date.now()
  var elapsed = Math.max(0, currentTime - timestamp)
  var hourMs = 60 * 60 * 1000
  var dayMs = 24 * hourMs

  if (elapsed < hourMs) return 'NOW'
  if (elapsed < dayMs) return Math.floor(elapsed / hourMs) + 'h'
  if (elapsed <= 7 * dayMs) return Math.floor(elapsed / dayMs) + 'd'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp))
}

function refreshIGPostTimes(page) {
  if (!page) return
  var now = Date.now()
  page.querySelectorAll('.ig-post-time[data-ig-created-at]').forEach(function(element) {
    var formatted = formatIGOwnPostTime(element.dataset.igCreatedAt, now)
    if (formatted && element.textContent !== formatted) element.textContent = formatted
  })
}

function stopIGPostTimeUpdater(page) {
  if (!page || !page._igPostTimeInterval) return
  clearInterval(page._igPostTimeInterval)
  page._igPostTimeInterval = null
}

function startIGPostTimeUpdater(page) {
  if (!page) return
  stopIGPostTimeUpdater(page)
  refreshIGPostTimes(page)
  page._igPostTimeInterval = setInterval(function() {
    if (!document.body.contains(page)) {
      stopIGPostTimeUpdater(page)
      return
    }
    refreshIGPostTimes(page)
  }, 60 * 1000)
}

function buildIGPost(data, options) {
  options = options || {}
  var likes = data.likes || 0
  var comments = data.comments || 0
  var reposts = data.reposts || 0
  var images = normalizeIGPostImages(data)
  var firstImage = images[0] || { src: '', desc: '' }
  var postId = options.postId || data.id || getIGGeneratedPostId(data, 0)
  var commentsEnabled = options.commentsEnabled === true
  var author = resolveIGPostAuthor(data, options.user, options.profile)
  var ownPostCreatedAt = isIGCurrentUserPost(data, options.user) ? getIGPostCreatedAt(data) : null
  var postTime = ownPostCreatedAt !== null ? formatIGOwnPostTime(ownPostCreatedAt) : data.time
  var postTimeAttrs = ownPostCreatedAt !== null
    ? ' data-ig-created-at="' + ownPostCreatedAt + '"'
    : ''

  return '<div class="ig-post" data-post-id="' + igEscape(postId) + '">' +
    '<div class="ig-post-header">' +
      '<div class="ig-post-user">' +
        '<div class="ig-post-avatar">' + getIGAvatarHTML({ avatar: author.avatar || '', name: author.username }, author.username) + '</div>' +
        '<div class="ig-post-userinfo">' +
          '<span class="ig-post-username">' + igEscape(author.username) + '</span>' +
          (data.location ? '<span class="ig-post-location">' + igEscape(data.location) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<button class="ig-post-more" type="button" aria-label="更多">' +
        '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>' +
      '</button>' +
    '</div>' +
    buildIGPostImageCarousel(images, firstImage) +
    '<div class="ig-post-actions-bar">' +
      '<div class="ig-post-actions-left">' +
        '<span class="ig-action-group"><button class="ig-post-action ig-like" data-liked="0" data-count="' + likes + '">' + getIGHeartSvg(false) + '</button>' +
        '<span class="ig-action-count ig-like-count">' + likes + '</span></span>' +
        '<span class="ig-action-group"><button class="ig-post-action ig-comment" type="button" data-comments-enabled="' + (commentsEnabled ? '1' : '0') + '" aria-label="评论"' + (commentsEnabled ? '' : ' disabled aria-disabled="true"') + '>' + getIGCommentSvg() + '</button>' +
        '<span class="ig-action-count">' + comments + '</span></span>' +
        '<span class="ig-action-group"><button class="ig-post-action ig-repost">' + getIGRepostSvg() + '</button>' +
        '<span class="ig-action-count">' + reposts + '</span></span>' +
        '<button class="ig-post-action ig-send">' + getIGSendSvg() + '</button>' +
      '</div>' +
      '<div class="ig-post-actions-right">' +
        '<button class="ig-post-action ig-bookmark">' + getIGBookmarkSvg() + '</button>' +
      '</div>' +
    '</div>' +
    (data.likedBy ? '<div class="ig-post-likes">Liked by <strong>' + igEscape(data.likedBy) + '</strong> and <strong>others</strong></div>' : '') +
    (data.caption ? '<div class="ig-post-caption"><strong>' + igEscape(author.username) + '</strong> ' + igFormatCaption(data.caption) + '</div>' : '') +
    (postTime ? '<div class="ig-post-time"' + postTimeAttrs + '>' + igEscape(postTime) + '</div>' : '') +
  '</div>'
}

function normalizeIGPostImageItem(image) {
  if (typeof image === 'string') return { src: image, desc: '' }
  if (!image || typeof image !== 'object') return { src: '', desc: '' }
  return {
    src: String(image.src || image.image || image.url || ''),
    desc: String(image.desc || image.imageText || image.text || image.alt || '')
  }
}

function normalizeIGPostImages(data) {
  var images = Array.isArray(data && data.images)
    ? data.images.map(normalizeIGPostImageItem)
    : []
  images = images.filter(function(item) { return item.src }).slice(0, 9)
  if (!images.length && data && data.image) {
    images.push({ src: data.image, desc: data.imageText || '' })
  }
  return images
}

function buildIGPostImageCarousel(images, firstImage) {
  var safeImages = (Array.isArray(images) ? images : []).filter(function(item) { return item && item.src }).slice(0, 9)
  if (!safeImages.length) return ''
  var hasMany = safeImages.length > 1
  var imageStoreId = registerIGCarouselImages(safeImages)
  var controls = hasMany
    ? '<button class="ig-post-carousel-btn ig-post-carousel-prev" type="button" data-dir="prev" aria-label="上一张" disabled><i class="fa fa-angle-left"></i></button>' +
      '<button class="ig-post-carousel-btn ig-post-carousel-next" type="button" data-dir="next" aria-label="下一张"><i class="fa fa-angle-right"></i></button>' +
      '<div class="ig-carousel-dots">' + safeImages.map(function(_, i) {
        return '<span class="ig-carousel-dot' + (i === 0 ? ' active' : '') + '"></span>'
      }).join('') + '</div>'
    : ''
  return '<div class="ig-post-image" role="button" tabindex="0" data-active-index="0" data-ig-images-id="' + igEscape(imageStoreId) + '" data-image="' + igEscape(firstImage.src) + '" data-image-text="' + igEscape(firstImage.desc || '') + '">' +
      '<img class="ig-post-carousel-img" src="' + igEscape(firstImage.src) + '" alt="' + igEscape(firstImage.desc || '') + '">' +
      controls +
    '</div>'
}

function registerIGCarouselImages(images) {
  if (!window._igCarouselImageStore) window._igCarouselImageStore = {}
  window._igCarouselImageStoreSeq = (window._igCarouselImageStoreSeq || 0) + 1
  var id = 'ig-carousel-' + window._igCarouselImageStoreSeq
  window._igCarouselImageStore[id] = images
  return id
}

var igBottomBarSvgs = {
  home: {
    active: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="m21.762 8.786-7-6.68a3.994 3.994 0 0 0-5.524 0l-7 6.681A4.017 4.017 0 0 0 1 11.68V19c0 2.206 1.794 4 4 4h3.005a1 1 0 0 0 1-1v-7.003a2.997 2.997 0 0 1 5.994 0V22a1 1 0 0 0 1 1H19c2.206 0 4-1.794 4-4v-7.32a4.02 4.02 0 0 0-1.238-2.894Z"></path></svg>',
    inactive: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9.005 16.545a2.997 2.997 0 0 1 2.997-2.997A2.997 2.997 0 0 1 15 16.545V22h7V11.543L12 2 2 11.543V22h7.005Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path></svg>'
  },
  reels: {
    active: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M22.935 7.468c-.063-1.36-.307-2.142-.512-2.67a5.341 5.341 0 0 0-1.27-1.95 5.345 5.345 0 0 0-1.95-1.27c-.53-.206-1.311-.45-2.672-.513C15.333 1.012 14.976 1 12 1s-3.333.012-4.532.065c-1.36.063-2.142.307-2.67.512-.77.298-1.371.69-1.95 1.27a5.36 5.36 0 0 0-1.27 1.95c-.206.53-.45 1.311-.513 2.672C1.012 8.667 1 9.024 1 12s.012 3.333.065 4.532c.063 1.36.307 2.142.512 2.67.297.77.69 1.372 1.27 1.95.58.581 1.181.974 1.95 1.27.53.206 1.311.45 2.672.513C8.667 22.988 9.024 23 12 23s3.333-.012 4.532-.065c1.36-.063 2.142-.307 2.67-.512a5.33 5.33 0 0 0 1.95-1.27 5.356 5.356 0 0 0 1.27-1.95c.206-.53.45-1.311.513-2.672.053-1.198.065-1.555.065-4.531s-.012-3.333-.065-4.532ZM16.353 9.612l-5.25-3a2.725 2.725 0 0 0-2.745.01A2.722 2.722 0 0 0 6.988 9v6c0 .992.512 1.88 1.37 2.379.432.25.906.376 1.38.376.468 0 .937-.123 1.365-.367l5.25-3c.868-.496 1.385-1.389 1.385-2.388s-.517-1.892-1.385-2.388Z"></path></svg>',
    inactive: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22.935 7.468c-.063-1.36-.307-2.142-.512-2.67a5.341 5.341 0 0 0-1.27-1.95 5.345 5.345 0 0 0-1.95-1.27c-.53-.206-1.311-.45-2.672-.513C15.333 1.012 14.976 1 12 1s-3.333.012-4.532.065c-1.36.063-2.142.307-2.67.512-.77.298-1.371.69-1.95 1.27a5.36 5.36 0 0 0-1.27 1.95c-.206.53-.45 1.311-.513 2.672C1.012 8.667 1 9.024 1 12s.012 3.333.065 4.532c.063 1.36.307 2.142.512 2.67.297.77.69 1.372 1.27 1.95.58.581 1.181.974 1.95 1.27.53.206 1.311.45 2.672.513C8.667 22.988 9.024 23 12 23s3.333-.012 4.532-.065c1.36-.063 2.142-.307 2.67-.512a5.33 5.33 0 0 0 1.95-1.27 5.356 5.356 0 0 0 1.27-1.95c.206-.53.45-1.311.513-2.672.053-1.198.065-1.555.065-4.531s-.012-3.333-.065-4.532Zm-1.998 8.972c-.05 1.07-.228 1.652-.38 2.04-.197.51-.434.874-.82 1.258a3.362 3.362 0 0 1-1.258.82c-.387.151-.97.33-2.038.379-1.162.052-1.51.063-4.441.063s-3.28-.01-4.44-.063c-1.07-.05-1.652-.228-2.04-.38a3.354 3.354 0 0 1-1.258-.82 3.362 3.362 0 0 1-.82-1.258c-.151-.387-.33-.97-.379-2.038C3.011 15.28 3 14.931 3 12s.01-3.28.063-4.44c.05-1.07.228-1.652.38-2.04.197-.51.434-.875.82-1.26a3.372 3.372 0 0 1 1.258-.819c.387-.15.97-.329 2.038-.378C8.72 3.011 9.069 3 12 3s3.28.01 4.44.063c1.07.05 1.652.228 2.04.38.51.197.874.433 1.258.82.385.382.622.747.82 1.258.151.387.33.97.379 2.038C20.989 8.72 21 9.069 21 12s-.01 3.28-.063 4.44Zm-4.584-6.828-5.25-3a2.725 2.725 0 0 0-2.745.01A2.722 2.722 0 0 0 6.988 9v6c0 .992.512 1.88 1.37 2.379.432.25.906.376 1.38.376.468 0 .937-.123 1.365-.367l5.25-3c.868-.496 1.385-1.389 1.385-2.388s-.517-1.892-1.385-2.388Zm-.993 3.04-5.25 3a.74.74 0 0 1-.748-.003.74.74 0 0 1-.374-.649V9a.74.74 0 0 1 .374-.65.737.737 0 0 1 .748-.002l5.25 3c.341.196.378.521.378.652s-.037.456-.378.651Z"></path></svg>'
  },
  dm: {
    active: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z"></path><line x1="7.488" x2="15.515" y1="12.208" y2="7.641" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></line></svg>',
    inactive: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"></line></svg>'
  },
  search: {
    active: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" x1="16.511" x2="22" y1="16.511" y2="22"></line></svg>',
    inactive: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="16.511" x2="22" y1="16.511" y2="22"></line></svg>'
  }
}

function buildIGBottomBar(user) {
  var profile = getIGProfileSync(user)
  var items = [
    { id: 'home', active: true },
    { id: 'reels', active: false },
    { id: 'dm', active: false },
    { id: 'search', active: false },
    { id: 'profile', active: false, isAvatar: true }
  ]

  return items.map(function(item) {
    if (item.isAvatar) {
      return '<div class="ig-bottombar-item' + (item.active ? ' active' : '') + '" data-tab="' + item.id + '">' +
        '<div class="ig-bottombar-avatar">' + getIGProfileAvatarHTML(user, profile) + '</div>' +
      '</div>'
    }
    var svgData = igBottomBarSvgs[item.id]
    var svg = item.active ? svgData.active : svgData.inactive
    return '<div class="ig-bottombar-item' + (item.active ? ' active' : '') + '" data-tab="' + item.id + '">' +
      svg +
    '</div>'
  }).join('')
}
