"""Build docs/data/meta.json (task definition, prompt, SAC/HL comparison, Lyapunov) from local analysis data."""
import ast, json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), '_remote_demo_build')
DATA = os.path.join(SRC, 'analysis', 'data')
OUT = os.path.join(ROOT, 'docs', 'data')


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def constants():
    tree = ast.parse(open(os.path.join(SRC, 'hl_learning.py'), encoding='utf-8').read())
    out = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            if node.targets[0].id in ('NOHINT_SYSTEM', 'NOHINT_EVALUATION', 'BEHAVIOUR_AXES'):
                out[node.targets[0].id] = ast.literal_eval(node.value)
    return out


def paired_t_rule(cfg):
    # mirrors HLManager.evaluation_rule() for acceptance == 'paired_t'
    n, c = len(cfg['dev_seeds']), len(cfg['confirm_seeds'])
    return ('Every candidate runs on %d development conditions that differ only by a 1e-4 m/s inlet perturbation '
            'during the 0.2 s start-up. The flow is chaotic: the return of one condition varies by about +-1.5 for '
            'reasons unrelated to control. Gain = R - R_fixed on the same condition, R_fixed being the return of '
            'equal flow (action = [0, 0, 0]). A candidate first runs %d steps on each condition and is discarded if '
            'its mean %d-step gain is below -%s (equal flow scores about -1 over 50 steps); otherwise it runs 200 '
            'steps. Let d = candidate gain - champion gain on each condition. If mean(d) > %s, mean(d) > %s standard '
            'errors of d and no d < -%s, the candidate also runs on %d further confirmation conditions; it replaces '
            'the champion if the same test passes over all %d conditions and the mean d on the confirmation '
            'conditions is positive. Held-out test conditions are never shown.'
            % (n, cfg['screen_horizon'], cfg['screen_horizon'], cfg['screen_tolerance'], cfg['minimum_gain'],
               cfg['kappa'], cfg['max_regression'], c, n + c))


def main():
    k = constants()
    cfg = load('nohint/hl_h200_nohint_stat01/protocol.json')
    learners = load('learners_v9.json')
    lyap = load('lyapunov.json')
    sac = load('sac_seed_curves.json')
    meta = {
        'prompt': {
            'system_paired_t': k['NOHINT_SYSTEM'].replace('{evaluation}', paired_t_rule(cfg)),
            'system_promote3': k['NOHINT_SYSTEM'].replace('{evaluation}', k['NOHINT_EVALUATION']),
        },
        'behaviour_axes': k['BEHAVIOUR_AXES'],
        'learners': {name: {kk: v[kk] for kk in ('gains', 'circ', 'u_xi0', 'segments', 'program') if kk in v}
                     for name, v in learners['learners'].items()},
        'learner_conditions': learners['conditions'],
        'lyapunov': {kk: {'t': v['t'], 'rms': v['rms_alpha_distance'], 'ftle': v['ftle_1_per_s'],
                          'efold': v['e_folding_time_s']} for kk, v in lyap['series'].items()},
        'sac_curves': {kk: [round(x, 3) for x in v] for kk, v in sac.items()},
        'search_cost': load('nohint/search_cost.json'),
    }
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)
    print('meta.json', os.path.getsize(os.path.join(OUT, 'meta.json')) // 1024, 'KB')

    code = os.path.join(ROOT, 'src')
    os.makedirs(code, exist_ok=True)
    for name in ('bubble_env.py', 'hl_runtime.py', 'hl_learning.py', 'campaign.py', 'sac_controller.py',
                 'build_case.py', 'test_hl_learning.py', 'test_framework.py', 'blockMeshDict'):
        shutil.copy(os.path.join(SRC, name), os.path.join(code, name))
    print('copied sources to', code)


if __name__ == '__main__':
    main()
