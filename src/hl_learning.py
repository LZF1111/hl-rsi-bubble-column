"""Auditable code-policy learning against direct CFD, with no surrogate."""
import argparse
import ast
from contextlib import contextmanager
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import threading
import time
import urllib.request
import uuid
from hl_runtime import CodePolicy, BASELINE

ROOT = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_json(path, data):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as handle:
        json.dump(data, handle, indent=2, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


@contextmanager
def lock_run(directory):
    import fcntl
    with (directory/'run.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def fingerprint(template):
    paths = [ROOT/name for name in ('bubble_env.py', 'build_case.py', 'hl_runtime.py', 'hl_learning.py')]
    for name in ('0', 'constant', 'system'):
        paths.extend(path for path in (template/name).rglob('*') if path.is_file())
    paths.append(template/'mesh_meta.json')
    return {str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path): digest(path.read_bytes()) for path in sorted(paths)}


def check_source(source, interval):
    policy = CodePolicy(source, interval)
    for observation in ([0.0]*21, [0.01]*9+[0.0]*12, [(-1.0)**index*0.05 for index in range(21)]):
        policy.reset()
        for _ in range(60):
            policy(observation)


def promote(candidate, incumbent, minimum_gain, max_regression):
    """Accept when the mean per-seed advantage over fixed flow improves by minimum_gain and no seed regresses."""
    if candidate['seeds'] != incumbent['seeds']:
        raise ValueError('Paired seed sets must match')
    key = 'gains' if 'gains' in candidate and 'gains' in incumbent else 'returns'
    deltas = [new-old for new, old in zip(candidate[key], incumbent[key])]
    return sum(deltas)/len(deltas) > minimum_gain and min(deltas) >= -max_regression


def paired_test(deltas, minimum_gain, kappa, max_regression):
    """Paired test on per-condition differences: mean above floor and kappa standard errors, no gross loss."""
    n = len(deltas)
    mean = sum(deltas) / n
    sd = (sum((d - mean) ** 2 for d in deltas) / (n - 1)) ** 0.5 if n > 1 else 0.0
    se = sd / n ** 0.5
    passed = mean > minimum_gain and mean > kappa * se and min(deltas) >= -max_regression
    return passed, {'n': n, 'mean': mean, 'se': se, 't': mean / se if se > 0 else None, 'min': min(deltas)}


def structure_signature(source):
    """Readable lexical tag kept for logs; diversity is enforced by behaviour cells, not this."""
    markers = (
        ('memory', "memory["),
        ('pressure_delta', 'obs[9'),
        ('phase', 'step <'),
        ('probe', 'sin('),
        ('feedback', 'tanh('),
        ('deadband', 'abs('),
        ('loop', 'for '),
        ('previous_action', 'obs[18'),
    )
    labels = [name for name, marker in markers if marker in source]
    try:
        shape = sum(1 for node in ast.walk(ast.parse(source))
                    if isinstance(node, (ast.If, ast.For, ast.Assign)))
    except (SyntaxError, ValueError):
        shape = -1
    return '|'.join(labels) + f'|nodes={shape}'


# MAP-Elites behaviour axes measured from the CFD episode, not from source text.
BEHAVIOUR_AXES = {
    'actuation': [0.0005, 0.002, 0.006, 0.012],   # mean |u_i - 0.03| over the episode (m/s)
    'bias': ['left', 'centre', 'right', 'sides', 'flat'],   # inlet(s) receiving the most gas on average
    'phase': [0.6, 0.9, 1.2],                      # late/early imbalance ratio
}


def behaviour_descriptor(episode):
    """Map an evaluated episode to a coarse, physically meaningful cell."""
    trace = episode.get('trace') or []
    if not trace:
        return {'cell': 'unknown', 'actuation': None, 'bias': 'flat', 'phase': None}
    velocities = [row.get('velocities', [0.03, 0.03, 0.03]) for row in trace]
    deviation = sum(sum(abs(v - 0.03) for v in row) / 3.0 for row in velocities) / len(velocities)
    means = [sum(row[i] for row in velocities) / len(velocities) for i in range(3)]
    spread = max(means) - min(means)
    if spread < 0.0005:
        bias = 'flat'
    elif 'sides' in BEHAVIOUR_AXES['bias'] and abs(means[0] - means[2]) < 0.25 * spread and means[1] < min(means[0], means[2]):
        bias = 'sides'
    else:
        bias = ['left', 'centre', 'right'][max(range(3), key=lambda i: means[i])]
    half = max(1, len(trace) // 2)
    early = sum(row.get('gas_imbalance', 0.0) for row in trace[:half]) / half
    late = sum(row.get('gas_imbalance', 0.0) for row in trace[half:]) / max(1, len(trace) - half)
    phase = late / (early + 1e-6)
    act_bin = sum(1 for edge in BEHAVIOUR_AXES['actuation'] if deviation >= edge)
    phase_bin = sum(1 for edge in BEHAVIOUR_AXES['phase'] if phase >= edge)
    return {'cell': f'a{act_bin}_{bias}_p{phase_bin}', 'actuation': deviation, 'bias': bias,
            'phase': phase, 'mean_velocities': means}


# Prompt text derived from the first SAC policy; 'nohint' runs omit it so HL must find the strategy itself.
SAC_HINT = (
    'Abrupt '
    'open-loop redistribution (ramping one inlet to raw +0.5 within a few steps, or cycling bias every '
    'N steps) has failed the screen every time: the plume has not developed in the first 5 s and a '
    'sudden asymmetry creates the very imbalance the reward penalizes. What survives the screen is '
    '(a) staying near equal flow for the first 1-3 s while the plume forms, (b) then ramping over '
    '20-40 steps toward a moderate asymmetric set point (e.g. centre ~0.02-0.024 m/s, sides ~0.033-0.035, '
    'i.e. raw centre ~-0.4, sides ~+0.2), and (c) CLOSING THE LOOP: continuously nudging the set point '
    'using the lateral pressure contrast (left-minus-right and centre-minus-sides sums of obs[0..8]) and '
    'their filtered differences, with gain large enough to matter (raw action changes of 0.05-0.2 per '
    'step, not 0.005). A learned neural controller on this exact task reached gain +3.9 vs fixed flow '
    'with that shape; it is a hypothesis to test, not a guarantee. ')
SAC_HINT_CELLS = 'prefer cells with actuation a2-a3 and a feedback mechanism over a4 open-loop extremes. '
NEUTRAL_SCREEN = ('Screened-out programs are shown with their early imbalance and velocity traces; '
                  'use them to work out why they failed. ')

# Task definition only: plant, observation, actuator, reward, evaluation, grammar, context, output.
# No statement about which control works; the model keeps its own notebook of what it has learned.
NOHINT_SYSTEM = (
    'You design and maintain a control program for a simulated three-inlet bubble column. You learn only '
    'from the simulation results shown to you. '
    'PLANT: a box 0.15 m wide, 1.0 m tall and 0.15 m deep, filled with water to 0.70 m, simulated by an '
    'Euler-Euler two-phase CFD model without a turbulence model. Air enters through three equal bottom inlets '
    '(left, centre, right) that together cover the bottom. Control starts at t = 0.2 s from equal flow '
    '(0.03 m/s per inlet); a control step is 0.1 s and an episode has 200 steps. '
    'OBSERVATION obs (21 floats): obs[0..8] mid-plane pressures at heights 0.15, 0.35 and 0.55 m, index '
    '3*height + lateral with lateral 0 = left, 1 = centre, 2 = right, minus a hydrostatic reference and '
    'divided by 6867 Pa; obs[9..17] their change since the previous step; obs[18..20] the previous applied '
    'inlet velocities as (u - 0.03)/0.02. '
    'ACTION: assign action = [a_left, a_centre, a_right], finite values in [-1, 1]. The fixed actuator maps '
    'c = a - mean(a) to target velocities 0.03 + 0.02*c/max(1, max|c|), so the total 0.09 m/s is conserved '
    'and 0.01 <= u <= 0.05 m/s, and moves every inlet at most 0.005 m/s per step towards its target. '
    'REWARD per step: r = -I - 0.1*P - 0.01*S. I = std(g)/(mean(g) + 0.01), g = mean air fraction in the left, '
    'centre and right thirds of the window 0.05 <= height <= 0.6 m. P = mean over the three heights of the '
    'lateral standard deviation of the normalised pressures. S = mean over inlets of ((u_new - u_old)/0.02)^2. '
    'Return R = sum of r over the 200 steps; higher is better. '
    'EVALUATION: {evaluation} '
    'PROGRAM: source is a restricted Python statement block executed once per control step. Read-only inputs: '
    'obs, step (0-199), dt, pi. memory is a dictionary kept across steps and cleared at the start of every '
    'episode; initialise its keys when step == 0. Allowed: scalar arithmetic + - * / %, comparisons, if/else, '
    'conditional expressions, list/dict literals, indexing, single assignment, for loops over range up to 128; '
    'functions abs, min, max, sum, len, sin, cos, sqrt, tanh, exp. No imports, attributes, methods, function '
    'definitions, comprehensions, while, files, network, randomness or exec. Memory/list length <= 128, nesting '
    '<= 5, |values| <= 1e12, per-step node budget 5000. '
    'CONTEXT: your notebook from the previous round; the champion and the parent program with source, '
    'per-condition gains and traces; summaries of other evaluated and discarded programs with their '
    'rationale, per-condition gains, behaviour cell and traces of inlet velocities (mm/s), air fraction in the '
    'three thirds and I on the first condition, sampled every 0.8 s for 200-step runs and every 0.2 s for 50-step '
    'screens; a MAP-Elites archive keeping the best program per behaviour cell a<actuation>_<bias>_p<phase> '
    '(actuation bins mean |u - 0.03| in m/s by edges [0.0005, 0.002, 0.006, 0.012]; bias = inlet with most gas '
    'on average, sides when both outer inlets get more than the centre by similar amounts, or flat; phase bins '
    'the late/early mean-I ratio by edges [0.6, 0.9, 1.2]); unexplored cells; and recent decisions. The parent '
    'is the champion in some rounds and another archive elite in others; you may refine it or write something '
    'different. When requested_behaviour_cell is set, it is an unexplored cell drawn uniformly at random to '
    'widen coverage, not a suggestion that it works: write a program whose behaviour on condition 0 should fall '
    'in that cell, as an informative experiment. '
    'Nothing beyond this description and these results is known about which control works; draw your own '
    'conclusions from the data. '
    'RETURN JSON with exactly three string fields: source (the program); rationale (what this program tests and '
    'why, from the evidence); notes (your notebook, at most 6000 characters, replacing the previous one: what '
    'the experiments have shown, open hypotheses with evidence for and against, ideas already tried and their '
    'outcome, and what to test next).')


NOHINT_EVALUATION = (
    'every candidate runs on three development conditions that differ only by a 1e-4 m/s inlet '
    'perturbation during the 0.2 s start-up. The flow is chaotic: the return of one condition varies by about '
    '+-1.5 for reasons unrelated to control. Gain = R - R_fixed on the same condition, R_fixed being the return '
    'of equal flow (action = [0, 0, 0]). A candidate first runs 50 steps on each condition and is discarded if '
    'its mean 50-step gain is below -0.5 (equal flow scores about -1 over 50 steps); otherwise it runs 200 '
    'steps. It replaces the champion if its per-condition gains exceed the champion\'s by more than 0.5 on '
    'average and are not worse by more than 0.75 on any condition. Held-out test conditions are never shown.')


def generate_code(context, prompt_variant='sac_hint'):
    if prompt_variant not in ('sac_hint', 'nohint'):
        raise ValueError('Unknown prompt variant')
    hint = prompt_variant == 'sac_hint'
    url = os.environ.get('HL_API_URL', 'https://api.aicodewith.com/v1/chat/completions')
    model = os.environ.get('HL_MODEL', 'gpt-6-astra')
    key = os.environ.get('HL_API_KEY')
    if not key:
        raise RuntimeError('HL_API_KEY must be configured in the server shell')
    if not url.startswith('https://'):
        raise ValueError('HTTPS endpoint required')
    system = (
        'You improve a stateful control program for a three-inlet Euler-Euler bubble column. '
        'Return JSON with exactly source and rationale (strings). Source is a restricted Python '
        'statement block, not a function or class. Available read-only inputs: obs (21 floats), '
        'dt (seconds), step (zero-based), pi. memory is a dictionary retained across actions '
        'and cleared each episode; initialize its keys when step == 0. Assign action to a '
        'list of three finite values in [-1,1]. Observation order: 9 pressures, ordered '
        'by height then lateral position, minus a fixed hydrostatic reference and divided '
        'by 6867 Pa; 9 inter-step differences; 3 previous normalized applied velocities. '
        'Allowed: scalar arithmetic + - * / %, comparisons, if/else, conditional expressions, '
        'list/dict literals, indexing, single assignment, for loops over range up to 128. '
        'Functions: abs,min,max,sum,len,sin,cos,sqrt,tanh,exp. No imports, attributes, methods, '
        'functions, comprehensions, while, files, network, randomness or exec. Memory/list '
        'length <=128, nesting <=5, numeric magnitude <=1e12, per-step node budget 5000. '
        'You may invent filters, state machines, adaptive phase, delayed feedback and '
        'feature combinations rather than only tune parameters. Fixed actuator removes '
        'common-mode action, enforces gas velocity [0.01,0.05] m/s, sum 0.09 and per-step '
        'change <=0.005. Higher return is better. Reward penalizes regional gas fraction '
        'imbalance, lateral pressure spread and action increments. SCORING: every candidate is run on '
        'several development conditions that differ only by a 1e-4 m/s warmup inlet perturbation; the '
        'score is the mean over conditions of (return - fixed_flow_return). Single-condition returns '
        'are chaotic at the +-1.5 level, so micro-adjustments of order 1e-4 m/s cannot produce real, '
        'repeatable gains and will be rejected. CASCADE: a candidate first runs a 50-step screen; if its '
        'mean gain there is below -0.5 it is rejected without a full run. Fixed flow scores only about -1 '
        'over 50 steps, so a screen gain of -3 means the candidate tripled the early imbalance. '
        + (SAC_HINT if hint else NEUTRAL_SCREEN) +
        'The 0.01 slew penalty is small '
        'relative to imbalance gains. The context contains a protected champion, the parent_source branch '
        'you should improve, top_programs and diverse_programs from a MAP-Elites archive, screened_out '
        'programs with their early-imbalance traces so you can see exactly how they failed, and the '
        'archive_cells each occupies. Cells are named a<actuation>_<bias>_p<phase>: actuation bins mean '
        '|u-0.03| in m/s by edges [0.0005,0.002,0.006,0.012]; bias is the inlet with most gas on average or '
        'flat; phase bins late/early imbalance ratio by edges [0.6,0.9,1.2]. unexplored_behaviour_cells '
        'lists behaviours nobody has tried; '
        + (SAC_HINT_CELLS if hint else '') +
        'You may recombine mechanisms from top or diverse programs. Return a program '
        'that is behaviourally different from every listed program, not a parameter tweak. Do not infer a '
        'causal pressure-feedback sign without experiments; probing it with a short early test is allowed. '
        'No physics/score/test edits permitted. Only development results follow; do not request hidden '
        'fields or final-test data.'
    ) if hint else NOHINT_SYSTEM.replace('{evaluation}', context.get('evaluation_rule') or NOHINT_EVALUATION)
    payload = {'model': model, 'messages': [{'role':'system','content':system},
               {'role':'user','content':json.dumps(context)}], 'max_tokens':3500}
    request = urllib.request.Request(url, json.dumps(payload).encode(),
        headers={'Authorization':'Bearer '+key, 'Content-Type':'application/json'})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    started = time.perf_counter()
    # Model latency has been measured at ~1.5 s/token; a 3k-token program needs well over 300 s.
    with urllib.request.build_opener(NoRedirect).open(request, timeout=900) as response:
        body = response.read(262145)
    if len(body) > 262144:
        raise ValueError('Response too large')
    result = json.loads(body)
    message = result['choices'][0]
    if message.get('finish_reason') == 'length':
        raise ValueError('Model response truncated')
    text = message['message']['content'].strip()
    if text.startswith('```'):
        text = '\n'.join(text.splitlines()[1:-1])
    proposal = json.loads(text)
    fields = {'source', 'rationale'} if hint else {'source', 'rationale', 'notes'}
    if set(proposal) != fields or not all(isinstance(value,str) for value in proposal.values()):
        raise ValueError('Invalid proposal schema')
    if len(proposal['source'].encode()) > 16000 or len(proposal['rationale']) > 8000 or len(proposal.get('notes', '')) > 6000:
        raise ValueError('Proposal too large')
    return proposal, {'model':model, 'usage':result.get('usage'), 'seconds':time.perf_counter()-started}


class LearningRun:
    def __init__(self, directory, config, env_factory=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.config = config
        self.env_factory = env_factory
        path = self.directory/'protocol.json'
        if path.exists():
            if json.loads(path.read_text()) != config:
                raise ValueError('Protocol or evaluator changed; create a new run')
        else:
            atomic_json(path, config)
        state_path = self.directory/'state.json'
        self.state = json.loads(state_path.read_text()) if state_path.exists() else {
            'rounds':0, 'reserved_segments':0, 'api_calls':0, 'incumbent':None,
            'development':None, 'pending':None, 'sealed':False,
            'candidates':{}, 'population':[], 'parent_cursor':0}
        self.state.setdefault('candidates', {})
        self.state.setdefault('population', [])
        self.state.setdefault('parent_cursor', 0)

    def save(self):
        atomic_json(self.directory/'state.json', self.state)

    def event(self, kind, **fields):
        record = {'time':time.time(), 'kind':kind, **fields}
        with (self.directory/'events.jsonl').open('a') as handle:
            handle.write(json.dumps(record, allow_nan=False)+'\n')
            handle.flush()
            os.fsync(handle.fileno())

    def recover(self):
        if self.state['pending']:
            self.event('interrupted', pending=self.state['pending'], note='Reserved budget is not refunded')
            self.state['pending'] = None
            self.save()

    def archive(self, source):
        identifier = digest(source.encode())
        path = self.directory/'policies'/f'{identifier}.py'
        path.parent.mkdir(exist_ok=True)
        if path.exists() and path.read_text() != source:
            raise ValueError('Policy archive mismatch')
        path.write_text(source)
        return identifier

    def source(self, identifier):
        source = (self.directory/'policies'/f'{identifier}.py').read_text()
        if digest(source.encode()) != identifier:
            raise ValueError('Policy archive changed')
        return source

    def population_size(self):
        return int(self.config.get('population_size', 8))

    def register_candidate(self, identifier, result=None, parent=None, status='evaluated', error=None, rationale=None):
        behaviour = None
        imbalance_trace = velocity_trace = None
        if result is not None and result.get('episodes'):
            first = result['episodes'][0]
            behaviour = behaviour_descriptor(first)
            trace = first.get('trace') or []
            imbalance_trace = [round(row.get('gas_imbalance', 0.0), 4) for row in trace]
            velocity_trace = [[round(v, 4) for v in row.get('velocities', [])] for row in trace]
            thirds_trace = [[round(v, 4) for v in row.get('gas_means', [])] for row in trace]
        previous = self.state['candidates'].get(identifier, {})
        record = {
            'id': identifier,
            'parent': parent,
            'mean_return': None if result is None else result.get('mean_return'),
            'mean_gain': None if result is None else result.get('mean_gain'),
            'returns': None if result is None else result.get('returns'),
            'gains': None if result is None else result.get('gains'),
            'horizon': None if result is None else result.get('horizon'),
            'signature': structure_signature(self.source(identifier)),
            'behaviour': behaviour,
            'imbalance_trace': imbalance_trace,
            'velocity_trace': velocity_trace,
            'thirds_trace': thirds_trace if result is not None and result.get('episodes') else None,
            'rationale': rationale if rationale is not None else previous.get('rationale'),
            'status': status,
            'error': error,
            'round': self.state.get('rounds', 0),
        }
        self.state['candidates'][identifier] = record
        if result is not None:
            self.rebuild_population()

    def inherit_from(self, parent_directory, reevaluate=True):
        """Import sources and lineage from an earlier run. Old scores are not trusted under a new
        protocol: the parent's champion is re-evaluated on the current development conditions, and
        other inherited programs are kept unscored until the search re-tests them."""
        parent_directory = Path(parent_directory)
        parent_state = json.loads((parent_directory / 'state.json').read_text())
        if not parent_state.get('incumbent') or not parent_state.get('development'):
            raise RuntimeError('Parent has no development incumbent')
        parent_events = []
        events_path = parent_directory / 'events.jsonl'
        if events_path.exists():
            for line in events_path.read_text().splitlines():
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get('split') != 'test':
                    parent_events.append(event)
        parents = {}
        evaluated = []
        for event in parent_events:
            identifier = event.get('policy')
            if not identifier:
                continue
            if event.get('kind') == 'proposal':
                parents[identifier] = event.get('parent')
            if event.get('kind') == 'evaluation_finished' and event.get('split') == 'dev':
                evaluated.append(identifier)
        for source_path in (parent_directory / 'policies').glob('*.py'):
            self.archive(source_path.read_text())
        same_protocol = (parent_state.get('baselines') is not None
                         and json.loads((parent_directory / 'protocol.json').read_text()).get('dev_seeds') == self.config['dev_seeds'])
        if same_protocol or not reevaluate:
            for identifier in evaluated:
                if identifier in self.state['candidates']:
                    continue
                result = next((e['result'] for e in reversed(parent_events)
                               if e.get('kind') == 'evaluation_finished' and e.get('policy') == identifier), None)
                if result:
                    self.register_candidate(identifier, result, parent=parents.get(identifier), status='inherited')
        for identifier in evaluated:
            if identifier not in self.state['candidates']:
                self.register_candidate(identifier, None, parent=parents.get(identifier), status='inherited_unscored')
        self.event('inherited_search_population', source_run=str(parent_directory),
                   candidates=len(self.state['candidates']), parent_incumbent=parent_state['incumbent'],
                   reevaluated=not same_protocol)
        self.save()
        # Seed the champion race with the parent's champion under *this* protocol.
        self.initialize()
        if not same_protocol:
            legacy = parent_state['incumbent']
            if legacy != self.state['incumbent']:
                # Drop the unscored placeholder so candidate() does not treat it as a duplicate.
                self.state['candidates'].pop(legacy, None)
                self.candidate(self.source(legacy), 'Legacy champion re-evaluated under multi-condition protocol',
                               parent=None)
        self.rebuild_population()
        self.save()

    def score_of(self, record):
        """Ranking key: mean advantage over fixed flow when available, else raw mean return."""
        if record.get('mean_gain') is not None:
            return record['mean_gain']
        return record.get('mean_return')

    def rebuild_population(self):
        """MAP-Elites: one elite per behaviour cell, champion always retained."""
        full = self.config['horizon']
        candidates = [record for record in self.state['candidates'].values()
                      if self.score_of(record) is not None
                      and (record.get('horizon') in (None, full))]
        candidates.sort(key=self.score_of, reverse=True)
        cells = {}
        for record in candidates:
            cell = (record.get('behaviour') or {}).get('cell', 'unknown')
            if cell not in cells:
                cells[cell] = record['id']
        champion = self.state.get('incumbent')
        selected = []
        if champion and champion in self.state['candidates']:
            selected.append(champion)
        for identifier in cells.values():
            if identifier not in selected:
                selected.append(identifier)
        selected = selected[:self.population_size()]
        self.state['population'] = selected
        self.state['archive_cells'] = cells

    def select_parent(self):
        """Alternate between exploiting the champion and exploring other behaviour cells."""
        self.rebuild_population()
        population = self.state['population']
        if not population:
            return self.state['incumbent']
        champion = self.state['incumbent']
        alternatives = [identifier for identifier in population if identifier != champion]
        explore_every = int(self.config.get('explore_every', 2))
        if alternatives and self.state['rounds'] % explore_every == 1:
            index = self.state['parent_cursor'] % len(alternatives)
            parent = alternatives[index]
            self.state['parent_cursor'] += 1
            return parent
        return champion

    def empty_cells(self):
        occupied = set(self.state.get('archive_cells', {}))
        hints = []
        for act_bin in range(len(BEHAVIOUR_AXES['actuation']) + 1):
            for bias in BEHAVIOUR_AXES['bias']:
                for phase_bin in range(len(BEHAVIOUR_AXES['phase']) + 1):
                    cell = f'a{act_bin}_{bias}_p{phase_bin}'
                    if cell not in occupied:
                        hints.append(cell)
        return hints

    def evaluate(self, identifier, seeds, split, horizon=None):
        horizon = int(horizon or self.config['horizon'])
        required = len(seeds)*(horizon+1)
        if self.state['reserved_segments']+required > self.config['max_segments']:
            raise RuntimeError('CFD segment budget exhausted (includes startup and failed attempts)')
        self.state['reserved_segments'] += required
        self.state['pending'] = {'policy':identifier, 'split':split, 'seeds':seeds, 'horizon':horizon}
        self.save()
        source = self.source(identifier)
        episodes = []
        started = time.perf_counter()
        if self.env_factory is None:
            from bubble_env import BubbleEnv
            factory = BubbleEnv
        else:
            factory = self.env_factory
        lock = threading.Lock()

        def episode_for(seed):
            environment = factory(label='hl_code_'+split, horizon=horizon,
                                  interval=self.config['interval'], warmup=self.config['warmup'])
            try:
                policy = CodePolicy(source, self.config['interval'])
                observation, reset_info = environment.reset(seed=seed)
                with lock:
                    self.event('episode_started', policy=identifier, split=split, seed=seed, horizon=horizon, case=reset_info.get('case'))
                rows = []
                truncated = False
                for index in range(horizon):
                    action = policy(observation)
                    observation, reward, terminated, truncated, info = environment.step(action)
                    if not math_finite(reward):
                        raise ValueError('Nonfinite reward')
                    rows.append({'reward':float(reward), **info})
                    if terminated or truncated:
                        if index+1 != horizon:
                            raise RuntimeError('Unexpected early episode end')
                        break
                if not truncated:
                    raise RuntimeError('Missing episode horizon signal')
                episode = {'seed':seed, 'return':sum(row['reward'] for row in rows),
                           'case':reset_info.get('case'), 'final':info,
                           'mean_imbalance':sum(row['gas_imbalance'] for row in rows)/len(rows),
                           'mean_holdup':sum(row['gas_hold_up'] for row in rows)/len(rows),
                           'max_pressure_reference_deviation_pa':max(row['pressure_reference_deviation_max_pa'] for row in rows),
                           'saturated_steps':sum(bool(row['action_saturated']) for row in rows),
                           'mean_action_slew':sum(row['action_slew'] for row in rows)/len(rows),
                           'trace':rows[::max(1,len(rows)//(25 if self.config.get('prompt_variant') == 'nohint' else 10))]}
                with lock:
                    self.event('episode_finished', policy=identifier, split=split, **episode)
                return episode
            finally:
                environment.close()
                case = getattr(environment, 'case', None)
                # CFD case folders are ~220 MB each; returns and traces are already in events.jsonl.
                if self.config.get('cleanup_cases') and case is not None and split in ('screen', 'dev', 'confirm'):
                    shutil.rmtree(case, ignore_errors=True)

        try:
            workers = max(1, min(len(seeds), int(self.config.get('parallel_episodes', 1))))
            if workers == 1:
                episodes = [episode_for(seed) for seed in seeds]
            else:
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    episodes = list(pool.map(episode_for, seeds))
            result = {'seeds':seeds, 'horizon':horizon, 'returns':[row['return'] for row in episodes],
                      'episodes':episodes, 'seconds':time.perf_counter()-started}
            result['mean_return'] = sum(result['returns'])/len(seeds)
            baselines = self.state.get('baselines', {}).get(str(horizon), {})
            if all(str(seed) in baselines for seed in seeds):
                result['gains'] = [ret - baselines[str(seed)] for ret, seed in zip(result['returns'], seeds)]
                result['mean_gain'] = sum(result['gains'])/len(seeds)
            self.event('evaluation_finished', policy=identifier, split=split, result=result)
            return result
        except Exception as error:
            self.event('evaluation_failed', policy=identifier, split=split, error_type=type(error).__name__)
            raise
        finally:
            self.state['pending'] = None
            self.save()

    def ensure_baselines(self, seeds, horizon):
        """Fixed-flow return per seed is deterministic; compute once and reuse as the control."""
        store = self.state.setdefault('baselines', {}).setdefault(str(int(horizon)), {})
        missing = [seed for seed in seeds if str(seed) not in store]
        if not missing:
            return
        baseline = self.archive(BASELINE)
        result = self.evaluate(baseline, missing, 'baseline', horizon=horizon)
        for seed, ret in zip(missing, result['returns']):
            store[str(seed)] = ret
        self.event('baselines_recorded', horizon=int(horizon), seeds=missing, returns=result['returns'])
        self.save()

    def screening_horizon(self):
        value = self.config.get('screen_horizon')
        return int(value) if value else None

    def initialize(self):
        seeds = self.config['dev_seeds']
        self.ensure_baselines(seeds, self.config['horizon'])
        if self.screening_horizon():
            self.ensure_baselines(seeds, self.screening_horizon())
        confirm = self.config.get('confirm_seeds') or []
        if confirm:
            self.ensure_baselines(confirm, self.config['horizon'])
        if self.state['incumbent'] is None:
            identifier = self.archive(BASELINE)
            result = self.evaluate(identifier, seeds, 'dev')
            self.state['incumbent'], self.state['development'] = identifier, result
            self.register_candidate(identifier, result, status='champion')
            if confirm:
                # Equal flow against itself: the solver is deterministic, so its confirmation gains are zero.
                self.state['champion_confirm'] = {'seeds': confirm, 'gains': [0.0] * len(confirm)}
        elif self.state['incumbent'] not in self.state['candidates']:
            self.register_candidate(self.state['incumbent'], self.state['development'], status='champion')
        self.rebuild_population()
        self.save()

    def candidate(self, source, rationale='', metadata=None, parent=None):
        if self.state['sealed']:
            raise RuntimeError('Run sealed after final-test request; no further learning allowed')
        self.state['rounds'] += 1
        self.save()
        identifier = self.archive(source)
        self.event('proposal', policy=identifier, rationale=rationale, metadata=metadata or {}, parent=parent)
        try:
            check_source(source, self.config['interval'])
        except Exception as error:
            self.register_candidate(identifier, parent=parent, status='preflight_failed', error=type(error).__name__)
            self.save()
            self.event('rejected_preflight', policy=identifier, error_type=type(error).__name__)
            return False
        if identifier in self.state['candidates']:
            self.event('duplicate_skipped', policy=identifier)
            return False
        seeds = self.config['dev_seeds']
        screen = self.screening_horizon()
        try:
            if screen and screen < self.config['horizon']:
                probe = self.evaluate(identifier, seeds, 'screen', horizon=screen)
                if probe.get('mean_gain', 0.0) < -self.config.get('screen_tolerance', 0.0):
                    self.register_candidate(identifier, probe, parent=parent, status='screened_out', rationale=rationale)
                    self.event('rejected_screen', policy=identifier, mean_gain=probe.get('mean_gain'))
                    self.save()
                    return False
            result = self.evaluate(identifier, seeds, 'dev')
        except Exception as error:
            self.register_candidate(identifier, parent=parent, status='evaluation_failed', error=type(error).__name__, rationale=rationale)
            self.save()
            return False
        self.register_candidate(identifier, result, parent=parent, status='evaluated', rationale=rationale)
        confirmation = None
        if self.config.get('acceptance') == 'paired_t':
            accepted, confirmation = self.paired_decision(identifier, result)
        else:
            accepted = promote(result, self.state['development'], self.config['minimum_gain'], self.config['max_regression'])
        self.event('accepted' if accepted else 'rejected_regression', policy=identifier,
                   mean_return=result['mean_return'], mean_gain=result.get('mean_gain'))
        if accepted:
            self.state['incumbent'], self.state['development'] = identifier, result
            if confirmation is not None:
                self.state['champion_confirm'] = confirmation
            self.state['candidates'][identifier]['status'] = 'champion'
        self.rebuild_population()
        self.save()
        return accepted

    def paired_decision(self, identifier, result):
        """Paired t-type test against the champion on dev conditions, then on fresh confirmation conditions."""
        kappa, floor, worst = self.config['kappa'], self.config['minimum_gain'], self.config['max_regression']
        deltas = [g - c for g, c in zip(result['gains'], self.state['development']['gains'])]
        passed, dev_stats = paired_test(deltas, floor, kappa, worst)
        record = self.state['candidates'][identifier]
        record['test'] = {'dev': dev_stats, 'dev_passed': passed}
        confirm_seeds = self.config.get('confirm_seeds') or []
        if not passed or not confirm_seeds:
            self.save()
            return passed, None
        confirmation = self.evaluate(identifier, confirm_seeds, 'confirm')
        champion_confirm = self.state['champion_confirm']['gains']
        confirm_deltas = [g - c for g, c in zip(confirmation['gains'], champion_confirm)]
        combined, all_stats = paired_test(deltas + confirm_deltas, floor, kappa, worst)
        accepted = combined and sum(confirm_deltas) / len(confirm_deltas) > 0
        record.update(confirm_gains=confirmation['gains'],
                      test={'dev': dev_stats, 'dev_passed': True, 'confirm_deltas': confirm_deltas,
                            'all': all_stats, 'accepted': accepted})
        self.save()
        return accepted, {'seeds': confirm_seeds, 'gains': confirmation['gains']}

    def evaluation_rule(self):
        n, screen = len(self.config['dev_seeds']), self.screening_horizon()
        text = (f'Every candidate runs on {n} development conditions that differ only by a 1e-4 m/s inlet '
                'perturbation during the 0.2 s start-up. The flow is chaotic: the return of one condition varies '
                'by about +-1.5 for reasons unrelated to control. Gain = R - R_fixed on the same condition, R_fixed '
                'being the return of equal flow (action = [0, 0, 0]). ')
        if screen:
            text += (f'A candidate first runs {screen} steps on each condition and is discarded if its mean '
                     f'{screen}-step gain is below -{self.config.get("screen_tolerance", 0.0)} (equal flow scores '
                     'about -1 over 50 steps); otherwise it runs 200 steps. ')
        if self.config.get('acceptance') == 'paired_t':
            c = len(self.config.get('confirm_seeds') or [])
            text += (f'Let d = candidate gain - champion gain on each condition. If mean(d) > '
                     f'{self.config["minimum_gain"]}, mean(d) > {self.config["kappa"]} standard errors of d and no '
                     f'd < -{self.config["max_regression"]}, the candidate also runs on {c} further confirmation '
                     f'conditions; it replaces the champion if the same test passes over all {n + c} conditions '
                     'and the mean d on the confirmation conditions is positive. ')
        else:
            text += (f'It replaces the champion if its per-condition gains exceed the champion\'s by more than '
                     f'{self.config["minimum_gain"]} on average and are not worse by more than '
                     f'{self.config["max_regression"]} on any condition. ')
        return text + 'Held-out test conditions are never shown.'

    def target_cell(self):
        """Exploration rounds request a behaviour cell drawn uniformly from the unexplored ones."""
        explore_every = int(self.config.get('explore_every', 2))
        empty = self.empty_cells()
        if not self.config.get('target_cells') or not empty or self.state['rounds'] % explore_every != 1:
            return None
        import random
        return random.Random(f"{self.directory.name}:{self.state['rounds']}").choice(empty)

    def feedback(self):
        recent = []
        path = self.directory/'events.jsonl'
        if path.exists():
            for line in path.read_text().splitlines():
                row = json.loads(line)
                if row.get('split') != 'test' and row['kind'] in ('proposal','evaluation_finished','evaluation_failed','rejected_preflight','rejected_regression','rejected_screen','accepted'):
                    recent.append(row)
        parent = self.select_parent()
        champion = self.state['incumbent']
        candidates = self.state['candidates']
        ranked = sorted((c for c in candidates.values() if self.score_of(c) is not None
                         and c.get('horizon') in (None, self.config['horizon'])),
                        key=self.score_of, reverse=True)
        top_ids = [c['id'] for c in ranked[:3] if c['id'] not in (parent, champion)]
        diverse_ids = [i for i in self.state['population'] if i not in (parent, champion) and i not in top_ids][:3]
        screened = [c for c in candidates.values() if c.get('status') == 'screened_out']
        screened.sort(key=lambda c: c.get('round', 0), reverse=True)

        def summary(identifier, with_source):
            record = candidates[identifier]
            item = {'id': identifier[:12], 'mean_gain_vs_fixed': record.get('mean_gain'),
                    'per_condition_gains': record.get('gains'),
                    'behaviour': record.get('behaviour'), 'status': record.get('status'),
                    'parent': (record.get('parent') or '')[:12]}
            if with_source:
                item['source'] = self.source(identifier)
            return item

        def screen_summary(record):
            item = summary(record['id'], False)
            item['screen_horizon'] = record.get('horizon')
            item['early_imbalance_trace'] = record.get('imbalance_trace')
            item['early_velocity_trace'] = record.get('velocity_trace')
            item['rationale_excerpt'] = (record.get('rationale') or '')[:200]
            return item

        parent_record = candidates.get(parent, {})
        development = dict(self.state['development'])
        development.pop('episodes', None)
        baselines = self.state.get('baselines', {}).get(str(self.config['horizon']), {})
        if self.config.get('prompt_variant') == 'nohint':
            return self.system_feedback(champion, parent, baselines, recent)
        return {'protocol':{key:self.config[key] for key in ('horizon','interval','warmup','dev_seeds')},
                'evaluation_rule':('Each candidate runs on every development condition (seed = distinct '
                                   'warmup inlet perturbation of 1e-4 m/s). Score = mean over conditions of '
                                   '(return - fixed_flow_return). A single-condition return is chaotic at the '
                                   '+-1.5 level; only gains consistent across conditions are real.'),
                'fixed_flow_returns_per_condition':baselines,
                'champion_source':self.source(champion),
                'champion_behaviour':candidates.get(champion, {}).get('behaviour'),
                'champion_gains':candidates.get(champion, {}).get('gains'),
                'parent_source':self.source(parent),
                'parent_id':parent,
                'parent_behaviour':parent_record.get('behaviour'),
                'parent_gains':parent_record.get('gains'),
                'development':development,
                'top_programs':[summary(i, False) for i in top_ids],
                'diverse_programs':[summary(i, False) for i in diverse_ids],
                'screened_out_programs':[screen_summary(c) for c in screened[:4]],
                'archive_cells':{cell: round(self.score_of(candidates[i]), 4)
                                 for cell, i in self.state.get('archive_cells', {}).items()},
                'unexplored_behaviour_cells':self.empty_cells()[:12],
                'behaviour_axes':BEHAVIOUR_AXES,
                'recent_development':[{k: r.get(k) for k in ('kind','policy','mean_gain','error_type')
                                       if k in r} for r in recent[-8:]]}
    def system_feedback(self, champion, parent, baselines, recent):
        """Learning state shown to the model in nohint runs: data and the model's own notebook, no advice."""
        candidates = self.state['candidates']

        def traces(record):
            vel = [[round(v * 1000, 2) for v in row] for row in (record.get('velocity_trace') or [])]
            return {'inlet_mm_s': vel, 'air_fraction_thirds': record.get('thirds_trace'),
                    'imbalance_I': record.get('imbalance_trace')}

        def full(identifier):
            record = candidates.get(identifier, {})
            return {'id': identifier[:12], 'source': self.source(identifier), 'rationale': record.get('rationale'),
                    'per_condition_gains': record.get('gains'), 'mean_gain': record.get('mean_gain'),
                    'behaviour_cell': (record.get('behaviour') or {}).get('cell'), **traces(record)}

        tried = [c for c in candidates.values() if c['id'] not in (champion, parent)
                 and c.get('status') not in ('inherited_unscored',)]
        tried.sort(key=lambda c: c.get('round', 0), reverse=True)
        table = [{'id': c['id'][:12], 'round': c.get('round'), 'status': c.get('status'), 'horizon': c.get('horizon'),
                  'per_condition_gains': c.get('gains'), 'behaviour_cell': (c.get('behaviour') or {}).get('cell'),
                  'rationale': (c.get('rationale') or '')[:300], 'error': c.get('error')} for c in tried[:40]]
        latest = [{**{'id': c['id'][:12], 'status': c.get('status')}, **traces(c)} for c in tried[:6]
                  if c.get('velocity_trace')]
        target = self.target_cell()
        if target:
            self.event('target_cell', round=self.state['rounds'] + 1, cell=target)
        for item in table:
            record = candidates.get(next((i for i in candidates if i.startswith(item['id'])), ''), {})
            if record.get('test'):
                item['acceptance_test'] = record['test']
                item['confirmation_gains'] = record.get('confirm_gains')
        return {'notebook': self.state.get('notes', ''),
                'evaluation_rule': self.evaluation_rule(),
                'requested_behaviour_cell': target,
                'champion_confirmation_gains': (self.state.get('champion_confirm') or {}).get('gains'),
                'fixed_flow_returns_per_condition': baselines,
                'champion': full(champion), 'parent': full(parent),
                'experiments_newest_first': table, 'latest_traces': latest,
                'archive_cells': {cell: round(self.score_of(candidates[i]), 4)
                                  for cell, i in self.state.get('archive_cells', {}).items()},
                'unexplored_behaviour_cells': self.empty_cells(),
                'recent_decisions': [{k: r.get(k) for k in ('kind', 'policy', 'mean_gain', 'error_type') if k in r}
                                     for r in recent[-8:]]}

    def learn(self, rounds):
        if self.state['sealed']:
            raise RuntimeError('Run is sealed')
        if not os.environ.get('HL_API_KEY'):
            raise RuntimeError('Configure HL_API_KEY before starting live learning')
        self.initialize()
        stagnation = self.state.get('stagnation', {}).get('count', 0)
        previous_best = self.state.get('stagnation', {}).get(
            'best_score', self.score_of(self.state['candidates'][self.state['incumbent']]))
        for _ in range(rounds):
            per_candidate = len(self.config['dev_seeds'])*(self.config['horizon']+1)
            if self.screening_horizon():
                per_candidate += len(self.config['dev_seeds'])*(self.screening_horizon()+1)
            if self.state['reserved_segments']+per_candidate > self.config['max_segments']:
                self.event('budget_stop', resource='cfd')
                break
            if self.state['api_calls'] >= self.config['max_api_calls']:
                self.event('budget_stop', resource='api')
                break
            self.state['api_calls'] += 1
            parent = self.select_parent()
            self.state['pending'] = {'api_call':self.state['api_calls']}
            self.save()
            self.event('api_started', call=self.state['api_calls'], parent=parent)
            proposal = metadata = None
            for attempt in range(1, self.config.get('api_retries', 5) + 1):
                try:
                    proposal, metadata = generate_code(self.feedback(), self.config.get('prompt_variant', 'sac_hint'))
                    break
                except Exception as error:
                    self.event('api_failed', error_type=type(error).__name__,
                               attempt=attempt, max_attempts=self.config.get('api_retries', 5))
                    if attempt < self.config.get('api_retries', 5):
                        delay = min(300, 2 ** (attempt - 1) * 10)
                        self.event('api_retry_wait', seconds=delay)
                        time.sleep(delay)
            if proposal is None:
                self.event('api_paused', reason='retry budget exhausted')
                self.state['pending'] = None
                self.save()
                break
            self.state['pending'] = None
            if 'notes' in proposal:
                self.state['notes'] = proposal['notes']
                self.event('notes_updated', round=self.state['rounds'] + 1, notes=proposal['notes'])
            self.save()
            accepted = self.candidate(proposal['source'], proposal['rationale'], metadata, parent=parent)
            current_best = self.score_of(self.state['candidates'][self.state['incumbent']])
            if accepted and current_best > previous_best + self.config.get('stagnation_gain', 0.001):
                stagnation = 0
                previous_best = current_best
            else:
                stagnation += 1
            self.state['stagnation'] = {'count':stagnation,
                                        'limit':self.config.get('stagnation_limit', 20),
                                        'best_score':previous_best}
            self.save()
            self.event('stagnation_check', count=stagnation,
                       limit=self.config.get('stagnation_limit', 20),
                       best_score=previous_best)
            if stagnation >= self.config.get('stagnation_limit', 20):
                self.event('stagnation_stop', count=stagnation,
                           best_score=previous_best)
                break

    def finalize(self):
        if self.state['sealed']:
            raise RuntimeError('Final test already requested; inspect existing events')
        self.initialize()
        required = len(self.config['test_seeds'])*(self.config['horizon']+1)*2
        if self.state['reserved_segments']+required > self.config['max_segments']:
            raise RuntimeError('Insufficient budget for paired final test')
        self.state['sealed'] = True
        self.save()
        baseline = self.archive(BASELINE)
        fixed = self.evaluate(baseline, self.config['test_seeds'], 'test')
        learned = self.evaluate(self.state['incumbent'], self.config['test_seeds'], 'test')
        gains = [l - f for l, f in zip(learned['returns'], fixed['returns'])]
        atomic_json(self.directory/'final_test.json', {'fixed':fixed, 'learned':learned,
                    'gains_vs_fixed':gains, 'mean_gain_vs_fixed':sum(gains)/len(gains),
                    'policy':self.state['incumbent'],
                    'note':'Held-out perturbation conditions; same geometry and mesh. Not cross-operating-point validation.'})


def math_finite(value):
    import math
    return math.isfinite(float(value))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--mode', choices=('probe','learn','offline','finalize'), default='learn')
    parser.add_argument('--rounds', type=int, default=1)
    parser.add_argument('--candidate', type=Path)
    args = parser.parse_args()
    args.run.mkdir(parents=True, exist_ok=True)
    with lock_run(args.run):
        protocol = args.run/'protocol.json'
        config = json.loads(protocol.read_text()) if protocol.exists() else {
            'horizon':50, 'interval':0.1, 'warmup':0.2,
            'dev_seeds':[0,1], 'test_seeds':[3100,3101],
            'minimum_gain':0.001, 'max_regression':0.0,
            'max_segments':816, 'max_api_calls':3,
            'fingerprint':fingerprint(ROOT/'template')}
        if config['fingerprint'] != fingerprint(ROOT/'template'):
            raise RuntimeError('Evaluator/template changed; create a new run')
        run = LearningRun(args.run, config)
        run.recover()
        if args.mode == 'probe':
            if run.state['sealed']:
                raise RuntimeError('Run is sealed')
            if not os.environ.get('HL_API_KEY'):
                raise RuntimeError('Configure HL_API_KEY before probing')
            if run.state['api_calls'] >= config['max_api_calls']:
                raise RuntimeError('API budget exhausted')
            run.state['api_calls'] += 1
            run.state['pending'] = {'probe_call':run.state['api_calls']}
            run.save()
            run.event('probe_started', call=run.state['api_calls'])
            try:
                proposal, metadata = generate_code({'purpose':'Connection and syntax probe only; no CFD evidence. Return a simple valid neutral controller.', 'incumbent_source':BASELINE})
                identifier = run.archive(proposal['source'])
                run.event('probe_response', policy=identifier, metadata=metadata)
                check_source(proposal['source'], config['interval'])
                run.event('probe_passed', policy=identifier)
            except Exception as error:
                run.event('probe_failed', error_type=type(error).__name__)
                raise RuntimeError('Probe failed; see events.jsonl for sanitized error type') from None
            finally:
                run.state['pending'] = None
                run.save()
        elif args.mode == 'learn':
            run.learn(args.rounds)
        elif args.mode == 'offline':
            if not args.candidate:
                parser.error('--candidate required for offline; this is NOT LLM learning')
            if run.state['sealed']:
                raise RuntimeError('Run is sealed')
            run.initialize()
            run.candidate(args.candidate.read_text(), 'User supplied candidate; no model generation')
        else:
            run.finalize()
        print(json.dumps(run.state, indent=2))


if __name__ == '__main__':
    main()