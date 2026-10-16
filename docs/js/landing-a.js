/* Landing page sections (markup). Rendering/animation lives in landing.js. */
(function () {
  const ICON = {
    prompt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>',
    llm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 10.5 3 3 0 0 0 5 13a3 3 0 0 0 1 4.5A3 3 0 0 0 9 20h1V4H9zM15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 3 3 3 0 0 1-1 2.5 3 3 0 0 1-1 4.5A3 3 0 0 1 15 20h-1V4h1z"/></svg>',
    cfd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18c3-6 5-6 8 0s5 6 8 0"/><path d="M4 11c3-6 5-6 8 0s5 6 8 0" opacity=".6"/><circle cx="7" cy="5" r="1.4"/><circle cx="16" cy="4" r="1"/></svg>',
    db: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6M5 11.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/></svg>',
    person: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M12 17h.01"/></svg>',
    bot: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/></svg>',
    crown: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>',
  };
  window.LANDING_ICON = ICON;

  window.LANDING_SECTIONS = () => `
<section class="sec tight">
  <div class="wrap grid g4 stats-dark">
    <div class="reveal"><b id="sRounds">—</b><span>${L('轮自主进化（4 次无先验运行）', 'autonomous rounds (4 prior-free runs)')}</span></div>
    <div class="reveal"><b id="sCfd">—</b><span>${L('段真实 CFD，每段 0.1 s 物理时间', 'real CFD segments, 0.1 s each')}</span></div>
    <div class="reveal"><b id="sBest">—</b><span>${L('最佳冠军在留出条件上的回报提升', 'best champion, held-out return gain')}</span></div>
    <div class="reveal"><b>3</b><span>${L('行代码：最终控制器的长度', 'lines: length of the final controller')}</span></div>
  </div>
</section>

<section class="sec" id="what">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('一分钟看懂', 'In one minute')}</p>
      <h2 class="headline">${L('塔里的气，总往中间跑。', 'The gas keeps drifting to the centre.')}</h2>
      <p class="lead">${L('鼓泡塔底部有左、中、右三个进气口，总气量固定。均匀进气时，大尺度液相环流把气泡卷向中央，两侧缺气。任务是只靠重新分配三口气量，让气体在塔内分布均匀。',
        'A bubble column has three bottom inlets with a fixed total flow. Under equal flow, the large liquid circulation sweeps bubbles to the centre and starves the walls. The task: redistribute the three inlet flows so the gas spreads evenly.')}</p>
    </div>
    <div class="explain reveal">
      <div class="ex-step"><span class="ex-n">1</span><h3>${L('只能动三个阀门', 'Three valves, nothing else')}</h3><p>${L('每口 10–50 mm/s，三口之和恒为 90 mm/s，每 0.1 s 最多改 5 mm/s。', 'Each inlet 10–50 mm/s, sum fixed at 90 mm/s, at most 5 mm/s change per 0.1 s.')}</p></div>
      <div class="ex-step"><span class="ex-n">2</span><h3>${L('分数 = 三段气量差多少', 'Score = how unequal the thirds are')}</h3><p>${L('把塔切成左中右三段，气含率越接近，扣分越少，20 秒累计。', 'Cut the column into thirds; the closer their gas fractions, the smaller the penalty, summed over 20 s.')}</p></div>
      <div class="ex-step"><span class="ex-n">3</span><h3>${L('流动是混沌的', 'The flow is chaotic')}</h3><p>${L('0.3% 的扰动 3 秒后就让流场完全不同，单次"变好"可能只是运气。', 'A 0.3% nudge makes the flow unrecognisable within 3 s, so one "improvement" may be pure luck.')}</p></div>
    </div>
    <div class="explain-fig reveal">
      <div class="card"><h3>${L('时均气含率：均匀布气 vs 进化后', 'Time-mean gas fraction: equal flow vs evolved')}</h3><p class="sub">${L('细网格 30×120 复核，5 个条件平均，t > 3 s', 'Fine-mesh 30×120 check, 5-condition average, t > 3 s')}</p>
        <div class="pair-fields"><div><div class="col-frame mean-col"><canvas id="meanA"></canvas></div><p class="col-cap dk">${L('均匀布气', 'Equal flow')}</p></div><div><div class="col-frame mean-col"><canvas id="meanB"></canvas></div><p class="col-cap dk">${L('中间 → 两侧', 'Centre → sides')}</p></div><div class="pair-legend"><div id="meanCbar"></div><p class="note">${L('中央气柱被"打散"到两侧，评分窗内三段气含率趋于一致。', 'The central plume spreads to the sides; the three thirds in the scoring window even out.')}</p></div></div></div>
      <div class="card"><h3>${L('三段气含率剖面', 'Lateral gas-fraction profile')}</h3><p class="sub">${L('评分窗 0.05–0.6 m 内按宽度平均', 'Averaged over the scoring window 0.05–0.6 m')}</p><div class="chart" id="profChart"></div>
        <div class="legend"><span><i style="background:#8e8e93"></i>${L('均匀布气', 'Equal flow')}</span><span><i style="background:#0066cc"></i>${L('进化程序（38,14,38）', 'Evolved (38,14,38)')}</span></div></div>
    </div>
  </div>
</section>

<section class="sec soft" id="how">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">Heuristic Learning · Recursive Self-Improvement</p>
      <h2 class="headline">${L('HL：用证据推理代替梯度。', 'HL: evidence-driven reasoning instead of gradients.')}</h2>
      <p class="lead">${L('语言模型生成候选控制程序，真实 CFD 评估器打分，程序库保留最优与多样的那批，模型读完全部证据再写下一版。这是一个能自我改进的闭环。',
        'A language model proposes control programs, a real-CFD evaluator scores them, a program database keeps the best and most diverse, and the model reads all of the evidence before writing the next version: a closed self-improvement loop.')}</p>
    </div>
    <div class="arch reveal" aria-label="architecture">
      <div class="arch-human">
        <h4>${ICON.person}${L('研究者只定义问题', 'The researcher only defines the problem')}</h4>
        <div class="arch-inputs">
          <div>${L('任务定义提示词<br>（无答案、无先验）', 'Task-definition prompt<br>(no answers, no priors)')}</div>
          <div>${L('可替换的大语言模型', 'Any OpenAI-compatible LLM')}</div>
          <div>${L('CFD 环境 + 奖励 + 评估规则', 'CFD plant + reward + evaluation rule')}</div>
          <div>${L('初始程序：均匀布气', 'Initial program: equal flow')}</div>
        </div>
      </div>
      <div class="arch-sys">
        <div class="arch-mods">
          <div class="mod m1">${ICON.prompt}${L('上下文组装', 'Context builder')}<small>${L('笔记本 · 冠军 · 轨迹 · 存档', 'notebook · champion · traces · archive')}</small></div>
          <div class="mod m2">${ICON.llm}${L('语言模型', 'Language model')}<small>source · rationale · notes</small></div>
          <div class="mod m3">${ICON.cfd}${L('CFD 评估器', 'CFD evaluator')}<small>${L('6+3 条件 · 配对 t 检验', '6+3 conditions · paired t-test')}</small></div>
          <div class="mod m4">${ICON.db}${L('程序库', 'Program database')}<small>MAP-Elites · ${L('冠军棘轮', 'champion ratchet')}</small></div>
        </div>
        <div class="arch-links"><span></span><span></span><span></span><span></span></div>
        <div class="arch-loop">
          <h5>${L('推理—实验—裁决闭环（每轮）', 'Reason · experiment · verdict loop (every round)')}</h5>
<pre>parent, elites  = <span class="c4">archive</span>.select()             <span class="cmt"># ${Lt('偶数轮选冠军，奇数轮选其他精英', 'champion on even rounds, another elite on odd')}</span>
context         = <span class="c1">build</span>(notebook, parent, elites, traces, table)
source, rationale, notes = <span class="c2">llm</span>.generate(task_prompt, context)
notebook        = notes                            <span class="cmt"># ${Lt('模型重写自己的笔记本', 'the model rewrites its own notebook')}</span>
result          = <span class="c3">cfd</span>.evaluate(source, dev_conditions)
if <span class="c3">paired_t</span>(result, champion) and <span class="c3">confirm</span>(source): champion = source
<span class="c4">archive</span>.add(source, result, behaviour_cell(result))</pre>
        </div>
        <div class="arch-foot">${ICON.bot}FlowEvolve <span class="arch-crown">${ICON.crown}<span>${L('最终冠军程序 → 封存留出测试', 'Champion → sealed held-out test')}</span></span></div>
      </div>
    </div>
    <div class="rsi-strip">
      <div class="rsi-card reveal"><span class="k">01 · RSI</span><h3>${L('改进自己的产物', 'Improves its own artefact')}</h3><p>${L('每一轮的输入是上一轮自己写的程序和笔记，输出是新的程序和笔记。', 'Each round takes its own previous program and notebook as input and outputs new ones.')}</p></div>
      <div class="rsi-card reveal"><span class="k">02 · Evidence</span><h3>${L('读轨迹，不读梯度', 'Reads traces, not gradients')}</h3><p>${L('看入口速度、三段气含率、I(t) 的完整曲线，提出因果假设。', 'Reads full inlet, gas-fraction and I(t) traces and forms causal hypotheses.')}</p></div>
      <div class="rsi-card reveal"><span class="k">03 · Ratchet</span><h3>${L('只接受可信的进步', 'Only trusts real progress')}</h3><p>${L('6 个开发条件配对 t 检验，再加 3 个新鲜确认条件。假阳性约 2%。', 'Paired t-test on 6 development conditions plus 3 fresh confirmations. ~2% false-positive rate.')}</p></div>
      <div class="rsi-card reveal"><span class="k">04 · Readable</span><h3>${L('结果可以逐行审查', 'Every line is auditable')}</h3><p>${L('冠军是 3 行 Python，而不是黑箱网络。', 'The champion is 3 lines of Python, not a black-box network.')}</p></div>
    </div>
  </div>
</section>`;
})();
