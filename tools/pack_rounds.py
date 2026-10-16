"""Pack per-round xi_0 replays (from tools/rerun_rounds.py) into docs/data/rounds/<run>.json.

Usage: python tools/pack_rounds.py <dir with run subfolders of <round>.json>
"""
import base64, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'data', 'rounds')
VMAX = 0.3


def pack(arr, lo, hi):
    q = np.clip(np.round((np.asarray(arr, dtype=float) - lo) / (hi - lo) * 255), 0, 255).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode()


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for run in sorted(os.listdir(src)):
        d = os.path.join(src, run)
        if not os.path.isdir(d):
            continue
        rounds = {}
        for f in os.listdir(d):
            if not f.endswith('.json'):
                continue
            r = json.load(open(os.path.join(d, f)))
            fr = r['frames']
            rounds[str(r['round'])] = {
                'policy': r['policy'][:12], 'return': round(r['return'], 4), 't': [x['t'] for x in fr],
                'a': pack([x['a'] for x in fr], 0, 1), 'ux': pack([x['ux'] for x in fr], -VMAX, VMAX),
                'uy': pack([x['uy'] for x in fr], -VMAX, VMAX), 'v': [x['v'] for x in fr], 'I': [x['I'] for x in fr],
                'ma': pack(r['mean_alpha'], 0, 1), 'mux': pack(r['mean_ux'], -VMAX, VMAX), 'muy': pack(r['mean_uy'], -VMAX, VMAX)}
        out = {'nx': 12, 'ny': 40, 'vmax': VMAX, 'seed': 0, 'rounds': rounds}
        p = os.path.join(OUT, run + '.json')
        json.dump(out, open(p, 'w'), separators=(',', ':'))
        print(run, len(rounds), 'rounds', os.path.getsize(p) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1])
