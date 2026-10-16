/* Landing page: evolution film, HL vs SAC, results, CTA (markup). */
(function () {
  window.LANDING_SECTIONS_B = () => `
<section class="sec" id="evolution">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('一次真实的进化', 'One real evolution run')}</p>
      <h2 class="headline">${L('从均匀布气到冠军，<br>只用了 6 轮。', 'From equal flow to champion<br>in six rounds.')}</h2>
      <p class="lead">${L('云图是在同一初始条件 ξ<sub>0</sub> 上重新计算的真实 CFD（3 s 起时均）；得分是 6 个开发条件的平均提升。点选一轮，和起点对比：它改了什么、保留了什么、气体分布变成什么样。', 'Fields are real CFD re-runs on one starting condition ξ<sub>0</sub> (time-mean from 3 s); scores are mean gains over 6 development conditions. Pick a round and compare it with the starting point: what changed, what was kept, and what the gas distribution became.')}</p>
    </div>
    <div class="evo2 reveal">
      <div class="stage-list" id="filmList"></div>
      <div class="evo-main">
        <div class="vs" id="filmVs"></div>
        <div class="film-scrub"><button class="play" id="filmPlay" aria-label="play">▶</button><input type="range" id="filmT" min="0" max="49" value="49" aria-label="time"><span class="num" id="filmTl">t = 20.2 s</span><span id="filmCbar" class="film-cbar"></span></div>
        <div class="film-detail" id="filmDetail"></div>
      </div>
    </div>
    <div class="grid g2 reveal" style="margin-top:24px">
      <div class="card"><h3>${L('得分：冠军只升不降', 'Score: the champion only moves up')}</h3><p class="sub">${L('点 = 每轮新程序在 6 个开发条件上相对均匀布气的平均提升；蓝色台阶 = 当前冠军。', 'Dots: each round\'s mean gain over equal flow on 6 development conditions. Blue steps: the current champion.')}</p><div class="chart" id="evoChart"></div>
        <div class="legend"><span><i style="background:#0066cc"></i>${L('晋升冠军', 'Promoted')}</span><span><i style="background:#c7c7cc"></i>${L('未通过裁决', 'Not adopted')}</span><span><i style="background:#e0a030"></i>${L('初筛淘汰', 'Screened out')}</span></div></div>
      <div class="card"><h3>${L('策略：中间口气速一路下调', 'Strategy: the centre inlet keeps coming down')}</h3><p class="sub">${L('每轮程序最终的中间口气速（两侧自动补齐）。前 5 轮只敢小改，第 6 轮找到"降到 17 mm/s"，之后的探索都围绕它。', 'Final centre-inlet velocity of each round\'s program (the sides make up the rest). Rounds 1–5 only nudge it; round 6 finds "down to 17 mm/s", and later exploration clusters around it.')}</p><div class="chart" id="stratChart"></div>
        <div class="legend"><span><i style="background:#0066cc"></i>${L('冠军', 'Champion')}</span><span><i style="background:#c7c7cc"></i>${L('挑战者', 'Challenger')}</span><span><i style="background:#8e8e93;height:2px"></i>${L('均匀 30 mm/s', 'Equal 30 mm/s')}</span></div></div>
    </div>
  </div>
</section>

<section class="sec soft" id="results">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('对照 · 深度强化学习', 'Versus deep reinforcement learning')}</p>
      <h2 class="headline">${L('两条完全不同的路，<br>找到了同一个答案。', 'Two completely different learners<br>found the same answer.')}</h2>
      <p class="lead">${L('SAC 用 20 万步梯度更新神经网络；HL 用约 40 轮推理改写程序。两者都学会了：等塔里充满气，再把中间口的气挪到两侧并保持。', 'SAC updates a neural network over 200k gradient steps; HL rewrites a program in about 40 reasoning rounds. Both learned the same thing: wait until the column fills, then move gas from the centre inlet to the sides and hold it.')}</p>
    </div>
    <div class="grid g2 reveal" style="margin-top:56px">
      <div class="card"><h3>${L('中间口入口速度', 'Centre-inlet velocity')}</h3><p class="sub">${L('条件 ξ<sub>0</sub>，两者独立学到相同时序', 'Condition ξ<sub>0</sub>; both learn the same schedule')}</p><div class="chart" id="uChart"></div>
        <div class="legend"><span><i style="background:#d6517d"></i>SAC seed 1</span><span><i style="background:#0066cc"></i>${L('HL 冠军', 'HL champion')}</span><span><i style="background:#8e8e93"></i>${L('均匀布气', 'Equal flow')}</span></div></div>
      <div class="card"><h3>${L('学习成本', 'Cost of learning')}</h3><p class="sub">${L('达到可比控制效果所需的真实 CFD 段', 'Real CFD segments to reach comparable control')}</p><div class="chart" id="costBars"></div><p class="note">${L('SAC 每个种子 2×10⁵ 段；HL 每次运行 3–6×10⁴ 段（含初筛与确认）。', 'SAC: 2×10⁵ segments per seed; HL: 3–6×10⁴ per run, including screens and confirmations.')}</p></div>
    </div>
    <div class="compare-rows reveal">
      <div class="h"></div><div class="hd">SAC</div><div class="hd">HL · FlowEvolve</div>
      <div class="h">${L('学什么', 'What is learned')}</div><div>${L('神经网络权重 θ', 'Network weights θ')}</div><div>${L('一段可读的 Python 程序', 'A readable Python program')}</div>
      <div class="h">${L('怎么改进', 'How it improves')}</div><div>${L('每步梯度下降', 'Gradient step per transition')}</div><div>${L('每轮读证据、提假设、写程序', 'Reads evidence, forms hypotheses, writes code')}</div>
      <div class="h">${L('知识存在哪', 'Where knowledge lives')}</div><div>${L('权重 + 回放池', 'Weights + replay buffer')}</div><div>${L('程序库 + 自写笔记本', 'Program library + self-written notebook')}</div>
      <div class="h">${L('对混沌', 'Against chaos')}</div><div>${L('靠大量回合平均', 'Averages over many episodes')}</div><div>${L('配对 t 检验 + 新鲜确认条件', 'Paired t-test + fresh confirmation')}</div>
      <div class="h">${L('产物', 'Output')}</div><div>${L('黑箱', 'Black box')}</div><div>${L('3 行可审查代码', '3 auditable lines')}</div>
    </div>
  </div>
</section>

<section class="sec" id="why">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('为什么可行', 'Why it works')}</p>
      <h2 class="headline">${L('控制慢的平均态，<br>而不是快的混沌。', 'Steer the slow mean,<br>not the fast chaos.')}</h2>
    </div>
    <div class="grid g3 reveal" style="margin-top:56px">
      <div class="card"><div class="big-n">0.26 s</div><h3>${L('混沌 e 折时间', 'Chaos e-folding time')}</h3><p>${L('Lyapunov 指数 3.9 s⁻¹。逐个操纵气泡不可能。', 'Lyapunov exponent 3.9 s⁻¹. Steering individual bubbles is impossible.')}</p></div>
      <div class="card"><div class="big-n">2.0 s</div><h3>${L('大尺度环流记忆', 'Circulation memory')}</h3><p>${L('液相环流的自相关时间是混沌时间的 8 倍，足够被控制。', 'The liquid circulation remembers 8× longer than the chaos, long enough to steer.')}</p></div>
      <div class="card"><div class="big-n">2 s</div><h3>${L('时机比反馈重要', 'Timing beats feedback')}</h3><p>${L('同一设定点，从 0 s 起回报 −0.40，从 2 s 起 +4.20。', 'Same set-point: −0.40 if applied from 0 s, +4.20 from 2 s.')}</p></div>
    </div>
    <div class="card reveal" style="margin-top:20px"><h3>${L('两次几乎相同的运行如何分道扬镳', 'How two nearly identical runs diverge')}</h3><p class="sub">${L('只差 10⁻⁶ m/s 单步扰动，气含率场距离指数增长后饱和', 'A single 10⁻⁶ m/s nudge: field distance grows exponentially, then saturates')}</p><div class="chart" id="lyapChart"></div></div>
  </div>
</section>

<section class="sec soft center" id="cta">
  <div class="wrap reveal">
    <h2 class="headline">${L('打开控制台，<br>亲手翻看每一轮。', 'Open the console<br>and inspect every round.')}</h2>
    <p class="lead">${L('提示词、代码差异、模型笔记本、CFD 云图、统计裁决，全部来自真实运行日志。', 'Prompts, code diffs, the model\'s notebook, CFD fields and statistical verdicts, all from real run logs.')}</p>
    <div class="ctas"><a class="btn primary" href="console.html">${L('进入控制台', 'Enter the console')}</a><a class="btn ghost" href="https://github.com/LZF1111/hl-rsi-bubble-column" target="_blank" rel="noopener">GitHub ›</a></div>
  </div>
</section>`;

  window.LANDING_FOOT = () => `<p>${L('数据来自 OpenFOAM v2306 twoPhaseEulerFoam 真实运行（12×40×4 网格，细网格 30×120×10 复核）。语言模型原文保留英文。所有条件为同一几何、网格与工况下的启动扰动，不代表跨工况验证。', 'Data from real OpenFOAM v2306 twoPhaseEulerFoam runs (12×40×4 mesh, 30×120×10 fine-mesh check). Model text is kept verbatim in English. All conditions are start-up perturbations at one geometry, mesh and operating point; this is not cross-operating-point validation.')}</p>`;
})();
