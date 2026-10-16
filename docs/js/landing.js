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

  const runMeanI = (I, k) => { const s = 27, e = Math.max(s, Math.min(I.length - 1, k)); let m = 0; for (let i = s; i <= e; i++) m += I[i]; return m / (e - s + 1); };

  /* hero: real held-out CFD, equal flow vs champion; deviation from the lateral mean, time-mean from 3 s */
  Promise.all([D.getJSON('data/fields/fixed.json'), D.getJSON(`data/fields/${RUN}.json`)]).then(([fx, hl]) => {
    const A = D.episode(fx.episodes.fixed_s7, fx), B = D.episode(hl.episodes.learned_s7, hl);
    const lab = L('到此刻累计扣分（越少越好）', 'Penalty so far (lower is better)');
    document.getElementById('heroVs').innerHTML = D.vsPanel('hA', L('均匀布气', 'Equal flow'), L('三口都是 30 mm/s', '30 mm/s at every inlet'), lab)
      + D.vsPanel('hB', L('FlowEvolve 冠军', 'FlowEvolve champion'), L('第 6 轮自己进化出的 3 行程序', 'a 3-line program it evolved in round 6'), lab, true);
    Lang.bind(document.getElementById('heroVs'));
    const o = { nx: fx.nx, ny: fx.ny, guide: true };
    const va = new CFD.FieldView(document.getElementById('hAC'), o), vb = new CFD.FieldView(document.getElementById('hBC'), o);
    document.getElementById('heroCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
    const pa = D.cumPenalty(A.reward), pb = D.cumPenalty(B.reward);
    const f = C.lines(document.getElementById('heroEp'), [
      { name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: pa, width: 2.5 },
      { name: Lt('冠军', 'Champion'), color: '#0066cc', pts: pb, width: 3, area: true }],
      { h: 170, x: [0, 20.3], y: [0, 15.5], xlabel: Lt('回合内时间 (s)', 'Time in the episode (s)'), ylabel: Lt('累计扣分', 'Penalty'), xname: 't', digits: 2, margin: { l: 40, b: 32, t: 8, r: 70 } });
    const tA = pa[pa.length - 1][1], tB = pb[pb.length - 1][1];
    C.text(f.g, f.sx(20.2) + 4, f.sy(tA) + 4, tA.toFixed(1), { 'font-size': 12, fill: '#6e6e73', 'font-weight': 600 });
    C.text(f.g, f.sx(20.2) + 4, f.sy(tB) + 4, `${tB.toFixed(1)}  −${Math.round(100 * (1 - tB / tA))}%`, { 'font-size': 12, fill: '#0066cc', 'font-weight': 700 });
    const guide = C.el('line', { y1: f.m.t, y2: f.H - f.m.b, stroke: '#1d1d1f', 'stroke-width': 1, opacity: 0.4 }, f.svg);
    D.player(document.getElementById('heroPl'), { watch: document.getElementById('heroVs'), n: A.t.length, t: A.t, fps: 7, draw: (k, mode) => {
      const t = A.t[k];
      D.vsFill('hA', va, D.frameAt(A, k, mode), A.ux[k], A.uy[k], D.inletAt(A.velocities, t), fx.nx, fx.ny, D.cumAt(pa, t).toFixed(2));
      D.vsFill('hB', vb, D.frameAt(B, k, mode), B.ux[k], B.uy[k], D.inletAt(B.velocities, t), fx.nx, fx.ny, D.cumAt(pb, t).toFixed(2));
      guide.setAttribute('x1', f.sx(t)); guide.setAttribute('x2', f.sx(t));
    } });
  });

  /* fine-mesh time-mean fields + lateral profile */
  D.getJSON('data/fine.json').then(F => {
    const v = F.vmax, get = n => ({ a: CFD.smooth(CFD.unpack(F.configs[n].a, 0, 1), F.nx, F.ny, 4), ux: CFD.unpack(F.configs[n].ux, -v, v), uy: CFD.unpack(F.configs[n].uy, -v, v), u: F.configs[n].u_final });
    const fa = get('fixed'), fb = get('c14d20'), o = { nx: F.nx, ny: F.ny, smooth: 0 };
    document.getElementById('meanVs').innerHTML = D.vsPanel('mA', L('均匀布气', 'Equal flow'), '30 · 30 · 30') + D.vsPanel('mB', L('进化分配', 'Evolved split'), '38 · 14 · 38', null, true);
    Lang.bind(document.getElementById('meanVs'));
    D.vsFill('mA', new CFD.FieldView(document.getElementById('mAC'), o), fa.a, fa.ux, fa.uy, fa.u, F.nx, F.ny);
    D.vsFill('mB', new CFD.FieldView(document.getElementById('mBC'), o), fb.a, fb.ux, fb.uy, fb.u, F.nx, F.ny);
    document.getElementById('meanCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
    const prof = f => { const out = []; for (let i = 0; i < F.nx; i++) { let s = 0, n = 0; for (let j = 6; j < 72; j++) { s += f.a[j * F.nx + i]; n++; } out.push([(i + 0.5) / F.nx * 150, 100 * s / n]); } return out; };
    C.lines(document.getElementById('profChart'), [
      { name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: prof(fa), width: 2.5 },
      { name: Lt('进化分配', 'Evolved split'), color: '#0066cc', pts: prof(fb), width: 3 }],
      { h: 260, xlabel: Lt('横向位置 x (mm)', 'Lateral position x (mm)'), ylabel: Lt('气含率 %', 'Gas fraction %'), xname: 'x', x: [0, 150], digits: 2 });
  });

  /* evolution film: real per-round re-runs on xi_0 */
  Promise.all([D.getJSON(`data/runs/${RUN}.json`), D.rounds(RUN), D.getJSON('data/meta.json')]).then(([run, rr, meta]) => {
    D.annotate(run);
    const R = run.rounds;
    const pick = [0, 1, 5, 6, 7].map(i => R.find(r => r.round === i) || null);
    const st = (n, zh, en, dzh, den, champ) => ({ r: n ? R.find(x => x.round === n) : null, zh, en, dzh, den, champ });
    const stages = [
      st(0, '起点：均匀布气', 'Start: equal flow', '三口各 30 mm/s。没有任何先验，提示词里也不含控制建议。', '30 mm/s per inlet. No priors; the prompt contains no control hints.'),
      st(1, '第 1 轮：试探性小改', 'Round 1: a cautious nudge', '看完一条基线曲线，猜测"中间气偏多"，把中间口从 30 降到 27 mm/s。6 个练习场景平均 +1.36，进了加赛，但加赛第一场输了 3.0 分，未采纳。', 'After one baseline trace it guessed "too much gas in the centre" and cut the centre from 30 to 27 mm/s. Averaged +1.36 over 6 practice scenes and reached the rematch, but lost the first rematch by 3.0: not adopted.'),
      st(5, '第 5 轮：加入压力反馈', 'Round 5: adds pressure feedback', '改写成读取壁面压力的反馈程序。6 个场景全都赢了均匀布气，但赢得太少，和运气波动分不开。', 'Rewritten as a feedback program reading wall pressures. Beat equal flow in all 6 scenes, but by too little to tell apart from luck.'),
      st(6, '第 6 轮：大胆挪气 → 冠军', 'Round 6: bold shift → champion', '回到最简结构，只写 3 行：等塔充满气（约 2 s）后，3.5 s 内把中间口降到 17 mm/s、两侧升到 36 mm/s 并保持。6 场练习 + 3 场加赛全部通过，晋升冠军；在从未见过的封存考题上同样提升 +2.61。', 'Back to the simplest form, 3 lines: once the column has filled (≈2 s), ramp the centre down to 17 mm/s and the sides up to 36 mm/s over 3.5 s, then hold. Passed 6 practice scenes and 3 rematches; promoted; +2.61 on sealed tests it never saw.', true),
      st(7, '第 7 轮：再加大一点？', 'Round 7: push it further?', '只改一个数：中间口继续降到 13 mm/s。对均匀布气的平均分更高（+3.49），但和冠军逐场比只是有输有赢，领先不够大，不收。', 'One number changed: centre down to 13 mm/s. Higher average vs. equal flow (+3.49), but head-to-head with the champion it won some and lost some; not adopted.'),
    ];
    renderFilm(stages, run, rr);
    renderEvo(run);
    renderStrategy(run);
    renderCompare(meta, run, rr);
    renderLyap(meta);
  });

  function renderFilm(stages, run, rr) {
    const list = document.getElementById('filmList'), det = document.getElementById('filmDetail'), vs = document.getElementById('filmVs');
    const sigs = stages.map(s => D.sig(s.r));
    list.innerHTML = stages.map((s, i) => `<button class="stage${s.champ ? ' champ' : ''}" data-i="${i}"><span class="stage-k">${s.r ? 'R' + s.r.round : 'R0'}</span><span class="stage-b"><b>${L(s.zh, s.en)}</b><small>${L('左/中/右', 'L/C/R')} ${sigs[i].split.join(' · ')} mm/s${s.r ? ' · ' + Lt('得分', 'score') + ' ' + D.f2(s.r.mean_gain) : ''}</small></span>${s.champ ? '<span class="pill acc">★</span>' : ''}</button>`).join('');
    const eps = stages.map(s => rr && rr.rounds[s.r ? String(s.r.round) : '0'] ? D.roundEpisode(rr.rounds[s.r ? String(s.r.round) : '0'], rr) : null);
    document.getElementById('filmCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
    let cur = 3, va, vb, pl, guide, fE;
    const A = eps[0];
    const draw = (k, mode) => {
      const B = eps[cur]; if (!A || !B) return;
      const t = A.t[k];
      D.vsFill('fA', va, D.frameAt(A, k, mode), A.ux[k], A.uy[k], A.v[k], 12, 40, D.cumAt(A.cp, t).toFixed(2));
      D.vsFill('fB', vb, D.frameAt(B, k, mode), B.ux[k], B.uy[k], B.v[k], 12, 40, D.cumAt(B.cp, t).toFixed(2));
      if (guide) { guide.setAttribute('x1', fE.sx(t)); guide.setAttribute('x2', fE.sx(t)); }
    };
    const select = i => {
      cur = i; const s = stages[i], B = eps[i];
      list.querySelectorAll('.stage').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
      const lab = L('到此刻累计扣分', 'Penalty so far');
      vs.innerHTML = D.vsPanel('fA', L('均匀布气', 'Equal flow'), '30 · 30 · 30', lab)
        + D.vsPanel('fB', s.r ? L(`第 ${s.r.round} 轮程序`, `Round ${s.r.round} program`) : L('起点', 'Start'), sigs[i].split.join(' · '), lab, s.champ);
      Lang.bind(vs);
      va = new CFD.FieldView(document.getElementById('fAC'), { nx: 12, ny: 40, guide: true }); vb = new CFD.FieldView(document.getElementById('fBC'), { nx: 12, ny: 40, guide: true });
      if (A && B) {
        const tA = A.cp[A.cp.length - 1][1], tB = B.cp[B.cp.length - 1][1];
        fE = C.lines(document.getElementById('filmEp'), [
          { name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: A.cp, width: 2.5 },
          { name: s.r ? 'R' + s.r.round : 'R0', color: s.champ ? '#0066cc' : '#5a9be0', pts: B.cp, width: 3, area: true }],
          { h: 170, x: [0, 20.3], y: [0, Math.max(tA, tB) * 1.1], xlabel: Lt('回合内时间 (s)', 'Time in the episode (s)'), ylabel: Lt('累计扣分', 'Penalty'), xname: 't', digits: 2, margin: { l: 40, b: 32, t: 8, r: 80 } });
        C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tA) + 4, tA.toFixed(1), { 'font-size': 12, fill: '#6e6e73', 'font-weight': 600 });
        if (i) C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tB) + (tB > tA ? -4 : 12), `${tB.toFixed(1)}  ${tB < tA ? '−' : '+'}${Math.abs(Math.round(100 * (1 - tB / tA)))}%`, { 'font-size': 12, fill: '#0066cc', 'font-weight': 700 });
        guide = C.el('line', { y1: fE.m.t, y2: fE.H - fE.m.b, stroke: '#1d1d1f', 'stroke-width': 1, opacity: 0.4 }, fE.svg);
      }
      if (pl) pl.draw(); else if (A) pl = D.player(document.getElementById('filmPl'), { watch: vs, n: A.t.length, t: A.t, fps: 6, draw: (k, m) => draw(k, m) });
      const r = s.r, champR = r && r._champ.round ? run.rounds.find(x => x.round === r._champ.round) : null, dl = D.delta(D.sig(champR), sigs[i]);
      const src = r ? r.source : 'action = [0.0, 0.0, 0.0]\n';
      const df = r && r.parent_source ? D.diff(r.parent_source, src) : { html: D.highlight(src), add: 0, del: 0 };
      det.innerHTML = `<div class="fd-grid"><div><h4>${L('这一轮', 'This round')}</h4><p>${L(s.dzh, s.den)}</p>
        ${r ? `<div class="ck"><div><h5>${L('和当时冠军相比，改了', 'Changed vs. the champion')}</h5>${dl.changed.length ? dl.changed.map(x => `<p>${x}</p>`).join('') : `<p class="muted">${L('只调了参数细节', 'only fine parameter tweaks')}</p>`}</div><div><h5>${L('保留不变', 'Kept')}</h5>${dl.kept.map(x => `<p>${x}</p>`).join('') || '<p>—</p>'}</div></div>
        <h5 class="sc-h">${L('和冠军逐场比赛', 'Scene-by-scene against the champion')}</h5>${D.scorecard(run, r)}` : ''}</div>
        <div><h4>${L('程序代码', 'Program code')}${r ? ` <span class="pill acc">+${df.add}</span><span class="pill">−${df.del}</span>` : ''}</h4><pre class="code">${df.html}</pre>${r ? `<details class="fd-why"><summary>${L('模型写下的理由（英文原文）', 'Rationale written by the model (verbatim)')}</summary><p>${D.esc(r.rationale || '')}</p></details>` : ''}<a class="btn ghost" href="console.html#round/${RUN}/${r ? r.round : 1}">${L('在控制台查看这一轮的完整过程 ›', 'See this round in full in the console ›')}</a></div></div>`;
      Lang.bind(det);
    };
    list.querySelectorAll('.stage').forEach(b => b.onclick = () => select(+b.dataset.i));
    select(3);
  }

  function renderEvo(run) {
    const R = run.rounds, ys = R.map(r => r.mean_gain).filter(v => v != null);
    const step = [[0, 0]]; R.forEach(r => { step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, r._champAfter.mean]); }); step.push([R.length + 0.5, run._final.mean]);
    const f = C.lines(document.getElementById('evoChart'), [{ name: Lt('冠军', 'Champion'), color: '#0066cc', pts: step, width: 3, nohover: true, area: true }],
      { h: 260, x: [0, R.length + 1], y: [Math.min(-2, ...ys) - 0.3, Math.max(...ys) + 0.5], zero: true, xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('比均匀布气少扣的分', 'Penalty saved vs. equal flow'), hover: false });
    C.scatter(f, R.filter(r => r.mean_gain != null).map(r => ({ x: r.round, y: r.mean_gain, r: r.decision === 'accepted' ? 8 : 4.5, ring: r.decision === 'accepted',
      color: r.decision === 'accepted' ? '#0066cc' : r.decision === 'rejected_screen' ? '#e0a030' : '#c7c7cc',
      html: `<b>R${r.round}</b> ${D.f2(r.mean_gain)}` })));
    const c = R.find(r => r.decision === 'accepted');
    if (c) C.text(f.g, f.sx(c.round) + 10, f.sy(c.mean_gain) - 10, Lt('冠军 R' + c.round, 'champion R' + c.round), { 'font-size': 12, fill: '#0066cc', 'font-weight': 600 });
  }

  function renderStrategy(run) {
    const R = run.rounds.filter(r => r.velocity_trace && r.velocity_trace.length);
    const step = [[0, 30]]; run.rounds.forEach(r => { const s = D.sig(r._champAfter.round ? run.rounds.find(x => x.round === r._champAfter.round) : null).split[1]; step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, s]); }); step.push([run.rounds.length + 0.5, step[step.length - 1][1]]);
    const f = C.lines(document.getElementById('stratChart'), [{ name: Lt('均匀', 'Equal'), color: '#8e8e93', pts: [[0, 30], [run.rounds.length + 1, 30]], dash: '4 4', width: 1.5 }, { name: Lt('冠军', 'Champion'), color: '#0066cc', pts: step, width: 3 }],
      { h: 260, x: [0, run.rounds.length + 1], y: [8, 46], xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('中间口气速 mm/s', 'Centre inlet, mm/s'), hover: false });
    C.scatter(f, R.map(r => { const s = D.sig(r); return { x: r.round, y: s.split[1], r: r.decision === 'accepted' ? 8 : 4.5, ring: r.decision === 'accepted', color: r.decision === 'accepted' ? '#0066cc' : '#c7c7cc', html: `<b>R${r.round}</b> ${s.split.join(' · ')} mm/s` }; }));
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
    C.lines(document.getElementById('lyapChart'), Object.entries(ly).map(([k, v], j) => ({ name: k === 'd1e-6' ? Lt('改动 0.000001 m/s', 'nudge 0.000001 m/s') : Lt('改动 0.00001 m/s', 'nudge 0.00001 m/s'), color: j ? '#6e40c9' : '#0066cc', width: 2.5,
      pts: v.t.map((x, i) => [x, v.rms[i] > 0 ? Math.log10(v.rms[i]) : null]) })),
      { h: 240, x: [0, 20.2], xlabel: Lt('时间 (s)', 'Time (s)'), ylabel: Lt('两次运行的差别', 'Difference between runs'), xname: 't', yfmt: v => ({ '-6': Lt('百万分之一', '1e-6'), '-4': Lt('万分之一', '1e-4'), '-2': Lt('百分之一', '1e-2'), '0': '1' }[v.toFixed(0)] || ''), hover: false, margin: { l: 78 } });
    const f = document.getElementById('lyapChart').querySelector('svg');
    if (f) f.style.overflow = 'visible';
  }

  Lang.on(() => location.reload());
})();
