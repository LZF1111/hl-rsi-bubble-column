"""Pack fine-mesh (30x120) time-mean fields of constant-setpoint and learned controllers for the site.

Source: _remote_demo_build/analysis/data/fine_validate_fields.json (real OpenFOAM runs, seeds 0,1,2,7,8).
Writes docs/data/fine.json with seed-averaged alpha.air and U.water mid-plane means, uint8/base64 packed.
"""
import base64, json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), '_remote_demo_build', 'analysis', 'data')
VMAX = 0.3
CONFIGS = ['fixed', 'c40d20', 'const20', 'c14d20', 'c10d20', 'const0', 'hl', 'sac']


def pack(arr, lo, hi):
    q = np.clip(np.round((np.asarray(arr, dtype=float) - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode()


fields = json.load(open(os.path.join(SRC, 'fine_validate_fields.json')))
summary = json.load(open(os.path.join(SRC, 'fine_validate.json')))
out = {'nx': 30, 'ny': 120, 'vmax': VMAX, 'configs': {}}
for name in CONFIGS:
    keys = sorted(k for k in fields if k.rsplit('_s', 1)[0] == name)
    a = np.mean([fields[k]['alpha_mean'] for k in keys], axis=0)
    u = np.mean([fields[k]['u_water_mean'] for k in keys], axis=0)
    v = np.mean([fields[k]['velocities'][-1] for k in keys], axis=0)
    s = summary.get(name, {})
    out['configs'][name] = {'seeds': [int(k.rsplit('_s', 1)[1]) for k in keys],
                            'a': pack(a, 0, 1), 'ux': pack(u[..., 0], -VMAX, VMAX), 'uy': pack(u[..., 1], -VMAX, VMAX),
                            'u_final': np.round(v, 5).tolist(), 'mean_gain': s.get('mean_gain'),
                            'gains': s.get('gains'), 'C_mean': s.get('C_mean')}
    print(name, keys, np.round(v * 1000, 1), s.get('mean_gain'))
json.dump(out, open(os.path.join(ROOT, 'docs', 'data', 'fine.json'), 'w'), separators=(',', ':'))
print(os.path.getsize(os.path.join(ROOT, 'docs', 'data', 'fine.json')) // 1024, 'KB')
