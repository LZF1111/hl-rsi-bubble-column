/* Console sidebar: problem definition, live constraint demo, reward, evaluator, search space, prompt. */
(function () {
  const PROMPT_KEYS = ['PLANT', 'OBSERVATION', 'ACTION', 'REWARD', 'EVALUATION', 'PROGRAM', 'CONTEXT', 'RETURN JSON'];
  const blk = (ix, zh, en, szh, sen, body, open) => `<details class="sblock"${open ? ' open' : ''}><summary><span class="ix">${ix}</span><span>${L(zh, en)}<small>${L(szh, sen)}</small></span><span class="chev">›</span></summary><div class="sbody">${body}</div></details>`;

  window.SIDE = {
    html(evaluator) {
      const goal = `<p>${L('三进气口鼓泡塔。均匀进气时大尺度液相环流把气体卷向中央、两侧缺气。目标是只调三口气量分配，让评分窗内左中右三段的气含率趋于一致。',
        'A three-inlet bubble column. Under equal flow the large liquid circulation drives gas to the centre and starves the walls. The goal: redistribute the three inlet flows so the left, centre and right thirds of the scoring window hold the same gas fraction.')}</p>
      <dl class="facts">
        <dt>${L('几何', 'Geometry')}</dt><dd>0.15 × 1.0 × 0.15 m, ${L('水深', 'water')} 0.70 m</dd>
        <dt>${L('求解器', 'Solver')}</dt><dd>OpenFOAM v2306 twoPhaseEulerFoam</dd>
        <dt>${L('模型', 'Model')}</dt><dd>${L('双欧拉，层流', 'Euler–Euler, laminar')}</dd>
        <dt>${L('网格', 'Mesh')}</dt><dd>12 × 40 × 4 · ${L('细网格复核', 'fine check')} 30 × 120 × 10</dd>
        <dt>${L('控制步长', 'Control step')}</dt><dd>0.1 s · 200 ${L('步', 'steps')} = 20 s</dd>
        <dt>${L('观测', 'Sensing')}</dt><dd>${L('9 个压力计（3 个高度 × 左中右）+ 变化率 + 上步气速', '9 pressure probes (3 heights × L/C/R) + rates + last velocities')}</dd>
      </dl>`;

      const demo = `<p>${L('拖动中间口气速，两侧自动补齐，总气量恒定。云图是真实细网格 CFD 时均气相分布，在相邻两个实算工况之间插值。',
        'Drag the centre-inlet velocity; the sides make up the rest, so total flow stays fixed. The map is a real fine-mesh time-mean gas distribution, interpolated between the two nearest computed cases.')}</p>
      <div class="demo">
        <div class="col-frame"><canvas id="demoCol" aria-label="gas fraction for selected inlet split"></canvas></div>
        <div class="demo-r">
          <div><label for="demoU">${L('中间口 u<sub>C</sub>', 'Centre inlet u<sub>C</sub>')}</label><div class="demo-u"><span id="demoUc">30</span> <small>mm/s</small></div>
            <input type="range" id="demoU" min="10" max="40" step="0.5" value="30" aria-label="centre inlet velocity"></div>
          <div class="demo-k"><span>${L('两侧', 'Sides')}</span><b id="demoUs">30 / 30</b></div>
          <div style="margin-top:14px"><div class="th3" id="demoTh"><div><span></span></div><div><span></span></div><div><span></span></div></div><div class="th3l"><span>${L('左', 'L')}</span><span>${L('中', 'C')}</span><span>${L('右', 'R')}</span></div></div>
          <div class="demo-k"><span>${L('不均匀度 I', 'Imbalance I')}</span><b id="demoI">—</b></div>
          <div class="demo-k"><span>${L('相对均匀布气', 'vs equal flow')}</span><b id="demoG">—</b></div>
          <div id="demoCbar"></div>
        </div>
      </div>
      <div class="chips" id="demoChips"></div>
      <ul class="cons">
        <li><b>${L('单口范围', 'Per inlet')}</b><span>10–50 mm/s</span></li>
        <li><b>${L('总气量', 'Total')}</b><span>${L('恒为 90 mm/s（三口之和）', 'fixed at 90 mm/s (sum of three)')}</span></li>
        <li><b>${L('变化速率', 'Slew')}</b><span>${L('每 0.1 s 每口最多 5 mm/s', '≤ 5 mm/s per inlet per 0.1 s')}</span></li>
        <li><b>${L('启动', 'Start-up')}</b><span>${L('0–0.2 s 均匀进气，之后开始控制', 'equal flow until 0.2 s, then control')}</span></li>
      </ul>`;

      const reward = `<div class="rw"><div class="formula-box"><div class="math">
        <span class="rw-row"><i>r</i><sub>k</sub> = − <span class="term t-i"><i>I</i></span> − 0.1 <span class="term t-p"><i>P</i></span> − 0.01 <span class="term t-s"><i>S</i></span></span>
        <span class="rw-row"><span class="term t-i"><i>I</i> = <span class="frac"><span>std(<i>g</i><sub>L</sub>, <i>g</i><sub>C</sub>, <i>g</i><sub>R</sub>)</span><span>mean(<i>g</i>) + 0.01</span></span></span></span>
        <span class="rw-row"><i>R</i> = <span class="lim"><small>200</small><span class="big">Σ</span><small><i>k</i>=1</small></span> <i>r</i><sub>k</sub>,&nbsp; ${L('增益', 'gain')} = <i>R</i> − <i>R</i><sub>${L('均匀', 'equal')}</sub></span>
      </div></div>
      <div class="glance">
        <div><i class="gi">I</i><span>${L('<b>主项。</b>g 为评分窗 0.05–0.6 m 内左中右三段平均气含率。三段越接近，I 越小。', '<b>Main term.</b> g is the mean gas fraction in the left, centre and right thirds of the 0.05–0.6 m window. Closer thirds, smaller I.')}</span></div>
        <div><i class="gp">P</i><span>${L('三个高度上横向压力差的平均，惩罚强烈的横向晃动。', 'Mean lateral pressure spread at three heights; penalises strong sloshing.')}</span></div>
        <div><i class="gs">S</i><span>${L('阀门动作平方，惩罚抖动。', 'Squared valve moves; penalises chatter.')}</span></div>
      </div>
      <div class="one-line">${L('一句话：<b>气在三段里分得越匀、晃得越少、阀门动得越稳，分越高。</b>均匀布气一回合约扣 12 分，最佳冠军在封存考题上少扣 2.6 分。', '<b>In one line: spread the gas evenly, slosh less, move the valves gently.</b> Equal flow loses about 12 points per episode; the best champion saves +2.6 on the sealed tests.')}</div></div>`;

      const evalPT = `<p>${L('<b>什么是"场景"：</b>同一个塔，只在开头 0.2 秒把进气改动 0.0001 m/s。因为流动是混沌的，3 秒后就变成完全不同的流动，同一个程序的分数会差 ±1.5。我们用这种方法造出：', '<b>What a "scene" is:</b> the same column, with the inlet nudged by 0.0001 m/s during the first 0.2 s. The flow is chaotic, so within 3 s it becomes a completely different flow, and the same program\'s score varies by ±1.5. This gives us:')}</p>
      <ul class="cons"><li><b>${L('6 个练习场景', '6 practice scenes')}</b><span>${L('每轮都用来打分', 'used to score every round')}</span></li><li><b>${L('3 个加赛场景', '3 rematch scenes')}</b><span>${L('只在快要上位时才用', 'only used just before promotion')}</span></li><li><b>${L('2 个封存考题', '2 sealed tests')}</b><span>${L('从不给模型看，只考最终冠军', 'never shown; only score the final champion')}</span></li></ul>
      <div class="pipe">
        <div><b>${L('① 快速初筛', '① Quick screen')}</b>${L('每个场景先跑 5 秒，明显比均匀布气差就淘汰，省算力', '5 s in each scene; clearly worse than equal flow is dropped')}</div>
        <div><b>${L('② 和冠军同场比 6 场', '② 6 scenes head-to-head')}</b>${L('新程序与现任冠军在同样的 6 个场景里各跑完整回合，逐场看谁扣分少', 'New program and champion each run full episodes in the same 6 scenes; compare scene by scene')}</div>
        <div><b>${L('③ 要赢得明显', '③ Must win clearly')}</b>${L('平均每场领先 > 0.3 分，领先要大于运气波动的 2 倍，且没有一场输超过 2 分', 'Average lead > 0.3, lead more than 2× the luck scatter, and no scene lost by more than 2')}</div>
        <div><b>${L('④ 3 场加赛', '④ 3-scene rematch')}</b>${L('换 3 个从未用过的场景再比，9 场合计仍满足 ③ 才上位', 'Three unused scenes; promoted only if all 9 together still satisfy ③')}</div></div>
      <p class="note" style="margin-top:6px">${L('为什么要这么严：在 ±1.5 的运气波动下，只看平均分很容易选到"运气好"的程序。例如第 7 轮平均分比冠军还高，但逐场比有输有赢，所以不收。', 'Why so strict: with ±1.5 of luck, picking by average alone often selects a lucky program. Round 7 averaged higher than the champion but won some scenes and lost others, so it was not adopted.')}</p>`;
      const evalP3 = `<p>${L('对照组（宽松规则）：只比 3 个场景，平均领先 0.5 分、单场不输超过 0.75 分就上位，没有加赛。', 'Control arm (lenient rule): 3 scenes only; promoted on a 0.5 average lead with no scene lost by more than 0.75; no rematch.')}</p><div class="pipe">
        <div><b>${L('① 快速初筛', '① Quick screen')}</b>${L('先跑 5 秒，明显变差的淘汰', 'Run 5 s; drop clearly worse programs')}</div>
        <div><b>${L('② 3 场对比', '② 3 scenes')}</b>${L('平均领先冠军 0.5，单场不输 0.75 以上', 'Lead the champion by 0.5 on average, never lose by more than 0.75')}</div>
        <div><b>${L('最后：封存考题', 'Finally: sealed tests')}</b>${L('2 个从未给模型看过的场景', '2 scenes never shown to the model')}</div></div>
        <p class="note" style="margin-top:6px">${L('结果：在 ±1.5 的运气波动下，这条规则很容易被运气骗过，最终冠军在封存考题上只有 +0.1。这正是要用严格裁决的原因。', 'Result: under ±1.5 of luck this rule is easily fooled; its final champion scores only +0.1 on the sealed tests. That is why the strict verdict matters.')}</p>`;

      const search = `<p>${L('模型写的是受限 Python 语句块，每个控制步执行一次。', 'The model writes a restricted Python block executed once per control step.')}</p>
      <dl class="facts">
        <dt>${L('输入', 'Inputs')}</dt><dd>obs[21], step, dt, memory</dd>
        <dt>${L('允许', 'Allowed')}</dt><dd>${L('四则、比较、if、for≤128、min/max/sin/exp…', 'arithmetic, if, for ≤ 128, min/max/sin/exp…')}</dd>
        <dt>${L('禁止', 'Forbidden')}</dt><dd>${L('import、函数定义、随机、文件、网络', 'imports, defs, randomness, files, network')}</dd>
        <dt>${L('父代', 'Parent')}</dt><dd>${L('冠军与存档精英交替', 'champion and archive elites alternate')}</dd>
        <dt>${L('探索', 'Explore')}</dt><dd>${L('每 2 轮随机要求尝试一种没试过的操作风格', 'every 2nd round: try a random untried style')}</dd>
        <dt>${L('存档', 'Archive')}</dt><dd>${L('按风格分格保存最佳程序（动作大小 × 偏向哪口 × 何时动作）', 'best program per style (how much × which inlet × when)')}</dd>
        <dt>${L('记忆', 'Memory')}</dt><dd>${L('模型自写笔记本 ≤ 6000 字符', 'self-written notebook ≤ 6000 chars')}</dd>
        <dt>${L('先验', 'Priors')}</dt><dd>${L('无。提示词不含任何控制提示', 'none; the prompt contains no control hints')}</dd>
      </dl>`;

      return blk('01', '控制对象', 'Control target', '三进气口鼓泡塔', 'Three-inlet bubble column', goal, true)
        + blk('02', '控制范围与约束', 'Control range & constraints', '拖动试试：真实 CFD 气相分布', 'Try it: real CFD gas distribution', demo, true)
        + blk('03', '奖励函数', 'Reward', '分数怎么算', 'How the score works', reward, false)
        + blk('04', '怎样才算真的变好', 'What counts as better', evaluator === 'promote3' ? '对照组：宽松规则' : '四道关卡，防止被运气骗', evaluator === 'promote3' ? 'Control arm: lenient rule' : 'Four gates against luck', evaluator === 'promote3' ? evalP3 : evalPT, false)
        + blk('05', '搜索空间与策略', 'Search space & strategy', '程序、存档、探索', 'Programs, archive, exploration', search, false)
        + blk('06', '任务提示词（中英对照）', 'Task prompt (ZH / EN)', '模型看到的全部问题定义', 'Everything the model is told', '<p class="note" style="margin:0 0 10px">' + L('左为中文译文，右为实际发送给模型的英文原文。提示词只定义问题，不含任何控制建议。', 'Chinese translation beside the verbatim English actually sent to the model. The prompt only defines the problem and contains no control hints.') + '</p><div id="promptDoc"></div>', false);
    },

    prompt(text) {
      let h = D.esc(text);
      for (const k of PROMPT_KEYS) h = h.replace(new RegExp('(^|\\s)(' + k + ')(:)', 'g'), '$1\n\n<span class="sec-k">$2</span>$3');
      return h.replace(/^\n+/, '');
    },

    /* centre-velocity slider blending real fine-mesh time-mean fields */
    demo(F) {
      const keys = ['c10d20', 'c14d20', 'hl', 'const20', 'fixed', 'c40d20'];
      const v = F.vmax, cases = keys.map(k => ({ k, uc: F.configs[k].u_final[1] * 1000, gain: F.configs[k].mean_gain, a: CFD.unpack(F.configs[k].a, 0, 1), ux: CFD.unpack(F.configs[k].ux, -v, v), uy: CFD.unpack(F.configs[k].uy, -v, v) })).sort((p, q) => p.uc - q.uc);
      const view = new CFD.FieldView(document.getElementById('demoCol'), { nx: F.nx, ny: F.ny, smooth: 4, window: true });
      document.getElementById('demoCbar').innerHTML = CFD.colorbar('dev', Lt('气含率偏差', 'gas-fraction deviation'));
      const sl = document.getElementById('demoU'), bars = [...document.querySelectorAll('#demoTh > div')];
      const name = { c10d20: Lt('10 · 极端', '10 · extreme'), c14d20: Lt('14 · 最优', '14 · best'), hl: Lt('17 · HL 冠军', '17 · HL champ'), const20: '21', fixed: Lt('30 · 均匀', '30 · equal'), c40d20: Lt('40 · 反向', '40 · reversed') };
      document.getElementById('demoChips').innerHTML = cases.map(c => `<button class="chip" data-u="${c.uc.toFixed(1)}">${name[c.k]}</button>`).join('');
      const blend = (A, B, f) => { const o = new Float32Array(A.length); for (let i = 0; i < o.length; i++) o[i] = A[i] + (B[i] - A[i]) * f; return o; };
      const update = () => {
        const u = +sl.value; let j = 0;
        while (j < cases.length - 2 && u > cases[j + 1].uc) j++;
        const A = cases[j], B = cases[j + 1], f = Math.max(0, Math.min(1, (u - A.uc) / (B.uc - A.uc)));
        const a = blend(A.a, B.a, f), s = (90 - u) / 2;
        view.set(a, blend(A.ux, B.ux, f), blend(A.uy, B.uy, f), [s / 1000, u / 1000, s / 1000]);
        const th = CFD.thirds(a, F.nx, F.ny), mx = 0.3;
        bars.forEach((b, i) => { b.style.height = Math.max(6, th.g[i] / mx * 100) + '%'; b.style.background = `rgb(${CFD.jet((th.g[i] - CFD.RANGE.lo) / (CFD.RANGE.hi - CFD.RANGE.lo))})`; b.firstChild.textContent = th.g[i].toFixed(3); });
        document.getElementById('demoUc').textContent = u.toFixed(1);
        document.getElementById('demoUs').textContent = `${s.toFixed(1)} / ${s.toFixed(1)}`;
        document.getElementById('demoI').textContent = th.I.toFixed(3);
        const g = A.gain + (B.gain - A.gain) * f, ge = document.getElementById('demoG');
        ge.textContent = D.f2(g); ge.className = D.cls(g);
        document.querySelectorAll('#demoChips .chip').forEach(c => c.setAttribute('aria-pressed', Math.abs(+c.dataset.u - u) < 0.3));
      };
      sl.oninput = update;
      document.querySelectorAll('#demoChips .chip').forEach(c => c.onclick = () => { sl.value = c.dataset.u; update(); });
      update();
    },
  };
})();
