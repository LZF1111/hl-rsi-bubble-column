/* Console main: run selector, KPIs, evolution, round detail. Archive/compare/mechanism live in console-b.js. */
(function () {
  const C = window.Charts;
  const RUNINFO = {
    hl_h200_nohint_stat01: { zh: '配对 t · 运行 1', en: 'Paired t · run 1', ev: 'paired_t' },
    hl_h200_nohint_stat02: { zh: '配对 t · 运行 2', en: 'Paired t · run 2', ev: 'paired_t' },
    hl_h200_nohint01: { zh: '阈值晋升 · 运行 1', en: 'Threshold · run 1', ev: 'promote3' },
    hl_h200_nohint02: { zh: '阈值晋升 · 运行 2', en: 'Threshold · run 2', ev: 'promote3' },
  };
  const DEC = {
    accepted: ['acc', '晋升冠军', 'Promoted'],
    rejected_regression: ['rej', '未通过裁决', 'Not significant'],
    rejected_screen: ['scr', '初筛淘汰', 'Screened out'],
  };
  const pill = d => { const x = DEC[d] || ['rej', d, d]; return `<span class="pill ${x[0]}">${L(x[1], x[2])}</span>`; };
  const W = 10;
  const state = { run: null, tab: 'evo', round: null };
  let meta, fine, runs = {}, views = [];

  const side = document.getElementById('side'), main = document.getElementById('main');
  document.getElementById('langNav').innerHTML = Lang.switcher();
  Lang.bind();
  Lang.on(() => location.reload());

  function parseHash() {
    const h = location.hash.slice(1).split('/');
    if (h[0] === 'round' && RUNINFO[h[1]]) { state.run = h[1]; state.tab = 'round'; state.round = +h[2] || 1; }
    else if (h[0] === 'run' && RUNINFO[h[1]]) { state.run = h[1]; state.tab = h[2] || 'evo'; }
    if (!state.run) state.run = D.RUNS[0];
  }
  const setHash = () => history.replaceState(null, '', state.tab === 'round' ? `#round/${state.run}/${state.round}` : `#run/${state.run}/${state.tab}`);

  Promise.all([D.getJSON('data/meta.json'), D.getJSON('data/fine.json'), ...D.RUNS.map(n => D.getJSON(`data/runs/${n}.json`))]).then(([m, f, ...rs]) => {
    meta = m; fine = f; D.RUNS.forEach((n, i) => { runs[n] = D.annotate(rs[i]); });
    parseHash();
    renderSide();
    render();
    addEventListener('hashchange', () => { const ev0 = RUNINFO[state.run].ev; state.run = null; parseHash(); if (RUNINFO[state.run].ev !== ev0) renderSide(); render(); });
  });

  function renderSide() {
    const ev = RUNINFO[state.run].ev;
    side.innerHTML = SIDE.html(ev);
    document.getElementById('promptDoc').innerHTML = SIDE.prompt(meta.prompt[ev === 'promote3' ? 'system_promote3' : 'system_paired_t']);
    SIDE.demo(fine);
    Lang.bind(side);
  }

  function clearViews() { views.forEach(v => v.destroy()); views = []; }

  function render() {
    clearViews();
    const run = runs[state.run], R = run.rounds, ft = run.final_test;
    const acc = R.filter(r => r.decision === 'accepted').length;
    const tokens = R.reduce((s, r) => s + (+r.prompt_tokens || 0) + (+r.completion_tokens || 0), 0);
    main.innerHTML = `
      <div>
        <p class="eyebrow" style="margin:0 0 6px">${L('多相流模拟控制自进化系统', 'Self-improving multiphase-flow control')}</p>
        <h1 class="ctitle">${L('进化控制台', 'Evolution console')}</h1>
      </div>
      <div class="runbar" role="group" aria-label="runs">${D.RUNS.map(n => { const g = runs[n].final_test.mean_gain_vs_fixed; return `<button class="runbtn" data-run="${n}" aria-pressed="${n === state.run}"><span class="g ${D.cls(g)}">${D.f2(g)}</span><b>${L(RUNINFO[n].zh, RUNINFO[n].en)}</b><small>${runs[n].rounds_total} ${L('轮', 'rounds')} · ${L('留出增益', 'held-out')}</small></button>`; }).join('')}</div>
      <div class="kpis">
        <div class="card"><b class="${D.cls(ft.mean_gain_vs_fixed)}">${D.f2(ft.mean_gain_vs_fixed)}</b><span>${L('留出条件平均增益', 'Held-out mean gain')}</span></div>
        <div class="card"><b>${run.rounds_total}</b><span>${L('自主轮次', 'Autonomous rounds')}</span></div>
        <div class="card"><b>${acc}</b><span>${L('次晋升冠军', 'Promotions')}</span></div>
        <div class="card"><b>${(run.segments / 1000).toFixed(1)}k</b><span>${L('段真实 CFD', 'CFD segments')}</span></div>
        <div class="card"><b>${(tokens / 1e6).toFixed(2)}M</b><span>${L('LLM token', 'LLM tokens')}</span></div>
      </div>
      <div class="tabs" role="tablist">${[['evo', '进化过程', 'Evolution'], ['round', '单轮详情', 'Round detail'], ['archive', '行为存档', 'Archive'], ['compare', 'HL vs SAC', 'HL vs SAC'], ['mech', '物理机理', 'Physics']].map(([k, z, e]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === state.tab}">${L(z, e)}</button>`).join('')}</div>
      <div id="pane" class="pane"></div>`;
    main.querySelectorAll('.runbtn').forEach(b => b.onclick = () => { const ev0 = RUNINFO[state.run].ev; state.run = b.dataset.run; state.round = null; if (RUNINFO[state.run].ev !== ev0) renderSide(); render(); });
    main.querySelectorAll('.tab').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });
    Lang.bind(main);
    const pane = document.getElementById('pane');
    if (state.tab === 'evo') evolution(pane, run);
    else if (state.tab === 'round') roundDetail(pane, run);
    else if (state.tab === 'archive') CONSOLE_B.archive(pane, run, goRound);
    else if (state.tab === 'compare') CONSOLE_B.compare(pane, meta, fine, views);
    else CONSOLE_B.mechanism(pane, meta, fine);
    setHash();
  }
  function goRound(n) { state.tab = 'round'; state.round = n; render(); scrollTo({ top: 0, behavior: 'smooth' }); }

  function evolution(pane, run) {
    const R = run.rounds;
    pane.innerHTML = `
      <div class="card"><div class="ch-head"><div><h3>${L('奖励随进化上升', 'Reward rising through evolution')}</h3><p class="sub">${L('每个点是一轮候选在开发条件上相对均匀布气的平均增益。蓝色台阶为冠军：只有通过统计裁决才会抬升。点击任意点查看该轮。', 'Each dot: one candidate\'s mean gain over equal flow on the development conditions. Blue staircase: the champion, which rises only when a candidate passes the statistical verdict. Click a dot to open that round.')}</p></div>
        <div class="legend" style="margin:0"><span><i style="background:#0066cc"></i>${L('晋升', 'Promoted')}</span><span><i style="background:#c7c7cc"></i>${L('未通过', 'Not significant')}</span><span><i style="background:#e0a030"></i>${L('初筛淘汰', 'Screened')}</span><span><i style="background:#34c759"></i>${L('留出测试', 'Held-out')}</span></div></div>
        <div class="chart" id="evoC"></div></div>
      <div class="card" id="stripCard"><h3>${L('每一轮的流场', 'The flow, every round')}</h3><p class="sub">${L('同一条件 ξ<sub>0</sub> 上逐轮重算的真实 CFD 时均气相分布（t &gt; 3 s）。蓝框为冠军。左右对比可见中央气柱如何被逐步打散。', 'Real CFD time-mean gas distribution (t &gt; 3 s) on condition ξ<sub>0</sub>, re-run for every round. Blue frames are champions. Watch the central plume get spread out.')}</p><div class="strip" id="strip"><p class="note">${L('加载中…', 'Loading…')}</p></div><div id="stripCbar" style="margin-top:12px"></div></div>
      <div class="card"><h3>${L('逐轮记录', 'Round log')}</h3><p class="sub">${L('模型每轮的理由原文（英文），点击展开详情。', 'The model\'s verbatim rationale for each round. Click to open.')}</p><div class="tl" id="tl"></div></div>`;
    const ys = R.map(r => r.mean_gain).filter(v => v != null);
    const step = [[0, 0]]; R.forEach(r => { step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, r._champAfter.mean]); }); step.push([R.length + 0.5, run._final.mean]);
    const ymax = Math.max(...ys, run.final_test.mean_gain_vs_fixed) + 0.6;
    const f = C.lines(document.getElementById('evoC'), [{ name: Lt('冠军', 'Champion'), color: '#0066cc', pts: step, width: 3, area: true }],
      { h: 320, w: 900, x: [0, R.length + 1.5], y: [Math.min(-2, ...ys) - 0.3, ymax], zero: true, xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('平均增益', 'Mean gain'), hover: false });
    C.scatter(f, R.filter(r => r.mean_gain != null).map(r => ({ x: r.round, y: r.mean_gain, r: r.decision === 'accepted' ? 8 : 5, ring: r.decision === 'accepted',
      color: r.decision === 'accepted' ? '#0066cc' : r.decision === 'rejected_screen' ? '#e0a030' : '#c7c7cc',
      html: `<b>R${r.round}</b> · ${D.f2(r.mean_gain)} · ${Lt(DEC[r.decision][1], DEC[r.decision][2])}<br><span style="opacity:.75">${D.esc((r.rationale || '').slice(0, 140))}…</span>`, onclick: () => goRound(r.round) })));
    const hx = R.length + 1, hg = run.final_test.mean_gain_vs_fixed;
    C.scatter(f, [{ x: hx, y: hg, r: 9, color: '#34c759', ring: true, html: `${Lt('封存留出测试', 'Sealed held-out test')} ξ₇, ξ₈: <b>${D.f2(hg)}</b>` }]);
    C.text(f.g, f.sx(hx), f.sy(hg) - 16, Lt('留出', 'held-out'), { 'text-anchor': 'middle', 'font-size': 11, fill: '#248a3d', 'font-weight': 600 });

    document.getElementById('tl').innerHTML = R.map(r => `<button class="tl-row${r.decision === 'accepted' ? ' acc' : ''}" data-r="${r.round}"><span class="r">R${r.round}</span>${pill(r.decision)}<span class="num ${D.cls(r.mean_gain)}">${D.f2(r.mean_gain)}</span><span class="q">${D.esc(r.rationale || r.error || '')}</span></button>`).join('');
    pane.querySelectorAll('.tl-row').forEach(b => b.onclick = () => goRound(+b.dataset.r));
    Lang.bind(pane);

    D.rounds(state.run).then(rr => {
      const strip = document.getElementById('strip');
      if (!rr) { document.getElementById('stripCard').style.display = 'none'; return; }
      const keys = Object.keys(rr.rounds).map(Number).sort((a, b) => a - b);
      const champs = new Set([0, ...R.filter(r => r.decision === 'accepted').map(r => r.round)]);
      const byRound = Object.fromEntries(R.map(r => [r.round, r]));
      strip.innerHTML = keys.map(k => { const r = byRound[k]; return `<button class="st${champs.has(k) ? ' ch' : ''}" data-r="${k}" title="R${k}"><span class="col-frame"><canvas id="st${k}"></canvas></span><small>R${k}</small><em class="${D.cls(r ? r.mean_gain : 0)}">${r ? D.f2(r.mean_gain, 1) : '0'}</em></button>`; }).join('');
      keys.forEach(k => { const e = rr.rounds[String(k)], v = rr.vmax; const fv = new CFD.FieldView(document.getElementById('st' + k), { nx: rr.nx, ny: rr.ny, inlets: false }); fv.set(CFD.unpack(e.ma, 0, 1), CFD.unpack(e.mux, -v, v), CFD.unpack(e.muy, -v, v)); views.push(fv); });
      strip.querySelectorAll('.st').forEach(b => b.onclick = () => { if (+b.dataset.r > 0) goRound(+b.dataset.r); });
      document.getElementById('stripCbar').innerHTML = CFD.colorbar('alpha', 'ᾱ<sub>air</sub>');
    });
  }

  window.CONSOLE = { state, goRound, pill, DEC, W, views: () => views, runs: () => runs, meta: () => meta };
  function roundDetail(pane, run) { (window.CONSOLE_ROUND || (() => {}))(pane, run, state, views); }
})();
