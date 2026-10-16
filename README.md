# HL · RSI — 语言模型自我改进的鼓泡塔控制

在线界面：<https://lzf1111.github.io/hl-rsi-bubble-column/>

启发式学习（Heuristic Learning, HL）让语言模型**写控制程序**，真实 CFD **执行**，评估器**裁决**，学习状态与笔记本**记账**，模型下一轮**读账再改**。对照组是 Stable-Baselines3 SAC。两者在同一个混沌鼓泡塔、同一执行器、同一奖励上学习。

## 控制问题

| 项 | 内容 |
|---|---|
| 装置 | 0.15 × 1.0 × 0.15 m 方塔，水深 0.70 m，底部左 / 中 / 右三块等面积入口 |
| 模型 | OpenFOAM v2306 `twoPhaseEulerFoam`，Euler–Euler 两流体，层流，12×40×4 网格 |
| 时序 | 0.2 s 均匀流启动 → 200 步 × 0.1 s |
| 动作 | a ∈ [−1, 1]³ → 去均值、限幅 0.01–0.05 m/s、总和 0.09 m/s、每步 ≤ 0.005 m/s |
| 观测 | 21 维：9 个压力、9 个增量、3 个上一步入口速度 |
| 奖励 | r = −I − 0.1P − 0.01S；I = std(g)/(mean(g)+0.01)，g 为评分窗三段平均气含率 |
| 混沌 | λ ≈ 3.9 s⁻¹；10⁻⁴ m/s 启动扰动 → 单回合回报 σ ≈ 1.4 |

## 界面内容

- 左侧功能栏：控制目标、可选策略、控制范围（可交互执行器）、奖励函数（可交互 I 计算）、评估器、完整系统提示词。
- 右侧结果：每轮 LLM 提案的增益、与当时冠军的配对检验、源码 diff、rationale、自维护笔记本、入口速度 / 三段气含率 / I(t) 轨迹，可逐轮播放。
- MAP-Elites 行为存档、HL 与 SAC 对照、学到的机制（定时把中间口的气挪到两侧）。

展示的 4 次运行全部是**无先验**提示（只给任务定义）。留出条件 ξ₇、ξ₈ 在学习中从未展示给模型。所有结果为同一几何、网格与工况下的扰动条件，不代表跨工况验证。

## 目录

```
docs/            GitHub Pages 静态站（无构建、无依赖）
  data/meta.json         提示词、SAC/HL 对照、Lyapunov、搜索成本
  data/runs/*.json       每次 HL 运行的逐轮记录
src/             控制环境、受限解释器、HL 管理器、SAC 控制器（研究代码快照）
tools/           export_site.py（CFD 服务器上导出运行数据）、build_meta.py（本地组装 meta.json）
```

## 本地预览

```bash
python -m http.server 8000 -d docs
```

## 更新数据

```bash
# 在 CFD 服务器项目根目录
python3 tools/export_site.py            # → /tmp/hl_site_export/*.json，拷到 docs/data/runs/
# 本地
python tools/build_meta.py
```

## 运行 HL（需 OpenFOAM v2306 + 自备 OpenAI 兼容端点）

```bash
export HL_API_KEY=...  HL_API_URL=https://.../v1/chat/completions  HL_MODEL=...
cd src
python campaign.py hl --run my_run --horizon 200 --prompt-variant nohint \
    --evaluator paired_t --rounds 60 --stagnation-limit 30
python campaign.py sac --run my_sac --horizon 200 --episodes 1000
```

密钥只从环境变量读取，代码和数据中不含任何凭据。
