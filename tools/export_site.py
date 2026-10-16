"""Export HL runs (events + state + policy sources) into compact JSON for the static dashboard.

Run on the CFD server from the project root: python3 export_site.py [run ...]; output in /tmp/hl_site_export.
"""
import json, os, sys

RUNS = sys.argv[1:] or ['hl_h200_nohint_stat01', 'hl_h200_nohint_stat02', 'hl_h200_nohint01', 'hl_h200_nohint02']
OUT = '/tmp/hl_site_export'
os.makedirs(OUT, exist_ok=True)


def src(run, pid):
    p = 'results/%s/policies/%s.py' % (run, pid)
    return open(p).read() if os.path.exists(p) else None


for run in RUNS:
    d = 'results/' + run
    state = json.load(open(d + '/state.json'))
    protocol = json.load(open(d + '/protocol.json'))
    final = json.load(open(d + '/final_test.json')) if os.path.exists(d + '/final_test.json') else None
    cands = state['candidates']
    rounds, target, cur = {}, {}, 0
    for line in open(d + '/events.jsonl'):
        e = json.loads(line)
        k = e['kind']
        if k == 'target_cell':
            target[e['round']] = e['cell']
        elif k == 'notes_updated':
            cur = e['round']
            rounds.setdefault(cur, {})['notes'] = e['notes']
        elif k == 'proposal':
            r = rounds.setdefault(cur, {})
            m = e.get('metadata') or {}
            u = m.get('usage') or {}
            r.update(policy=e['policy'], parent=e.get('parent'), rationale=e.get('rationale'), model=m.get('model'),
                     prompt_tokens=u.get('prompt_tokens'), completion_tokens=u.get('completion_tokens'),
                     latency_s=m.get('seconds'), time=e['time'])
        elif k in ('accepted', 'rejected_regression', 'rejected_screen', 'evaluation_failed', 'rejected_preflight'):
            for rr in rounds.values():
                if rr.get('policy') == e['policy'] and 'decision' not in rr:
                    rr['decision'] = k
                    if 'error' in e:
                        rr['error'] = str(e['error'])[:400]
    out_rounds = []
    for n in sorted(rounds):
        r = rounds[n]
        pid = r.get('policy')
        c = cands.get(pid, {}) if pid else {}
        test = c.get('test') or {}
        out_rounds.append({
            'round': n, 'id': (pid or '')[:12], 'parent': (r.get('parent') or '')[:12],
            'requested_cell': target.get(n), 'decision': r.get('decision') or c.get('status'),
            'status': c.get('status'), 'rationale': r.get('rationale'), 'notes': r.get('notes'),
            'source': src(run, pid) if pid else None,
            'parent_source': src(run, r.get('parent')) if r.get('parent') else None,
            'model': r.get('model'), 'prompt_tokens': r.get('prompt_tokens'),
            'completion_tokens': r.get('completion_tokens'), 'latency_s': r.get('latency_s'), 'time': r.get('time'),
            'gains': c.get('gains'), 'mean_gain': c.get('mean_gain'), 'confirm_gains': c.get('confirm_gains'),
            'horizon': c.get('horizon'), 'behaviour': c.get('behaviour'),
            'test': {k: test.get(k) for k in ('dev', 'dev_passed', 'all', 'accepted', 'confirm_deltas') if k in test},
            'velocity_trace': c.get('velocity_trace'), 'thirds_trace': c.get('thirds_trace'),
            'imbalance_trace': c.get('imbalance_trace'), 'error': r.get('error') or c.get('error'),
        })
    base = cands.get(next(iter(cands)), {})
    champ = state['incumbent']
    summary = {
        'run': run, 'rounds_total': state['rounds'], 'api_calls': state['api_calls'],
        'segments': state['reserved_segments'], 'champion': champ[:12],
        'champion_source': src(run, champ), 'champion_gains': cands.get(champ, {}).get('gains'),
        'champion_confirm': state.get('champion_confirm'),
        'development': {k: v for k, v in state['development'].items() if k != 'episodes'},
        'baselines': state.get('baselines'),
        'archive_cells': {k: v[:12] for k, v in state.get('archive_cells', {}).items()},
        'stagnation': state.get('stagnation'),
        'protocol': {k: v for k, v in protocol.items() if k != 'fingerprint'},
        'final_test': None if final is None else {
            'gains_vs_fixed': final.get('gains_vs_fixed'), 'mean_gain_vs_fixed': final.get('mean_gain_vs_fixed'),
            'fixed_returns': final.get('fixed', {}).get('returns'),
            'learned_returns': (final.get('learned') or {}).get('returns'), 'note': final.get('note')},
        'baseline_trace': {'velocity_trace': base.get('velocity_trace'), 'thirds_trace': base.get('thirds_trace'),
                           'imbalance_trace': base.get('imbalance_trace')},
        'rounds': out_rounds,
    }
    json.dump(summary, open('%s/%s.json' % (OUT, run), 'w'))
    print(run, len(out_rounds), os.path.getsize('%s/%s.json' % (OUT, run)) // 1024, 'KB')
