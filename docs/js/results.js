/* Result views: evolution overview and per-round detail. */
(function () {
  const C = window.Charts, { esc, f3, cls, head, DECISION } = window.U;
  const DCOL = { accepted: '#1a9e55', rejected_regression: '#8e8e93', rejected_screen: '#f5a623', evaluation_failed: '#e3342f', rejected_preflight: '#e3342f', champion: '#c7c7cc', evaluated: '#8e8e93' };

  /* Champion history: for each round, champion id/gains *before* the round's decision. */
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
  window.annotateRun = annotate;

  function diffLines(a, b) {
    const A = (a || '').replace(/\n$/, '').split('\n'), B = (b || '').replace(/\n$/, '').split('\n');
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0, add = 0, del = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push(['', A[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { out.push(['del', A[i++]]); del++; }
      else { out.push(['add', B[j++]]); add++; }
    }
    while (i < n) { out.push(['del', A[i++]]); del++; }
    while (j < m) { out.push(['add', B[j++]]); add++; }
    return { html: out.map(([k, s]) => `<span class="${k}">${k === 'add' ? '+ ' : k === 'del' ? '− ' : '  '}${esc(s)}</span>`).join('\n'), add, del };
  }

  const tAxis = (n, horizon) => i => 0.2 + (horizon === 50 ? 0.2 : 0.8) * i;

  function traceCharts(r, base, el) {
    const ht = r.horizon || 200, tx = tAxis(0, ht), bt = tAxis(0, 200);
    const v = r.velocity_trace || [], g = r.thirds_trace || [], I = r.imbalance_trace || [];
    const names = ['左 L', '中 C', '右 R'], cols = ['#2f7cf6', '#f5a623', '#e14b8a'];
    C.lines(el.querySelector('.tv'), names.map((nm, k) => ({ name: nm, color: cols[k], pts: v.map((row, i) => [tx(i), row[k] * 1000]) })),
      { h: 200, y: [8, 52], xlabel: '时间 t (s)', ylabel: '入口 mm/s', xname: 't', digits: 1, x: [0, 20.2] });
    C.lines(el.querySelector('.tg'), names.map((nm, k) => ({ name: nm, color: cols[k], pts: g.map((row, i) => [tx(i), row[k]]) })),
      { h: 200, xlabel: '时间 t (s)', ylabel: '三段气含率', xname: 't', x: [0, 20.2] });
    const bI = (base.imbalance_trace || []).map((y, i) => [bt(i), y]).filter(p => p[0] <= (ht === 50 ? 5.2 : 21));
    C.lines(el.querySelector('.ti'), [
      { name: '均匀流 ξ₀', color: '#c7c7cc', pts: bI, width: 2 },
      { name: '本轮程序 ξ₀', color: '#0071e3', pts: I.map((y, i) => [tx(i), y]), area: true, anim: true },
    ], { h: 200, xlabel: '时间 t (s)', ylabel: '不均匀度 I', xname: 't', x: [0, ht === 50 ? 5.2 : 20.2] });
  }

  function gainBars(r, run, el) {
    const seeds = run.protocol.dev_seeds, cs = run.protocol.confirm_seeds || [];
    const groups = seeds.map((s, i) => ({ label: 'ξ' + s, values: [
      { v: r._champ.gains ? r._champ.gains[i] : 0, color: '#c7c7cc', name: '当时冠军' },
      { v: r.gains ? r.gains[i] : null, color: '#0071e3', name: '本轮候选' }] }));
    (r.confirm_gains || []).forEach((v, i) => groups.push({ label: 'ξ' + cs[i] + '✓', values: [{ v: null }, { v, color: '#8e44ef', name: '确认条件' }] }));
    C.bars(el, groups, { h: 210, ylabel: '增益 R − R₀', label: '各条件增益' });
  }

  const V = {};
  V.evolution = (ctx) => {
    const run = ctx.run, R = run.rounds, fin = run.final_test;
    const acc = R.filter(r => r.decision === 'accepted').length, scr = R.filter(r => r.decision === 'rejected_screen').length;
    const tok = R.reduce((a, r) => a + (r.prompt_tokens || 0) + (r.completion_tokens || 0), 0);
    return `${head('进化总览', '每个点是一轮 LLM 提案在开发条件上的平均增益。绿色台阶是冠军：只有通过评估器的程序才能让它上升。点击任意点查看那一轮。')}
      <div class="grid g4">
        <div class="card kpi"><b>${run.rounds_total}</b><span>轮次 · ${acc} 次晋升 · ${scr} 次初筛淘汰</span></div>
        <div class="card kpi"><b class="pos">${f3(run._final.mean)}</b><span>冠军开发增益（第 ${run._final.round} 轮诞生）</span></div>
        <div class="card kpi"><b class="${cls(fin && fin.mean_gain_vs_fixed)}">${f3(fin && fin.mean_gain_vs_fixed)}</b><span>留出 ξ${run.protocol.test_seeds.join('/ξ')} 平均增益（${fin ? fin.gains_vs_fixed.map(v => f3(v)).join(' / ') : '—'}）</span></div>
        <div class="card kpi"><b>${(tok / 1e6).toFixed(2)}M</b><span>LLM tokens · ${run.segments.toLocaleString()} CFD 段</span></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>递归自我改进轨迹</h3><div class="chart" id="evoChart"></div>
        <div class="legend"><span><i style="background:#1a9e55"></i>晋升</span><span><i style="background:#8e8e93"></i>未通过裁决</span><span><i style="background:#f5a623"></i>初筛淘汰（50 步）</span><span><i style="background:#1a9e55;height:3px"></i>冠军台阶</span><span>◯ 黑圈 = 探索轮（随机指定行为格）</span></div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>成本与进步</h3><div class="chart" id="costChart"></div><p class="note">横轴为累计 CFD 段（0.1 s 物理时间一段，含初筛与确认）。</p></div>
        <div class="card"><h3>每轮提示长度</h3><div class="chart" id="tokChart"></div><p class="note">上下文随实验表、笔记本和存档增长；模型每轮都在读更厚的"账本"。</p></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>轮次一览</h3><div style="overflow:auto;max-height:520px"><table class="t"><thead><tr><th>#</th><th>决策</th><th>开发增益</th><th>vs 冠军 d̄</th><th>行为格</th><th>LLM 理由（节选）</th></tr></thead><tbody>
        ${R.map(r => `<tr class="clickable" data-round="${r.round}"><td class="num">${r.round}</td><td><span class="pill ${(DECISION[r.decision] || ['', ''])[1]}">${(DECISION[r.decision] || [r.decision])[0]}</span></td><td class="num ${cls(r.mean_gain)}">${f3(r.mean_gain)}</td><td class="num">${r.test && r.test.dev ? f3(r.test.dev.mean) : '—'}</td><td class="num">${esc(r.behaviour ? r.behaviour.cell : '—')}${r.requested_cell ? `<br><small class="note">要求 ${esc(r.requested_cell)}</small>` : ''}</td><td style="max-width:460px">${esc((r.rationale || '').slice(0, 160))}…</td></tr>`).join('')}
      </tbody></table></div></div>`;
  };
  V.evolution.after = (ctx) => {
    const run = ctx.run, R = run.rounds;
    const ys = R.map(r => r.mean_gain).filter(v => v != null);
    const step = [[0, 0]]; R.forEach(r => { step.push([r.round - 0.5, step[step.length - 1][1]]); step.push([r.round - 0.5, r._champAfter.mean]); });
    step.push([R.length + 0.5, run._final.mean]);
    const f = C.lines(document.getElementById('evoChart'), [{ name: '冠军', color: '#1a9e55', pts: step, width: 3, nohover: true }],
      { h: 300, x: [0, R.length + 1], y: C.extent(ys.concat([0]), 0.1), zero: true, xlabel: '进化轮次', ylabel: '开发平均增益', hover: false });
    C.scatter(f, R.filter(r => r.mean_gain != null).map(r => ({ x: r.round, y: r.mean_gain, color: DCOL[r.decision] || '#8e8e93', r: r.decision === 'accepted' ? 8 : 5, ring: !!r.requested_cell,
      html: `<b>第 ${r.round} 轮</b> · ${(DECISION[r.decision] || [r.decision])[0]}<br>增益 ${f3(r.mean_gain)}${r.behaviour ? ' · ' + esc(r.behaviour.cell) : ''}<br><span style="opacity:.75">${esc((r.rationale || '').slice(0, 140))}…</span>`,
      onclick: () => ctx.go('round', r.round) })));
    const sc = ((ctx.meta.search_cost || {})[run.run] || {}).rows || [];
    if (sc.length) {
      let best = 0; const bpts = [], all = [], gid = {};
      sc.forEach(row => {
        if (row.accepted) best = gid[row.id] != null ? gid[row.id] : best;
        else { gid[row.id] = row.gain; all.push([row.seg, row.gain]); }
        bpts.push([row.seg, best]);
      });
      const ff = C.lines(document.getElementById('costChart'), [{ name: '冠军', color: '#1a9e55', pts: bpts, width: 3 }],
        { h: 220, zero: true, y: C.extent(all.map(p => p[1]).concat([0, best])), xlabel: '累计 CFD 段', ylabel: '增益', xname: 'CFD 段', xdigits: 0 });
      C.scatter(ff, all.map(p => ({ x: p[0], y: p[1], r: 3.5, color: '#c7c7cc' })));
    }
    C.bars(document.getElementById('tokChart'), R.map(r => ({ label: R.length > 20 && r.round % 5 ? '' : String(r.round), values: [{ v: (r.prompt_tokens || 0) / 1000, color: '#0071e3', name: 'prompt k tokens' }, { v: (r.completion_tokens || 0) / 1000, color: '#8e44ef', name: 'completion k tokens' }] })),
      { h: 220, ylabel: 'k tokens' });
    document.querySelectorAll('tr[data-round]').forEach(tr => tr.addEventListener('click', () => ctx.go('round', +tr.dataset.round)));
  };
  window.EvoViews = V;
  window.EvoHelpers = { diffLines, traceCharts, gainBars, DCOL };
})();
