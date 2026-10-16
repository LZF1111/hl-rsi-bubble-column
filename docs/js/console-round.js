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
        <div class="rmeta" style="margin-top:10px"><span>${L('父代', 'Parent')} <b>${pz}</b></span><span>${L('当时冠军', 'Champion then')} <b>${champ.round ? 'R' + champ.round : L('均匀布气', 'equal flow')}</b></span><span>${L('操作风格', 'Style')} <b>${D.esc(cell)}</b></span><span>${L('模型', 'Model')} <b>${D.esc(r.model || '—')}</b></span><span>${L('输入/输出 token', 'Tokens in/out')} <b>${(+r.prompt_tokens || 0).toLocaleString()} / ${(+r.completion_tokens || 0).toLocaleString()}</b></span><span>${L('推理用时', 'Latency')} <b>${r.latency_s ? (+r.latency_s).toFixed(0) + ' s' : '—'}</b></span></div>
        <div class="rs">${(() => {
          const dl = D.delta(D.sig(champ.round ? R.find(x => x.round === champ.round) : null), D.sig(r));
          const ok = r.decision === 'accepted', why = ok ? L('在 9 个条件上都稳定胜过当时冠军', 'Beat the champion consistently on all 9 conditions') : r.decision === 'rejected_screen' ? L('前 5 秒就明显变差，提前淘汰', 'Clearly worse within 5 s; screened out') : (dev.mean != null && dev.mean <= 0.3) ? L('平均没有明显超过当时冠军', 'No clear average lead over the champion') : (all && all.min < -2) || (dev.min != null && dev.min < -2) ? L('有一个条件输得太多', 'Lost too much on one condition') : L('领先幅度没有大过混沌噪声', 'Lead not larger than the chaotic noise');
          return `<div class="chg"><h5>${L('相对当时冠军，改了', 'Changed vs. the champion')}</h5>${dl.changed.length ? dl.changed.map(x => `<p>${x}</p>`).join('') : `<p>${L('只调了细节参数', 'fine parameter tweaks only')}</p>`}</div>
            <div><h5>${L('保留不变', 'Kept')}</h5>${dl.kept.map(x => `<p>${x}</p>`).join('') || '<p>—</p>'}</div>
            <div class="res${ok ? ' ok' : ''}"><h5>${L('结果', 'Outcome')}</h5><b class="${D.cls(r.mean_gain)}">${D.f2(r.mean_gain)}</b><p>${ok ? L('✓ 晋升为新冠军', '✓ New champion') : L('✗ 未采纳', '✗ Not adopted')}：${why}</p></div>`;
        })()}</div>
      </div>

      <div class="card"><h3>${L('改动前后：真实 CFD 气相分布', 'Before and after: real CFD gas distribution')}</h3><p class="sub">${L(`练习场景 1 里完整的一个 20 秒回合。左：改动前（${pz}）；右：本轮程序。点 ▶ 看气怎么跑，或切到「时间平均」看整体分布。颜色 = 比同高度平均多（红）或少（蓝）的气，越白越均匀。`, `One full 20 s episode in practice scene 1. Left: before (${pz}); right: this round's program. Press ▶ to watch the gas move, or switch to time-mean. Colour = more (red) or less (blue) gas than the same-height average; whiter is more even.`)}</p>
        <div class="ba" id="ba"><p class="note">${L('加载中…', 'Loading…')}</p></div></div>

      <div class="grid g2">
        <div class="card"><h3>${L('裁决：和冠军逐场比', 'Verdict: scene by scene against the champion')}</h3>${D.scorecard(run, r)}</div>
        <div class="card"><h3>${L('代码变化', 'Code change')} <span id="dfp"></span></h3><p class="sub">${L(`相对父代 ${pz}`, `Against parent ${pz}`)}</p><pre class="code" id="rDiff"></pre></div>
      </div>

      <div class="card"><h3>${L('这一轮，模型是怎么分析和改进的', 'How the model analysed and improved this round')}</h3><p class="sub">${L('模型看不到流场图，只能看到上一轮给它的数字证据：父代程序在练习场景 1 中左/中/右三块含气量和进气口气速随时间的记录，以及每个场景的得分。下面左图就是它看到的那条记录。', 'The model never sees field images. It only gets numbers from earlier rounds: the parent program\'s left/centre/right gas and inlet velocities over time in practice scene 1, and the score in every scene. The chart below is exactly that record.')}</p>
        <div class="rz-grid"><div><h5 class="rz-ch">${L(`模型看到的证据：父代 ${pz} 在练习场景 1 中的记录（每 0.8 s 一个点）`, `Evidence it saw: parent ${pz} in practice scene 1 (one point per 0.8 s)`)}</h5><div class="chart" id="rzT"></div><div class="chart" id="rzU"></div>
          <div class="legend"><span><i style="background:#3a7bd5"></i>${L('左', 'Left')}</span><span><i style="background:#e0a030"></i>${L('中', 'Centre')}</span><span><i style="background:#d6517d"></i>${L('右', 'Right')}</span></div></div>
          <div id="rzSteps"><p class="note">${L('加载中…', 'Loading…')}</p></div></div>
        <details class="fd-why" open><summary>${L('模型写下的完整理由（中英对照）', 'Full rationale written by the model (ZH / EN)')}</summary><div id="rzRat"></div></details>
        <details class="fd-why"><summary>${L('模型自己的笔记本：每轮整体重写的长期记忆（中英对照）', 'The model\'s own notebook, rewritten every round (ZH / EN)')}</summary><div id="rzNb"></div></details>
      </div>

      <div class="card"><h3>${L('这一轮的提示词上下文', 'Prompt context for this round')}</h3><p class="sub">${L('模型每轮收到两部分：① 固定的任务提示词（只定义问题，不含答案）；② 本轮动态证据——上一轮笔记本、父代程序、近期裁决、本轮指令。', 'Each round the model receives: ① the fixed task prompt (defines the problem, no answers); ② dynamic evidence: last notebook, parent program, recent verdicts, this round\'s request.')}</p>
        <div class="ctx">
          <details class="ctx-item"><summary>${L('固定任务提示词（中英对照）', 'Fixed task prompt (ZH / EN)')}<span class="k">system</span></summary><div>${PROMPT.html(CONSOLE.meta().prompt[CONSOLE.runs()[state.run].protocol.acceptance === 'paired_t' ? 'system_paired_t' : 'system_promote3'], CONSOLE.runs()[state.run].protocol.acceptance === 'paired_t' ? 'paired_t' : 'promote3')}</div></details>
          <details class="ctx-item" open><summary>${L('指令', 'Request')}<span class="k">requested_behaviour_cell</span></summary><div><p class="note">${r.requested_cell ? L(`本轮被随机要求尝试一种还没试过的操作风格 <b>${D.esc(r.requested_cell)}</b>：写一个在练习场景 1 上表现为该风格的程序，作为信息性实验，而不是暗示它有效。`, `This round was randomly asked to explore the unexplored cell <b>${D.esc(r.requested_cell)}</b>: write a program whose behaviour in practice scene 1 falls in it, as an informative experiment, not a hint that it works.`) : L('无探索指令：模型可自由改进父代或写全新程序。', 'No exploration request: the model may refine the parent or write something new.')}</p></div></details>
          <details class="ctx-item"><summary>${L('父代程序', 'Parent program')}<span class="k">${pz}</span></summary><div><pre class="code">${D.highlight(r.parent_source || '')}</pre></div></details>
          <details class="ctx-item"><summary>${L('上一轮笔记本', 'Previous notebook')}<span class="k">notes · R${r.round - 1}</span></summary><div><div id="rzPrevNb"></div></div></details>
          <details class="ctx-item"><summary>${L('近期决策', 'Recent decisions')}<span class="k">table</span></summary><div><table class="t"><thead><tr><th>${L('轮', 'Round')}</th><th>${L('裁决', 'Verdict')}</th><th>${L('得分', 'Score')}</th><th>${L('操作风格', 'Style')}</th></tr></thead><tbody>${R.filter(x => x.round < r.round).slice(-8).map(x => `<tr><td class="num">R${x.round}</td><td>${K.pill(x.decision)}</td><td class="num ${D.cls(x.mean_gain)}">${D.f2(x.mean_gain)}</td><td class="num">${D.esc(x.behaviour ? x.behaviour.cell : '—')}</td></tr>`).join('') || `<tr><td colspan="4" class="note">${L('无', 'none')}</td></tr>`}</tbody></table></div></details>
        </div></div>`;

    document.getElementById('rPrev').onclick = () => K.goRound(r.round - 1);
    document.getElementById('rNext').onclick = () => K.goRound(r.round + 1);
    Lang.bind(pane);

    const df = D.diff(r.parent_source || '', r.source || '');
    document.getElementById('rDiff').innerHTML = df.html;
    document.getElementById('dfp').innerHTML = `<span class="pill acc">+${df.add}</span><span class="pill">−${df.del}</span>`;

    // evidence the model actually received: parent's logged traces on condition 0
    const P = parentR || { velocity_trace: run.baseline_trace.velocity_trace, thirds_trace: run.baseline_trace.thirds_trace, horizon: 200 };
    const dtP = P.horizon == 50 ? 0.2 : 0.8, cols = ['#3a7bd5', '#e0a030', '#d6517d'], nm = [Lt('左', 'L'), Lt('中', 'C'), Lt('右', 'R')];
    if (P.thirds_trace && P.thirds_trace.length) {
      C.lines(document.getElementById('rzT'), [0, 1, 2].map(j => ({ name: nm[j], color: cols[j], width: 2.2, pts: P.thirds_trace.map((g, i) => [(i + 1) * dtP, g[j] * 100]) })),
        { h: 170, x: [0, 20.3], y: [9, 14.5], xlabel: Lt('时间 (s)', 'Time (s)'), ylabel: Lt('含气量 %', 'Gas %'), xname: 't', digits: 2 });
      C.lines(document.getElementById('rzU'), [0, 1, 2].map(j => ({ name: nm[j], color: cols[j], width: 2.2, pts: P.velocity_trace.map((u, i) => [(i + 1) * dtP, u[j] * 1000]) })),
        { h: 140, x: [0, 20.3], y: [8, 52], xlabel: Lt('时间 (s)', 'Time (s)'), ylabel: Lt('气速 mm/s', 'Velocity mm/s'), xname: 't', digits: 1 });
    }
    const prevR = R.find(x => x.round === r.round - 1);
    D.zh(state.run).then(Z => {
      const z = Z[String(r.round)] || {}, zp = prevR ? Z[String(prevR.round)] || {} : {};
      const ok = r.decision === 'accepted';
      const outcome = `<p class="zh-t"><b class="${D.cls(r.mean_gain)}">${D.f2(r.mean_gain)}</b> · ${ok ? '晋升为新冠军' : r.decision === 'rejected_screen' ? '初筛被淘汰' : '没能稳定赢过冠军，未采纳'}</p><p class="en-t">${ok ? 'promoted to champion' : r.decision === 'rejected_screen' ? 'dropped at the quick screen' : 'did not reliably beat the champion; not adopted'}</p><p class="note">${L('这个结果会写进下一轮的证据里，模型据此更新笔记本、决定下一步。', 'This result goes into the next round\'s evidence; the model updates its notebook and plans the next step from it.')}</p>`;
      document.getElementById('rzSteps').innerHTML = D.reasonSteps(z, r, outcome);
      document.getElementById('rzRat').innerHTML = D.bitext(z.zh, r.rationale || r.error);
      document.getElementById('rzNb').innerHTML = D.bitext(z.nb || '（该运行的笔记本暂只提供英文原文）', r.notes, 'nbt');
      const pn = document.getElementById('rzPrevNb'); if (pn) pn.innerHTML = prevR ? D.bitext(zp.nb || '（该运行的笔记本暂只提供英文原文）', prevR.notes, 'nbt') : `<p class="note">${L('首轮，笔记本为空', 'First round: empty notebook')}</p>`;
      Lang.bind(pane);
    });

    D.rounds(state.run).then(rr => beforeAfter(rr, run, r, parentR, views));
  };

  function beforeAfter(rr, run, r, parentR, views) {
    const ba = document.getElementById('ba'); if (!ba) return;
    const byPolicy = {}; if (rr) for (const k in rr.rounds) byPolicy[rr.rounds[k].policy] = k;
    const ek = rr && byPolicy[r.id], pk = rr && (parentR ? byPolicy[parentR.id] : '0');
    if (!rr || ek == null || pk == null) return traces(ba, run, r, parentR);
    const A = D.roundEpisode(rr.rounds[pk], rr), B = D.roundEpisode(rr.rounds[ek], rr);
    const pz = parentR ? 'R' + parentR.round : Lt('均匀布气', 'equal flow');
    const lab = L('到此刻累计扣分', 'Penalty so far');
    ba.innerHTML = `<div class="vs ba-vs">${D.vsPanel('bA', L('改动前', 'Before') + ' · ' + pz, D.sig(parentR).split.join(' · '), lab)}${D.vsPanel('bB', L('本轮', 'This round') + ' · R' + r.round, D.sig(r).split.join(' · '), lab, B.ret > A.ret)}</div>
      <div class="ba-side"><div id="baPl"></div>
        <div class="chart" id="baE"></div><div class="chart" id="baU"></div>
        <div class="legend"><span><i style="background:#8e8e93"></i>${pz}</span><span><i style="background:#0066cc"></i>R${r.round}</span></div>${D.howto()}<div id="baCbar"></div></div>`;
    Lang.bind(ba);
    const o = { nx: rr.nx, ny: rr.ny, guide: true };
    const va = new CFD.FieldView(document.getElementById('bAC'), o), vb = new CFD.FieldView(document.getElementById('bBC'), o);
    views.push(va, vb);
    document.getElementById('baCbar').innerHTML = CFD.colorbar('dev', Lt('比同高度平均', 'vs. same-height average'));
    const tA = A.cp[A.cp.length - 1][1], tB = B.cp[B.cp.length - 1][1];
    const fE = C.lines(document.getElementById('baE'), [
      { name: pz, color: '#8e8e93', pts: A.cp, width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: B.cp, width: 2.5, area: true }],
      { h: 180, x: [0, 20.3], y: [0, Math.max(tA, tB) * 1.1], xlabel: Lt('回合内时间 (s)', 'Time in the episode (s)'), ylabel: Lt('累计扣分（越少越好）', 'Penalty (lower is better)'), xname: 't', digits: 2, margin: { r: 64 } });
    C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tA) + 4, tA.toFixed(1), { 'font-size': 11.5, fill: '#6e6e73', 'font-weight': 600 });
    C.text(fE.g, fE.sx(20.2) + 4, fE.sy(tB) + 4, tB.toFixed(1), { 'font-size': 11.5, fill: '#0066cc', 'font-weight': 700 });
    C.lines(document.getElementById('baU'), [
      { name: pz, color: '#8e8e93', pts: A.t.map((x, i) => [x, A.v[i][1] * 1000]), width: 2 },
      { name: 'R' + r.round, color: '#0066cc', pts: B.t.map((x, i) => [x, B.v[i][1] * 1000]), width: 2.5 }],
      { h: 160, x: [0, 20.3], y: [8, 52], xlabel: Lt('回合内时间 (s)', 'Time in the episode (s)'), ylabel: Lt('中间口气速 mm/s', 'Centre inlet, mm/s'), xname: 't', digits: 1 });
    const guide = C.el('line', { y1: fE.m.t, y2: fE.H - fE.m.b, stroke: '#1d1d1f', 'stroke-width': 1, opacity: 0.4 }, fE.svg);
    D.player(document.getElementById('baPl'), { watch: ba, n: A.t.length, t: A.t, fps: 6, draw: (k, mode) => {
      const t = A.t[k];
      D.vsFill('bA', va, D.frameAt(A, k, mode), A.ux[k], A.uy[k], A.v[k], rr.nx, rr.ny, D.cumAt(A.cp, t).toFixed(2));
      D.vsFill('bB', vb, D.frameAt(B, k, mode), B.ux[k], B.uy[k], B.v[k], rr.nx, rr.ny, D.cumAt(B.cp, t).toFixed(2));
      guide.setAttribute('x1', fE.sx(t)); guide.setAttribute('x2', fE.sx(t));
    } });
  }

  /* runs without per-round CFD replays: logged traces on condition 0 */
  function traces(ba, run, r, parentR) {
    const P = parentR || { velocity_trace: run.baseline_trace.velocity_trace, imbalance_trace: run.baseline_trace.imbalance_trace, thirds_trace: run.baseline_trace.thirds_trace };
    const pz = parentR ? 'R' + parentR.round : Lt('均匀布气', 'equal flow');
    const tt = (arr, h) => arr.map((_, i) => (i + 1) * (h === 50 ? 0.2 : 0.8));
    ba.style.gridTemplateColumns = '1fr 1fr';
    ba.innerHTML = `<div><div class="chart" id="trI"></div></div><div><div class="chart" id="trU"></div></div><p class="note" style="grid-column:1/-1">${L('该运行未做逐轮流场重算，此处显示运行日志中练习场景 1 的记录（每 0.8 s 一个点）。逐轮流场动画见“严格裁决 · 运行 1”。', 'Per-round field replays were not computed for this run; showing the logged practice-scene-1 traces (every 0.8 s). Per-round field playback: see "Strict verdict · run 1".')}</p>`;
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
