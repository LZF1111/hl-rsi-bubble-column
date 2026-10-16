"""Re-run every HL candidate of a run on condition xi_0 (deterministic) and keep only mid-plane fields.

Run on the CFD server from the project root:
  bash remote_run.sh /tmp/rerun_rounds.py <run> [workers]
Output: /tmp/hl_site_rounds/<run>/<round>.json (resumable). Each CFD case is deleted after extraction.
"""
import json, os, re, shutil, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np

sys.path.insert(0, os.getcwd())
from bubble_env import BubbleEnv, scalar_field  # noqa: E402
from hl_runtime import CodePolicy  # noqa: E402

NXB, NY, NZ = 4, 40, 4
FRAME_EVERY = 4     # 0.4 s
run = sys.argv[1]
workers = int(sys.argv[2]) if len(sys.argv) > 2 else 8
OUT = '/tmp/hl_site_rounds/' + run
os.makedirs(OUT, exist_ok=True)


def vector(path):
    t = open(path).read()
    m = re.search(r'internalField\s+nonuniform\s+List<vector>\s+(\d+)\s*\((.*?)\n\)\s*;', t, re.S)
    return np.array([r.split() for r in re.findall(r'\(([^()]+)\)', m.group(2))], dtype=float)


def plane(a):
    b = a.reshape(3, NZ, NY, NXB, *a.shape[1:])
    return np.concatenate([b[i] for i in range(3)], axis=2).mean(axis=0)


def job(item):
    rnd, pid = item
    target = '%s/%d.json' % (OUT, rnd)
    if os.path.exists(target):
        return rnd, 'cached'
    src = open('results/%s/policies/%s.py' % (run, pid)).read()
    env = BubbleEnv(label='site_round', horizon=200, interval=0.1, warmup=0.2)
    try:
        pol = CodePolicy(src, 0.1)
        obs, info = env.reset(seed=0)
        frames, rewards = [], []
        for k in range(200):
            obs, r, _, trunc, st = env.step(pol(obs))
            rewards.append(r)
            if k % FRAME_EVERY == FRAME_EVERY - 1 or k == 199:
                a = plane(scalar_field(env.latest / 'alpha.air', 3 * NXB * NY * NZ))
                u = plane(vector(env.latest / 'U.water'))
                frames.append({'t': round(st['time'], 2), 'a': np.round(a, 3).tolist(),
                               'ux': np.round(u[..., 0], 3).tolist(), 'uy': np.round(u[..., 1], 3).tolist(),
                               'v': [round(x, 5) for x in st['velocities']], 'I': round(st['gas_imbalance'], 5)})
        late = [f for f in frames if f['t'] >= 3.0]
        res = {'round': rnd, 'policy': pid, 'return': float(sum(rewards)), 'frames': frames,
               'mean_alpha': np.round(np.mean([f['a'] for f in late], axis=0), 4).tolist(),
               'mean_ux': np.round(np.mean([f['ux'] for f in late], axis=0), 4).tolist(),
               'mean_uy': np.round(np.mean([f['uy'] for f in late], axis=0), 4).tolist()}
        json.dump(res, open(target + '.tmp', 'w'), separators=(',', ':'))
        os.replace(target + '.tmp', target)
        return rnd, round(res['return'], 4)
    finally:
        env.close()
        if env.case is not None:
            shutil.rmtree(env.case, ignore_errors=True)


state = json.load(open('results/%s/state.json' % run))
items = sorted((c['round'], c['id']) for c in state['candidates'].values()
               if os.path.exists('results/%s/policies/%s.py' % (run, c['id'])))
print(run, len(items), 'candidates', flush=True)
with ThreadPoolExecutor(max_workers=workers) as pool:
    for rnd, ret in pool.map(job, items):
        print('round', rnd, ret, flush=True)
print('DONE', flush=True)
