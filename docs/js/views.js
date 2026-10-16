/* Task-definition views + shared helpers. */
(function () {
  const C = window.Charts;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f3 = (v, d) => v == null ? '—' : (v >= 0 ? '+' : '') + (+v).toFixed(d == null ? 2 : d);
  const cls = v => v == null ? '' : v >= 0 ? 'pos' : 'neg';
  const head = (t, p) => `<div class="vh"><h2>${t}</h2>${p ? `<p>${p}</p>` : ''}</div>`;
  const RUN_LABEL = {
    hl_h200_nohint_stat01: ['无先验 · 统计评估 01', 't 检验'],
    hl_h200_nohint_stat02: ['无先验 · 统计评估 02', 't 检验'],
    hl_h200_nohint01: ['无先验 · 简单评估 01', 'promote3'],
    hl_h200_nohint02: ['无先验 · 简单评估 02', 'promote3'],
  };
  const DECISION = {
    accepted: ['晋升为冠军', 'acc'], rejected_regression: ['未通过裁决', 'rej'], rejected_screen: ['初筛淘汰', 'scr'],
    evaluation_failed: ['运行失败', 'rej'], rejected_preflight: ['编译拒绝', 'rej'], champion: ['与冠军重复', ''], evaluated: ['已评估', ''],
  };
  window.U = { esc, f3, cls, head, RUN_LABEL, DECISION };

  /* Column schematic: 0.15 m wide, 1.0 m tall, water 0.70 m, window 0.05-0.6 m, 9 probes. */
  function columnSVG(opts) {
    opts = opts || {};
    const u = opts.u || [0.03, 0.03, 0.03];
    const W = 300, H = 420, x0 = 90, w = 120, y0 = 20, h = 360, sy = y => y0 + h * (1 - y);
    const water = sy(0.7), win0 = sy(0.6), win1 = sy(0.05);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="鼓泡塔示意图">`;
    s += `<defs><linearGradient id="wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff"/><stop offset="1" stop-color="#7fb8f5"/></linearGradient></defs>`;
    s += `<rect x="${x0}" y="${water}" width="${w}" height="${sy(0) - water}" fill="url(#wat)" />`;
    s += `<rect x="${x0}" y="${win0}" width="${w}" height="${win1 - win0}" fill="none" stroke="#0071e3" stroke-dasharray="4 3" />`;
    [0, 1, 2].forEach(i => { const xx = x0 + w * i / 3; if (i) s += `<line x1="${xx}" x2="${xx}" y1="${win0}" y2="${win1}" stroke="#0071e3" stroke-dasharray="2 4" opacity=".6"/>`; });
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="#1d1d1f" stroke-width="2.5" rx="2"/>`;
    for (const yy of [0.15, 0.35, 0.55]) for (const xx of [0.025, 0.075, 0.125]) s += `<circle cx="${x0 + w * xx / 0.15}" cy="${sy(yy)}" r="3.2" fill="#fff" stroke="#1d1d1f" stroke-width="1.4"/>`;
    const cols = ['var(--L)', 'var(--C)', 'var(--R)'], names = ['左 L', '中 C', '右 R'];
    u.forEach((v, i) => {
      const cx = x0 + w * (i + 0.5) / 3, len = 14 + (v - 0.01) / 0.04 * 34;
      s += `<rect x="${x0 + w * i / 3 + 2}" y="${sy(0) - 1}" width="${w / 3 - 4}" height="5" fill="${cols[i]}" rx="2"/>`;
      s += `<line x1="${cx}" x2="${cx}" y1="${sy(0) + 10 + len}" y2="${sy(0) + 10}" stroke="${cols[i]}" stroke-width="3" marker-end="url(#ah${i})"/>`;
      s += `<defs><marker id="ah${i}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${cols[i]}"/></marker></defs>`;
      s += `<text x="${cx}" y="${H - 2}" text-anchor="middle" font-size="11" fill="#6e6e73">${names[i]} ${(v * 1000).toFixed(1)}</text>`;
    });
    const lab = (y, t, c) => `<text x="${x0 + w + 10}" y="${sy(y) + 4}" font-size="11" fill="${c || '#6e6e73'}">${t}</text>`;
    s += lab(1, '1.00 m 出口') + lab(0.7, '0.70 m 液面') + lab(0.6, '0.60 m', '#0071e3') + lab(0.05, '0.05 m 评分窗', '#0071e3');
    s += `<text x="${x0 - 8}" y="${sy(0.35) + 4}" text-anchor="end" font-size="11" fill="#6e6e73">9 个压力探针</text>`;
    s += `<text x="${x0 + w / 2}" y="${y0 - 6}" text-anchor="middle" font-size="11" fill="#6e6e73">0.15 m × 0.15 m</text>`;
    if (opts.bubbles) s += `<g id="bub" clip-path="inset(0)"></g>`;
    return s + '</svg>';
  }
  window.columnSVG = columnSVG;

  const V = {};
  V.goal = () => `
    ${head('控制目标：让气体在塔里分布均匀。', '三入口方形鼓泡塔。总气量固定，只能在左、中、右之间重新分配。目标是评分窗内左/中/右三段的平均气含率尽量相等。')}
    <div class="grid g3">
      <div class="card span1" style="display:flex;align-items:center;justify-content:center">${columnSVG()}</div>
      <div class="card span2">
        <h3>装置与模型</h3>
        <table class="t"><tbody>
          <tr><th>几何</th><td>0.15 × 1.0 × 0.15 m 方塔，初始水深 0.70 m</td></tr>
          <tr><th>布气</th><td>底部左 / 中 / 右三块等面积入口，覆盖全底面</td></tr>
          <tr><th>求解器</th><td>OpenFOAM v2306 <code>twoPhaseEulerFoam</code>，Euler–Euler 两流体，层流，12×40×4 网格</td></tr>
          <tr><th>封闭</th><td>Schiller–Naumann 曳力，虚拟质量 0.5，等温气泡直径 3 mm</td></tr>
          <tr><th>时序</th><td>0.2 s 均匀流启动 → 200 个控制步，每步 0.1 s，共 20 s 物理时间</td></tr>
          <tr><th>观测</th><td>21 维：9 个中平面压力（去静压 / 6867 Pa）、9 个一步增量、3 个上一步入口速度</td></tr>
          <tr><th>难点</th><td>流动混沌：有限时间 Lyapunov 指数 λ ≈ 3.9 s⁻¹，e 折时间 0.26 s，不到 3 个控制步。10⁻⁴ m/s 的启动扰动让单回合回报散布 σ ≈ 1.4</td></tr>
        </tbody></table>
        <h4>为什么这是一个好的 RSI 试验场</h4>
        <p>每次评估都要跑真实 CFD，单个候选 6 条件 × 200 步约 5 分钟。回报被混沌噪声污染，"看起来更好"很可能是运气。学习系统必须自己判断哪些证据可信，并把结论写进笔记本留给下一轮的自己。</p>
      </div>
    </div>`;

  V.strategy = () => {
    const S = [
      ['◎', '均匀流（基线）', 'action = [0, 0, 0]，三口各 30 mm/s。所有增益都相对它计算。', 'a0_flat'],
      ['⇄', '开环重分配', '等塔充满后，把中间口的气挪到两侧并保持。时机 + 设定点 + 斜坡。', 'a2–a3 sides'],
      ['↺', '压力反馈', '用左右 / 中侧压力差实时推动设定点，低通滤波、增益、限幅。', 'a1–a2'],
      ['∿', '脉冲 / 行波', '周期性振荡或行波激励，试图打断大尺度环流。', 'a3–a4'],
      ['▣', '阶段机 / 混合', '多阶段时间表 + 反馈 + 积分项组合，由 LLM 自由组合。', '任意格'],
      ['θ', 'SAC（对照）', '2×64 高斯策略网络，输入最近 4 帧观测 + 时间，梯度学习。', '—'],
    ];
    return `${head('可选控制策略', 'HL 不从固定菜单里挑。它写任意受限 Python 程序，下面只是实际运行中出现过的策略家族。')}
      <div class="grid g3">${S.map(s => `<div class="card strategy-card"><div class="icon">${s[0]}</div><h3>${s[1]}</h3><p>${s[2]}</p><span class="pill blue">行为格 ${s[3]}</span></div>`).join('')}</div>
      <div class="card" style="margin-top:16px"><h3>程序可以用什么</h3>
      <p>只读输入 <code>obs</code>（21 维）、<code>step</code>（0–199）、<code>dt</code>、<code>pi</code>；跨步记忆 <code>memory</code>（≤128 个元素，每回合清空）；输出 <code>action = [a_L, a_C, a_R]</code>。</p>
      <p>允许：四则运算、比较、if/else、列表/字典、for range(≤128)、abs / min / max / sum / len / sin / cos / sqrt / tanh / exp。禁止：import、属性、方法调用、函数定义、while、文件、网络、随机数、exec。每步 ≤5000 AST 节点。</p>
      <p class="note">由 <code>hl_runtime.CodePolicy</code> 自行遍历 AST 执行，不调用 Python exec。同一程序 + 同一条件必得同一回报。</p></div>`;
  };

  V.range = () => `
    ${head('控制范围与约束', '无论 LLM 写出什么，执行器都会把动作投影进物理可行域。拖动下面的原始动作，看实际入口速度。')}
    <div class="grid g2">
      <div class="card">
        <h3>执行器映射</h3>
        <div class="formula">c = a − mean(a)
u* = 0.03 + 0.02 · c / max(1, max|c|)   [m/s]
u ← u + clip(u* − u, ±0.005)           每步限速</div>
        <h4>约束</h4>
        <table class="t"><tbody>
          <tr><th>单口速度</th><td>0.01 – 0.05 m/s</td></tr>
          <tr><th>总气量</th><td>Σu = 0.09 m/s 恒定（6.75×10⁻⁴ m³/s）</td></tr>
          <tr><th>限速</th><td>每个控制步 |Δu| ≤ 0.005 m/s</td></tr>
          <tr><th>动作空间</th><td>a ∈ [−1, 1]³，共模分量被去除</td></tr>
        </tbody></table>
      </div>
      <div class="card">
        <h3>试一试</h3>
        ${['L', 'C', 'R'].map((k, i) => `<label style="display:flex;gap:10px;align-items:center;margin:8px 0;font-size:14px"><b style="width:18px;color:var(--${k})">${k}</b><input type="range" min="-1" max="1" step="0.01" value="0" data-act="${i}" style="flex:1;accent-color:var(--${k})" aria-label="原始动作 ${k}"><span class="num" id="actv${i}">0.00</span></label>`).join('')}
        <div id="actCol" style="max-width:260px;margin:0 auto"></div>
        <p class="note" id="actNote"></p>
      </div>
    </div>`;
  V.range.after = () => {
    const ins = [...document.querySelectorAll('[data-act]')];
    const upd = () => {
      const a = ins.map(i => +i.value); ins.forEach((x, i) => document.getElementById('actv' + i).textContent = (+x.value).toFixed(2));
      const m = (a[0] + a[1] + a[2]) / 3, c = a.map(v => v - m), mx = Math.max(1, ...c.map(Math.abs));
      const u = c.map(v => 0.03 + 0.02 * v / mx);
      document.getElementById('actCol').innerHTML = columnSVG({ u });
      document.getElementById('actNote').textContent = `目标速度 ${u.map(v => (v * 1000).toFixed(1)).join(' / ')} mm/s，和 = ${(u.reduce((p, q) => p + q, 0) * 1000).toFixed(1)} mm/s。从均匀流出发约需 ${Math.ceil(Math.max(...u.map(v => Math.abs(v - 0.03))) / 0.005)} 步到达。`;
    };
    ins.forEach(i => i.addEventListener('input', upd)); upd();
  };

  V.reward = () => `
    ${head('奖励函数怎么定义', '单步奖励惩罚三段气含率不均、横向压力差和动作抖动。I 占回报 99.7%。')}
    <div class="grid g2">
      <div class="card">
        <div class="formula" style="font-size:16px">r_k = − I_k − 0.1·P_k − 0.01·S_k
R   = Σ_{k=1}^{200} r_k</div>
        <h4>各项</h4>
        <table class="t"><tbody>
          <tr><th>I</th><td>g = 评分窗 0.05 ≤ y ≤ 0.6 m 内左/中/右三段平均气含率；I = std(g) / (mean(g) + 0.01)</td></tr>
          <tr><th>P</th><td>三个高度上归一化压力的横向标准差，取平均</td></tr>
          <tr><th>S</th><td>mean(((u_new − u_old) / 0.02)²)，惩罚入口突变</td></tr>
        </tbody></table>
        <h4>HL 实际用的分数</h4>
        <div class="formula">gain_ξ = R_P(ξ) − R_fixed(ξ)      同一条件配对
score  = mean_ξ gain_ξ</div>
        <p class="note">均匀流回报 R₀ 在 ξ₀–ξ₅ 上为 −11.22 / −13.32 / −11.15 / −12.93 / −12.27 / −11.19。配对相减消掉条件本身的"底子"。</p>
      </div>
      <div class="card">
        <h3>拖动三段气含率，看 I</h3>
        ${['左', '中', '右'].map((k, i) => `<label style="display:flex;gap:10px;align-items:center;margin:10px 0;font-size:14px"><b style="width:22px">${k}</b><input type="range" min="0.02" max="0.2" step="0.001" value="${[0.105, 0.12, 0.1][i]}" data-g="${i}" style="flex:1" aria-label="${k}段气含率"><span class="num" id="gv${i}"></span></label>`).join('')}
        <div class="grid g2" style="margin-top:12px">
          <div class="kpi"><b id="iVal">—</b><span>本步 I</span></div>
          <div class="kpi"><b id="rVal">—</b><span>若整回合保持，R ≈ −200·I</span></div>
        </div>
        <div class="bar" style="margin-top:14px"><i id="iBar"></i></div>
        <p class="note">均匀流典型 I 在 0.05–0.14 之间波动；好的控制器让 R 提高 2–4，约 3σ。</p>
      </div>
    </div>`;
  V.reward.after = () => {
    const ins = [...document.querySelectorAll('[data-g]')];
    const upd = () => {
      const g = ins.map(i => +i.value); g.forEach((v, i) => document.getElementById('gv' + i).textContent = v.toFixed(3));
      const m = g.reduce((a, b) => a + b) / 3, sd = Math.sqrt(g.reduce((a, b) => a + (b - m) ** 2, 0) / 3), I = sd / (m + 0.01);
      document.getElementById('iVal').textContent = I.toFixed(4);
      document.getElementById('rVal').textContent = (-200 * I).toFixed(2);
      document.getElementById('iBar').style.width = Math.min(100, I / 0.3 * 100) + '%';
    };
    ins.forEach(i => i.addEventListener('input', upd)); upd();
  };

  V.evaluator = (ctx) => {
    const p = ctx.run.protocol, t = p.acceptance === 'paired_t';
    const steps = t ? [
      ['编译', '受限解释器解析源码；违规直接拒绝，不花 CFD'],
      [`${p.screen_horizon} 步初筛`, `${p.dev_seeds.length} 个开发条件；平均增益 < −${p.screen_tolerance} 即淘汰`],
      ['200 步完整评估', `ξ${p.dev_seeds.join(', ξ')} 并行`],
      ['配对 t 检验', `d = 候选 − 冠军；mean(d) > ${p.minimum_gain}，mean(d) > ${p.kappa}·SE，且每个 d ≥ −${p.max_regression}`],
      ['确认条件', `新鲜条件 ξ${p.confirm_seeds.join(', ξ')}；9 条件重检且确认均值 > 0 才晋升`],
      ['留出测试', `ξ${p.test_seeds.join(', ξ')} 只在封存时跑一次，从不展示给模型`],
    ] : [
      ['编译', '受限解释器解析源码'], [`${p.screen_horizon} 步初筛`, `平均增益 < −${p.screen_tolerance} 即淘汰`],
      ['200 步完整评估', `ξ${p.dev_seeds.join(', ξ')}`],
      ['promote3', `mean(Δ) > ${p.minimum_gain} 且 min(Δ) ≥ −${p.max_regression}`],
      ['留出测试', `ξ${p.test_seeds.join(', ξ')}`],
    ];
    return `${head('评估器：决定哪些进步可信', '评估器不改流动、不改程序，只决定学习者能相信哪些回报差异。在混沌流里，评估器设计就是学习算法设计。')}
      <div class="grid g3">${steps.map((s, i) => `<div class="card"><span class="pill blue">${i + 1}</span><h3 style="margin-top:8px">${s[0]}</h3><p>${s[1]}</p></div>`).join('')}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>为什么要这么严</h3><p>N 个毫无效果的程序里，单条件最好的观测增益约为 σ√(2 ln N)。N = 122、σ = 1.4 时约 +3.6，纯靠运气就能"进步" 25%。</p><p>蒙特卡洛（σ = 1.4）：旧 promote3 对零效应候选误收约 21%；配对 t 检验约 2%，对真实 +1.5 增益的检出率仍约 70%。</p></div>
        <div class="card dark"><h3>当前运行：${U.RUN_LABEL[ctx.run.run][0]}</h3><p>种群 ${p.population_size} · 每 ${p.explore_every} 轮探索一次 · 停滞 ${p.stagnation_limit} 轮（增益 &lt; ${p.stagnation_gain}）即停 · API 上限 ${p.max_api_calls} 次 · CFD 段上限 ${p.max_segments.toLocaleString()}</p><p style="opacity:.7">${esc(p.evaluation_note || '')}</p></div>
      </div>`;
  };

  V.prompt = (ctx) => {
    const t = ctx.run.protocol.acceptance === 'paired_t' ? ctx.meta.prompt.system_paired_t : ctx.meta.prompt.system_promote3;
    const marked = esc(t).replace(/\b(PLANT|OBSERVATION|ACTION|REWARD per step|EVALUATION|PROGRAM|CONTEXT|RETURN JSON)\b:?/g, '\n\n<mark>$1</mark>').trim();
    return `${head('提示词：只有任务定义，没有答案', '无先验（nohint）版本的系统提示。它描述装置、观测、执行器、奖励、评估规则和语法，但从不说哪种控制有效。模型靠自己的笔记本积累结论。')}
      <div class="grid g3">
        <div class="card span2"><h3>System prompt <span class="pill">${t.length.toLocaleString()} 字符</span></h3><div class="prompt">${marked}</div></div>
        <div class="card"><h3>每轮用户消息里还有</h3><ul>
          <li>上一轮自己写的笔记本（≤6000 字符）</li><li>冠军与父代：完整源码、理由、各条件增益、轨迹</li>
          <li>最近 40 个候选的实验表</li><li>初筛淘汰者的早期轨迹</li><li>MAP-Elites 存档与未探索格</li>
          <li>探索轮随机抽取的 <code>requested_behaviour_cell</code></li><li>均匀流在各条件上的回报</li></ul>
          <h4>模型返回</h4><div class="formula">{ "source":    受限 Python 程序,
  "rationale": 这次检验什么、依据什么,
  "notes":     替换旧笔记本 }</div>
          <p class="note">对照组 robust02/03 的提示里含有 SAC 解的形状（不公平）；这里展示的全部是无先验运行。</p></div>
      </div>`;
  };

  window.TaskViews = V;
})();
