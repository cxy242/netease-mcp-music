// tutorial.js — 教程 App
// 依赖：main.js, settings.js

function tutorialRow(id, icon, title, sub) {
  return '<div class="list-row clickable tutorial-row" id="' + id + '">' +
    '<div class="row-icon-box"><i class="' + icon + '"></i></div>' +
    '<div class="row-body">' +
      '<div class="row-label">' + title + '</div>' +
      '<div class="row-sub">' + sub + '</div>' +
    '</div>' +
    '<i class="fa fa-angle-right row-chevron"></i>' +
  '</div>'
}

function tutorialSteps(items) {
  return '<div class="tutorial-steps">' + items.map(function(item, index) {
    return '<div class="tutorial-step">' +
      '<div class="tutorial-step-num">' + (index + 1) + '</div>' +
      '<div class="tutorial-step-text">' + item + '</div>' +
    '</div>'
  }).join('') + '</div>'
}

function tutorialEsc(str) {
  return String(str || '').replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function copyTutorialText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
  }
  var ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}

function escapeTutorialRegexText(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildThoughtRegexFromSample(sampleText) {
  var text = String(sampleText || '').replace(/\r\n?/g, '\n').trim()
  if (!text) return '^([\\s\\S]+)$'
  var labelRegex = /(^|[\n｜|])([^\n｜|:：]+)([:：])/g
  var matches = []
  var match
  while ((match = labelRegex.exec(text))) {
    matches.push({
      tokenStart: match.index,
      afterColon: match.index + match[0].length
    })
  }
  if (!matches.length) return '^([\\s\\S]+)$'
  var out = ''
  for (var i = 0; i < matches.length; i++) {
    var staticStart = i === 0 ? 0 : matches[i].tokenStart
    out += escapeTutorialRegexText(text.slice(staticStart, matches[i].afterColon))
    out += i === matches.length - 1 ? '([\\s\\S]+)' : '(.+?)'
  }
  if (!out) return '^([\\s\\S]+)$'
  return out
}

window.WANWAN_CHAT_BEAUTY_CLASS_GROUPS = [
  {
    label: '顶栏',
    items: [
      '.chat-window-page', '.chat-header', '.chat-header-body', '.header-back', '.chat-header-info',
      '.chat-header-name', '.chat-header-status', '.chat-status-dot',
      '.chat-status-text', '.btn-icon', '.chat-multi-select-header',
      '.chat-multi-header-btn', '.chat-multi-header-title'
    ]
  },
  {
    label: '气泡相关',
    items: [
      '.chat-messages', '.msg-row', '.msg-self', '.msg-other', '.msg-content-wrap',
      '.msg-avatar', '.msg-bubble', '.bubble-self', '.bubble-other',
      '.quote-ref', '.quote-ref-self', '.quote-ref-other', '.quote-ref-name',
      '.quote-ref-time', '.msg-recall-row', '.recall-tip', '.recall-view',
      '.wc-system-tip', '.msg-time-center', '.voice-bubble', '.msg-card',
      '.location-card', '.transfer-card', '.msg-sticker'
    ]
  },
  {
    label: '底栏',
    items: [
      '.chat-input-area', '.chat-input-bar', '.chat-reply-btn', '.chat-action-reply',
      '.chat-input-wrap', '.chat-input', '.chat-input-actions', '.chat-input-icon',
      '.chat-action-voice', '.chat-action-emoji', '.chat-action-plus',
      '.chat-action-send'
    ]
  }
]

window.showTutorialPage = function() {
  var page = document.createElement('div')
  page.id = 'tutorial-page'
  page.className = 'full-page'
  page.innerHTML =
    '<div class="page-header">' +
      '<button class="header-back" onclick="window.closePage(\'tutorial-page\')">' +
        '<i class="fa fa-angle-left"></i>' +
      '</button>' +
      '<span class="header-title">教程</span>' +
    '</div>' +
    '<div class="settings-scroll tutorial-scroll">' +
      '<div class="setting-section tutorial-hero">' +
        '<div class="tutorial-hero-icon"><img src="img/wanwan.png" alt=""></div>' +
        '<div class="tutorial-hero-title">WANWAN</div>' +
        '<div class="tutorial-hero-desc">软件部分内容教程&答疑，不含基础新手教程</div>' +
      '</div>' +
      '<div class="setting-section">' +
        '<div class="section-title">数据同步教程</div>' +
        '<div class="tutorial-tip">新手建议Github，Cloudflare需要搭建后端，数据同步都需用到🪄</div>' +
        tutorialRow('row-github-tutorial', 'fa-brands fa-github', 'Github教程', '使用自己的 GitHub 私有仓库同步数据') +
        tutorialRow('row-cloudflare-tutorial', 'fa-brands fa-cloudflare', 'Cloudflare搭建教程', '部署自己的 Cloudflare 后端接口') +
      '</div>' +
      '<div class="setting-section">' +
        '<div class="section-title">长期记忆系统</div>' +
        '<div class="tutorial-tip">长期记忆会绑定当前微信账号和当前角色；不同微信账号聊同一角色，会拥有不同记忆。</div>' +
        tutorialRow('row-memory-settings-tutorial', 'fa-solid fa-chart-simple', '记忆设置', '了解聊天设置中的长期记忆选项') +
        tutorialRow('row-memory-values-tutorial', 'fa-solid fa-chart-line', '记忆数值设置', '了解记忆列表中的各项数值') +
        tutorialRow('row-memory-api-tutorial', 'fa-solid fa-bolt-lightning', 'API调用说明', '了解回复、总结和向量检索的调用次数') +
      '</div>' +
      '<div class="setting-section">' +
        '<div class="section-title">微信</div>' +
        '<div class="tutorial-tip">微信相关功能说明。</div>' +
        tutorialRow('row-thought-template-tutorial', 'fa-solid fa-heart', '创建心声模版', '自动生成Regex工具') +
        tutorialRow('row-chat-beauty-tutorial', 'fa-solid fa-wand-sparkles', '聊天页面美化', '使用 CSS 模板美化单个聊天页面') +
        tutorialRow('row-app-theme-tutorial', 'fa-solid fa-paintbrush', '主题页面美化', '使用 CSS 美化微信五个主题页面') +
      '</div>' +
      '<div class="setting-section">' +
        '<div class="section-title">iScreen</div>' +
        '<div class="tutorial-tip">桌面组件定制相关说明。</div>' +
        tutorialRow('row-custom-widget-tutorial', 'fa-solid fa-cube', '自定义 HTML 组件', '使用 HTML 生成可编辑的桌面组件') +
      '</div>' +
      '<div style="height:40px"></div>' +
    '</div>'
  window.openPage(page)
  page.querySelector('#row-github-tutorial').addEventListener('click', openGithubTutorialPage)
  page.querySelector('#row-cloudflare-tutorial').addEventListener('click', openCloudflareTutorialPage)
  page.querySelector('#row-memory-settings-tutorial').addEventListener('click', openMemorySettingsTutorialPage)
  page.querySelector('#row-memory-values-tutorial').addEventListener('click', openMemoryValuesTutorialPage)
  page.querySelector('#row-memory-api-tutorial').addEventListener('click', openMemoryApiTutorialPage)
  page.querySelector('#row-thought-template-tutorial').addEventListener('click', openThoughtTemplateTutorialPage)
  page.querySelector('#row-chat-beauty-tutorial').addEventListener('click', openChatBeautyTutorialPage)
  page.querySelector('#row-app-theme-tutorial').addEventListener('click', openAppThemeTutorialPage)
  page.querySelector('#row-custom-widget-tutorial').addEventListener('click', openCustomWidgetTutorialPage)
}

function openCustomWidgetTutorialPage() {
  var sampleHtml = [
    '<div style="display:flex;align-items:center;gap:12px;width:100%;height:100%;padding:14px;box-sizing:border-box;">',
    '  <img src="{avatar:头像}" style="width:56px;height:56px;border-radius:16px;object-fit:cover;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.12);">',
    '  <div style="flex:1;min-width:0;">',
    '    <div style="font-size:15px;font-weight:700;color:#3a3a3a;">{text:昵称}</div>',
    '    <div style="font-size:12px;color:#8a8f9c;margin-top:2px;">{text:签名}</div>',
    '    <div style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:#fff;font-size:11px;color:#c47b93;">{text:状态}</div>',
    '  </div>',
    '</div>'
  ].join('\n')
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">基础信息</div>' +
      '<div class="section-desc">在「iScreens → Widgets Gallery」里粘贴一段 HTML，即可创建一个自定义组件。若想使用AI制作组件，建议复制 占位符语法 + 示例组件 作为参考文件。</div>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">占位符语法</div>' +
      tutorialTermList([
        {
          title: '{avatar:名称}',
          desc: '可修改的图片/头像，写在 img 的 src 属性里，例如 &lt;img src="{avatar:头像}"&gt;。点击组件后可从相册选图替换。'
        },
        {
          title: '{text:名称}',
          desc: '可修改的文字，写在任意文字位置，例如 &lt;div&gt;{text:昵称}&lt;/div&gt;。未填写时默认显示名称本身。'
        },
        {
          title: '名称作用',
          desc: '冒号后的名称就是编辑弹窗里显示的字段名，可用中文；名称相同的占位符共享同一个值。'
        },
        {
          title: '注意事项',
          desc: '样式建议写成内联 style，宽高用 100% 自适应组件容器；出于安全考虑 &lt;script&gt; 和内联事件「onclick 等」会被自动移除。'
        }
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">使用步骤</div>' +
      tutorialSteps([
        '打开主页「iScreens → Widgets Gallery → 我的组件」，填名称、选尺寸「如 4x2」、粘贴 HTML，点「添加自定义组件」创建；也可选择「导入组件」导入 .json 组件文件。',
        '长按桌面空白处进入编辑模式，点击左上角「添加组件」，在弹窗底部「自定义组件」中点你创建的组件即可加到桌面，可重复添加多个。',
        '组件出现在桌面后，直接点击它即可打开编辑弹窗，修改头像和文字，每个组件的内容互相独立。',
        '想修改 HTML 源码时，回到「我的组件」点「编辑 HTML」；保存后桌面上的同款组件会一起更新，已填的头像和文字按名称保留。点击「导出」可以导出文件进行分享。',
        '不需要时，在桌面编辑模式下点组件角上的 ✕ 删除；Gallery 里删除组件不影响桌面上已添加的。'
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="tutorial-section-head">' +
        '<div class="section-title">示例组件</div>' +
        '<button class="tutorial-copy-btn" id="btn-copy-custom-widget" type="button">' +
          '<i class="fa-regular fa-clone"></i>复制示例</button>' +
      '</div>' +
      '<div class="section-desc">4x2 名片组件：可换头像 + 三段可改文字「昵称、签名、状态」。</div>' +
      '<pre class="tutorial-code tutorial-code-block"><code>' + tutorialEsc(sampleHtml) + '</code></pre>' +
    '</div>'
  var page = buildSubPage('sub-custom-widget-tutorial', '自定义 HTML 组件', html)
  openSubPage(page)
  page.querySelector('#btn-copy-custom-widget').addEventListener('click', function() {
    copyTutorialText(sampleHtml).then(function() {
      window.toast('示例 HTML 已复制')
    }).catch(function(err) {
      window.toast('复制失败：' + (err && err.message ? err.message : '请手动复制'))
    })
  })
}

function tutorialTermList(items) {
  return '<div class="tutorial-term-list">' + items.map(function(item) {
    return '<div class="tutorial-term">' +
      '<div class="tutorial-term-title">' + item.title + '</div>' +
      '<div class="tutorial-term-desc">' + item.desc + '</div>' +
    '</div>'
  }).join('') + '</div>'
}

function openMemorySettingsTutorialPage() {
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">记忆设置</div>' +
      '<div class="section-desc">这里说明的是微信聊天右上角「聊天设置」里的长期记忆选项。它们只作用于当前微信账号和当前角色的这一个私聊。</div>' +
      tutorialTermList([
        {
          title: '当前角色',
          desc: '显示这组长期记忆绑定的角色。相同角色被不同微信账号聊天时，会分别建立不同记忆。'
        },
        {
          title: '绑定记忆',
          desc: '当前微信账号和当前角色已经保存的长期记忆数量。这里的数量不等于聊天消息数量，而是 AI 总结后的记忆条目数量。'
        },
        {
          title: '自动总结',
          desc: '开启后，角色回复完成后会在后台检查是否达到总结阈值。达到阈值时会额外调用一次 Chat API，把最近一段聊天整理成长期记忆。'
        },
        {
          title: '每多少条消息总结',
          desc: '控制自动总结频率。例如设为 30，表示距离上次总结后新增消息达到 30 条时，后台进行一次总结。'
        },
        {
          title: '回复前读取记忆',
          desc: '控制角色每次回复前最多读取多少条长期记忆。例如设为 12，系统会在本地给记忆打分排序，最多选 12 条放进角色的系统提示词。没有设置 embedding 时，这一步不额外调用 Chat API。'
        },
        {
          title: '启用向量检索',
          desc: '开启后，系统会尝试使用向量 API 判断当前聊天和历史记忆的语义相似度。未配置或测试失败时，会自动降级为关键词、重要度、情绪强度和遗忘分检索。'
        },
        {
          title: '遗忘较慢 / 适中 / 较快',
          desc: '控制记忆随时间降低活跃度的速度。遗忘较慢会让旧记忆更久保持活跃；遗忘较快会让长期未被读取的记忆更快进入沉睡。'
        },
        {
          title: '查看这个角色的记忆',
          desc: '打开桌面「记忆」App，并自动筛选到当前微信账号、当前角色和当前聊天绑定的记忆。'
        }
      ]) +
    '</div>'
  var page = buildSubPage('sub-memory-settings-tutorial', '记忆设置', html)
  openSubPage(page)
}

function openMemoryValuesTutorialPage() {
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">记忆数值设置</div>' +
      '<div class="section-desc">这里说明的是「记忆」App 记忆列表中每条记忆的数值。它们用于回复前排序、遗忘曲线和状态判断。</div>' +
      tutorialTermList([
        {
          title: '重要度',
          desc: '范围 1-10。表示这条记忆对未来回复有多值得参考。关系变化、稳定偏好、身份背景通常更高；普通日常信息通常更低。没有 embedding 时，重要度仍会直接影响读取排序。'
        },
        {
          title: '效价',
          desc: '范围 -1 到 1。表示记忆整体偏负向、中性还是正向。-1 偏负向，0 中性，1 偏正向。它不是好坏评价，而是 Russell 情感模型中的情感方向。'
        },
        {
          title: '唤醒',
          desc: '范围 0-1。表示这条记忆的情绪或关系强度有多高，不区分正负。越平静越低；越涉及冲突、边界、强烈偏好或关系节点越高。'
        },
        {
          title: '遗忘分',
          desc: '系统根据重要度、被读取次数、上次读取时间和唤醒度计算出的当前活跃程度。分数越高，越容易被回复前读取；长期未被读取会降低。'
        },
        {
          title: '读取次数',
          desc: '这条记忆曾经被放入角色回复系统提示词的次数。读取次数越多，遗忘分下降越慢。'
        },
        {
          title: '上次读取时间',
          desc: '这条记忆最近一次被回复前读取的时间。距离现在越久，遗忘分通常越低。'
        },
        {
          title: '活跃',
          desc: '正常参与回复前读取和排序。活跃记忆更容易进入角色回复前的系统提示词。'
        },
        {
          title: '沉睡',
          desc: '还保留在记忆库里，但权重较低。相关度足够高或再次被读取时，可以重新变得活跃。'
        },
        {
          title: '归档',
          desc: '保留记录，但默认不再参与回复前读取，也不会进入角色系统提示词。适合旧设定、不想继续影响角色回复但暂时不想删除的记忆。'
        }
      ]) +
    '</div>'
  var page = buildSubPage('sub-memory-values-tutorial', '记忆数值设置', html)
  openSubPage(page)
}

function openMemoryApiTutorialPage() {
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">API 调用说明</div>' +
      '<div class="section-desc">没有启用 embedding 时，每次普通角色回复通常只调用一次 Chat API。达到自动总结阈值时，会在角色回复完成后后台额外调用一次 Chat API 生成记忆。启用 embedding 后，回复前可能额外调用一次向量 API；总结新记忆后也可能额外调用向量 API 保存语义坐标。</div>' +
    '</div>'
  var page = buildSubPage('sub-memory-api-tutorial', 'API调用说明', html)
  openSubPage(page)
}

function updateThoughtRegexTutorial(page) {
  if (!page) return
  var inputEl = page.querySelector('#thought-regex-sample')
  var outputEl = page.querySelector('#thought-regex-output')
  var statusEl = page.querySelector('#thought-regex-status')
  if (!inputEl || !outputEl || !statusEl) return
  var sample = String(inputEl.value || '')
  var regex = buildThoughtRegexFromSample(sample)
  outputEl.textContent = regex
  if (!sample.trim()) {
    statusEl.textContent = '等待输入'
  } else if (regex === '^([\\s\\S]+)$') {
    statusEl.textContent = '已使用兜底正则'
  } else {
    statusEl.textContent = '已生成可复制 Regex'
  }
}

function openThoughtTemplateTutorialPage() {
  var sampleText = '情绪：开心｜想法：我想你了'
  var sampleRegex = buildThoughtRegexFromSample(sampleText)
  var replaceExample = [
    '<div class="thought-card">',
    '  <div class="thought-line"><b>情绪</b><span>$1</span></div>',
    '  <div class="thought-line"><b>想法</b><span>$2</span></div>',
    '</div>'
  ].join('\n')
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">正则转换</div>' +
      '<div class="section-desc">这里填的是你想让 thought 输出出来的原文样子。教程会按“标题：内容”的简单结构，自动帮你生成可直接复制到「Regex 部分」的文本。</div>' +
      '<div class="tutorial-tip">想拆成多项时，尽量写成“标题：内容”这种格式。没有明显标题时，会自动退回到最简单的整段匹配。</div>' +
      '<div class="tutorial-converter-card">' +
        '<label class="tutorial-field-label" for="thought-regex-sample">输入示例原文</label>' +
        '<textarea class="tutorial-textarea" id="thought-regex-sample" rows="4" placeholder="例如：情绪：开心｜想法：我想你了"></textarea>' +
        '<div class="tutorial-converter-head">' +
          '<span class="tutorial-field-label">生成后的 Regex</span>' +
          '<button class="tutorial-copy-btn" id="btn-copy-thought-regex" type="button"><i class="fa-regular fa-clone"></i>复制</button>' +
        '</div>' +
        '<div class="tutorial-regex-output" id="thought-regex-output">^([\\s\\S]+)$</div>' +
        '<div class="tutorial-converter-status" id="thought-regex-status">等待输入</div>' +
      '</div>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="tutorial-section-head">' +
        '<div class="section-title">简单示例</div>' +
        '<button class="tutorial-copy-btn" id="btn-copy-thought-example" type="button">' +
          '<i class="fa-regular fa-clone"></i>复制示例</button>' +
      '</div>' +
      '<div class="tutorial-example-grid">' +
        '<div class="tutorial-example-block">' +
          '<div class="tutorial-example-title">示例原文</div>' +
          '<pre class="tutorial-code tutorial-code-block"><code>' + tutorialEsc(sampleText) + '</code></pre>' +
        '</div>' +
        '<div class="tutorial-example-block">' +
          '<div class="tutorial-example-title">自动生成的 Regex</div>' +
          '<pre class="tutorial-code tutorial-code-block"><code>' + tutorialEsc(sampleRegex) + '</code></pre>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">心声怎么做</div>' +
      '<div class="section-desc">最简单的理解就是三步：先让 AI 按固定格式写 thought，再用 Regex 把每一项拆开，最后用「正则替换部分」把它排成一个小面板。参考酒馆状态栏时，也可以把它理解成“把几项短信息排整齐”，不是额外能力。</div>' +
      tutorialTermList([
        {
          title: 'Prompt 部分',
          desc: '告诉 AI thought 应该按什么格式输出。比如：让 thought 输出“情绪：...｜想法：...｜状态：...”'
        },
        {
          title: 'Regex 部分',
          desc: '把 thought 原文拆成几块。最省事的做法，就是先写一段示例原文，再丢进上面的正则转换。'
        },
        {
          title: '正则替换部分',
          desc: '把拆出来的内容排版成卡片。$1、$2、$3 分别代表 Regex 抓到的第 1、2、3 项。'
        },
        {
          title: '测试文本 / 预览',
          desc: '把一段真实 thought 原文贴进去，看 Regex 有没有匹配到、排版是不是你想要的样子。'
        }
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">最小可用流程</div>' +
      tutorialSteps([
        '先想好你要显示哪几项，例如情绪、想法、状态。',
        '在 Prompt 部分要求 thought 固定输出这几项，顺序尽量不要变。',
        '把一段示例原文丢进上面的正则转换，拿到可复制的 Regex。',
        '在 正则替换部分 用 $1、$2、$3 排版成三行或三格信息卡。',
        '最后用 测试文本 和 预览 检查显示效果，不对就微调格式。'
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="tutorial-section-head">' +
        '<div class="section-title">示例模板</div>' +
        '<button class="tutorial-copy-btn" id="btn-copy-thought-replace" type="button">' +
          '<i class="fa-regular fa-clone"></i>复制替换</button>' +
      '</div>' +
      '<div class="tutorial-example-block">' +
        '<div class="tutorial-example-title">Prompt 示例</div>' +
        '<div class="tutorial-code">thought 必须按“情绪：...｜想法：...｜状态：...”输出，保持顺序固定。</div>' +
      '</div>' +
      '<div class="tutorial-example-block">' +
        '<div class="tutorial-example-title">Regex 示例</div>' +
        '<pre class="tutorial-code tutorial-code-block"><code>' + tutorialEsc(buildThoughtRegexFromSample('情绪：开心｜想法：我想你了｜状态：想见你')) + '</code></pre>' +
      '</div>' +
      '<div class="tutorial-example-block">' +
        '<div class="tutorial-example-title">正则替换部分示例</div>' +
        '<pre class="tutorial-code tutorial-code-block"><code>' + tutorialEsc(replaceExample) + '</code></pre>' +
      '</div>' +
    '</div>'
  var page = buildSubPage('sub-thought-template-tutorial', '创建心声模版', html)
  openSubPage(page)
  var sampleInput = page.querySelector('#thought-regex-sample')
  if (sampleInput) {
    sampleInput.addEventListener('input', function() {
      updateThoughtRegexTutorial(page)
    })
  }
  page.querySelector('#btn-copy-thought-regex').addEventListener('click', function() {
    var text = page.querySelector('#thought-regex-output').textContent || '^([\\s\\S]+)$'
    copyTutorialText(text).then(function() {
      window.toast('Regex 已复制')
    }).catch(function(err) {
      window.toast('复制失败：' + (err && err.message ? err.message : '请手动复制'))
    })
  })
  page.querySelector('#btn-copy-thought-example').addEventListener('click', function() {
    copyTutorialText(sampleText).then(function() {
      window.toast('示例原文已复制')
    }).catch(function(err) {
      window.toast('复制失败：' + (err && err.message ? err.message : '请手动复制'))
    })
  })
  page.querySelector('#btn-copy-thought-replace').addEventListener('click', function() {
    copyTutorialText(replaceExample).then(function() {
      window.toast('替换示例已复制')
    }).catch(function(err) {
      window.toast('复制失败：' + (err && err.message ? err.message : '请手动复制'))
    })
  })
  updateThoughtRegexTutorial(page)
}

function openChatBeautyTutorialPage() {
  var classGroups = window.WANWAN_CHAT_BEAUTY_CLASS_GROUPS
  var classGroupsHtml = classGroups.map(function(group) {
    return '<div class="setting-section">' +
      '<div class="section-title">参考类名 · ' + tutorialEsc(group.label) + '</div>' +
      '<div class="tutorial-class-list">' + group.items.map(function(name) {
        return '<code>' + tutorialEsc(name) + '</code>'
      }).join('') + '</div>' +
    '</div>'
  }).join('')
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">聊天页面美化</div>' +
      '<div class="section-desc">此页面用于生成微信聊天页面美化代码。生成后，请复制代码并前往「我 → 美化」创建 CSS 模板。</div>' +
    '</div>' +
    (window.buildChatBeautyGeneratorHTML ? window.buildChatBeautyGeneratorHTML() : '') +
    classGroupsHtml
  var page = buildSubPage('sub-chat-beauty-tutorial', '聊天页面美化', html)
  openSubPage(page)
  if (window.initChatBeautyGenerator) window.initChatBeautyGenerator(page)
}

function openAppThemeTutorialPage() {
  var classGroups = window.WANWAN_WECHAT_APP_THEME_CLASS_GROUPS || []
  var classGroupsHtml = classGroups.map(function(group) {
    var names = [group.root].concat(group.items || [])
    return '<div class="setting-section">' +
      '<div class="section-title">参考类名 · ' + tutorialEsc(group.label) + '</div>' +
      '<div class="tutorial-class-list">' + names.map(function(name) {
        return '<code>' + tutorialEsc(name) + '</code>'
      }).join('') + '</div>' +
    '</div>'
  }).join('')
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">主题页面美化</div>' +
      '<div class="section-desc">在主页打开「iScreen → APP Theme」输入 CSS，可美化 Messages、Contacts、Discovery、Moments、Personal Profile 五个微信页面。每条选择器必须以该页面的根类开头；聊天窗口和其他页面不会被修改。</div>' +
    '</div>' +
    classGroupsHtml
  var page = buildSubPage('sub-app-theme-tutorial', '主题页面美化', html)
  openSubPage(page)
}

function openGithubTutorialPage() {
  var html =
    '<div class="setting-section">' +
      '<div class="section-title">准备内容</div>' +
      '<div class="section-desc">GitHub 方式适合新手：不用自己写后端，只需要一个私有仓库和一个可读写文件的 Token。</div>' +
      tutorialSteps([
        '打开 GitHub，新建一个私有仓库，例如 wanwan-sync。',
        '创建 Fine-grained personal access token，只授权刚刚的仓库。',
        '在 Token 权限里把 Contents 设置为 Read and write。',
        '回到弯弯，打开 设置 → 数据管理 → 同步设置。',
        '同步方式选择 GitHub，填写 Token、仓库、分支和同步文件路径。',
        '保存后先点“上传到同步后端”，以后其他设备可以点“从同步后端下载”。'
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">填写示例</div>' +
      '<div class="tutorial-code">仓库：username/wanwan-sync<br>分支：main<br>同步文件路径：wanwan-sync.json</div>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">提醒</div>' +
      '<div class="section-desc">Token 只保存在你的设备里。仓库建议保持 Private。每次上传都会覆盖同一个同步文件。</div>' +
    '</div>'
  var page = buildSubPage('sub-github-tutorial', 'Github教程', html)
  openSubPage(page)
}

function openCloudflareTutorialPage() {
  var workerCode = [
    'export default {',
    '  async fetch(request, env) {',
    '    const url = new URL(request.url)',
    '    const token = request.headers.get("Authorization") || ""',
    '    if (token !== "Bearer " + env.SYNC_TOKEN) {',
    '      return Response.json({ message: "Unauthorized" }, { status: 401 })',
    '    }',
    '    const key = "wanwan-sync.json"',
    '    const headers = { "Access-Control-Allow-Origin": "*" }',
    '    if (request.method === "OPTIONS") return new Response(null, { headers })',
    '    if (url.pathname === "/sync/status") {',
    '      const obj = await env.WANWAN_SYNC.head(key)',
    '      return Response.json({ exists: !!obj, updatedAt: obj && obj.customMetadata && obj.customMetadata.updatedAt, size: obj && obj.size }, { headers })',
    '    }',
    '    if (url.pathname === "/sync/data" && request.method === "GET") {',
    '      const obj = await env.WANWAN_SYNC.get(key)',
    '      if (!obj) return Response.json({ message: "No sync data" }, { status: 404, headers })',
    '      return new Response(await obj.text(), { headers: { ...headers, "Content-Type": "application/json" } })',
    '    }',
    '    if (url.pathname === "/sync/data" && request.method === "PUT") {',
    '      const updatedAt = Date.now()',
    '      await env.WANWAN_SYNC.put(key, await request.text(), { httpMetadata: { contentType: "application/json" }, customMetadata: { updatedAt: String(updatedAt) } })',
    '      return Response.json({ ok: true, updatedAt }, { headers })',
    '    }',
    '    return Response.json({ message: "Not found" }, { status: 404, headers })',
    '  }',
    '}'
  ].join('\n')

  var html =
    '<div class="setting-section">' +
      '<div class="section-title">准备内容</div>' +
      '<div class="section-desc">Cloudflare 方式需要自己搭建后端。推荐使用 Worker + R2，把完整同步 JSON 存成一个对象。</div>' +
      tutorialSteps([
        '在 Cloudflare R2 新建 Bucket，例如 wanwan-sync。',
        '新建一个 Worker，例如 wanwan-sync-api。',
        '给 Worker 绑定 R2 Bucket，Binding 名称填写 WANWAN_SYNC。',
        '给 Worker 添加环境变量 SYNC_TOKEN，值设置成你自己的长密码。',
        '把下面的 Worker 示例代码粘贴进去并部署。',
        '回到弯弯，打开 设置 → 数据管理 → 同步设置，选择 Cloudflare，填写 Worker 地址和 SYNC_TOKEN。'
      ]) +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">接口约定</div>' +
      '<div class="tutorial-code">GET /sync/status<br>GET /sync/data<br>PUT /sync/data</div>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="tutorial-section-head">' +
        '<div class="section-title">Worker 示例</div>' +
        '<button class="tutorial-copy-btn" id="btn-copy-worker" type="button">' +
          '<i class="fa-regular fa-clone"></i>复制</button>' +
      '</div>' +
      '<pre class="tutorial-code tutorial-code-block" id="worker-code-example"><code>' + tutorialEsc(workerCode) + '</code></pre>' +
    '</div>' +
    '<div class="setting-section">' +
      '<div class="section-title">提醒</div>' +
      '<div class="section-desc">Cloudflare 后端由你自己维护。每次上传都会覆盖 R2 里的 wanwan-sync.json。</div>' +
    '</div>'
  var page = buildSubPage('sub-cloudflare-tutorial', 'Cloudflare搭建教程', html)
  openSubPage(page)
  page.querySelector('#btn-copy-worker').addEventListener('click', function() {
    copyTutorialText(workerCode).then(function() {
      window.toast('Worker 示例已复制')
    }).catch(function(err) {
      window.toast('复制失败：' + (err && err.message ? err.message : '请手动复制'))
    })
  })
}
