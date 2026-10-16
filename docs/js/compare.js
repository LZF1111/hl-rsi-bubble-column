/* HL vs SAC comparison and learned-mechanism views. */
(function () {
  const C = window.Charts, { esc, f3, cls, head } = window.U, V = window.EvoViews;
  const LCOL = { 'SAC seed 1': '#e14b8a', 'SAC seed 2': '#f08bb4', 'SAC seed 3': '#f6bfd5', 'HL run 1': '#7fb0f8', 'HL run 2': '#0071e3' };
  const mean = a => a.reduce((p, q) => p + q, 0) / a.length;

  V.compare = (ctx) => {
    const L = ctx.meta.learners, conds = ctx.meta.learner_conditions;
    const rows = Object.entries(L).map(([k, v]) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${LCOL[k]};margin-right:8px"></i>${k}</td>${v.gains.map(g => `<td class="num ${cls(g)}">${f3(g)}</td>`).join('')}<td class="num"><b class="${cls(mean(v.gains))}">${f3(mean(v.gains))}</b></td><td class="num">${(v.segments / 1000).toFixed(0)}k</td></tr>`).join('');
    return `${head('HL 与 SAC：两种完全不同的学习方式', '同一环境、执行器、奖励和观测。SAC 用梯度更新网络权重；HL 用 LLM 推理改写程序。下表是论文 v9 的五条件复测（ξ₀,ξ₁,ξ₂ 开发 + ξ₇,ξ₈ 留出）。')}
      <div class="grid g2">
        <div class="card"><h3>五条件增益 R − R₀</h3><table class="t"><thead><tr><th>学习者</th>${conds.map(c => `<th>ξ${c}</th>`).join('')}<th>均值</th><th>CFD 段</th></tr></thead><tbody>${rows}</tbody></table>
          <p class="note">HL run 1/2 来自含 SAC 先验提示的 robust 运行；无先验运行的结果见"进化总览"。学习者之间的差异比学习者内部（SAC 三个种子 +2.15 ~ +4.66）还小，所以不排名。</p></div>
        <div class="card"><h3>增益分布</h3><div class="chart" id="cmpBars"></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>SAC 学习曲线</h3><div class="chart" id="sacCurve"></div><p class="note">每回合只在 ξ₀ 训练，200 步回报；细线为原始回合，粗线为 50 回合滑动平均。灰虚线为均匀流 R₀(ξ₀) = −11.22。</p></div>
        <div class="card"><h3>本质对比</h3><table class="t"><tbody>
          <tr><th></th><th>SAC</th><th>HL</th></tr>
          <tr><th>学什么</th><td>网络权重 θ</td><td>一段可读程序</td></tr>
          <tr><th>知识在哪</th><td>θ + 回放池</td><td>程序库 + 轨迹 + 笔记本</td></tr>
          <tr><th>怎么改进</td><td>每步梯度</td><td>每轮 LLM 提案 → CFD → 裁决</td></tr>
          <tr><th>奖励粒度</th><td>每步 r_k（γ = 0.99）</td><td>回合配对增益 + 完整轨迹</td></tr>
          <tr><th>防运气</th><td>无显式机制</td><td>多条件 + 配对 + t 检验 + 确认</td></tr>
          <tr><th>成本</th><td>2×10⁵ 段 / 种子</td><td>3–6×10⁴ 段 / 运行</td></tr>
          <tr><th>产物</th><td>黑箱网络</td><td>3–60 行可审查代码</td></tr>
        </tbody></table></div>
      </div>`;
  };
  V.compare.after = (ctx) => {
    const L = ctx.meta.learners;
    C.bars(document.getElementById('cmpBars'), Object.entries(L).map(([k, v]) => ({ label: k.replace('seed ', 's'), values: v.gains.map((g, i) => ({ v: g, color: LCOL[k], name: 'ξ' + ctx.meta.learner_conditions[i], opacity: i >= 3 ? 1 : 0.55 })) })), { h: 260, ylabel: '增益' });
    const S = ctx.meta.sac_curves, cols = ['#e14b8a', '#f08bb4', '#c86fa0'], series = [];
    Object.entries(S).forEach(([k, v], j) => {
      series.push({ name: k + ' 原始', color: cols[j], pts: v.map((y, i) => [i + 1, y]), width: 0.6, opacity: 0.25, nohover: true });
      const w = 50, sm = v.map((_, i) => i < w - 1 ? null : mean(v.slice(i - w + 1, i + 1)));
      series.push({ name: k, color: cols[j], pts: sm.map((y, i) => [i + 1, y]), width: 2.5 });
    });
    series.push({ name: '均匀流', color: '#8e8e93', pts: [[1, -11.22], [1000, -11.22]], dash: '4 4', width: 1.5 });
    C.lines(document.getElementById('sacCurve'), series, { h: 260, y: [-20, -4], xlabel: '训练回合', ylabel: '回合回报 R', xname: '回合', xdigits: 0, digits: 2 });
  };

  V.mechanism = (ctx) => {
    const run = ctx.run, ch = run._final;
    const lines = (ch.source || '').split('\n').filter(Boolean).length;
    return `${head('学到了什么：控制慢的平均态，而不是快的混沌轨迹', '所有学到的控制器都收敛到同一个机制：等塔里充满气（约 2 s）之后，把中间口的气挪到两侧，并一直保持。')}
      <div class="grid g3">
        <div class="card span2"><h3>入口速度 u(t)，条件 ξ₀</h3><div class="chart" id="mechU"></div>
          <div class="legend"><span><i style="background:#e14b8a"></i>SAC seed 1 中间口</span><span><i style="background:#0071e3"></i>HL run 2 中间口</span><span><i style="background:#1a9e55"></i>当前运行冠军 中间口</span><span>虚线 = 左口</span></div></div>
        <div class="card" style="display:flex;flex-direction:column;align-items:center"><h3 style="align-self:flex-start">冠军回放</h3><div id="mechCol" style="width:100%;max-width:240px"></div><input type="range" id="mechT" min="0" max="${(run.rounds.find(r => r.id === ch.id) || {}).velocity_trace ? 24 : 0}" value="24" style="width:100%;accent-color:var(--blue)" aria-label="回放时间"><p class="note" id="mechTl"></p></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>本运行冠军程序 <span class="pill">${lines} 行</span><span class="pill acc">第 ${ch.round} 轮</span></h3><pre class="code">${esc(ch.source || '')}</pre>
          <p class="note">开发增益 ${f3(ch.mean)}；留出 ${run.final_test ? run.final_test.gains_vs_fixed.map(v => f3(v)).join(' / ') : '—'}。</p></div>
        <div class="card"><h3>时机比反馈重要</h3><table class="t"><thead><tr><th>控制器</th><th>稳态 (L, C, R) mm/s</th><th>五条件增益</th></tr></thead><tbody>
          <tr><td>SAC seed 1</td><td>(35.3, 21.1, 33.6)</td><td class="num pos">+4.66</td></tr>
          <tr><td>HL run 2</td><td>(34.4, 22.0, 33.6)</td><td class="num pos">+4.05</td></tr>
          <tr><td>常数设定点，2 s 起</td><td>(35, 21, 35)</td><td class="num pos">+4.20</td></tr>
          <tr><td>常数设定点，t = 0 起</td><td>(35, 21, 35)</td><td class="num neg">−0.40</td></tr>
          <tr><td>HL run 2 去掉反馈</td><td>—</td><td class="num pos">+3.54</td></tr></tbody></table>
          <p class="note">同一设定点，从 t = 0 开始是 −0.40，从 2 s 开始是 +4.20。</p></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>为什么混沌流还能控制</h3><div class="chart" id="lyap"></div><p class="note">两次只差 10⁻⁶ / 10⁻⁵ m/s 单步扰动的运行，气含率场 r.m.s. 距离按 e^{λt} 增长，λ ≈ 3.9 s⁻¹，约 3 s 后饱和。轨迹不可控。</p></div>
        <div class="card dark"><h3>但统计量可控</h3><p>回报是 20 s 内气分布的平均，而气分布由慢的大尺度液相环流决定：τ_I = 0.9 s，τ_C = 2.0 s，是 Lyapunov 时间的 3.5 和 8 倍。</p><p>均匀布气时中间上升、两壁下降的环流把气往中间卷。塔充满后减少中间供气，中央上升流"断粮"，环流减弱或翻转。环流指标 C 的均值从 +0.19 变为 −0.27 m/s（SAC seed 1）。</p><p>多轨迹评估让这种统计变化可测量；慢环流让它可实现。</p></div>
      </div>`;
  };
  V.mechanism.after = (ctx) => {
    const L = ctx.meta.learners, t = i => 0.3 + 0.1 * i, series = [];
    const add = (name, u, color) => {
      series.push({ name: name + ' C', color, pts: u.map((r, i) => [t(i), r[1] * 1000]), width: 2.4 });
      series.push({ name: name + ' L', color, pts: u.map((r, i) => [t(i), r[0] * 1000]), width: 1.2, dash: '4 3', nohover: true });
    };
    add('SAC s1', L['SAC seed 1'].u_xi0, '#e14b8a');
    add('HL run 2', L['HL run 2'].u_xi0, '#0071e3');
    const run = ctx.run, cr = run.rounds.find(r => r.id === run._final.id);
    if (cr && cr.velocity_trace) {
      const v = cr.velocity_trace;
      series.push({ name: '冠军 C', color: '#1a9e55', pts: v.map((r, i) => [0.2 + 0.8 * i, r[1] * 1000]), width: 2.4 });
      series.push({ name: '冠军 L', color: '#1a9e55', pts: v.map((r, i) => [0.2 + 0.8 * i, r[0] * 1000]), width: 1.2, dash: '4 3', nohover: true });
    }
    C.lines(document.getElementById('mechU'), series, { h: 260, y: [10, 45], x: [0, 20.3], xlabel: '时间 t (s)', ylabel: '入口速度 mm/s', xname: 't', digits: 1 });
    const ly = ctx.meta.lyapunov;
    C.lines(document.getElementById('lyap'), Object.entries(ly).map(([k, v], j) => ({ name: k.replace('d', 'δ='), color: j ? '#8e44ef' : '#0071e3', pts: v.t.map((x, i) => [x, v.rms[i] > 0 ? Math.log10(v.rms[i]) : null]) })),
      { h: 220, xlabel: '时间 t (s)', ylabel: 'log₁₀ r.m.s. Δα', xname: 't', yfmt: v => '1e' + v.toFixed(0), digits: 2 });
    const col = document.getElementById('mechCol'), sl = document.getElementById('mechT'), tl = document.getElementById('mechTl');
    const draw = () => {
      const v = cr && cr.velocity_trace ? cr.velocity_trace[+sl.value] : [0.03, 0.03, 0.03];
      const g = cr && cr.thirds_trace ? cr.thirds_trace[+sl.value] : null;
      col.innerHTML = window.columnSVG({ u: v });
      tl.textContent = `t = ${(0.2 + 0.8 * +sl.value).toFixed(1)} s` + (g ? ` · 三段气含率 ${g.map(x => x.toFixed(3)).join(' / ')}` : '');
    };
    sl.oninput = draw; draw();
  };
})();
