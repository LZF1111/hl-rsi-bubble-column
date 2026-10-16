/* Console: single-round detail (before/after CFD, verdict, rationale, diff, notebook, context). */
(function () {
  const C = window.Charts;
  const K = CONSOLE;

  window.CONSOLE_ROUND = function (pane, run, state, views) {
    const R = run.rounds, n = R.length;
    if (!state.round || state.round < 1 || state.round > n) state.round = (run._final.round || 1);
    const r = R.find(x => x.round === state.round) || R[0];
    const parentR = R.find(x => x.id === r.parent);
    const champ = r._champ;
    const t = r.test || {}, dev = t.dev || {}, all = t.all;
    const cell = r.behaviour ? r.behaviour.cell : '—';
    const pz = parentR ? `R${parentR.round}` : L('均匀布气', 'equal flow');

    pane.innerHTML = `
      <div class="card">
        <div class="rhead"><h2>${L('第', 'Round ')}${r.round}${L(' 轮', '')}</h2>${K.pill(r.decision)}${r.requested_cell ? `<span class="pill blue">${L('探索指令', 'exploration')} · ${D.esc(r.requested_cell)}</span>` : `<span class="pill">${L('自由改进', 'free refinement')}</span>`}
          <div class="rnav"><button id="rPrev" aria-label="previous round" ${r.round <= 1 ? 'disabled' : ''}>‹</button><button id="rNext" aria-label="next round" ${r.round >= n ? 'disabled' : ''}>›</button></div></div>
        <div class="rmeta" style="margin-top:10px"><span>${L('父代', 'Parent')} <b>${pz}</b></span><span>${L('当时冠军', 'Champion then')} <b>${champ.round ? 'R' + champ.round : L('均匀布气', 'equal flow')}</b></span><span>${L('行为格', 'Behaviour cell')} <b>${D.esc(cell)}</b></span><span>${L('模型', 'Model')} <b>${D.esc(r.model || '—')}</b></span><span>${L('输入/输出 token', 'Tokens in/out')} <b>${(+r.prompt_tokens || 0).toLocaleString()} / ${(+r.completion_tokens || 0).toLocaleString()}</b></span><span>${L('推理用时', 'Latency')} <b>${r.latency_s ? (+r.latency_s).toFixed(0) + ' s' : '—'}</b></span></div>
        <div class="flow" style="margin-top:16px"><span>${L('读笔记本与证据', 'Read notebook & evidence')}</span><i>→</i><span>${L('提出假设', 'Hypothesis')}</span><i>→</i><span>${L('写程序', 'Write program')}</span><i>→</i><span class="${r.decision === 'rejected_screen' ? 'on' : ''}">${L('50 步初筛', '50-step screen')}</span><i>→</i><span class="${r.decision === 'rejected_regression' ? 'on' : ''}">${L('200 步开发', '200-step dev')}</span><i>→</i><span class="${r.decision === 'accepted' ? 'on' : ''}">${L('确认并晋升', 'Confirm & promote')}</span></div>
      </div>

      <div class="card"><h3>${L('改动前后：真实 CFD 气相分布', 'Before and after: real CFD gas distribution')}</h3><p class="sub">${L(`条件 ξ<sub>0</sub>。左为父代 ${pz}，右为本轮候选。2 s 滑动平均；虚线框为评分窗三段。`, `Condition ξ<sub>0</sub>. Left: parent ${pz}; right: this round's candidate. 2 s moving average; dashed boxes are the three scoring thirds.`)}</p>
        <div class="ba" id="ba"><p class="note">${L('加载中…', 'Loading…')}</p></div></div>

      <div class="grid g2">
        <div class="card"><h3>${L('统计裁决', 'Statistical verdict')}</h3><p class="sub">${L('逐条件与冠军配对：d = 候选增益 − 冠军增益', 'Paired with the champion on each condition: d = candidate gain − champion gain')}</p>
          <div class="verdict">
            <div><b class="${D.cls(r.mean_gain)}">${D.f2(r.mean_gain)}</b><span>${L('相对均匀布气', 'vs equal flow')}</span></div>
            <div><b class="${D.cls(dev.mean)}">${dev.mean != null ? D.f2(dev.mean) : '—'}</b><span>${L('mean(d) 开发', 'mean(d), dev')}</span></div>
            <div><b>${dev.t != null ? dev.t.toFixed(2) : '—'}</b><span>t ${L('统计量（需 > 2）', '(needs > 2)')}</span></div>
            <div><b>${all ? all.t.toFixed(2) : '—'}</b><span>${L('9 条件 t', 't over 9')}</span></div>
          </div>
          <div class="chart" id="rGain" style="margin-top:14px"></div>
          <div class="legend"><span><i style="background:#0066cc"></i>${L('本轮候选', 'Candidate')}</span><span><i style="background:#c7c7cc"></i>${L('当时冠军', 'Champion')}</span></div></div>
        <div class="card"><h3>${L('代码变化', 'Code change')} <span id="dfp"></span></h3><p class="sub">${L(`相对父代 ${pz}`, `Against parent ${pz}`)}</p><pre class="code" id="rDiff"></pre></div>
      </div>

      <div class="grid g2">
        <div class="card"><h3>${L('模型的理由', 'Model rationale')}</h3><p class="sub">${L('原文（英文），模型在写程序前给出的假设', 'Verbatim; the hypothesis the model states before writing code')}</p><div class="prose">${D.esc(r.rationale || r.error || '—')}</div></div>
        <div class="card"><h3>${L('模型笔记本', 'Model notebook')}</h3><p class="sub">${L('模型自写、每轮整体重写的长期记忆（≤ 6000 字符）', 'Self-written long-term memory, fully rewritten each round (≤ 6000 chars)')}</p><div class="nb">${D.esc(r.notes || '—')}</div></div>
      </div>

      <div class="card"><h3>${L('这一轮的提示词上下文', 'Prompt context for this round')}</h3><p class="sub">${L('模型每轮收到：固定任务提示词 + 下列动态证据。任务提示词全文见左栏 06。', 'Each round the model receives the fixed task prompt plus the dynamic evidence below. Full task prompt: sidebar 06.')}</p>
        <div class="ctx">
          <details class="ctx-item" open><summary>${L('指令', 'Request')}<span class="k">requested_behaviour_cell</span></summary><div><p class="note">${r.requested_cell ? L(`本轮被随机要求探索未覆盖的行为格 <b>${D.esc(r.requested_cell)}</b>：写一个在 ξ<sub>0</sub> 上会落入该格的程序，作为信息性实验，而不是暗示它有效。`, `This round was randomly asked to explore the unexplored cell <b>${D.esc(r.requested_cell)}</b>: write a program whose behaviour on ξ<sub>0</sub> falls in it, as an informative experiment, not a hint that it works.`) : L('无探索指令：模型可自由改进父代或写全新程序。', 'No exploration request: the model may refine the parent or write something new.')}</p></div></details>
          <details class="ctx-item"><summary>${L('父代程序', 'Parent program')}<span class="k">${pz}</span></summary><div><pre class="code">${D.highlight(r.parent_source || '')}</pre></div></details>
          <details class="ctx-item"><summary>${L('上一轮笔记本', 'Previous notebook')}<span class="k">notes · R${r.round - 1}</span></summary><div><div class="nb">${D.esc((R.find(x => x.round === r.round - 1) || {}).notes || L('（首轮，笔记本为空）', '(first round: empty notebook)'))}</div></div></details>
          <details class="ctx-item"><summary>${L('近期决策', 'Recent decisions')}<span class="k">table</span></summary><div><table class="t"><thead><tr><th>${L('轮', 'Round')}</th><th>${L('裁决', 'Verdict')}</th><th>${L('增益', 'Gain')}</th><th>${L('行为格', 'Cell')}</th></tr></thead><tbody>${R.filter(x => x.round < r.round).slice(-8).map(x => `<tr><td class="num">R${x.round}</td><td>${K.pill(x.decision)}</td><td class="num ${D.cls(x.mean_gain)}">${D.f2(x.mean_gain)}</td><td class="num">${D.esc(x.behaviour ? x.behaviour.cell : '—')}</td></tr>`).join('') || `<tr><td colspan="4" class="note">${L('无', 'none')}</td></tr>`}</tbody></table></div></details>
        </div></div>`;

    document.getElementById('rPrev').onclick = () => K.goRound(r.round - 1);
    document.getElementById('rNext').onclick = () => K.goRound(r.round + 1);
    Lang.bind(pane);

    const df = D.diff(r.parent_source || '', r.source || '');
    document.getElementById('rDiff').innerHTML = df.html;
    document.getElementById('dfp').innerHTML = `<span class="pill acc">+${df.add}</span><span class="pill">−${df.del}</span>`;

    const cg = r.gains || [], hg = champ.gains || [], conf = r.confirm_gains || [];
    const groups = cg.map((v, i) => ({ label: 'ξ' + i, values: [{ v, color: '#0066cc', name: Lt('候选', 'Candidate') }, { v: hg[i] != null ? hg[i] : 0, color: '#c7c7cc', name: Lt('冠军', 'Champion') }] }));
    conf.forEach((v, i) => groups.push({ label: Lt('确认', 'cf') + (i + 1), values: [{ v, color: '#5a9be0', name: 'd' }] }));
    if (groups.length) C.bars(document.getElementById('rGain'), groups, { h: 210, ylabel: Lt('增益', 'Gain') });

    D.rounds(state.run).then(rr => beforeAfter(rr, run, r, parentR, views));
  };

  function beforeAfter(rr, run, r, parentR, views) {
    const ba = document.getElementById('ba'); if (!ba) return;
    const byPolicy = {}; if (rr) for (const k in rr.rounds) byPolicy[rr.rounds[k].policy] = k;
    const ek = rr && byPolicy[r.id], pk = rr && (parentR ? byPolicy[parentR.id] : '0');
    if (!rr || ek == null || pk == null) return traces(ba, run, r, parentR);
    const A = D.roundEpisode(rr.rounds[pk], rr), B = D.roundEpisode(rr.rounds[ek], rr);
    const pz = parentR ? 'R' + parentR.round : Lt('均匀布气', 'equal flow');
    ba.innerHTML = `<div><div class="col-frame"><canvas id="baA"></canvas><span class="col-tag">${pz}</span></div><p class="ba-cap"><b>${A.ret.toFixed(2)}</b>${L('ξ₀ 回报', 'ξ₀ return')}</p></div>
      <div><div class="col-frame"><canvas id="baB"></canvas><span class="col-tag">R${r.round}</span></div><p class="ba-cap"><b class="${B.ret >= A.ret ? 'pos' : 'neg'}">${B.ret.toFixed(2)}</b>${L('ξ₀ 回报', 'ξ₀ return')}</p></div>
      <div class="ba-side"><div class="scrub"><button class="play" id="baPlay" aria-label="play">▶</button><input type="range" id="baT" min="0" max="${A.t.length - 1}" value="${A.t.length - 1}" aria-label="time"><span class="num" id="baTl"></span></div>
        <div class="chart" id="baI"></div><div class="chart" id="baU"></div>
        <div class="legend"><span><i style="background:#8e8e93"></i>${pz}</span><span><i style="background:#0066cc"></i>R${r.round}</span></div><div id="baCbar"></div></div>`;
    Lang.bind(ba);
    const o = { nx: rr.nx, ny: rr.ny, window: true };
    const va = new CFD.FieldView(document.getElementById('baA'), o), vb = new CFD.FieldView(document.getElementById('baB'), o);
    views.push(va, vb);
    document.getElementById('baCbar').innerHTML = CFD.colorbar('alpha', 'α<sub>air</sub>');
    const sl = document.getElementById('baT'), tl = document.getElementById('baTl'), play = document.getElementById('baPlay'), w = Math.max(1, Math.round(K.W / 2));
    const fI = C.lines(document.getElementById('baI'), [
      { name: pz, color: '#8e8e93', pts: A.t.map((x, i) => [x, A.I[i]]), width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: B.t.map((x, i) => [x, B.I[i]]), width: 2.5 }],
      { h: 170, x: [0, 20.3], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: Lt('不均匀度 I', 'Imbalance I'), xname: 't' });
    C.lines(document.getElementById('baU'), [
      { name: pz, color: '#8e8e93', pts: A.t.map((x, i) => [x, A.v[i][1] * 1000]), width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: B.t.map((x, i) => [x, B.v[i][1] * 1000]), width: 2.5 }],
      { h: 150, x: [0, 20.3], y: [8, 52], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'u_C (mm/s)', xname: 't', digits: 1 });
    const guide = C.el('line', { y1: fI.m.t, y2: fI.H - fI.m.b, stroke: '#1d1d1f', 'stroke-width': 1, opacity: 0.35 }, fI.svg);
    const draw = () => {
      const k = +sl.value;
      va.set(CFD.windowMean(A.a, k, w), A.ux[k], A.uy[k], A.v[k]);
      vb.set(CFD.windowMean(B.a, k, w), B.ux[k], B.uy[k], B.v[k]);
      tl.textContent = `t = ${A.t[k].toFixed(1)} s`;
      guide.setAttribute('x1', fI.sx(A.t[k])); guide.setAttribute('x2', fI.sx(A.t[k]));
    };
    sl.oninput = draw; draw();
    let timer = 0;
    play.onclick = () => {
      if (timer) { clearInterval(timer); timer = 0; play.textContent = '▶'; return; }
      if (+sl.value >= A.t.length - 1) sl.value = 0;
      play.textContent = '❚❚';
      timer = setInterval(() => { if (!sl.isConnected || +sl.value >= A.t.length - 1) { clearInterval(timer); timer = 0; play.textContent = '▶'; return; } sl.value = +sl.value + 1; draw(); }, 180);
    };
  }

  /* runs without per-round CFD replays: logged traces on condition 0 */
  function traces(ba, run, r, parentR) {
    const P = parentR || { velocity_trace: run.baseline_trace.velocity_trace, imbalance_trace: run.baseline_trace.imbalance_trace, thirds_trace: run.baseline_trace.thirds_trace };
    const pz = parentR ? 'R' + parentR.round : Lt('均匀布气', 'equal flow');
    const tt = (arr, h) => arr.map((_, i) => (i + 1) * (h === 50 ? 0.2 : 0.8));
    ba.style.gridTemplateColumns = '1fr 1fr';
    ba.innerHTML = `<div><div class="chart" id="trI"></div></div><div><div class="chart" id="trU"></div></div><p class="note" style="grid-column:1/-1">${L('该运行未做逐轮流场重算，此处显示运行日志中的 ξ<sub>0</sub> 轨迹（每 0.8 s 采样）。逐轮 CFD 云图见“配对 t · 运行 1”。', 'Per-round field replays were not computed for this run; showing the logged ξ<sub>0</sub> traces (sampled every 0.8 s). Per-round CFD fields: see "Paired t · run 1".')}</p>`;
    Lang.bind(ba);
    const ser = (x, f) => (x.imbalance_trace || []).map((v, i) => [tt(x.imbalance_trace, x.horizon)[i], f(x, i)]);
    C.lines(document.getElementById('trI'), [
      { name: pz, color: '#8e8e93', pts: ser(P, (x, i) => x.imbalance_trace[i]), width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: ser(r, (x, i) => x.imbalance_trace[i]), width: 2.5 }],
      { h: 220, xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: Lt('不均匀度 I', 'Imbalance I'), xname: 't' });
    C.lines(document.getElementById('trU'), [
      { name: pz, color: '#8e8e93', pts: ser(P, (x, i) => x.velocity_trace[i][1] * 1000), width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: ser(r, (x, i) => x.velocity_trace[i][1] * 1000), width: 2.5 }],
      { h: 220, y: [8, 52], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'u_C (mm/s)', xname: 't', digits: 1 });
  }
})();
