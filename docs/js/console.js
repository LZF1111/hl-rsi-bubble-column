/* Console main: run selector, KPIs, evolution, round detail. Archive/compare/mechanism live in console-b.js. */
(function () {
  const C = window.Charts;
  const RUNINFO = {
    hl_h200_nohint_stat01: { zh: '严格裁决 · 运行 1', en: 'Strict verdict · run 1', ev: 'paired_t' },
    hl_h200_nohint_stat02: { zh: '严格裁决 · 运行 2', en: 'Strict verdict · run 2', ev: 'paired_t' },
    hl_h200_nohint01: { zh: '宽松对照 · 运行 1', en: 'Lenient control · run 1', ev: 'promote3' },
    hl_h200_nohint02: { zh: '宽松对照 · 运行 2', en: 'Lenient control · run 2', ev: 'promote3' },
  };
  const DEC = {
    accepted: ['acc', '晋升冠军', 'Promoted'],
    rejected_regression: ['rej', '没稳赢冠军', 'Did not beat champion'],
    rejected_screen: ['scr', '初筛淘汰', 'Screened out'],
    champion: ['rej', '冠军复测', 'Champion re-run'],
    evaluated: ['rej', '已评估', 'Evaluated'],
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
    document.getElementById('promptDoc').innerHTML = PROMPT.html(meta.prompt[ev === 'promote3' ? 'system_promote3' : 'system_paired_t'], ev);
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
      <div class="runbar" role="group" aria-label="runs">${D.RUNS.map(n => { const g = runs[n].final_test.mean_gain_vs_fixed; return `<button class="runbtn" data-run="${n}" aria-pressed="${n === state.run}"><span class="g ${D.cls(g)}">${D.f2(g)}</span><b>${L(RUNINFO[n].zh, RUNINFO[n].en)}</b><small>${runs[n].rounds_total} ${L('轮', 'rounds')} · ${L('封存考题得分', 'sealed-test score')}</small></button>`; }).join('')}</div>
      <div class="kpis">
        <div class="card"><b class="${D.cls(ft.mean_gain_vs_fixed)}">${D.f2(ft.mean_gain_vs_fixed)}</b><span>${L('封存考题得分（越高越好）', 'Sealed-test score (higher is better)')}</span></div>
        <div class="card"><b>${run.rounds_total}</b><span>${L('自主轮次', 'Autonomous rounds')}</span></div>
        <div class="card"><b>${acc}</b><span>${L('次晋升冠军', 'Promotions')}</span></div>
        <div class="card"><b>${(run.segments / 1000).toFixed(1)}k</b><span>${L('段仿真（每段 0.1 s）', 'simulation segments (0.1 s each)')}</span></div>
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
    const R = run.rounds, ft = run.final_test, champ = run._final;
    const champR = champ.round ? R.find(r => r.round === champ.round) : null;
    const s0 = D.EQUAL, s1 = D.sig(champR), tested = R.filter(r => r.horizon == 200).length;
    const best = R.reduce((b, r) => r.mean_gain != null && r.horizon == 200 && r.mean_gain > (b ? b.mean_gain : -1e9) ? r : b, null);
    const lineage = R.filter(r => r.decision === 'accepted');
    pane.innerHTML = `
      <div class="card hero-card">
        <div class="hc-l">
          <p class="eyebrow" style="margin:0 0 6px">${L('本次运行的结论', 'Outcome of this run')}</p>
          <h2 class="hc-h">${champR ? L(`第 ${champR.round} 轮找到冠军；在从未见过的封存考题上得分 ${D.f2(ft.mean_gain_vs_fixed)}`, `Champion found in round ${champR.round}; ${D.f2(ft.mean_gain_vs_fixed)} on sealed tests it never saw`) : L('没有程序稳定赢过均匀布气', 'No program reliably beat equal flow')}</h2>
          <div class="hc-flow">
            <div><span>${L('起点', 'Start')}</span><b>30 · 30 · 30</b><small>${L('均匀布气', 'equal flow')}</small></div><i>→</i>
            <div class="on"><span>${L('冠军', 'Champion')}${champR ? ' R' + champR.round : ''}</span><b>${s1.split.join(' · ')}</b><small>${champR ? `${s1.onset != null ? Lt(`${s1.onset} s 起`, `from ${s1.onset} s`) : ''} · ${Lt(s1.fb ? '压力反馈' : '定时开环', s1.fb ? 'feedback' : 'open loop')} · ${s1.lines} ${Lt('行', 'lines')}` : '—'}</small></div>
          </div>
          <div class="hc-k">
            <div><b>${R.length}</b><span>${L('轮提案', 'proposals')}</span></div>
            <div><b>${tested}</b><span>${L('轮完整 CFD 评估', 'full CFD evaluations')}</span></div>
            <div><b>${lineage.length}</b><span>${L('次被采纳', 'adopted')}</span></div>
            <div><b>${best ? D.f2(best.mean_gain) : '—'}</b><span>${L('单轮最高分', 'best single score')}${best ? ' · R' + best.round : ''}</span></div>
          </div>
          <p class="note">${L('得分 = 同一场景里比均匀布气少扣的分，多个场景取平均。均匀布气一回合约扣 12 分，+2.6 即少扣约 22%。', 'Score = penalty saved vs. equal flow in the same scene, averaged over scenes. Equal flow loses about 12 points per episode, so +2.6 is about 22% less.')}</p>
        </div>
        <div class="hc-r"><div class="vs" id="evVs"></div><div id="evCbar" style="margin-top:10px"></div></div>
      </div>

      <div class="card"><div class="ch-head"><div><h3>${L('分数随进化上升', 'Score rising through evolution')}</h3><p class="sub">${L('点：每轮新程序的得分；蓝色台阶：当前冠军（只有和冠军逐场比稳赢才会抬升）；绿点：冠军在封存考题上的得分。点击任意点查看该轮。', 'Dots: each round\'s score. Blue steps: the current champion (rises only after reliably beating it scene by scene). Green: the champion on the sealed tests. Click a dot to open the round.')}</p></div>
        <div class="legend" style="margin:0"><span><i style="background:#0066cc"></i>${L('采纳', 'Adopted')}</span><span><i style="background:#c7c7cc"></i>${L('未采纳', 'Not adopted')}</span><span><i style="background:#e0a030"></i>${L('初筛淘汰', 'Screened')}</span><span><i style="background:#34c759"></i>${L('封存考题', 'Sealed test')}</span></div></div>
        <div class="chart" id="evoC"></div></div>

      <div class="grid g2">
        <div class="card"><h3>${L('策略怎么变：中间口气速', 'How the strategy moved: centre-inlet velocity')}</h3><p class="sub">${L('每轮程序最终的中间口气速（两侧自动补齐，总量不变）。', 'Final centre-inlet velocity of each program (the sides make up the rest).')}</p><div class="chart" id="stC"></div></div>
        <div class="card"><h3>${L('冠军谱系：每次晋升改了什么', 'Champion lineage: what each promotion changed')}</h3><p class="sub">${L('从均匀布气出发，每一代都要在同样的场景里稳定赢过上一代。', 'From equal flow, each generation had to reliably beat the previous one in the same scenes.')}</p>
          <div class="lin">${[{ round: 0, sig: D.EQUAL, g: 0, txt: L('均匀布气，三口各 30 mm/s', 'Equal flow, 30 mm/s per inlet') }].concat(lineage.map(r => ({ round: r.round, sig: D.sig(r), g: r.mean_gain, r }))).map((x, i, arr) => {
            const dl = i ? D.delta(arr[i - 1].sig, x.sig) : null;
            return `<button class="lin-i${x.round ? '' : ' z'}" ${x.round ? `data-r="${x.round}"` : 'disabled'}><span class="lin-k">${x.round ? 'R' + x.round : L('起点', 'Start')}</span><span class="lin-b"><b>${x.sig.split.join(' · ')} mm/s</b>${dl ? `<small>${dl.changed.join('；')}</small>` : `<small>${x.txt}</small>`}</span><span class="lin-g ${D.cls(x.g)}">${D.f2(x.g)}</span></button>`;
          }).join('')}
          <div class="lin-i fin"><span class="lin-k">${L('考试', 'Exam')}</span><span class="lin-b"><b>${L('封存考题 A、B', 'Sealed tests A, B')}</b><small>${L('模型从未见过', 'never shown to the model')}</small></span><span class="lin-g pos">${D.f2(ft.mean_gain_vs_fixed)}</span></div></div></div>
      </div>

      <div class="card" id="stripCard"><h3>${L('每一轮的气相分布', 'Gas distribution, every round')}</h3><p class="sub">${L('练习场景 1 上逐轮重算的真实仿真（第 3–20 秒平均）。颜色 = 比同高度平均多或少的气；越接近白色越均匀。蓝框为冠军，下方数字为该轮平均提升。', 'Real simulation re-run for every round in practice scene 1 (mean over 3–20 s). Colour = more or less gas than the same-height average from the lateral mean; whiter is more even. Blue frames are champions; numbers are mean gains.')}</p><div class="strip" id="strip"><p class="note">${L('加载中…', 'Loading…')}</p></div><div id="stripCbar" style="margin-top:12px"></div></div>

      <div class="card"><h3>${L('逐轮记录', 'Round log')}</h3><p class="sub">${L('每轮的气速分配与模型理由（英文原文）。点击进入单轮详情。', 'Inlet split and the model\'s verbatim rationale for each round. Click to open.')}</p><div class="tl" id="tl"></div></div>`;
    pane.querySelectorAll('.lin-i[data-r]').forEach(b => b.onclick = () => goRound(+b.dataset.r));

    const ys = R.map(r => r.mean_gain).filter(v => v != null);
    const step = [[0, 0]]; R.forEach(r => { step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, r._champAfter.mean]); }); step.push([R.length + 0.5, champ.mean]);
    const ymax = Math.max(...ys, ft.mean_gain_vs_fixed) + 0.6;
    const f = C.lines(document.getElementById('evoC'), [{ name: Lt('冠军', 'Champion'), color: '#0066cc', pts: step, width: 3, area: true }],
      { h: 300, w: 900, x: [0, R.length + 1.5], y: [Math.min(-2, ...ys) - 0.3, ymax], zero: true, xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('相对均匀布气的提升', 'Gain over equal flow'), hover: false });
    C.scatter(f, R.filter(r => r.mean_gain != null).map(r => ({ x: r.round, y: r.mean_gain, r: r.decision === 'accepted' ? 8 : 5, ring: r.decision === 'accepted',
      color: r.decision === 'accepted' ? '#0066cc' : r.decision === 'rejected_screen' ? '#e0a030' : '#c7c7cc',
      html: `<b>R${r.round}</b> · ${D.f2(r.mean_gain)} · ${Lt((DEC[r.decision] || ['', r.decision, r.decision])[1], (DEC[r.decision] || ['', r.decision, r.decision])[2])}<br>${D.sig(r).split.join(' · ')} mm/s`, onclick: () => goRound(r.round) })));
    const hx = R.length + 1, hg = ft.mean_gain_vs_fixed;
    C.scatter(f, [{ x: hx, y: hg, r: 9, color: '#34c759', ring: true, html: `${Lt('封存考题', 'Sealed test')}: <b>${D.f2(hg)}</b>` }]);
    C.text(f.g, f.sx(hx), f.sy(hg) - 16, Lt('考试', 'exam'), { 'text-anchor': 'middle', 'font-size': 11, fill: '#248a3d', 'font-weight': 600 });
    lineage.forEach(r => C.text(f.g, f.sx(r.round) + 11, f.sy(r.mean_gain) - 10, Lt('冠军 R', 'champion R') + r.round, { 'font-size': 11.5, fill: '#0066cc', 'font-weight': 600 }));

    const sstep = [[0, 30]]; R.forEach(r => { const c = r._champAfter.round ? R.find(x => x.round === r._champAfter.round) : null; sstep.push([r.round - 0.5, sstep[sstep.length - 1][1]]); sstep.push([r.round - 0.5, D.sig(c).split[1]]); }); sstep.push([R.length + 0.5, sstep[sstep.length - 1][1]]);
    const fs = C.lines(document.getElementById('stC'), [{ name: Lt('均匀', 'Equal'), color: '#8e8e93', pts: [[0, 30], [R.length + 1, 30]], dash: '4 4', width: 1.5 }, { name: Lt('冠军', 'Champion'), color: '#0066cc', pts: sstep, width: 3 }],
      { h: 260, x: [0, R.length + 1], y: [8, 46], xlabel: Lt('进化轮次', 'Round'), ylabel: Lt('中间口 mm/s', 'Centre, mm/s'), hover: false });
    C.scatter(fs, R.filter(r => r.velocity_trace && r.velocity_trace.length).map(r => { const s = D.sig(r); return { x: r.round, y: s.split[1], r: r.decision === 'accepted' ? 8 : 4.5, ring: r.decision === 'accepted', color: r.decision === 'accepted' ? '#0066cc' : r.decision === 'rejected_screen' ? '#e0a030' : '#c7c7cc', html: `<b>R${r.round}</b> ${s.split.join(' · ')} mm/s · ${D.f2(r.mean_gain)}`, onclick: () => goRound(r.round) }; }));

    document.getElementById('tl').innerHTML = R.map(r => `<button class="tl-row${r.decision === 'accepted' ? ' acc' : ''}" data-r="${r.round}"><span class="r">R${r.round}</span>${pill(r.decision)}<span class="num ${D.cls(r.mean_gain)}">${D.f2(r.mean_gain)}</span><span class="num sp">${D.sig(r).split.join('/')}</span><span class="q">${D.esc(r.rationale || r.error || '')}</span></button>`).join('');
    pane.querySelectorAll('.tl-row').forEach(b => b.onclick = () => goRound(+b.dataset.r));
    Lang.bind(pane);

    D.rounds(state.run).then(rr => {
      const strip = document.getElementById('strip');
      if (!rr) { document.getElementById('stripCard').style.display = 'none'; heroTraces(run, champR); return; }
      const k0 = '0', kc = champR ? String(champR.round) : '0';
      const A = D.roundEpisode(rr.rounds[k0], rr), B = D.roundEpisode(rr.rounds[kc], rr), n = A.t.length - 1;
      document.getElementById('evVs').innerHTML = D.vsPanel('eA', L('起点', 'Start'), '30 · 30 · 30', L('到此刻累计扣分', 'Penalty so far')) + D.vsPanel('eB', L('冠军', 'Champion') + (champR ? ' R' + champR.round : ''), s1.split.join(' · '), L('到此刻累计扣分', 'Penalty so far'), true);
      Lang.bind(document.getElementById('evVs'));
      const va = new CFD.FieldView(document.getElementById('eAC'), { nx: rr.nx, ny: rr.ny, guide: true }), vb = new CFD.FieldView(document.getElementById('eBC'), { nx: rr.nx, ny: rr.ny, guide: true });
      views.push(va, vb);
      const evP = document.createElement('div'), evE = document.createElement('div'); evE.className = 'chart';
      document.getElementById('evVs').after(evP, evE);
      const tA = A.cp[A.cp.length - 1][1], tB = B.cp[B.cp.length - 1][1];
      const fE = C.lines(evE, [{ name: Lt('均匀布气', 'Equal flow'), color: '#8e8e93', pts: A.cp, width: 2 }, { name: Lt('冠军', 'Champion'), color: '#0066cc', pts: B.cp, width: 2.5, area: true }],
        { h: 150, x: [0, 20.3], y: [0, Math.max(tA, tB) * 1.1], xlabel: Lt('回合内时间 (s)', 'Time in the episode (s)'), ylabel: Lt('累计扣分', 'Penalty'), xname: 't', digits: 2, margin: { r: 76 } });
      C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tA) + 4, tA.toFixed(1), { 'font-size': 11.5, fill: '#6e6e73', 'font-weight': 600 });
      C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tB) + 12, `${tB.toFixed(1)} −${Math.round(100 * (1 - tB / tA))}%`, { 'font-size': 11.5, fill: '#0066cc', 'font-weight': 700 });
      const gl = C.el('line', { y1: fE.m.t, y2: fE.H - fE.m.b, stroke: '#1d1d1f', 'stroke-width': 1, opacity: 0.4 }, fE.svg);
      D.player(evP, { watch: document.getElementById('evVs'), n: A.t.length, t: A.t, fps: 6, draw: (k, mode) => {
        const t = A.t[k];
        D.vsFill('eA', va, D.frameAt(A, k, mode), A.ux[k], A.uy[k], A.v[k], rr.nx, rr.ny, D.cumAt(A.cp, t).toFixed(2));
        D.vsFill('eB', vb, D.frameAt(B, k, mode), B.ux[k], B.uy[k], B.v[k], rr.nx, rr.ny, D.cumAt(B.cp, t).toFixed(2));
        gl.setAttribute('x1', fE.sx(t)); gl.setAttribute('x2', fE.sx(t));
      } });
      document.getElementById('evCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
      const keys = Object.keys(rr.rounds).map(Number).sort((a, b) => a - b);
      const champs = new Set([0, ...lineage.map(r => r.round)]), byRound = Object.fromEntries(R.map(r => [r.round, r]));
      strip.innerHTML = keys.map(k => { const r = byRound[k]; return `<button class="st${champs.has(k) ? ' ch' : ''}" data-r="${k}" title="R${k}"><span class="col-frame"><canvas id="st${k}"></canvas></span><small>R${k}</small><em class="${D.cls(r ? r.mean_gain : 0)}">${r ? D.f2(r.mean_gain, 1) : '0'}</em></button>`; }).join('');
      keys.forEach(k => { const e = D.roundEpisode(rr.rounds[String(k)], rr), m = e.t.length - 1; const fv = new CFD.FieldView(document.getElementById('st' + k), { nx: rr.nx, ny: rr.ny }); fv.set(CFD.cumMean(e.a, e.t, m), e.ux[m], e.uy[m]); views.push(fv); });
      strip.querySelectorAll('.st').forEach(b => b.onclick = () => { if (+b.dataset.r > 0) goRound(+b.dataset.r); });
      document.getElementById('stripCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
    });
  }

  // runs without CFD replays: show the champion's logged inlet trace instead of fields
  function heroTraces(run, champR) {
    const el = document.getElementById('evVs'); if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<div class="chart" id="evTr"></div><p class="note">${L('该运行未做逐轮流场重算；这里显示冠军在练习场景 1 中一个回合的进气口气速记录。', 'No per-round field replays for this run; showing the champion\'s logged inlet velocities over one episode in practice scene 1.')}</p>`;
    Lang.bind(el);
    const src = champR || { velocity_trace: run.baseline_trace.velocity_trace, horizon: 200 };
    const tt = i => (i + 1) * 0.8, cols = ['#3a7bd5', '#e0a030', '#d6517d'], nm = [Lt('左', 'L'), Lt('中', 'C'), Lt('右', 'R')];
    C.lines(document.getElementById('evTr'), [0, 1, 2].map(j => ({ name: nm[j], color: cols[j], pts: src.velocity_trace.map((u, i) => [tt(i), u[j] * 1000]), width: 2.5 })), { h: 300, y: [8, 52], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: Lt('入口气速 mm/s', 'Inlet velocity, mm/s'), xname: 't', digits: 1 });
  }

  window.CONSOLE = { state, goRound, pill, DEC, W, views: () => views, runs: () => runs, meta: () => meta };
  function roundDetail(pane, run) { (window.CONSOLE_ROUND || (() => {}))(pane, run, state, views); }
})();
