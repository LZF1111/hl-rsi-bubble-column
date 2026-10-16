/* App controller: data loading, sidebar routing, hero animation. */
(function () {
  const RUNS = ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02', 'hl_h200_nohint01', 'hl_h200_nohint02'];
  const VIEWS = Object.assign({}, window.TaskViews, window.EvoViews);
  const stage = document.getElementById('stage');
  const state = { meta: null, runs: {}, run: null, view: 'goal', round: null, playing: false, timer: null };

  const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

  function ctx() {
    return { meta: state.meta, run: state.run, round: state.round, playing: state.playing, go, togglePlay };
  }

  function render(keepScroll) {
    const fn = VIEWS[state.view];
    stage.innerHTML = fn(ctx());
    if (fn.after) fn.after(ctx());
    document.querySelectorAll('.sidebar [data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === state.view);
      b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false');
    });
    document.querySelectorAll('.run-list button').forEach(b => b.classList.toggle('active', b.dataset.run === state.run.run));
    const h = `#${state.view}/${state.run.run}${state.view === 'round' ? '/' + state.round : ''}`;
    if (location.hash !== h) history.replaceState(null, '', h);
    if (!keepScroll) {
      const top = document.getElementById('console').getBoundingClientRect().top + scrollY - 56;
      if (Math.abs(scrollY - top) > 40 && scrollY > top - 200) window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function go(view, round, keepScroll) {
    if (view !== 'round') stopPlay();
    state.view = view;
    if (round != null) state.round = round;
    if (view === 'round' && state.round == null) state.round = (state.run.rounds.find(r => r.decision === 'accepted') || state.run.rounds[0]).round;
    render(keepScroll);
  }

  function stopPlay() { state.playing = false; clearInterval(state.timer); }
  function togglePlay() {
    if (state.playing) { stopPlay(); render(true); return; }
    state.playing = true;
    const R = state.run.rounds;
    let i = R.findIndex(r => r.round === state.round);
    if (i >= R.length - 1) i = -1;
    const step = () => {
      i += 1;
      if (i >= R.length) { stopPlay(); render(true); return; }
      state.round = R[i].round; render(true);
    };
    step();
    state.timer = setInterval(step, 2200);
  }

  function selectRun(name) {
    state.run = state.runs[name];
    state.round = null;
    go(state.view);
  }

  function runList() {
    const L = window.U.RUN_LABEL;
    document.getElementById('runList').innerHTML = RUNS.map(n => {
      const r = state.runs[n], ft = r.final_test;
      return `<button data-run="${n}"><span>${L[n][0]}<br><small>留出 ${ft ? window.U.f3(ft.mean_gain_vs_fixed) : '—'} · ${r.rounds_total} 轮</small></span><span class="tag">${L[n][1]}</span></button>`;
    }).join('');
    document.querySelectorAll('.run-list button').forEach(b => b.onclick = () => selectRun(b.dataset.run));
  }

  function heroStats() {
    const all = RUNS.map(n => state.runs[n]);
    document.getElementById('kRounds').textContent = all.reduce((a, r) => a + r.rounds_total, 0);
    document.getElementById('kSegments').textContent = (all.reduce((a, r) => a + r.segments, 0) / 1000).toFixed(0) + 'k';
    const best = Math.max(...all.map(r => r.final_test ? r.final_test.mean_gain_vs_fixed : -99));
    document.getElementById('kBest').textContent = '+' + best.toFixed(2);
  }

  /* Hero: column with bubbles; inlets morph from equal flow to the learned centre-to-sides redistribution. */
  function hero() {
    const box = document.getElementById('heroColumn');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W = 760, H = 340, x0 = 300, w = 160, top = 20, bot = 300, water = bot - (bot - top) * 0.7;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="hw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3f0ff"/><stop offset="1" stop-color="#9ccaf7"/></linearGradient></defs>
      <rect x="${x0}" y="${water}" width="${w}" height="${bot - water}" fill="url(#hw)" rx="2"/>
      <g id="hb"></g>
      <rect x="${x0}" y="${top}" width="${w}" height="${bot - top}" fill="none" stroke="#1d1d1f" stroke-width="3" rx="3"/>
      ${[0, 1, 2].map(i => `<rect id="hi${i}" x="${x0 + i * w / 3 + 3}" y="${bot + 4}" width="${w / 3 - 6}" height="8" rx="3" fill="${['#2f7cf6', '#f5a623', '#e14b8a'][i]}"/>`).join('')}
      <text id="hl" x="${x0 + w / 2}" y="${bot + 32}" text-anchor="middle" font-size="13" fill="#6e6e73"></text>
      <text x="${x0 - 30}" y="${water + 4}" text-anchor="end" font-size="12" fill="#6e6e73">均匀布气：气往中间卷</text>
      <text x="${x0 + w + 30}" y="${water + 4}" font-size="12" fill="#0071e3">充满后：中间 → 两侧</text></svg>`;
    if (reduce) return;
    const g = box.querySelector('#hb'), lab = box.querySelector('#hl'), bubbles = [];
    let t = 0;
    const NS = 'http://www.w3.org/2000/svg';
    const u = () => { const ph = (t % 16) / 16, s = ph < 0.3 ? 0 : ph < 0.45 ? (ph - 0.3) / 0.15 : ph < 0.9 ? 1 : 1 - (ph - 0.9) / 0.1; return [30 + 5 * s, 30 - 9 * s, 30 + 4 * s]; };
    function tick() {
      t += 0.04;
      const v = u();
      v.forEach((x, i) => { const r = box.querySelector('#hi' + i); r.setAttribute('height', 4 + (x - 10) / 40 * 14); });
      lab.textContent = `L ${v[0].toFixed(1)} · C ${v[1].toFixed(1)} · R ${v[2].toFixed(1)} mm/s`;
      for (let i = 0; i < 3; i++) if (Math.random() < v[i] / 110) {
        const c = document.createElementNS(NS, 'circle');
        const b = { el: c, x: x0 + w * (i + 0.15 + Math.random() * 0.7) / 3, y: bot - 4, r: 1.6 + Math.random() * 2.6, vx: 0 };
        c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#5a9be6'); c.setAttribute('stroke-width', '0.8'); c.setAttribute('opacity', '0.9');
        g.appendChild(c); bubbles.push(b);
      }
      const centreFed = v[1] > 27;
      for (let k = bubbles.length - 1; k >= 0; k--) {
        const b = bubbles[k], rel = (b.x - x0) / w - 0.5;
        b.vx += (centreFed ? -rel * 0.05 : rel * 0.012) + (Math.random() - 0.5) * 0.15;
        b.vx *= 0.92; b.x = Math.max(x0 + 4, Math.min(x0 + w - 4, b.x + b.vx)); b.y -= 1.1 + b.r * 0.25;
        if (b.y < water) { b.el.remove(); bubbles.splice(k, 1); continue; }
        b.el.setAttribute('cx', b.x.toFixed(1)); b.el.setAttribute('cy', b.y.toFixed(1)); b.el.setAttribute('r', b.r);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function loopRing() {
    const li = [...document.querySelectorAll('#loopRing li')];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    setInterval(() => { li.forEach((l, k) => l.classList.toggle('on', k === i)); i = (i + 1) % li.length; }, 1400);
  }

  document.querySelectorAll('.sidebar [data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
  hero(); loopRing();
  stage.innerHTML = '<p class="note">加载数据…</p>';
  Promise.all([getJSON('data/meta.json'), ...RUNS.map(n => getJSON(`data/runs/${n}.json`))]).then(([meta, ...runs]) => {
    state.meta = meta;
    runs.forEach(r => { state.runs[r.run] = window.annotateRun(r); });
    runList(); heroStats();
    const [v, rn, rd] = location.hash.slice(1).split('/');
    state.run = state.runs[rn] || state.runs[RUNS[0]];
    state.view = VIEWS[v] ? v : 'goal';
    state.round = rd != null && rd !== '' ? +rd : null;
    if (state.view === 'round' && state.round == null) state.round = state.run.rounds[0].round;
    render(true);
  }).catch(e => { stage.innerHTML = `<div class="card"><h3>数据加载失败</h3><p>${window.U.esc(e.message)}</p><p class="note">本地预览需要通过 HTTP 服务打开（例如 <code>python -m http.server -d docs</code>），不能直接双击 index.html。</p></div>`; });
})();
