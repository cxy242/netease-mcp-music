// about.js — 关于本机页面
// 依赖：main.js（免责声明）、settings.js（子页面构建器）

window.openAboutDevicePage = function() {
  var existing = document.getElementById('sub-about-device')
  if (existing) return

  var html =
    '<div class="setting-section">' +
      '<div class="list-row clickable" id="row-about-disclaimer">' +
        '<div class="row-icon-box"><i class="fa-solid fa-shield-halved"></i></div>' +
        '<div class="row-body"><div class="row-label">免责声明</div></div>' +
        '<i class="fa fa-angle-right row-chevron"></i>' +
      '</div>' +
    '</div>'

  var page = buildSubPage('sub-about-device', '关于本机', html)
  openSubPage(page)
  page.querySelector('#row-about-disclaimer').addEventListener('click', function() {
    if (window.showDisclaimer) window.showDisclaimer({ mode: 'view' })
  })
}
