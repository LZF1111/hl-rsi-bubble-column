"""Split the server field export into compact per-run files for the site.

Frames are quantised to uint8 (alpha 0..1, velocity -0.3..0.3 m/s) and base64-packed to keep files small.
Usage: python tools/pack_fields.py _fields_raw.json
"""
import base64, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'data', 'fields')
VMAX = 0.3


def pack(arr, lo, hi):
    q = np.clip(np.round((np.asarray(arr, dtype=float) - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode()


def episode(ep):
    fr = ep['frames']
    return {'t': [f['t'] for f in fr],
            'a': pack([f['a'] for f in fr], 0, 1),
            'ux': pack([f['ux'] for f in fr], -VMAX, VMAX),
            'uy': pack([f['uy'] for f in fr], -VMAX, VMAX),
            'mean_alpha': ep['mean_alpha'], 'mean_ux': ep['mean_ux'], 'mean_uy': ep['mean_uy'],
            'velocities': ep['velocities'], 'imbalance': ep['imbalance'], 'reward': ep['reward'],
            'return': round(ep['return'], 4)}


def main(src):
    data = json.load(open(src))
    os.makedirs(OUT, exist_ok=True)
    first = next(iter(data.values()))
    fixed = {k: episode(v) for k, v in first.items() if k.startswith('fixed')}
    meta = {'ny': 40, 'nx': 12, 'vmax': VMAX, 'width_m': 0.15, 'height_m': 1.0}
    json.dump(dict(meta, episodes=fixed), open(os.path.join(OUT, 'fixed.json'), 'w'), separators=(',', ':'))
    for run, eps in data.items():
        for k in eps:
            if k.startswith('fixed'):
                assert abs(eps[k]['return'] - first[k]['return']) < 1e-9, 'fixed-flow episodes must be identical'
        learned = {k: episode(v) for k, v in eps.items() if k.startswith('learned')}
        json.dump(dict(meta, episodes=learned), open(os.path.join(OUT, run + '.json'), 'w'), separators=(',', ':'))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
