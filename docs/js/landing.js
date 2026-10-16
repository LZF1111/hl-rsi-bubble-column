/* Landing page renderer. */
(function () {
  const C = window.Charts;
  const RUN = 'hl_h200_nohint_stat01';
  document.getElementById('landing').innerHTML = LANDING_SECTIONS() + LANDING_SECTIONS_B();
  document.getElementById('langNav').innerHTML = Lang.switcher();
  document.getElementById('foot').innerHTML = `<p>${L('全部数据来自 OpenFOAM v2306 twoPhaseEulerFoam 真实运行（12×40×4 网格，细网格 30×120×10 复核）。LLM 原文为英文。留出条件在学习中从未展示。同一几何、网格和工况下的扰动条件，不代表跨工况验证。',
    'All data are from real OpenFOAM v2306 twoPhaseEulerFoam runs (12×40×4 mesh, checked on 30×120×10). LLM text is original English. Held-out conditions were never shown during learning. Perturbation conditions share geometry, mesh and operating point; this is not cross-operating-point validation.')}</p><p>FlowEvolve · <a href="console.html">${L('控制台', 'Console')}</a> · <a href="https://github.com/LZF1111/hl-rsi-bubble-column">GitHub</a></p>`;
  Lang.bind();
  D.reveal();

  const W = 10; // 2 s moving average (frames every 0.2 s)

  /* hero: real held-out CFD, equal flow vs champion, frames every 0.2 s */
  Promise.all([D.getJSON('data/fields/fixed.json'), D.getJSON(`data/fields/${RUN}.json`)]).then(([fx, hl]) => {
    const A = D.episode(fx.episodes.fixed_s7, fx), B = D.episode(hl.episodes.learned_s7, hl);
    const o = { nx: fx.nx, ny: fx.ny };
    const va = new CFD.FieldView(document.getElementById('heroA'), o), vb = new CFD.FieldView(document.getElementById('heroB'), o);
    document.getElementById('heroCbar').innerHTML = CFD.colorbar('alpha', 'α<sub>air</sub>');
    const tl = document.getElementById('heroT'), ia = document.getElementById('heroIa'), ib = document.getElementById('heroIb');
    let k = 0;
    const show = () => {
      const t = A.t[k];
      va.set(CFD.windowMean(A.a, k, W), A.ux[k], A.uy[k], D.inletAt(A.velocities, t));
      vb.set(CFD.windowMean(B.a, k, W), B.ux[k], B.uy[k], D.inletAt(B.velocities, t));
      tl.textContent = t.toFixed(1);
      const step = Math.max(0, Math.min(199, Math.round((t - 0.3) / 0.1)));
      ia.textContent = A.imbalance[step].toFixed(3); ib.textContent = B.imbalance[step].toFixed(3);
    };
    show();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { k = (k + 1) % A.t.length; show(); }, 240);
  });

  /* fine-mesh time-mean fields + lateral profile */
  D.getJSON('data/fine.json').then(F => {
    const v = F.vmax, get = n => ({ a: CFD.unpack(F.configs[n].a, 0, 1), ux: CFD.unpack(F.configs[n].ux, -v, v), uy: CFD.unpack(F.configs[n].uy, -v, v), u: F.configs[n].u_final });
    const fa = get('fixed'), fb = get('c14d20'), o = { nx: F.nx, ny: F.ny, smooth: 4 };
    new CFD.FieldView(document.getElementById('meanA'), o).set(fa.a, fa.ux, fa.uy, fa.u);
    new CFD.FieldView(document.getElementById('meanB'), o).set(fb.a, fb.ux, fb.uy, fb.u);
    document.getElementById('meanCbar').innerHTML = CFD.colorbar('alpha', 'ᾱ<sub>air</sub>');
    const prof = f => { const out = []; for (let i = 0; i < F.nx; i++) { let s = 0, n = 0; for (let j = 6; j < 72; j++) { s += f.a[j * F.nx + i]; n++; } out.push([(i + 0.5) / F.nx * 150, s / n]); } return out; };
    C.lines(document.getElementById('profChart'), [
      { name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: prof(fa), width: 2.5 },
      { name: Lt('进化程序', 'Evolved'), color: '#0066cc', pts: prof(fb), width: 3, area: true }],
      { h: 250, xlabel: Lt('横向位置 x (mm)', 'Lateral position x (mm)'), ylabel: 'ᾱ', xname: 'x', x: [0, 150], digits: 3 });
  });

  /* evolution film: real per-round re-runs on xi_0 */
  Promise.all([D.getJSON(`data/runs/${RUN}.json`), D.rounds(RUN), D.getJSON('data/meta.json')]).then(([run, rr, meta]) => {
    D.annotate(run);
    const R = run.rounds;
    const pick = [0, 1, 5, 6, 7].map(i => R.find(r => r.round === i) || null);
    const stages = [
      { r: null, zh: '起点：均匀布气', en: 'Start: equal flow', dzh: '三口各 30 mm/s。初始冠军，增益定义为 0。', den: '30 mm/s per inlet. The initial champion; gain is 0 by definition.' },
      { r: R.find(x => x.round === 1), zh: '第 1 轮：试探性小幅挪气', en: 'Round 1: a cautious shift', dzh: '只看了一条基线轨迹，假设"中间偏多"，把中间口减到 27 mm/s。开发均值 +1.36，但确认条件 −3.0，被拒。', den: 'Seeing one baseline trace, it guessed the centre was gas-rich and cut the centre inlet to 27 mm/s. Dev mean +1.36 but −3.0 on a confirmation condition: rejected.' },
      { r: R.find(x => x.round === 5), zh: '第 5 轮：更早、更轻', en: 'Round 5: earlier, lighter', dzh: '对照前几轮笔记，测试更小幅度。6 个条件全为正，但 t = 1.68 未达显著。', den: 'Using its notes, it tested a smaller amplitude. Positive on all 6 conditions, but t = 1.68 is not significant.' },
      { r: R.find(x => x.round === 6), zh: '第 6 轮：大幅挪气，晋升冠军', en: 'Round 6: bold shift, new champion', dzh: '被随机要求探索"大动作"格子，写出 3 行程序：2 s 后 3.5 s 内把中间降到 17 mm/s 并保持。9 条件 t = 2.94，晋升。', den: 'Asked to explore a large-actuation cell, it wrote 3 lines: after 2 s, ramp the centre down to 17 mm/s over 3.5 s and hold. t = 2.94 over 9 conditions: promoted.', champ: true },
      { r: R.find(x => x.round === 7), zh: '第 7 轮：再加大一点？', en: 'Round 7: push further?', dzh: '只改一个数：幅度 0.32 → 0.42。均值更高（+3.49），但相对冠军 t = 1.77，裁决不收。', den: 'One number changed: amplitude 0.32 → 0.42. Higher mean (+3.49), but t = 1.77 vs the champion: not accepted.' },
    ];
    renderFilm(stages, run, rr, meta);
    renderEvo(run);
    renderCompare(meta, run, rr);
    renderLyap(meta);
    const tot = D.RUNS.length;
    Promise.all(D.RUNS.map(n => D.getJSON(`data/runs/${n}.json`))).then(all => {
      document.getElementById('sRounds').textContent = all.reduce((a, r) => a + r.rounds_total, 0);
      document.getElementById('sCfd').textContent = Math.round(all.reduce((a, r) => a + r.segments, 0) / 1000) + 'k';
      document.getElementById('sBest').textContent = D.f2(Math.max(...all.map(r => r.final_test.mean_gain_vs_fixed)));
    });
  });

  function renderFilm(stages, run, rr, meta) {
    const list = document.getElementById('filmList'), cols = document.getElementById('filmCols'), det = document.getElementById('filmDetail');
    list.innerHTML = stages.map((s, i) => `<button class="stage${i === 3 ? ' on' : ''}${s.champ ? ' champ' : ''}" data-i="${i}"><span class="stage-k">${s.r ? 'R' + s.r.round : 'R0'}</span><span class="stage-b"><b>${L(s.zh, s.en)}</b><small>${s.r ? `${Lt('开发增益', 'dev gain')} ${D.f2(s.r.mean_gain)}` : Lt('基线', 'baseline')}</small></span>${s.champ ? '<span class="pill acc">★</span>' : ''}</button>`).join('');
    const eps = stages.map(s => {
      if (!rr) return null;
      const key = s.r ? String(s.r.round) : '0';
      return rr.rounds[key] ? D.roundEpisode(rr.rounds[key], rr) : null;
    });
    cols.innerHTML = stages.map((s, i) => `<div class="film-col${s.champ ? ' champ' : ''}"><div class="col-frame"><canvas id="fc${i}"></canvas><span class="col-tag">${s.r ? 'R' + s.r.round : 'R0'}</span></div><p><b id="fr${i}">—</b>${Lt('ξ₀ 回报', 'ξ₀ return')}</p></div>`).slice(0, 5).join('');
    cols.style.gridTemplateColumns = `repeat(${stages.length}, 1fr)`;
    const views = stages.map((s, i) => new CFD.FieldView(document.getElementById('fc' + i), { nx: 12, ny: 40 }));
    const sl = document.getElementById('filmT'), tl = document.getElementById('filmTl'), play = document.getElementById('filmPlay');
    const n = eps[0] ? eps[0].t.length : 1; sl.max = n - 1; sl.value = n - 1;
    const draw = () => {
      const k = +sl.value;
      eps.forEach((e, i) => { if (!e) return; views[i].set(CFD.windowMean(e.a, k, W), e.ux[k], e.uy[k], e.v[k]); document.getElementById('fr' + i).textContent = e.ret.toFixed(2); });
      if (eps[0]) tl.textContent = `t = ${eps[0].t[k].toFixed(1)} s`;
    };
    sl.oninput = draw; draw();
    let timer = 0;
    play.onclick = () => {
      if (timer) { clearInterval(timer); timer = 0; play.textContent = '▶'; return; }
      play.textContent = '❚❚'; if (+sl.value >= n - 1) sl.value = 0;
      timer = setInterval(() => { if (+sl.value >= n - 1) { clearInterval(timer); timer = 0; play.textContent = '▶'; return; } sl.value = +sl.value + 1; draw(); }, 160);
    };
    const detail = i => {
      const s = stages[i]; list.querySelectorAll('.stage').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
      cols.querySelectorAll('.film-col').forEach((c, j) => c.classList.toggle('sel', j === i));
      const r = s.r, prev = i > 0 && stages[i - 1].r ? stages[i - 1].r : null;
      const src = r ? r.source : 'action = [0.0, 0.0, 0.0]\n', parent = r ? r.parent_source : null;
      const df = parent ? D.diff(parent, src) : { html: D.highlight(src), add: 0, del: 0 };
      det.innerHTML = `<div class="fd-grid"><div><h4>${L('这一轮做了什么', 'What happened')}</h4><p>${L(s.dzh, s.den)}</p>${r ? `<h4>${L('模型的理由（原文）', 'Model rationale (verbatim)')}</h4><p class="fd-q">${D.esc((r.rationale || '').slice(0, 420))}${(r.rationale || '').length > 420 ? '…' : ''}</p>` : ''}</div><div><h4>${L('代码变化', 'Code change')}${r ? ` <span class="pill acc">+${df.add}</span><span class="pill">−${df.del}</span>` : ''}</h4><pre class="code">${df.html}</pre><a class="btn ghost" href="console.html#round/${RUN}/${r ? r.round : 1}">${L('在控制台查看完整提示与笔记本 ›', 'Full prompt context and notebook in the console ›')}</a></div></div>`;
    };
    list.querySelectorAll('.stage').forEach(b => b.onclick = () => detail(+b.dataset.i));
    detail(3);
  }

  function renderEvo(run) {
    const R = run.rounds, ys = R.map(r => r.mean_gain).filter(v => v != null);
    const step = [[0, 0]]; R.forEach(r => { step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, r._champAfter.mean]); }); step.push([R.length + 0.5, run._final.mean]);
    const f = C.lines(document.getElementById('evoChart'), [{ name: Lt('冠军', 'Champion'), color: '#0066cc', pts: step, width: 3, nohover: true, area: true }],
      { h: 280, x: [0, R.length + 1], y: [Math.min(-2, ...ys) - 0.3, Math.max(...ys) + 0.5], zero: true, xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('开发平均增益', 'Mean dev gain'), hover: false });
    C.scatter(f, R.filter(r => r.mean_gain != null).map(r => ({ x: r.round, y: r.mean_gain, r: r.decision === 'accepted' ? 8 : 4.5,
      color: r.decision === 'accepted' ? '#0066cc' : r.decision === 'rejected_screen' ? '#e0a030' : '#c7c7cc',
      html: `<b>R${r.round}</b> ${D.f2(r.mean_gain)}<br><span style="opacity:.75">${D.esc((r.rationale || '').slice(0, 120))}…</span>` })));
  }

  function renderCompare(meta, run, rr) {
    const L1 = meta.learners['SAC seed 1'].u_xi0, t = i => 0.3 + 0.1 * i;
    const ch = rr && rr.rounds[String(run._final.round)];
    const s = [{ name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: [[0, 30], [20.2, 30]], dash: '4 4', width: 1.5, nohover: true },
      { name: 'SAC', color: '#d6517d', pts: L1.map((r, i) => [t(i), r[1] * 1000]), width: 2 }];
    if (ch) s.push({ name: Lt('HL 冠军', 'HL champion'), color: '#0066cc', pts: ch.t.map((x, i) => [x, ch.v[i][1] * 1000]), width: 3 });
    C.lines(document.getElementById('uChart'), s, { h: 260, x: [0, 20.3], y: [12, 34], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'u_C (mm/s)', xname: 't', digits: 1 });
    const runs = ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02'];
    const cost = meta.search_cost;
    C.bars(document.getElementById('costBars'), [
      { label: 'SAC s1', values: [{ v: 200, color: '#d6517d', name: Lt('k 段', 'k segments') }] },
      { label: 'SAC s2', values: [{ v: 200, color: '#e89ab6', name: Lt('k 段', 'k segments') }] },
      { label: 'HL 01', values: [{ v: cost[runs[0]].total / 1000, color: '#0066cc', name: Lt('k 段', 'k segments') }] },
      { label: 'HL 02', values: [{ v: cost[runs[1]].total / 1000, color: '#5a9be0', name: Lt('k 段', 'k segments') }] }],
      { h: 260, ylabel: Lt('千段 CFD', 'k CFD segments'), y: [0, 220] });
  }

  function renderLyap(meta) {
    const ly = meta.lyapunov;
    C.lines(document.getElementById('lyapChart'), Object.entries(ly).map(([k, v], j) => ({ name: k === 'd1e-6' ? 'δ = 10⁻⁶ m/s' : 'δ = 10⁻⁵ m/s', color: j ? '#6e40c9' : '#0066cc', width: 2.5,
      pts: v.t.map((x, i) => [x, v.rms[i] > 0 ? Math.log10(v.rms[i]) : null]) })),
      { h: 240, x: [0, 20.2], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'log₁₀ ‖Δα‖', xname: 't', yfmt: v => '10^' + v.toFixed(0), digits: 2 });
  }

  Lang.on(() => location.reload());
})();
