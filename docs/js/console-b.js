/* Console: archive, HL vs SAC, mechanism tabs. */
(function () {
  const C = window.Charts;
  const BIAS = ['left', 'centre', 'right', 'sides', 'flat'];
  const BZ = { left: '偏左', centre: '偏中', right: '偏右', sides: '两侧', flat: '平均' };
  const AX = ['a0', 'a1', 'a2', 'a3', 'a4'];
  const AXL = ['< 0.5', '0.5–2', '2–6', '6–12', '> 12'];

  function gainColor(g) {
    if (g == null) return '#f2f2f4';
    const t = Math.max(-1, Math.min(1, g / 3));
    const c = t >= 0 ? [0, 102, 204] : [215, 0, 21], f = 0.12 + 0.75 * Math.abs(t);
    return `rgba(${c[0]},${c[1]},${c[2]},${f.toFixed(2)})`;
  }

  window.CONSOLE_B = {
    archive(root, run, go) {
      const best = {};
      for (const r of run.rounds) {
        const b = r.behaviour; if (!b || r.mean_gain == null || r.horizon == 50 || r.decision === 'rejected_screen') continue;
        const k = b.cell.split('_').slice(0, 2).join('_');
        if (!best[k] || r.mean_gain > best[k].mean_gain) best[k] = r;
      }
      let html = `<div class="arc"><div class="h y"></div>${AX.map((a, i) => `<div class="h">${a}<br><small style="font-weight:400">${AXL[i]} mm/s</small></div>`).join('')}`;
      for (const b of BIAS) {
        html += `<div class="h y">${L(BZ[b], b)}</div>`;
        for (const a of AX) {
          const r = best[a + '_' + b];
          html += r ? `<button class="c" style="background:${gainColor(r.mean_gain)};color:${Math.abs(r.mean_gain) > 1.6 ? '#fff' : 'var(--ink)'}" data-r="${r.round}" title="R${r.round}"><small>R${r.round}${r.decision === 'accepted' ? ' ★' : ''}</small><b>${D.f2(r.mean_gain)}</b></button>` : '<div class="c e"></div>';
        }
      }
      root.innerHTML = `<div class="card"><h3>${L('MAP-Elites 行为存档', 'MAP-Elites behaviour archive')}</h3><p class="sub">${L('每格保留该行为类型中开发增益最高的程序。横轴：平均动作幅度 |u − 30| ；纵轴：气量偏向。随机探索指令让模型去填空格，避免只在冠军附近打转。点击格子查看该轮。',
        'Each cell keeps the highest-gain program of that behaviour. Columns: mean actuation |u − 30|; rows: which inlet gets the most gas. Random exploration requests push the model into empty cells instead of circling the champion. Click a cell to open its round.')}</p>${html}</div>
        <div class="legend"><span><i style="background:${gainColor(3)}"></i>${L('增益 +3', 'gain +3')}</span><span><i style="background:${gainColor(1)}"></i>+1</span><span><i style="background:${gainColor(-1.5)}"></i>−1.5</span><span><i style="background:#f2f2f4"></i>${L('未探索', 'unexplored')}</span></div></div>`;
      root.querySelectorAll('.arc .c[data-r]').forEach(b => b.onclick = () => go(+b.dataset.r));
    },

    compare(root, meta, F) {
      const LS = meta.learners, conds = meta.learner_conditions;
      root.innerHTML = `
      <div class="grid g2">
        <div class="card"><h3>${L('同一个答案', 'The same answer')}</h3><p class="sub">${L('条件 ξ<sub>0</sub> 的中间口入口速度。SAC 与 HL 独立学到：先等 2 s，再把中间口降到约 17–20 mm/s。', 'Centre-inlet velocity on ξ<sub>0</sub>. SAC and HL independently learn: wait ~2 s, then cut the centre to about 17–20 mm/s.')}</p><div class="chart" id="cmpU"></div>
          <div class="legend"><span><i style="background:#d6517d"></i>SAC</span><span><i style="background:#0066cc"></i>HL</span><span><i style="background:#8e8e93"></i>${L('均匀', 'Equal')}</span></div></div>
        <div class="card"><h3>${L('5 个条件上的增益', 'Gain on 5 conditions')}</h3><p class="sub">${L('ξ<sub>0–2</sub> 开发 · ξ<sub>7–8</sub> 留出。SAC 为确定性策略评估。', 'ξ<sub>0–2</sub> development · ξ<sub>7–8</sub> held-out. SAC evaluated deterministically.')}</p><div class="chart" id="cmpG"></div></div>
      </div>
      <div class="card"><h3>${L('细网格时均气相分布', 'Fine-mesh time-mean gas distribution')}</h3><p class="sub">${L('30 × 120 × 10 网格，5 个条件平均。两种学习者把中央气柱推向两侧的方式几乎一样。', '30 × 120 × 10 mesh, 5-condition average. Both learners spread the central plume in almost the same way.')}</p>
        <div class="fine3"><div><div class="col-frame"><canvas id="fq0"></canvas></div><p class="ba-cap"><b>${D.f2(F.configs.fixed.mean_gain)}</b>${L('均匀布气', 'Equal flow')}</p></div><div><div class="col-frame"><canvas id="fq1"></canvas></div><p class="ba-cap"><b>${D.f2(F.configs.sac.mean_gain)}</b>SAC</p></div><div><div class="col-frame"><canvas id="fq2"></canvas></div><p class="ba-cap"><b>${D.f2(F.configs.hl.mean_gain)}</b>HL</p></div>
        <div class="ba-side"><div id="fqCbar"></div><p class="note">${L('数字为细网格上相对均匀布气的平均增益。细网格增益小于粗网格，但方向一致。', 'Numbers are mean gains vs equal flow on the fine mesh: smaller than on the coarse mesh, same sign.')}</p></div></div></div>
      <div class="card"><h3>${L('两种学习方式', 'Two ways to learn')}</h3>
        <table class="t"><thead><tr><th></th><th>SAC</th><th>HL · FlowEvolve</th></tr></thead><tbody>
          <tr><th>${L('学习对象', 'Learns')}</th><td>${L('神经网络权重', 'network weights')}</td><td>${L('可读 Python 程序 + 笔记本', 'readable Python + notebook')}</td></tr>
          <tr><th>${L('CFD 预算', 'CFD budget')}</th><td>2 × 10⁵ ${L('段 / 种子', 'segments / seed')}</td><td>3–6 × 10⁴ ${L('段 / 运行', 'segments / run')}</td></tr>
          <tr><th>${L('改进步骤', 'Update')}</th><td>${L('每个转移一次梯度', 'gradient per transition')}</td><td>${L('每轮一次推理 + 一次统计裁决', 'one reasoning step + one statistical verdict per round')}</td></tr>
          <tr><th>${L('可解释性', 'Readability')}</th><td>${L('黑箱', 'black box')}</td><td>${L('3 行代码', '3 lines')}</td></tr>
        </tbody></table></div>`;
      const t = i => 0.3 + 0.1 * i;
      C.lines(document.getElementById('cmpU'), [
        { name: Lt('均匀', 'Equal'), color: '#8e8e93', pts: [[0, 30], [20.2, 30]], dash: '4 4', width: 1.5 },
        { name: 'SAC', color: '#d6517d', pts: LS['SAC seed 1'].u_xi0.map((r, i) => [t(i), r[1] * 1000]), width: 2 },
        { name: 'HL', color: '#0066cc', pts: LS['HL run 1'].u_xi0.map((r, i) => [t(i), r[1] * 1000]), width: 3 }],
        { h: 250, x: [0, 20.3], y: [12, 34], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'u_C (mm/s)', xname: 't', digits: 1 });
      const names = Object.keys(LS), col = { 'SAC seed 1': '#d6517d', 'SAC seed 2': '#e07a9c', 'SAC seed 3': '#eba7be', 'HL run 1': '#0066cc', 'HL run 2': '#5a9be0' };
      C.bars(document.getElementById('cmpG'), conds.map((c, j) => ({ label: 'ξ' + c, values: names.map(n => ({ v: LS[n].gains[j], color: col[n], name: n })) })), { h: 250, ylabel: Lt('增益', 'Gain') });
      const v = F.vmax, o = { nx: F.nx, ny: F.ny, smooth: 4 };
      ['fixed', 'sac', 'hl'].forEach((k, i) => new CFD.FieldView(document.getElementById('fq' + i), o).set(CFD.unpack(F.configs[k].a, 0, 1), CFD.unpack(F.configs[k].ux, -v, v), CFD.unpack(F.configs[k].uy, -v, v), F.configs[k].u_final));
      document.getElementById('fqCbar').innerHTML = CFD.colorbar('dev', Lt('气含率偏差', 'gas-fraction deviation'));
    },

    mechanism(root, meta, F) {
      const g = k => F.configs[k].mean_gain;
      root.innerHTML = `
      <div class="grid g3">
        <div class="card"><div class="big-n">0.26 s</div><h3>${L('混沌 e 折时间', 'Chaos e-folding')}</h3><p>${L('10⁻⁶ m/s 的扰动按 3.9 s⁻¹ 指数放大。单条轨迹的"进步"可能只是运气。', 'A 10⁻⁶ m/s nudge grows at 3.9 s⁻¹. One improved trajectory can be pure luck.')}</p></div>
        <div class="card"><div class="big-n">2.0 s</div><h3>${L('环流记忆', 'Circulation memory')}</h3><p>${L('液相大尺度环流的相关时间约为混沌时间的 8 倍，留出可控窗口。', 'The large liquid circulation stays correlated ~8× longer than the chaos, leaving room to steer.')}</p></div>
        <div class="card"><div class="big-n">${D.f2(g('const0'))} → ${D.f2(g('c14d20'))}</div><h3>${L('时机与力度', 'Timing and dose')}</h3><p>${L('细网格上：从 0 s 起把中间口降到 21 mm/s 为负；等 2 s 再降到 14 mm/s 为显著正收益。', 'On the fine mesh: cutting the centre to 21 mm/s from 0 s loses; waiting 2 s and cutting to 14 mm/s gains markedly.')}</p></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>${L('扰动如何放大', 'How a nudge grows')}</h3><p class="sub">${L('两次运行气含率场的 RMS 距离', 'RMS distance between the gas-fraction fields of two runs')}</p><div class="chart" id="mLy"></div></div>
        <div class="card"><h3>${L('细网格剂量—响应', 'Fine-mesh dose–response')}</h3><p class="sub">${L('中间口终值与起始时间；5 条件平均增益', 'Final centre velocity and start time; 5-condition mean gain')}</p><div class="chart" id="mDose"></div></div>
      </div>
      <div class="card"><h3>${L('方向和力度都要对', 'Direction and dose both matter')}</h3><p class="sub">${L('细网格时均气相分布。中间加气（左）把中央气柱进一步加强；适度挪到两侧（右二）分布最匀。', 'Fine-mesh time-mean gas fraction. Adding gas to the centre (left) strengthens the central plume; a moderate shift to the sides (second right) evens it out.')}</p>
        <div class="fine3" style="grid-template-columns:repeat(4,110px) minmax(0,1fr)">${['c40d20', 'fixed', 'c14d20', 'c10d20'].map((k, i) => `<div><div class="col-frame"><canvas id="mq${i}"></canvas></div><p class="ba-cap"><b>${D.f2(g(k))}</b>u<sub>C</sub> = ${Math.round(F.configs[k].u_final[1] * 1000)}</p></div>`).join('')}<div class="ba-side"><div id="mqCbar"></div></div></div></div>`;
      const ly = meta.lyapunov;
      C.lines(document.getElementById('mLy'), Object.entries(ly).map(([k, v], j) => ({ name: k === 'd1e-6' ? 'δ = 10⁻⁶' : 'δ = 10⁻⁵', color: j ? '#6e40c9' : '#0066cc', width: 2.5, pts: v.t.map((x, i) => [x, v.rms[i] > 0 ? Math.log10(v.rms[i]) : null]) })),
        { h: 240, x: [0, 20.2], xlabel: Lt('时间 t (s)', 'Time t (s)'), ylabel: 'log₁₀ ‖Δα‖', xname: 't', yfmt: v => '10^' + v.toFixed(0), digits: 2 });
      const dose = [['c40d20', '40 @2s'], ['fixed', '30'], ['const0', '21 @0s'], ['const20', '21 @2s'], ['hl', '17 @2s'], ['c14d20', '14 @2s'], ['c10d20', '10 @2s']];
      C.bars(document.getElementById('mDose'), dose.map(([k, l]) => ({ label: l, values: [{ v: g(k), color: g(k) >= 0 ? '#0066cc' : '#d70015', name: Lt('增益', 'gain') }] })), { h: 240, ylabel: Lt('增益', 'Gain') });
      const v = F.vmax, o = { nx: F.nx, ny: F.ny, smooth: 4 };
      ['c40d20', 'fixed', 'c14d20', 'c10d20'].forEach((k, i) => new CFD.FieldView(document.getElementById('mq' + i), o).set(CFD.unpack(F.configs[k].a, 0, 1), CFD.unpack(F.configs[k].ux, -v, v), CFD.unpack(F.configs[k].uy, -v, v), F.configs[k].u_final));
      document.getElementById('mqCbar').innerHTML = CFD.colorbar('dev', Lt('气含率偏差', 'gas-fraction deviation'));
    },
  };
})();
