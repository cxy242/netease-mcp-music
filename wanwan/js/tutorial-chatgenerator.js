// tutorial-chatgenerator.js — 教程页「聊天页面美化」可视化 CSS 生成器

(function() {
  'use strict'

  var bottomIconDefs = [
    { key: 'reply', label: '回复', selector: '.chat-reply-btn, .chat-action-reply' },
    { key: 'voice', label: '语音', selector: '.chat-action-voice' },
    { key: 'emoji', label: '表情', selector: '.chat-action-emoji' },
    { key: 'plus', label: '更多', selector: '.chat-action-plus' },
    { key: 'send', label: '发送', selector: '.chat-action-send' }
  ]

  function imageControl(id, placeholder) {
    return '<div class="cbg-image-control" data-cbg-image-control="' + id + '">' +
      '<input class="input-field cbg-image-url" id="' + id + '" data-cbg-control placeholder="' + placeholder + '">' +
      '<button class="btn-ghost cbg-mini-btn cbg-upload-btn" type="button">上传</button>' +
      '<button class="btn-ghost cbg-mini-btn cbg-clear-image" type="button">清空</button>' +
      '<input class="cbg-file-input" type="file" accept="image/*" hidden>' +
    '</div>'
  }

  function field(label, control, wide) {
    return '<div class="cbg-field' + (wide ? ' cbg-field-wide' : '') + '">' +
      '<label class="cbg-field-label">' + label + '</label>' + control +
    '</div>'
  }

  function rangeControl(id, min, max, value) {
    return '<input id="' + id + '" data-cbg-control type="range" min="' + min + '" max="' + max + '" value="' + value + '">'
  }

  function selectControl(id, options) {
    return '<select class="input-field cbg-select" id="' + id + '" data-cbg-control>' + options.map(function(option) {
      return '<option value="' + option[0] + '"' + (option[2] ? ' selected' : '') + '>' + option[1] + '</option>'
    }).join('') + '</select>'
  }

  function colorControl(id, value) {
    return '<input class="input-field cbg-color" id="' + id + '" data-cbg-control type="color" value="' + value + '">'
  }

  function badgeLabel(text, id) {
    return text + ' <span class="cbg-value-badge" data-cbg-value-for="' + id + '"></span>'
  }

  function iconEditor(idPrefix, label) {
    return '<div class="cbg-icon-row">' +
      '<span class="cbg-icon-name">' + label + '</span>' +
      imageControl(idPrefix + 'Image', '图片 URL / 上传') +
      selectControl(idPrefix + 'Mode', [
        ['default', '默认'], ['replace', '替换'], ['hide', '隐藏']
      ]) +
    '</div>'
  }

  function stickerEditor(side, pseudo, title) {
    var prefix = side + (pseudo === 'before' ? 'Before' : 'After')
    return '<div class="cbg-divider"></div>' +
      '<div class="cbg-subhead">' + title + '</div>' +
      '<div class="cbg-grid">' +
        field('贴图图片', imageControl(prefix + 'Image', '粘贴图片 URL，或从本地上传'), true) +
        field(badgeLabel('大小', prefix + 'Size'), rangeControl(prefix + 'Size', 12, 100, 36)) +
        field(badgeLabel('旋转', prefix + 'Rotate'), rangeControl(prefix + 'Rotate', -180, 180, 0)) +
        field(badgeLabel('左右位置', prefix + 'X'), rangeControl(prefix + 'X', -80, 160, pseudo === 'before' ? -18 : 80)) +
        field(badgeLabel('上下位置', prefix + 'Y'), rangeControl(prefix + 'Y', -80, 100, -18)) +
      '</div>'
  }

  function section(title, sub, body, extraHead) {
    return '<div class="setting-section cbg-card">' +
      '<div class="cbg-section-head"><div><div class="section-title">' + title + '</div>' +
      (sub ? '<div class="cbg-section-sub">' + sub + '</div>' : '') + '</div>' + (extraHead || '') + '</div>' +
      '<div class="cbg-section-body">' + body + '</div>' +
    '</div>'
  }

  window.buildChatBeautyGeneratorHTML = function() {
    var alignOptions = [['left', '靠左'], ['center', '居中', true], ['right', '靠右']]
    var imageSizeOptions = [['cover', '铺满'], ['contain', '完整显示'], ['auto', '原始大小']]
    var headerBody = '<div class="cbg-grid">' +
      field(badgeLabel('高度', 'headerHeight'), rangeControl('headerHeight', 52, 130, 68)) +
      field(badgeLabel('透明度', 'headerOpacity'), rangeControl('headerOpacity', 0, 100, 100)) +
      field('背景颜色', colorControl('headerColor', '#ffffff')) +
      field('背景图片方式', selectControl('headerImageSize', imageSizeOptions)) +
      field('背景图片', imageControl('headerImage', '粘贴图片 URL，或从本地上传'), true) +
    '</div>' +
    '<div class="cbg-divider"></div><div class="cbg-subhead">标题位置</div><div class="cbg-grid">' +
      field('对齐', selectControl('titleAlign', alignOptions)) +
      field(badgeLabel('左右偏移', 'titleX'), rangeControl('titleX', -80, 80, 0)) +
      field(badgeLabel('上下偏移', 'titleY'), rangeControl('titleY', -25, 25, 0), true) +
    '</div>' +
    '<div class="cbg-subhead cbg-subhead-space">状态位置</div><div class="cbg-grid">' +
      field('对齐', selectControl('statusAlign', alignOptions)) +
      field(badgeLabel('左右偏移', 'statusX'), rangeControl('statusX', -80, 80, 0)) +
      field(badgeLabel('上下偏移', 'statusY'), rangeControl('statusY', -25, 25, 0), true) +
    '</div>' +
    '<div class="cbg-divider"></div><div class="cbg-subhead">顶栏图标</div>' +
      iconEditor('back', '返回键') + iconEditor('settings', '设置键')

    var selfBody = '<div class="cbg-grid">' +
      field('气泡颜色', colorControl('selfColor', '#8c8c8c')) +
      field(badgeLabel('气泡圆角角度', 'selfRadius'), rangeControl('selfRadius', 0, 40, 8)) +
      field('文字颜色', colorControl('selfTextColor', '#ffffff'), true) +
    '</div>' + stickerEditor('self', 'before', '贴图1号') + stickerEditor('self', 'after', '贴图2号')

    var sameSwitch = '<label class="cbg-switch" title="与发送方一致"><input id="sameAsSelf" data-cbg-control type="checkbox"><span></span></label>'
    var otherBody = '<div id="cbg-other-body"><div class="cbg-grid">' +
      field('气泡颜色', colorControl('otherColor', '#ffffff')) +
      field(badgeLabel('气泡圆角角度', 'otherRadius'), rangeControl('otherRadius', 0, 40, 8)) +
      field('文字颜色', colorControl('otherTextColor', '#3a3a3a'), true) +
    '</div>' + stickerEditor('other', 'before', '贴图1号') + stickerEditor('other', 'after', '贴图2号') + '</div>'

    var bottomBody = '<div class="cbg-grid">' +
      field(badgeLabel('高度', 'bottomHeight'), rangeControl('bottomHeight', 52, 130, 64)) +
      field(badgeLabel('透明度', 'bottomOpacity'), rangeControl('bottomOpacity', 0, 100, 100)) +
      field('背景颜色', colorControl('bottomColor', '#ffffff')) +
      field('背景图片方式', selectControl('bottomImageSize', imageSizeOptions)) +
      field('背景图片', imageControl('bottomImage', '粘贴图片 URL，或从本地上传'), true) +
    '</div><div class="cbg-divider"></div><div class="cbg-subhead">底栏图标</div>' +
      bottomIconDefs.map(function(def) {
        return iconEditor('bottom' + def.key.charAt(0).toUpperCase() + def.key.slice(1), def.label)
      }).join('')

    var outputBody = '<div class="cbg-output-head"><span class="cbg-output-label">自动生成 CSS</span>' +
      '<div class="cbg-output-actions"><button class="btn-ghost" id="btn-cbg-reset" type="button">恢复默认</button>' +
      '<button class="btn-ghost" id="btn-cbg-select" type="button">全选</button></div></div>' +
      '<textarea class="input-field cbg-code-output" id="cbg-code-output" readonly spellcheck="false"></textarea>' +
      '<div class="cbg-primary-actions"><button class="btn-ghost btn-full" id="btn-cbg-preview" type="button">展示预览</button>' +
      '<button class="btn-pill btn-full" id="btn-cbg-copy" type="button">复制代码</button></div>'

    return '<div id="chat-beauty-generator" class="cbg-generator">' +
      section('顶栏', '调整尺寸、背景、标题与在线状态的位置', headerBody) +
      section('发送方气泡', '设置颜色、圆角，以及 before / after 两张贴图', selfBody) +
      section('接收方气泡', '可以单独设置，也可以直接同步发送方样式', otherBody, sameSwitch) +
      section('底栏', '更换背景，并单独替换或隐藏每一个图标', bottomBody) +
      section('生成结果', '复制后可粘贴到微信「我 → 美化」的新建或编辑页面', outputBody) +
    '</div>'
  }

  function hexToRgba(hex, opacity) {
    var normalized = String(hex || '#ffffff').replace('#', '')
    if (normalized.length === 3) normalized = normalized.split('').map(function(c) { return c + c }).join('')
    var int = parseInt(normalized, 16)
    var alpha = (opacity / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return 'rgba(' + ((int >> 16) & 255) + ', ' + ((int >> 8) & 255) + ', ' + (int & 255) + ', ' + alpha + ')'
  }

  function escUrl(url) {
    return String(url || '').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n|\r/g, '')
  }

  function cssUrl(url) {
    return url ? 'url("' + escUrl(url) + '")' : 'none'
  }

  function alignValue(value) {
    return value === 'left' ? 'flex-start' : value === 'right' ? 'flex-end' : 'center'
  }

  function copyText(text) {
    if (window.copyTutorialText) return window.copyTutorialText(text)
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text)
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

  window.initChatBeautyGenerator = function(page) {
    var root = page && page.querySelector('#chat-beauty-generator')
    if (!root) return
    var defaults = {}
    var controls = Array.prototype.slice.call(root.querySelectorAll('[data-cbg-control]'))
    controls.forEach(function(control) {
      defaults[control.id] = control.type === 'checkbox' ? control.checked : control.value
    })

    function byId(id) { return root.querySelector('#' + id) }
    function value(id) { return byId(id).value }
    function number(id) { return Number(value(id)) }
    function checked(id) { return byId(id).checked }

    function getSticker(side, pseudo) {
      var sourceSide = side === 'other' && checked('sameAsSelf') ? 'self' : side
      var prefix = sourceSide + (pseudo === 'before' ? 'Before' : 'After')
      return {
        image: value(prefix + 'Image').trim(), size: number(prefix + 'Size'),
        rotate: number(prefix + 'Rotate'), x: number(prefix + 'X'), y: number(prefix + 'Y')
      }
    }

    function stickerCss(selector, pseudo, config) {
      if (!config.image) return ''
      return '\n' + selector + '::' + pseudo + ' {\n' +
        '  content: "";\n  position: absolute;\n  z-index: 3;\n' +
        '  left: ' + config.x + 'px;\n  top: ' + config.y + 'px;\n' +
        '  width: ' + config.size + 'px;\n  height: ' + config.size + 'px;\n' +
        '  background: ' + cssUrl(config.image) + ' center / contain no-repeat;\n' +
        '  transform: rotate(' + config.rotate + 'deg);\n  pointer-events: none;\n}\n'
    }

    function iconCss(selector, mode, image) {
      if (mode === 'default' || (mode === 'replace' && !image)) return ''
      var lines = ['', selector + ' {', '  color: transparent !important;', '  font-size: 0 !important;']
      if (mode === 'replace' && image) {
        lines.push('  background-image: ' + cssUrl(image) + ' !important;')
        lines.push('  background-position: center !important;')
        lines.push('  background-size: contain !important;')
        lines.push('  background-repeat: no-repeat !important;')
      }
      lines.push('}', selector + ' > * { visibility: hidden !important; }')
      lines.push('/* 按钮本身没有被移除，点击功能仍然保留 */')
      return lines.join('\n') + '\n'
    }

    function buildCss() {
      var same = checked('sameAsSelf')
      var otherColor = same ? value('selfColor') : value('otherColor')
      var otherText = same ? value('selfTextColor') : value('otherTextColor')
      var otherRadius = same ? number('selfRadius') : number('otherRadius')
      var headerImage = value('headerImage').trim()
      var bottomImage = value('bottomImage').trim()
      var css = [
        '/* WANWAN · 微信聊天美化生成器 */',
        ':root {',
        '  --chat-header-height: calc(' + number('headerHeight') + 'px + env(safe-area-inset-top));',
        '  --chat-input-overlay-height: calc(' + number('bottomHeight') + 'px + env(safe-area-inset-bottom) + var(--chat-bottom-safe-extra));',
        '}', '', '/* 顶栏 */', '.chat-header {',
        '  height: var(--chat-header-height);',
        '  background-color: ' + hexToRgba(value('headerColor'), number('headerOpacity')) + ';',
        '  background-image: ' + cssUrl(headerImage) + ';',
        '  background-size: ' + value('headerImageSize') + ';',
        '  background-position: center;', '  background-repeat: no-repeat;', '}',
        '.chat-header-info {', '  align-items: ' + alignValue(value('titleAlign')) + ';',
        '  text-align: ' + value('titleAlign') + ';',
        '  transform: translate(' + number('titleX') + 'px, ' + number('titleY') + 'px);', '}',
        '.chat-header-status {', '  align-self: ' + alignValue(value('statusAlign')) + ';',
        '  transform: translate(' + number('statusX') + 'px, ' + number('statusY') + 'px);', '}',
        iconCss('.chat-header .header-back', value('backMode'), value('backImage').trim()).trimEnd(),
        iconCss('.chat-header #btn-chat-settings', value('settingsMode'), value('settingsImage').trim()).trimEnd(),
        '', '/* 聊天气泡 */', '.msg-bubble {', '  position: relative;', '  overflow: visible;', '}',
        '.bubble-self {', '  background: ' + value('selfColor') + ';', '  color: ' + value('selfTextColor') + ';',
        '  border-radius: ' + number('selfRadius') + 'px;', '}',
        '.bubble-other {', '  background: ' + otherColor + ';', '  color: ' + otherText + ';',
        '  border-radius: ' + otherRadius + 'px;', '}'
      ].join('\n')
      css += stickerCss('.bubble-self', 'before', getSticker('self', 'before'))
      css += stickerCss('.bubble-self', 'after', getSticker('self', 'after'))
      css += stickerCss('.bubble-other', 'before', getSticker('other', 'before'))
      css += stickerCss('.bubble-other', 'after', getSticker('other', 'after'))
      css += '\n/* 底栏 */\n.chat-input-area,\n.chat-input-bar {\n' +
        '  background-color: ' + hexToRgba(value('bottomColor'), number('bottomOpacity')) + ';\n' +
        '  background-image: ' + cssUrl(bottomImage) + ';\n' +
        '  background-size: ' + value('bottomImageSize') + ';\n' +
        '  background-position: center;\n  background-repeat: no-repeat;\n}\n' +
        '.chat-input-bar {\n  min-height: ' + number('bottomHeight') + 'px;\n}\n'
      bottomIconDefs.forEach(function(def) {
        var cap = def.key.charAt(0).toUpperCase() + def.key.slice(1)
        css += iconCss(def.selector, value('bottom' + cap + 'Mode'), value('bottom' + cap + 'Image').trim())
      })
      return css.replace(/\n{3,}/g, '\n\n').trim() + '\n'
    }

    function syncBadges() {
      root.querySelectorAll('[data-cbg-value-for]').forEach(function(badge) {
        var id = badge.getAttribute('data-cbg-value-for')
        var control = byId(id)
        var lower = id.toLowerCase()
        var suffix = lower.indexOf('opacity') !== -1 ? '%' : lower.indexOf('rotate') !== -1 ? '°' : 'px'
        var prefix = Number(control.value) > 0 && (id.endsWith('X') || id.endsWith('Y')) ? '+' : ''
        badge.textContent = prefix + control.value + suffix
      })
    }

    function updateAll() {
      syncBadges()
      byId('cbg-other-body').classList.toggle('cbg-disabled', checked('sameAsSelf'))
      byId('cbg-code-output').value = buildCss()
    }

    root.querySelectorAll('[data-cbg-image-control]').forEach(function(wrap) {
      var target = byId(wrap.getAttribute('data-cbg-image-control'))
      var fileInput = wrap.querySelector('.cbg-file-input')
      wrap.querySelector('.cbg-upload-btn').addEventListener('click', function() { fileInput.click() })
      wrap.querySelector('.cbg-clear-image').addEventListener('click', function() {
        target.value = ''
        fileInput.value = ''
        updateAll()
      })
      fileInput.addEventListener('change', function() {
        var file = fileInput.files && fileInput.files[0]
        if (!file) return
        if (!file.type.startsWith('image/')) { window.toast('请选择图片文件'); return }
        var reader = new FileReader()
        reader.onload = function() {
          target.value = reader.result
          updateAll()
          window.toast('图片已载入')
        }
        reader.readAsDataURL(file)
      })
    })

    root.addEventListener('input', function(event) {
      if (event.target.matches('[data-cbg-control]')) updateAll()
    })
    root.addEventListener('change', function(event) {
      if (event.target.matches('[data-cbg-control]')) updateAll()
    })
    byId('btn-cbg-reset').addEventListener('click', function() {
      Object.keys(defaults).forEach(function(id) {
        var control = byId(id)
        if (control.type === 'checkbox') control.checked = defaults[id]
        else control.value = defaults[id]
      })
      root.querySelectorAll('.cbg-file-input').forEach(function(input) { input.value = '' })
      updateAll()
      window.toast('已恢复默认设置')
    })
    byId('btn-cbg-select').addEventListener('click', function() {
      var output = byId('cbg-code-output')
      output.focus()
      output.select()
      window.toast('代码已全选')
    })
    byId('btn-cbg-copy').addEventListener('click', function() {
      copyText(byId('cbg-code-output').value).then(function() {
        window.toast('CSS 已复制')
      }).catch(function() {
        window.toast('复制失败，请手动全选复制')
      })
    })
    byId('btn-cbg-preview').addEventListener('click', function() {
      if (!window.openChatBeautyCssPreview) { window.toast('预览功能尚未加载'); return }
      window.openChatBeautyCssPreview(byId('cbg-code-output').value)
    })
    updateAll()
  }
})()
