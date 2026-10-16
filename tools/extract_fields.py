"""Extract real CFD fields (z-averaged alpha.air and U.water on the 12x40 mid-plane) from saved test cases.

Run on the CFD server from the project root: python3 extract_fields.py; writes /tmp/hl_site_export/fields.json.
Cell order (block, z, y, x) matches bubble_env._metrics: 3 blocks of 4 x 40 x 4.
"""
import json, os, re
import numpy as np

NXB, NY, NZ = 4, 40, 4
RUNS = ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02', 'hl_h200_nohint01', 'hl_h200_nohint02']
FRAME_STEP = 2          # every 0.2 s -> 101 frames per episode


def scalar(path):
    t = open(path).read()
    m = re.search(r'internalField\s+nonuniform\s+List<scalar>\s+(\d+)\s*\((.*?)\)\s*;', t, re.S)
    if m:
        return np.array(m.group(2).split(), dtype=float)
    return np.full(3 * NXB * NY * NZ, float(re.search(r'internalField\s+uniform\s+([^;]+);', t).group(1)))


def vector(path):
    t = open(path).read()
    m = re.search(r'internalField\s+nonuniform\s+List<vector>\s+(\d+)\s*\((.*?)\n\)\s*;', t, re.S)
    if not m:
        v = re.search(r'internalField\s+uniform\s+\(([^)]+)\)', t).group(1).split()
        return np.tile(np.array(v, dtype=float), (3 * NXB * NY * NZ, 1))
    return np.array([r.split() for r in re.findall(r'\(([^()]+)\)', m.group(2))], dtype=float)


def plane(a):
    b = a.reshape(3, NZ, NY, NXB, *a.shape[1:])
    full = np.concatenate([b[i] for i in range(3)], axis=2)      # (z, y, x, ...)
    return full.mean(axis=0)                                     # (y, x, ...)


def episode(case):
    times = sorted((d for d in os.listdir(case) if re.fullmatch(r'[0-9.]+', d) and float(d) >= 0.2 - 1e-9), key=float)
    times = times[::FRAME_STEP]
    if times[-1] != '20.2':
        times.append('20.2')
    frames = []
    for t in times:
        a = plane(scalar(os.path.join(case, t, 'alpha.air')))
        u = plane(vector(os.path.join(case, t, 'U.water')))
        frames.append({'t': round(float(t), 2),
                       'a': np.round(a, 3).tolist(),
                       'ux': np.round(u[..., 0], 4).tolist(), 'uy': np.round(u[..., 1], 4).tolist()})
    traj = [json.loads(l) for l in open(os.path.join(case, 'trajectory.jsonl')) if l.strip()]
    late = [f for f in frames if f['t'] >= 3.0]
    mean_a = np.mean([f['a'] for f in late], axis=0)
    mean_uy = np.mean([f['uy'] for f in late], axis=0)
    mean_ux = np.mean([f['ux'] for f in late], axis=0)
    return {'frames': frames, 'mean_alpha': np.round(mean_a, 4).tolist(),
            'mean_ux': np.round(mean_ux, 4).tolist(), 'mean_uy': np.round(mean_uy, 4).tolist(),
            'velocities': [[round(v, 5) for v in r['velocities']] for r in traj],
            'imbalance': [round(r['gas_imbalance'], 5) for r in traj],
            'reward': [round(r['reward'], 5) for r in traj],
            'return': sum(r['reward'] for r in traj)}


out = {}
for run in RUNS:
    ft = json.load(open('results/%s/final_test.json' % run))
    out[run] = {}
    for split in ('fixed', 'learned'):
        for ep in ft[split]['episodes']:
            key = '%s_s%d' % (split, ep['seed'])
            out[run][key] = episode(ep['case'])
            print(run, key, len(out[run][key]['frames']), round(out[run][key]['return'], 3), flush=True)
os.makedirs('/tmp/hl_site_export', exist_ok=True)
json.dump(out, open('/tmp/hl_site_export/fields.json', 'w'), separators=(',', ':'))
print('size MB', os.path.getsize('/tmp/hl_site_export/fields.json') / 1e6)
