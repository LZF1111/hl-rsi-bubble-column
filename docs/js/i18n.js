/* Bilingual UI: 中 / EN / 双语. L() returns markup for both languages; Lt() returns plain text for SVG/canvas. */
(function () {
  const KEY = 'hlflow.lang2';
  let mode = localStorage.getItem(KEY) || 'bi';
  const listeners = [];
  function apply() {
    document.documentElement.classList.remove('lang-zh', 'lang-en', 'lang-bi');
    document.documentElement.classList.add('lang-' + mode);
    document.documentElement.lang = mode === 'en' ? 'en' : 'zh-CN';
    document.querySelectorAll('.langsw button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === mode));
  }
  window.L = (zh, en) => `<span class="zh">${zh}</span><span class="en">${en == null ? zh : en}</span>`;
  window.Lt = (zh, en) => mode === 'en' ? (en == null ? zh : en) : mode === 'bi' && en ? `${zh} · ${en}` : zh;
  window.Lang = {
    get: () => mode,
    set(m) { mode = m; localStorage.setItem(KEY, m); apply(); listeners.forEach(f => f(m)); },
    on(f) { listeners.push(f); },
    switcher() {
      return `<div class="langsw" role="group" aria-label="Language">${[['zh', '中'], ['en', 'EN'], ['bi', '中/EN']].map(([k, t]) => `<button data-lang="${k}" aria-pressed="${k === mode}">${t}</button>`).join('')}</div>`;
    },
    bind(root) { (root || document).querySelectorAll('.langsw button').forEach(b => b.onclick = () => Lang.set(b.dataset.lang)); apply(); },
  };
  apply();
})();
