/* Round detail, archive, HL-vs-SAC and mechanism views. */
(function () {
  const C = window.Charts, { esc, f3, cls, head, DECISION } = window.U, H = window.EvoHelpers;
  const V = window.EvoViews;

  V.round = (ctx) => {
    const run = ctx.run, R = run.rounds, idx = Math.max(0, R.findIndex(r => r.round === ctx.round));
    const r = R[idx], d = DECISION[r.decision] || [r.decision, ''];
    const diff = H.diffLines(r.parent_source, r.source);
    const t = r.test || {}, dev = t.dev, all = t.all;
    const parentIsChamp = r.parent && r._champ && r.parent === (r._champ.id || '').slice(0, 12);
    const chips = R.map(x => `<button style="background:${H.DCOL[x.decision] || '#8e8e93'}" class="${x.round === r.round ? 'sel' : ''}" data-r="${x.round}" aria-label="第 ${x.round} 轮" title="第 ${x.round} 轮">${x.round}</button>`).join('');
    const delta = r.gains && r._champ.gains ? r.gains.map((g, i) => g - r._champ.gains[i]) : null;
    const md = delta ? delta.reduce((a, b) => a + b) / delta.length : null;
    return `${head(`第 ${r.round} 轮 <span class="pill ${d[1]}" style="font-size:15px;vertical-align:middle">${d[0]}</span>`, `候选 <code>${r.id}</code> · 父代 <code>${r.parent || '—'}</code>${parentIsChamp ? '（当时冠军，利用轮）' : '（存档精英，探索父代）'} · ${esc(r.model || '')} · 行为格 <b>${esc((r.behaviour || {}).cell || '—')}</b>${r.requested_cell ? ` · 被要求探索 <b>${esc(r.requested_cell)}</b>` : ''}`)}
      <div class="roundbar">
        <button id="rPrev" aria-label="上一轮">‹ 上一轮</button>
        <input type="range" id="rSlider" min="0" max="${R.length - 1}" value="${idx}" aria-label="选择轮次">
        <button id="rNext" aria-label="下一轮">下一轮 ›</button>
        <button id="rPlay" class="primary">▶ 播放进化</button>
      </div>
      <div class="chip-strip">${chips}</div>
      <div class="grid g4">
        <div class="card kpi"><b class="${cls(r.mean_gain)}">${f3(r.mean_gain)}</b><span>开发平均增益（${r.horizon || '—'} 步）</span></div>
        <div class="card kpi"><b class="${cls(md)}">${f3(md)}</b><span>相对当时冠军 d̄（冠军 ${f3(r._champ.mean)}）</span></div>
        <div class="card kpi"><b>${dev ? dev.t.toFixed(2) : '—'}</b><span>开发 t 值${all ? ` · 9 条件 t ${all.t.toFixed(2)}` : ''}</span></div>
        <div class="card kpi"><b>${((r.prompt_tokens || 0) / 1000).toFixed(1)}k</b><span>prompt tokens · 生成 ${r.completion_tokens || '—'} · ${r.latency_s ? r.latency_s.toFixed(0) + ' s' : ''}</span></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>大语言模型改了什么 <span class="pill acc">+${diff.add}</span><span class="pill rej">−${diff.del}</span></h3><h4>父代 → 本轮程序</h4><pre class="code">${diff.html}</pre></div>
        <div class="card"><h3>这一轮想检验什么</h3><h4>LLM rationale</h4><p class="prose">${esc(r.rationale || '—')}</p></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>各条件增益：候选 vs 当时冠军</h3><div class="chart" id="gainChart"></div>
          <div class="legend"><span><i style="background:#c7c7cc"></i>当时冠军</span><span><i style="background:#0071e3"></i>本轮候选</span><span><i style="background:#8e44ef"></i>确认条件（新鲜）</span></div>
          ${verdict(r, run)}</div>
        <div class="card"><h3>不均匀度 I(t)，条件 ξ₀</h3><div class="chart ti"></div><p class="note">${r.horizon === 50 ? '初筛只跑了 50 步（5 s）。' : '每 0.8 s 采样一次。'}灰线为均匀流。</p></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>控制策略：入口速度</h3><div class="chart tv"></div></div>
        <div class="card"><h3>效果：三段气含率</h3><div class="chart tg"></div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>HL 维护的笔记本 <span class="pill">${(r.notes || '').length} 字符</span></h3><p class="note">模型每轮重写整本笔记，替换上一版。这是跨轮积累"知识"的唯一载体。</p><p class="prose" style="max-height:480px">${esc(r.notes || '—')}</p></div>`;
  };
  function verdict(r, run) {
    const p = run.protocol, t = r.test || {};
    if (r.decision === 'rejected_screen') return `<p class="note">50 步初筛平均增益 ${f3(r.mean_gain)} &lt; −${p.screen_tolerance}，没有花 200 步。</p>`;
    if (!t.dev) return `<p class="note">评估规则：promote3（mean Δ &gt; ${p.minimum_gain}，min Δ ≥ −${p.max_regression}）。</p>`;
    const ok = (b, s) => `<span class="pill ${b ? 'acc' : 'rej'}">${b ? '✓' : '✗'} ${s}</span>`;
    const dv = t.dev;
    let s = `<h4>裁决</h4>${ok(dv.mean > p.minimum_gain, `d̄ ${dv.mean.toFixed(2)} > ${p.minimum_gain}`)}${ok(dv.mean > p.kappa * dv.se, `d̄ > ${p.kappa}·SE (${(p.kappa * dv.se).toFixed(2)})`)}${ok(dv.min >= -p.max_regression, `min d ${dv.min.toFixed(2)} ≥ −${p.max_regression}`)}`;
    if (t.all) s += `<br>${ok(t.all.mean > p.minimum_gain && t.all.mean > p.kappa * t.all.se && t.all.min >= -p.max_regression, `9 条件检验 t=${t.all.t.toFixed(2)}`)}${ok((t.confirm_deltas || []).reduce((a, b) => a + b, 0) > 0, '确认均值 > 0')}`;
    return s;
  }
  V.round.after = (ctx) => {
    const run = ctx.run, R = run.rounds, idx = Math.max(0, R.findIndex(r => r.round === ctx.round)), r = R[idx];
    H.gainBars(r, run, document.getElementById('gainChart'));
    H.traceCharts(r, run.baseline_trace, document.getElementById('stage'));
    const go = i => ctx.go('round', R[Math.max(0, Math.min(R.length - 1, i))].round, true);
    document.getElementById('rPrev').onclick = () => go(idx - 1);
    document.getElementById('rNext').onclick = () => go(idx + 1);
    document.getElementById('rSlider').oninput = e => go(+e.target.value);
    document.querySelectorAll('.chip-strip button').forEach(b => b.onclick = () => ctx.go('round', +b.dataset.r, true));
    const play = document.getElementById('rPlay');
    if (ctx.playing) play.textContent = '❚❚ 暂停';
    play.onclick = () => ctx.togglePlay();
  };

  V.archive = (ctx) => {
    const run = ctx.run, ax = ctx.meta.behaviour_axes;
    const best = {};
    for (const r of run.rounds) { const c = (r.behaviour || {}).cell; if (c && r.mean_gain != null && r.horizon === 200 && (!best[c] || r.mean_gain > best[c].mean_gain)) best[c] = r; }
    const acts = ['a0', 'a1', 'a2', 'a3', 'a4'], phases = ['p0', 'p1', 'p2', 'p3'];
    const col = g => g == null ? null : g >= 0 ? `rgba(26,158,85,${0.25 + Math.min(1, g / 2.6) * 0.75})` : `rgba(227,52,47,${0.25 + Math.min(1, -g / 2) * 0.75})`;
    const grids = ax.bias.map(b => `<div class="card"><h3>${({ left: '偏左', centre: '偏中', right: '偏右', sides: '两侧', flat: '平' })[b]} <small class="note">${b}</small></h3>
      <div class="cells" style="grid-template-columns:22px repeat(${phases.length},minmax(0,1fr))"><div></div>${phases.map(p => `<div class="note" style="text-align:center">${p}</div>`).join('')}
      ${acts.map(a => `<div class="note" style="align-self:center">${a}</div>` + phases.map(p => { const c = `${a}_${b}_${p}`, r = best[c]; return r ? `<div class="cell" style="background:${col(r.mean_gain)};cursor:pointer" data-round="${r.round}" title="${c}">${f3(r.mean_gain)}<span style="opacity:.8">R${r.round}</span></div>` : `<div class="cell empty">·</div>`; }).join('')).join('')}</div></div>`).join('');
    return `${head('MAP-Elites 行为存档', '格子按 CFD 跑出来的行为分类，不看源码。每格只留最高分程序；进存档的门槛很松，取代冠军的门槛很严。这保住了"不是最好但做法不同"的跳板。')}
      <div class="grid g3"><div class="card kpi"><b>${Object.keys(best).length}</b><span>已占据行为格（共 ${acts.length * ax.bias.length * phases.length}）</span></div>
      <div class="card"><h4 style="margin-top:0">actuation</h4><p class="note">mean|u − 0.03| 分箱 ${ax.actuation.join(' / ')} m/s → a0–a4</p></div>
      <div class="card"><h4 style="margin-top:0">phase</h4><p class="note">后半 / 前半回合平均 I 之比，分箱 ${ax.phase.join(' / ')} → p0–p3（p3 = 后期变差）</p></div></div>
      <div class="grid g3" style="margin-top:16px">${grids}</div>`;
  };
  V.archive.after = (ctx) => document.querySelectorAll('.cell[data-round]').forEach(c => c.onclick = () => ctx.go('round', +c.dataset.round));
})();
