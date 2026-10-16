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
    <div class="reveal"><b>−28%</b><span>${L('留出条件 ξ<sub>7</sub> 上，3 s 后的气体分布不均匀度', 'gas-distribution imbalance after 3 s on held-out ξ<sub>7</sub>')}</span></div>
    <div class="reveal"><b>6</b><span>${L('轮就找到冠军；之后 30 个挑战者都没能通过裁决', 'rounds to the champion; none of the next 30 challengers passed the verdict')}</span></div>
    <div class="reveal"><b>3.7×</b><span>${L('比深度强化学习 SAC 少用的 CFD 计算', 'less CFD compute than deep RL (SAC)')}</span></div>
    <div class="reveal"><b>3</b><span>${L('行可读代码：最终控制器全部内容', 'readable lines: the entire final controller')}</span></div>
  </div>
</section>

<section class="sec" id="what">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('一分钟看懂', 'In one minute')}</p>
      <h2 class="headline">${L('塔里的气，总往中间跑。', 'The gas keeps drifting to the centre.')}</h2>
      <p class="lead">${L('鼓泡塔底部有左、中、右三个进气口。均匀进气时，液体的大尺度环流把气泡卷向中央，两侧缺气，反应和传质就不均匀。我们能改变的只有一样东西：<b>每个进气口的气速</b>。',
        'A bubble column has three bottom inlets. With equal flow, the large liquid circulation sweeps bubbles to the centre and starves the walls, so reaction and mass transfer become uneven. There is only one thing we can change: <b>the gas velocity of each inlet</b>.')}</p>
    </div>
    <div class="explain reveal">
      <div class="ex-step"><span class="ex-n">1</span><h3>${L('控制量：三口气速', 'Control: three inlet velocities')}</h3><p>${L('每口 10–50 mm/s，三口之和恒为 90 mm/s（总气量不变），每 0.1 s 每口最多改 5 mm/s。', 'Each inlet 10–50 mm/s, the sum fixed at 90 mm/s (same total gas), at most 5 mm/s change per inlet every 0.1 s.')}</p></div>
      <div class="ex-step"><span class="ex-n">2</span><h3>${L('目标：三段气含率一样多', 'Goal: equal gas in each third')}</h3><p>${L('把塔的下部切成左中右三段，比较三段的平均气含率。越接近，得分越高。', 'Split the lower column into left, centre and right thirds and compare their mean gas fraction. The closer they are, the higher the score.')}</p></div>
      <div class="ex-step"><span class="ex-n">3</span><h3>${L('难点：流动是混沌的', 'Hard part: the flow is chaotic')}</h3><p>${L('入口气速差 0.0001 m/s，3 秒后流场就完全不同。一次"变好"可能只是运气，必须多次重复验证。', 'A 0.0001 m/s difference at the inlet makes the flow unrecognisable within 3 s. A single "improvement" can be luck, so every claim needs repeated tests.')}</p></div>
    </div>
    <div class="card reveal" style="margin-top:20px">
      <div class="ch-head"><div><h3>${L('改变入口气速，气体分布随之改变', 'Change the inlet velocities, and the gas distribution follows')}</h3><p class="sub">${L('细网格 30×120×10 实算，5 个条件平均的时均场（t > 3 s）。左：三口都是 30 mm/s；右：进化出的分配，中间 14、两侧 38 mm/s。', 'Fine-mesh 30×120×10 runs, time-mean over 5 conditions (t > 3 s). Left: 30 mm/s at every inlet. Right: the evolved split, 14 in the centre and 38 at the sides.')}</p></div><div id="meanCbar"></div></div>
      <div class="what-grid"><div class="vs" id="meanVs"></div><div><h4 class="vs-k" style="margin:0 0 8px">${L('横向气含率剖面（评分窗内平均）', 'Lateral gas-fraction profile (scoring window)')}</h4><div class="chart" id="profChart"></div>
        <div class="legend"><span><i style="background:#8e8e93"></i>${L('均匀布气', 'Equal flow')}</span><span><i style="background:#0066cc"></i>${L('进化分配', 'Evolved split')}</span></div>
        <p class="note" style="margin-top:14px">${L('均匀布气时中间鼓起一个"气包"（红）、两侧偏少（蓝）；把中间口的气挪到两侧后，剖面变平，三段最大差从 1.5 降到 0.7 个百分点。', 'With equal flow a gas bulge forms in the centre (red) while the sides run short (blue). Moving gas from the centre inlet to the sides flattens the profile: the largest spread between thirds falls from 1.5 to 0.7 percentage points.')}</p></div></div>
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
      <div class="rsi-card reveal"><span class="k">01</span><h3>${L('自己改进自己', 'Improves its own work')}</h3><p>${L('每一轮读上一轮自己写的程序和笔记，再写出新的程序和笔记。', 'Each round reads the program and notes it wrote last round, then writes new ones.')}</p></div>
      <div class="rsi-card reveal"><span class="k">02</span><h3>${L('看数据，提假设', 'Reads data, forms hypotheses')}</h3><p>${L('看入口气速、三段气含率随时间的完整曲线，写下"为什么"再动手。', 'It reads full time traces of inlet velocity and gas in each third and states "why" before changing code.')}</p></div>
      <div class="rsi-card reveal"><span class="k">03</span><h3>${L('不被运气骗', 'Not fooled by luck')}</h3><p>${L('每个新程序要在 9 个不同扰动下都比现任冠军好，才会被采用。单次跑得好不算数。', 'A new program is adopted only if it beats the current champion across 9 different perturbations. One lucky run does not count.')}</p></div>
      <div class="rsi-card reveal"><span class="k">04</span><h3>${L('结果可审查', 'Auditable result')}</h3><p>${L('冠军是 3 行 Python，工程师可以直接读懂、修改、部署。', 'The champion is 3 lines of Python that an engineer can read, edit and deploy.')}</p></div>
    </div>
  </div>
</section>`;
})();
