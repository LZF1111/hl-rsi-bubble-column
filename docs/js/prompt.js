/* Task prompt split into sections with a faithful Chinese translation beside the verbatim English. */
(function () {
  const SECTIONS = [
    { k: 'ROLE', zh: '角色', en: 'Role', start: 'You design', tr: '你负责设计并维护一个三进气口鼓泡塔仿真的控制程序。你只能从展示给你的仿真结果中学习。' },
    { k: 'PLANT', zh: '装置', en: 'Plant', start: 'PLANT:', tr: '0.15 m 宽、1.0 m 高、0.15 m 深的方箱，水深 0.70 m，用不含湍流模型的欧拉–欧拉两相 CFD 模拟。空气从底部左、中、右三个等宽进气口进入，三口合起来覆盖整个底面。控制从 t = 0.2 s 开始，此前为均匀进气（每口 0.03 m/s）；每个控制步 0.1 s，一回合 200 步。' },
    { k: 'OBSERVATION', zh: '观测', en: 'Observation', start: 'OBSERVATION', tr: 'obs 共 21 个数：obs[0..8] 为 0.15、0.35、0.55 m 三个高度上左/中/右的中截面压力（减去静压参考后除以 6867 Pa）；obs[9..17] 为它们相对上一步的变化；obs[18..20] 为上一步实际入口速度，按 (u − 0.03)/0.02 归一化。' },
    { k: 'ACTION', zh: '动作', en: 'Action', start: 'ACTION:', tr: '给出 action = [左, 中, 右]，取值在 [−1, 1]。执行器先去均值，再映射为目标气速 0.03 + 0.02·c/max(1, max|c|)：总气量 0.09 m/s 守恒，单口 0.01–0.05 m/s，每步每口最多向目标移动 0.005 m/s。' },
    { k: 'REWARD', zh: '奖励', en: 'Reward', start: 'REWARD', tr: '每步 r = −I − 0.1·P − 0.01·S。I = std(g)/(mean(g) + 0.01)，g 为 0.05–0.6 m 窗口内左、中、右三段的平均气含率；P 为三个高度上归一化压力横向标准差的平均；S 为各口 ((u_新 − u_旧)/0.02)² 的平均。回报 R 为 200 步之和，越高越好。' },
    { k: 'EVALUATION', zh: '评估', en: 'Evaluation', start: 'EVALUATION:', tr: null },
    { k: 'PROGRAM', zh: '程序规则', en: 'Program rules', start: 'PROGRAM:', tr: '程序是一段受限 Python 语句，每个控制步执行一次。只读输入：obs、step（0–199）、dt、pi；memory 是跨步保留、每回合清空的字典，需在 step == 0 时初始化。允许四则运算、比较、if/else、列表/字典、for 循环（≤128）及 abs/min/max/sum/len/sin/cos/sqrt/tanh/exp；禁止 import、属性、方法、函数定义、推导式、while、文件、网络、随机数和 exec。' },
    { k: 'CONTEXT', zh: '每轮提供的上下文', en: 'Context each round', start: 'CONTEXT:', tr: '你上一轮的笔记本；冠军和父代程序的源码、各条件增益与曲线；其他已评估和被淘汰程序的摘要（理由、各条件增益、行为格，以及条件 0 上入口速度、三段气含率和 I 的曲线）；MAP-Elites 存档（每个行为格 a&lt;幅度&gt;_&lt;偏向&gt;_p&lt;时相&gt; 保留最佳程序）；未探索格；最近的裁决。父代有时是冠军、有时是其他精英；可在其上改进，也可写全新程序。若给出 requested_behaviour_cell，它是随机抽取的未探索格，用于扩大覆盖，并非暗示其有效：请写一个在条件 0 上会落入该格的程序，作为信息性实验。除此描述和这些结果外，不知道哪种控制有效，请从数据中自行得出结论。' },
    { k: 'RETURN', zh: '返回格式', en: 'Return format', start: 'RETURN JSON', tr: '返回恰好包含三个字符串字段的 JSON：source（程序）；rationale（这个程序要检验什么、依据哪些证据）；notes（你的笔记本，≤ 6000 字符，整体替换上一版：实验已表明什么、尚未证实的假设及正反证据、已尝试的想法和结果、下一步测什么）。' },
  ];
  const EVAL_ZH = {
    paired_t: '每个候选在 6 个开发条件上运行，条件之间只差启动 0.2 s 内 1e−4 m/s 的入口扰动。流动是混沌的：同一条件回报会因与控制无关的原因波动约 ±1.5。增益 = R − R_均匀（同条件下均匀布气的回报）。候选先跑 50 步，若平均增益低于 −0.5 直接淘汰；否则跑满 200 步。令 d = 候选增益 − 冠军增益：若 mean(d) > 0.3、mean(d) > 2 倍标准误且没有 d < −2，则再加跑 3 个确认条件；在全部 9 个条件上同样通过、且确认条件的平均 d 为正，才替换冠军。留出测试条件从不展示。',
    promote3: '每个候选在 3 个开发条件上运行，条件之间只差启动 0.2 s 内 1e−4 m/s 的入口扰动。流动是混沌的：同一条件回报会因与控制无关的原因波动约 ±1.5。增益 = R − R_均匀。候选先跑 50 步，平均增益低于 −0.5 则淘汰；否则跑满 200 步。若各条件增益平均比冠军高 0.5 以上、且任一条件不比冠军差 0.75 以上，则替换冠军。留出测试条件从不展示。',
  };

  function split(text) {
    const idx = SECTIONS.map(s => text.indexOf(s.start));
    return SECTIONS.map((s, i) => {
      const a = idx[i], b = idx.slice(i + 1).find(x => x > a);
      return Object.assign({}, s, { orig: a < 0 ? '' : text.slice(a, b == null ? undefined : b).trim() });
    });
  }

  window.PROMPT = {
    html(text, ev, openKeys) {
      return `<div class="pz">${split(text).map(s => `<details class="pz-s"${(openKeys || []).includes(s.k) ? ' open' : ''}><summary><span class="k">${s.k}</span>${L(s.zh, s.en)}</summary>
        <div class="pz-b"><div><h6>中文译文</h6>${s.tr || EVAL_ZH[ev] || ''}</div><div><h6>Original (sent to the model)</h6>${D.esc(s.orig)}</div></div></details>`).join('')}</div>`;
    },
  };
})();
