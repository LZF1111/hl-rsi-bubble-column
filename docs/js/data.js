/* Shared data access + small helpers used by both the landing page and the console. */
(function () {
  const cache = {};
  const getJSON = u => cache[u] || (cache[u] = fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }));
  const RUNS = ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02', 'hl_h200_nohint01', 'hl_h200_nohint02'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f2 = (v, d) => v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 2 : d);
  const cls = v => v == null ? '' : v >= 0 ? 'pos' : 'neg';

  /* Field episode -> per-frame Float32Arrays (row 0 = bottom). */
  function episode(ep, meta) {
    const n = ep.t.length, v = meta.vmax;
    return { t: ep.t, a: CFD.frames(ep.a, n, 0, 1), ux: CFD.frames(ep.ux, n, -v, v), uy: CFD.frames(ep.uy, n, -v, v),
      velocities: ep.velocities, imbalance: ep.imbalance, reward: ep.reward, ret: ep.return,
      mean: { a: CFD.grid(ep.mean_alpha), ux: CFD.grid(ep.mean_ux), uy: CFD.grid(ep.mean_uy) } };
  }
  /* inlet velocity at physical time t from a 200-step trajectory (step k ends at 0.3 + 0.1k). */
  function inletAt(vel, t) { const k = Math.max(0, Math.min(vel.length - 1, Math.round((t - 0.3) / 0.1))); return t < 0.25 ? [0.03, 0.03, 0.03] : vel[k]; }

  const REPLAYS = ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02'];
  function rounds(name) { return REPLAYS.includes(name) ? getJSON(`data/rounds/${name}.json`).catch(() => null) : Promise.resolve(null); }
  /* packed round replay -> {t, a[], ux[], uy[], v, I, mean} */
  function roundEpisode(r, meta) {
    const n = r.t.length, v = meta.vmax;
    return { t: r.t, a: CFD.frames(r.a, n, 0, 1), ux: CFD.frames(r.ux, n, -v, v), uy: CFD.frames(r.uy, n, -v, v), v: r.v, I: r.I, ret: r.return,
      mean: { a: CFD.unpack(r.ma, 0, 1), ux: CFD.unpack(r.mux, -v, v), uy: CFD.unpack(r.muy, -v, v) } };
  }

  function diff(a, b) {
    const A = (a || '').replace(/\n$/, '').split('\n'), B = (b || '').replace(/\n$/, '').split('\n');
    const n = A.length, m = B.length, T = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = A[i] === B[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const out = []; let i = 0, j = 0, add = 0, del = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push(['', A[i]]); i++; j++; }
      else if (T[i + 1][j] >= T[i][j + 1]) { out.push(['del', A[i++]]); del++; }
      else { out.push(['add', B[j++]]); add++; }
    }
    while (i < n) { out.push(['del', A[i++]]); del++; }
    while (j < m) { out.push(['add', B[j++]]); add++; }
    return { html: out.map(([k, s]) => `<span class="ln ${k}">${k === 'add' ? '+ ' : k === 'del' ? '− ' : '  '}${highlight(s) || ' '}</span>`).join(''), add, del };
  }

  /* Champion staircase with ids, from round records. */
  function annotate(run) {
    let champ = { round: 0, id: 'equal-flow', gains: run.protocol.dev_seeds.map(() => 0), mean: 0, source: 'action = [0.0, 0.0, 0.0]\n' };
    for (const r of run.rounds) {
      r._champ = champ;
      if (r.decision === 'accepted') champ = { round: r.round, id: r.id, gains: r.gains, mean: r.mean_gain, source: r.source };
      r._champAfter = champ;
    }
    run._final = champ;
    return run;
  }

  function reveal() {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    document.querySelectorAll('.reveal:not(.in)').forEach(el => io.observe(el));
  }

  function highlight(src) {
    return String(src || '').split('\n').map(line => {
      const h = line.indexOf('#'), code = h < 0 ? line : line.slice(0, h), cm = h < 0 ? '' : line.slice(h);
      const c = esc(code)
        .replace(/\b(if|else|for|in|range|and|or|not)\b/g, '<span class="kw">$1</span>')
        .replace(/\b(min|max|abs|sum|len|sin|cos|sqrt|tanh|exp)\b(?=\()/g, '<span class="fn">$1</span>')
        .replace(/(?<![\w.#&])(-?\d+\.?\d*(?:e-?\d+)?)(?![\w;])/g, '<span class="nu">$1</span>');
      return c + (cm ? `<span class="cm">${esc(cm)}</span>` : '');
    }).join('\n');
  }

  /* plain-language signature of a program from its logged condition-0 inlet trace */
  const EQUAL = { split: [30, 30, 30], onset: null, fb: false, lines: 1 };
  function sig(r) {
    if (!r) return EQUAL;
    const v = r.velocity_trace || [], dt = r.horizon == 50 ? 0.2 : 0.8;
    const i = v.findIndex(u => u.some(x => Math.abs(x - 0.03) > 0.001));
    const last = v.length ? v[v.length - 1] : [0.03, 0.03, 0.03];
    return { split: last.map(x => Math.round(x * 1000)), onset: i < 0 ? null : +(i * dt + 0.2).toFixed(1), fb: /obs\[/.test(r.source || ''), lines: (r.source || '').trim().split('\n').length };
  }
  function sigText(s) {
    return { split: s.split.join(' · '), onset: s.onset == null ? L('不动作', 'never') : `${s.onset} s`, fb: s.fb ? L('读压力反馈', 'pressure feedback') : L('定时开环', 'timed open loop'), lines: s.lines };
  }
  /* what changed vs what was kept, parent -> candidate */
  function delta(p, c) {
    const out = [], same = [];
    const sp = p.split.join(), sc = c.split.join();
    const dc = c.split[1] - p.split[1];
    if (sp !== sc) out.push(L(`气速分配 ${p.split.join('/')} → <b>${c.split.join('/')}</b> mm/s（中间口 ${dc > 0 ? '+' : ''}${dc}）`, `inlet split ${p.split.join('/')} → <b>${c.split.join('/')}</b> mm/s (centre ${dc > 0 ? '+' : ''}${dc})`));
    else same.push(L(`气速分配 ${c.split.join('/')}`, `split ${c.split.join('/')}`));
    if (Math.abs((p.onset || 0) - (c.onset || 0)) > 0.5 || (p.onset == null) !== (c.onset == null)) out.push(L(`启动时刻 ${p.onset == null ? '无' : p.onset + ' s'} → <b>${c.onset == null ? '无' : c.onset + ' s'}</b>`, `onset ${p.onset == null ? 'none' : p.onset + ' s'} → <b>${c.onset == null ? 'none' : c.onset + ' s'}</b>`));
    else if (c.onset != null) same.push(L(`启动时刻 ${c.onset} s`, `onset ${c.onset} s`));
    if (p.fb !== c.fb) out.push(c.fb ? L('<b>加入压力反馈</b>', '<b>added pressure feedback</b>') : L('<b>去掉反馈</b>，改为定时', '<b>dropped feedback</b>, timed only'));
    else same.push(c.fb ? L('压力反馈结构', 'feedback structure') : L('开环定时结构', 'open-loop timing'));
    return { changed: out, kept: same };
  }

  /* one side of a side-by-side CFD comparison */
  function vsPanel(id, title, sub, scoreLabel, win) {
    return `<div class="vs-col${win ? ' win' : ''}"><div class="vs-h"><b>${title}</b><span>${sub || ''}</span></div>
      <div class="col-frame"><canvas id="${id}C"></canvas></div>
      <div class="vs-k">${L('入口气速 mm/s', 'Inlet gas velocity, mm/s')}</div><div id="${id}U"></div>
      <div class="vs-k">${L('评分窗三段气含率 %', 'Gas fraction in the three thirds, %')}</div><div id="${id}T"></div>
      <div class="vs-score"><span>${scoreLabel || L('不均匀度 I', 'Imbalance I')}</span><b id="${id}S">—</b></div></div>`;
  }
  function vsFill(id, view, a, ux, uy, u, nx, ny, score) {
    view.set(a, ux, uy, u);
    const th = CFD.thirds(a, nx, ny);
    document.getElementById(id + 'U').innerHTML = CFD.inlets(u);
    document.getElementById(id + 'T').innerHTML = CFD.thirdsHTML(th.g);
    document.getElementById(id + 'S').textContent = score != null ? score : th.I.toFixed(3);
    return th;
  }

  window.D = { getJSON, RUNS, esc, f2, cls, episode, inletAt, rounds, roundEpisode, annotate, reveal, highlight, diff, vsPanel, vsFill, sig, sigText, delta, EQUAL };
})();
