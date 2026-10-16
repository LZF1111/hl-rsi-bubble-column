/* Landing page: evolution film, HL vs SAC, results, CTA (markup). */
(function () {
  window.LANDING_SECTIONS_B = () => `
<section class="sec" id="evolution">
  <div class="wrap">
    <div class="center reveal">
      <p class="eyebrow">${L('一次真实的进化', 'One real evolution run')}</p>
      <h2 class="headline">${L('从均匀布气到冠军，<br>只用了 6 轮。', 'From equal flow to champion<br>in six rounds.')}</h2>
      <p class="lead">${L('每一轮，模型读完上一轮的结果，写一个新程序；仿真让它在 6 个练习场景里各跑一个 20 秒回合。左边选一轮，右边和均匀布气在<b>同一场景里整回合对比</b>：气怎么跑、扣了多少分。', 'Each round the model reads the previous results and writes a new program; the simulator runs it for one 20 s episode in each of 6 practice scenes. Pick a round on the left; on the right it races equal flow <b>through a whole episode in the same scene</b>: where the gas goes and how much penalty piles up.')}</p>
    </div>
    <div class="evo2 reveal">
      <div class="stage-list" id="filmList"></div>
      <div class="evo-main">
        <div class="vs" id="filmVs"></div>
        <div id="filmPl"></div>
        <div class="chart" id="filmEp"></div>
        <div class="film-foot"><span id="filmCbar" class="film-cbar"></span></div>
        <div class="film-detail" id="filmDetail"></div>
      </div>
    </div>
    <div class="grid g2 reveal" style="margin-top:24px">
      <div class="card"><h3>${L('得分：冠军只升不降', 'Score: the champion only moves up')}</h3><p class="sub">${L('得分 = 比均匀布气少扣的分，6 个练习场景取平均。点 = 每轮新程序；蓝色台阶 = 当前冠军。第 7 轮平均分更高却没上位，因为和冠军逐场比并不稳赢。', 'Score = penalty saved vs. equal flow, averaged over 6 practice scenes. Dots: each round; blue steps: the current champion. Round 7 averaged higher yet was not adopted: scene by scene it did not reliably beat the champion.')}</p><div class="chart" id="evoChart"></div>
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
      <p class="lead">${L('SAC（主流的深度强化学习）用 20 万步梯度更新神经网络；HL 用约 40 轮推理改写程序。两者都学会了：等塔里充满气，再把中间口的气挪到两侧并保持。', 'SAC updates a neural network over 200k gradient steps; HL rewrites a program in about 40 reasoning rounds. Both learned the same thing: wait until the column fills, then move gas from the centre inlet to the sides and hold it.')}</p>
    </div>
    <div class="grid g2 reveal" style="margin-top:56px">
      <div class="card"><h3>${L('中间口入口速度', 'Centre-inlet velocity')}</h3><p class="sub">${L('同一场景的一个回合里，两者独立学到几乎相同的操作时序', 'One episode in the same scene: both learn almost the same schedule')}</p><div class="chart" id="uChart"></div>
        <div class="legend"><span><i style="background:#d6517d"></i>SAC seed 1</span><span><i style="background:#0066cc"></i>${L('HL 冠军', 'HL champion')}</span><span><i style="background:#8e8e93"></i>${L('均匀布气', 'Equal flow')}</span></div></div>
      <div class="card"><h3>${L('学习成本', 'Cost of learning')}</h3><p class="sub">${L('达到可比控制效果所需的真实 CFD 段', 'Real CFD segments to reach comparable control')}</p><div class="chart" id="costBars"></div><p class="note">${L('1 段 = 0.1 秒仿真。SAC 每次训练 20 万段；HL 每次运行 3–6 万段（含初筛与加赛）。', '1 segment = 0.1 s of simulation. SAC: 200k per training run; HL: 30–60k per run, including screens and rematches.')}</p></div>
    </div>
    <div class="compare-rows reveal">
      <div class="h"></div><div class="hd">SAC</div><div class="hd">HL · FlowEvolve</div>
      <div class="h">${L('学什么', 'What is learned')}</div><div>${L('神经网络权重 θ', 'Network weights θ')}</div><div>${L('一段可读的 Python 程序', 'A readable Python program')}</div>
      <div class="h">${L('怎么改进', 'How it improves')}</div><div>${L('每步梯度下降', 'Gradient step per transition')}</div><div>${L('每轮读证据、提假设、写程序', 'Reads evidence, forms hypotheses, writes code')}</div>
      <div class="h">${L('知识存在哪', 'Where knowledge lives')}</div><div>${L('权重 + 回放池', 'Weights + replay buffer')}</div><div>${L('程序库 + 自写笔记本', 'Program library + self-written notebook')}</div>
      <div class="h">${L('对混沌', 'Against chaos')}</div><div>${L('靠大量回合平均', 'Averages over many episodes')}</div><div>${L('同场景和冠军逐场比，再换新场景加赛', 'Scene-by-scene vs. the champion, then a rematch in new scenes')}</div>
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
      <div class="card"><div class="big-n">0.26 s</div><h3>${L('小差别放大一倍多只要 0.26 秒', 'A tiny difference grows ~2.7× every 0.26 s')}</h3><p>${L('所以想精确操纵每一串气泡是不可能的。', 'So steering individual bubble plumes precisely is impossible.')}</p></div>
      <div class="card"><div class="big-n">2.0 s</div><h3>${L('大环流能"记住" 2 秒', 'The big circulation "remembers" for 2 s')}</h3><p>${L('塔里液体的大尺度翻滚比气泡慢 8 倍，这层"慢变量"是可以被控制的。', 'The large liquid roll changes 8× more slowly than the bubbles; that slow layer can be steered.')}</p></div>
      <div class="card"><div class="big-n">2 s</div><h3>${L('时机比反馈重要', 'Timing beats feedback')}</h3><p>${L('同样把中间口调小：一开始就调，比均匀布气差 0.4 分；等塔充满气（约 2 秒）再调，好 4.2 分。', 'Same centre cut: applied from the start it loses 0.4 points vs. equal flow; applied after the column fills (~2 s) it gains 4.2.')}</p></div>
    </div>
    <div class="card reveal" style="margin-top:20px"><h3>${L('为什么"跑一次变好了"不算数', 'Why "it did better once" proves nothing')}</h3><p class="sub">${L('把同一个塔跑两次，第二次只在开头把气速改动 0.000001 m/s（蓝）或 0.00001 m/s（紫）。纵轴是两次运行气体分布的差别（对数刻度，每格 100 倍）。', 'Run the same column twice; the second time nudge the inlet by 0.000001 m/s (blue) or 0.00001 m/s (purple) at the start. Vertical axis: how different the two gas fields are (log scale, ×100 per gridline).')}</p><div class="chart" id="lyapChart"></div>
      <div class="ly-read"><div><b>${L('① 0–3 秒：指数放大', '① 0–3 s: exponential growth')}</b>${L('差别从一百万分之一级飞涨到百分之一级，放大了一万倍。', 'The difference shoots from a millionth to a hundredth: 10,000× larger.')}</div><div><b>${L('② 3 秒后：已完全不同', '② After 3 s: completely different')}</b>${L('曲线不再上升，是因为两次运行已经是两个毫不相干的流场。', 'The curve stops rising because the two runs are now unrelated flows.')}</div><div><b>${L('③ 所以要换场景重复比', '③ Hence: repeat in many scenes')}</b>${L('我们就用这种"开头微小扰动"制造不同场景，新程序要在多个场景里都赢才算数。', 'We create different scenes exactly this way; a new program must win across many of them.')}</div></div></div>
  </div>
</section>

<section class="sec soft center" id="cta">
  <div class="wrap reveal">
    <h2 class="headline">${L('打开控制台，<br>亲手翻看每一轮。', 'Open the console<br>and inspect every round.')}</h2>
    <p class="lead">${L('提示词、代码改动、模型笔记、仿真动画、每场比赛的输赢，全部来自真实运行日志。', 'Prompts, code changes, the model\'s notes, simulation playback and every scene-by-scene result, all from real run logs.')}</p>
    <div class="ctas"><a class="btn primary" href="console.html">${L('进入控制台', 'Enter the console')}</a><a class="btn ghost" href="https://github.com/LZF1111/hl-rsi-bubble-column" target="_blank" rel="noopener">GitHub ›</a></div>
  </div>
</section>`;

  window.LANDING_FOOT = () => `<p>${L('数据来自 OpenFOAM v2306 twoPhaseEulerFoam 真实运行（12×40×4 网格，细网格 30×120×10 复核）。语言模型原文保留英文。所有条件为同一几何、网格与工况下的启动扰动，不代表跨工况验证。', 'Data from real OpenFOAM v2306 twoPhaseEulerFoam runs (12×40×4 mesh, 30×120×10 fine-mesh check). Model text is kept verbatim in English. All conditions are start-up perturbations at one geometry, mesh and operating point; this is not cross-operating-point validation.')}</p>`;
})();
