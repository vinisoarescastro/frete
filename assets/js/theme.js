/* Tema claro/escuro (mesma convenção do design system: data-theme no <html>, chave "theme" no localStorage). */
(function () {
  var root = document.documentElement, KEY = 'theme';
  function preferred() {
    try { var t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch (e) { /* ignora */ }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      var use = btn.querySelector('use');
      if (use) use.setAttribute('href', '/assets/icons.svg#' + (theme === 'dark' ? 'sun' : 'moon'));
      btn.setAttribute('aria-label', theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro');
    });
  }
  apply(preferred());
  document.addEventListener('DOMContentLoaded', function () { apply(root.dataset.theme); });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (err) { /* ignora */ }
    apply(next);
  });
})();
