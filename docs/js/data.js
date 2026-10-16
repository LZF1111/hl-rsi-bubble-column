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
    // replays log I every 0.4 s; spread the exact episode penalty (−return) over time in proportion to I
    let s = 0; const ci = r.I.map(x => s += x), cp = [[0.2, 0]].concat(r.t.map((x, i) => [x, -r.return * ci[i] / (s || 1)]));
    return { cp, t: r.t, a: CFD.frames(r.a, n, 0, 1), ux: CFD.frames(r.ux, n, -v, v), uy: CFD.frames(r.uy, n, -v, v), v: r.v, I: r.I, ret: r.return,
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
      <div class="vs-k">${L('进气口气速 mm/s', 'Inlet gas velocity, mm/s')}</div><div id="${id}U"></div>
      <div class="vs-k">${L('打分区 左 / 中 / 右 含气量 %', 'Gas in the left / centre / right blocks, %')}</div><div id="${id}T"></div>
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

  /* field at frame k: 'mean' = running mean from 3 s (settles into the distribution); 'live' = 1.2 s moving average */
  function frameAt(E, k, mode) {
    if (mode === 'mean') return CFD.cumMean(E.a, E.t, k);
    const dt = E.t.length > 1 ? E.t[1] - E.t[0] : 0.2;
    return CFD.windowMean(E.a, k, Math.max(2, Math.round(1.2 / dt)));
  }

  /* plain names for perturbation seeds: 0–5 practice, 7/8 sealed exam, 9–11 rematch */
  function scene(seed, short) {
    if (seed === 7 || seed === 8) { const s = seed === 7 ? 'A' : 'B'; return short ? Lt('考' + s, 'X' + s) : Lt('封存考题 ' + s, 'sealed test ' + s); }
    if (seed >= 9) return short ? Lt('加' + (seed - 8), 'R' + (seed - 8)) : Lt('加赛 ' + (seed - 8), 'rematch ' + (seed - 8));
    return short ? Lt('练' + (seed + 1), 'P' + (seed + 1)) : Lt('练习场景 ' + (seed + 1), 'practice ' + (seed + 1));
  }
  /* cumulative penalty (−reward summed) at each logged step; step k ends at 0.3 + 0.1k s */
  function cumPenalty(reward) { let s = 0; return [[0.2, 0]].concat(reward.map((r, k) => [0.3 + 0.1 * k, s -= r])); }
  function cumAt(cp, t) { let v = 0; for (const p of cp) { if (p[0] > t + 1e-6) break; v = p[1]; } return v; }

  /* episode player: play/pause, scrubber, live vs time-mean toggle, autoplay while on screen */
  function player(el, o) {
    const n = o.n, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let mode = o.mode || 'mean', timer = 0, auto = o.auto !== false && !reduce, visible = false, wait = 0;
    el.innerHTML = `<div class="pl"><button class="play" aria-label="play / pause">▶</button><input type="range" min="0" max="${n - 1}" value="${auto ? 0 : n - 1}" aria-label="time"><span class="num pl-t"></span><span class="seg" role="group" aria-label="view">${[['mean', '累积平均', 'Running mean'], ['live', '瞬时流动', 'Instantaneous']].map(([m, z, e]) => `<button data-m="${m}" aria-pressed="${m === mode}">${L(z, e)}</button>`).join('')}</span></div>`;
    const sl = el.querySelector('input'), btn = el.querySelector('.play'), tl = el.querySelector('.pl-t');
    const draw = () => { const k = +sl.value; tl.textContent = `t = ${o.t[k].toFixed(1)} s`; o.draw(k, mode); };
    const stop = () => { clearInterval(timer); clearTimeout(wait); timer = 0; btn.textContent = '▶'; };
    const play = () => {
      if (timer) return;
      if (+sl.value >= n - 1) sl.value = 0;
      btn.textContent = '❚❚';
      timer = setInterval(() => {
        if (!el.isConnected) { stop(); io.disconnect(); return; }
        if (+sl.value >= n - 1) { stop(); if (auto) wait = setTimeout(() => { if (auto && visible) play(); }, o.hold || 2200); return; }
        sl.value = +sl.value + 1; draw();
      }, 1000 / (o.fps || 8));
    };
    btn.onclick = () => { auto = false; if (timer) stop(); else play(); };
    sl.oninput = () => { auto = false; stop(); draw(); };
    el.querySelectorAll('.seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; el.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && auto) play(); else if (!visible) stop(); }, { threshold: 0.25 });
    io.observe(o.watch || el);
    draw();
    setTimeout(() => { const b = (o.watch || el).getBoundingClientRect(); if (auto && !timer && b.bottom > 0 && b.top < innerHeight) { visible = true; play(); } }, 600);
    return { draw, stop };
  }

  /* how to read a column figure */
  function howto() {
    return `<div class="howto"><span><i class="h-dot"></i>${L('压力计：模型能看到的只有这 9 个读数', 'Pressure probes: the only 9 readings the model sees')}</span><span><i class="h-box"></i>${L('打分区（离底 5–60 cm），分左 / 中 / 右三块比含气量', 'Scoring zone (5–60 cm above the bottom), split into left / centre / right')}</span><span><i class="h-red"></i>${L('气偏多', 'more gas')}<i class="h-white"></i>${L('均匀', 'even')}<i class="h-blue"></i>${L('气偏少', 'less gas')}</span></div>`;
  }

  /* head-to-head scorecard: candidate vs the champion it challenged, one chip per scene */
  function scorecard(run, r) {
    const strict = run.protocol.acceptance === 'paired_t', cg = r.gains || [], hg = (r._champ && r._champ.gains) || [];
    const dev = run.protocol.dev_seeds, conf = (run.protocol.confirm_seeds || []);
    const d = cg.map((v, i) => v - (hg[i] || 0)), cd = r.confirm_gains || (r.test && r.test.confirm_deltas) || [];
    const chip = (seed, v) => `<div class="sc-c ${v > 0 ? 'w' : v < -2 || (!strict && v < -0.75) ? 'bad' : 'l'}"><small>${scene(seed)}</small><b>${f2(v)}</b><em>${v > 0 ? L('胜', 'won') : L('负', 'lost')}</em></div>`;
    const champName = r._champ && r._champ.round ? Lt(`冠军 R${r._champ.round}`, `champion R${r._champ.round}`) : Lt('均匀布气', 'equal flow');
    if (r.decision === 'rejected_screen') return `<p class="sc-lead">${L(`初筛：先在 6 个练习场景各跑 5 秒。平均比均匀布气还差 0.5 分以上，直接淘汰，不再花完整回合的算力。`, `Quick screen: 5 s on each practice scene. More than 0.5 points worse than equal flow on average, so it was dropped without spending full episodes.`)}</p><div class="sc">${cg.map((v, i) => chip(dev[i], v)).join('')}</div>`;
    const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const ratio = x => { const n = x.length, m = mean(x), sd = Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, n - 1)); return sd > 0 ? m / (sd / Math.sqrt(n)) : 0; };
    const all = d.concat(cd), ck = (ok, txt) => `<li class="${ok ? 'ok' : 'no'}"><b>${ok ? '✓' : '✗'}</b>${txt}</li>`;
    let rules;
    if (strict) {
      const m6 = mean(d), t6 = ratio(d), w6 = Math.min(...d), p6 = m6 > 0.3 && t6 > 2 && w6 >= -2;
      rules = [ck(m6 > 0.3, L(`平均每场领先 <b>${f2(m6)}</b> 分（要求 > 0.3）`, `Average lead <b>${f2(m6)}</b> per scene (needs > 0.3)`)),
        ck(t6 > 2, L(`领先是运气波动的 <b>${t6.toFixed(1)}</b> 倍（要求 > 2 倍）`, `Lead is <b>${t6.toFixed(1)}×</b> the luck-driven scatter (needs > 2×)`)),
        ck(w6 >= -2, L(`最差一场 <b>${f2(w6)}</b>（不许输超过 2 分）`, `Worst scene <b>${f2(w6)}</b> (no loss worse than 2)`))];
      if (cd.length) {
        const ma = mean(all), ta = ratio(all), wa = Math.min(...all), mc = mean(cd);
        rules.push(ck(mc > 0 && ma > 0.3 && ta > 2 && wa >= -2, L(`加赛 3 场后：9 场平均 <b>${f2(ma)}</b>、波动倍数 <b>${ta.toFixed(1)}</b>、最差 <b>${f2(wa)}</b>，加赛平均 <b>${f2(mc)}</b>`, `After 3 rematches: 9-scene mean <b>${f2(ma)}</b>, scatter ratio <b>${ta.toFixed(1)}</b>, worst <b>${f2(wa)}</b>, rematch mean <b>${f2(mc)}</b>`)));
      } else if (p6) rules.push(ck(false, L('加赛未完成', 'rematch not run')));
      else rules.push(`<li class="skip"><b>–</b>${L('练习场景没过，不进入加赛', 'Failed the practice scenes, so no rematch')}</li>`);
    } else {
      const m3 = mean(d), w3 = Math.min(...d);
      rules = [ck(m3 > 0.5, L(`平均每场领先 <b>${f2(m3)}</b> 分（要求 > 0.5）`, `Average lead <b>${f2(m3)}</b> (needs > 0.5)`)),
        ck(w3 >= -0.75, L(`最差一场 <b>${f2(w3)}</b>（不许输超过 0.75 分）`, `Worst scene <b>${f2(w3)}</b> (no loss worse than 0.75)`)),
        `<li class="skip"><b>!</b>${L('宽松规则：只比 3 场，没有加赛，也不看领先是否大于运气波动', 'Lenient rule: 3 scenes, no rematch, no check against luck')}</li>`];
    }
    return `<p class="sc-lead">${L(`本轮程序和${champName}在<b>完全相同的场景</b>里各跑一个 20 秒回合，逐场比谁扣分少。数字 = 本轮多得的分（正 = 胜）。`, `This round's program and ${champName} each run a 20 s episode in <b>exactly the same scenes</b>; we compare scene by scene. Number = points gained by this round (positive = won).`)}</p>
      <div class="sc">${d.map((v, i) => chip(dev[i], v)).join('')}${cd.length ? `<span class="sc-sep">${L('加赛', 'rematch')}</span>` + cd.map((v, i) => chip(conf[i], v)).join('') : ''}</div>
      <ul class="sc-r">${rules.join('')}</ul>`;
  }

  window.D = { howto, scorecard, getJSON, RUNS, esc, f2, cls, episode, inletAt, rounds, roundEpisode, annotate, reveal, highlight, diff, vsPanel, vsFill, sig, sigText, delta, EQUAL, scene, cumPenalty, cumAt, player, frameAt };
})();
