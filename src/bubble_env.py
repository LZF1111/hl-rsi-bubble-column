from pathlib import Path
import json
import shutil
import subprocess
import time
import uuid
import hashlib
import re
import gymnasium as gym
import numpy as np
from build_case import ROOT, PATCHES, set_entry, command


def velocities(action, previous):
    action = np.asarray(action, dtype=float)
    if action.shape != (3,) or not np.isfinite(action).all():
        raise ValueError('Action must contain three finite numbers')
    centered = np.clip(action, -1, 1)
    centered -= centered.mean()
    centered /= max(1.0, np.max(np.abs(centered)))
    target = 0.03 + 0.02 * centered
    difference = target - previous
    fraction = min(1.0, 0.005 / max(np.max(np.abs(difference)), 1e-12))
    return previous + fraction * difference


# Return is chaotic at the 1e-4 m/s level; a candidate must beat fixed flow across several of these.
PERTURBATION_M_S = 1e-4


def warmup_velocities(seed):
    """Deterministic zero-sum inlet perturbation applied only during warmup; seed 0 is unperturbed."""
    base = np.full(3, 0.03)
    if not seed:
        return base
    patterns = [(1, 0, -1), (-1, 0, 1), (1, -2, 1), (-1, 2, -1), (0, 1, -1), (0, -1, 1)]
    pattern = np.array(patterns[(int(seed) - 1) % len(patterns)], dtype=float)
    scale = 1 + (int(seed) - 1) // len(patterns)
    return base + PERTURBATION_M_S * scale * pattern


def scalar_field(path, count):
    text = path.read_text()
    match = re.search(r'internalField\s+uniform\s+([^;]+);', text)
    if match:
        return np.full(count, float(match.group(1)))
    match = re.search(r'internalField\s+nonuniform\s+List<scalar>\s+(\d+)\s*\((.*?)\)\s*;', text, re.S)
    if not match:
        raise ValueError(f'Unsupported ASCII scalar field: {path}')
    values = np.fromstring(match.group(2), sep=' ')
    if len(values) != count or len(values) != int(match.group(1)):
        raise ValueError('Unexpected scalar field length')
    return values


class BubbleEnv(gym.Env):
    metadata = {'render_modes': []}

    def __init__(self, label='demo', horizon=50, interval=0.1, warmup=0.2, template=None):
        if horizon <= 0 or interval <= 0 or warmup <= 0 or not np.isfinite([horizon, interval, warmup]).all():
            raise ValueError('Timing parameters must be positive and finite')
        if horizon * interval < 5.0 - 1e-9:
            raise ValueError('Control duration must be at least 5 seconds')
        self.template = Path(template or ROOT / 'template')
        self.meta = json.loads((self.template / 'mesh_meta.json').read_text())
        self.label, self.horizon, self.interval, self.warmup = label, horizon, interval, warmup
        self.action_space = gym.spaces.Box(-1.0, 1.0, (3,), np.float32)
        self.observation_space = gym.spaces.Box(-np.inf, np.inf, (21,), np.float32)
        self.case = None
        self.total_segments = 0

    def _advance(self, end):
        control = self.case / 'system/controlDict'
        set_entry(control, 'endTime', f'{end:.8f}')
        set_entry(control, 'writeInterval', f'{end - self.current_time:.8f}')
        log = self.case / f'log.segment_{end:.8f}'
        started = time.perf_counter()
        status = 'failed'
        try:
            with log.open('w') as handle:
                subprocess.run(['twoPhaseEulerFoam', '-case', str(self.case)], stdout=handle,
                               stderr=subprocess.STDOUT, check=True, timeout=300)
            folder = max((item for item in self.case.iterdir() if item.is_dir() and re.fullmatch(r'[0-9.eE+-]+', item.name)), key=lambda item: float(item.name))
            if abs(float(folder.name) - end) > 1e-6:
                raise RuntimeError(f'Solver did not reach {end}; inspect {log}')
            self.current_time = end
            self.latest = folder
            status = 'ok'
        finally:
            self.total_segments += 1
            with (ROOT / 'results/cfd_ledger.jsonl').open('a') as handle:
                handle.write(json.dumps({'label': self.label, 'case': str(self.case), 'end': end,
                                         'seconds': time.perf_counter()-started, 'status': status})+'\n')

    def _pressure(self):
        rows = []
        for path in (self.case / 'postProcessing/pressureProbes').glob('*/p'):
            for line in path.read_text().splitlines():
                if line.strip() and not line.lstrip().startswith('#'):
                    row = np.fromstring(line, sep=' ')
                    if len(row) == 10:
                        rows.append(row)
        row = max(rows, key=lambda item: item[0])
        if abs(row[0]-self.current_time) > 1e-6 or not np.isfinite(row).all():
            raise RuntimeError('Stale or invalid pressure probes')
        hydrostatic = 100000 + 1000*9.81*(0.7-np.repeat([0.15,0.35,0.55],3))
        return (row[1:]-hydrostatic)/6867.0

    def _metrics(self):
        width, height, depth = self.meta['nx_per_block'], self.meta['ny'], self.meta['nz']
        field = scalar_field(self.latest / 'alpha.air', 3*width*height*depth)
        if not np.isfinite(field).all() or field.min() < -1e-5 or field.max() > 1.00001:
            raise RuntimeError('Invalid gas fraction')
        data = field.reshape(3, depth, height, width)
        vertical = (np.arange(height)+0.5)/height
        region = data[:,:, (vertical>=0.05)&(vertical<=0.6),:]
        means = region.mean(axis=(1,2,3))
        gas_hold_up = float(means.mean())
        if not np.isfinite(gas_hold_up) or gas_hold_up < 0 or gas_hold_up > 1:
            raise RuntimeError('Invalid gas holdup metric')
        return {'gas_means': means.tolist(), 'gas_imbalance': float(means.std()/(gas_hold_up+0.01)),
            'gas_hold_up': gas_hold_up,
            'domain_gas_volume_m3':float(field.mean()*np.prod(self.meta['dimensions_m'])),
            'domain_liquid_volume_m3':float((1-field.mean())*np.prod(self.meta['dimensions_m']))}

    def _obs(self, pressure, difference):
        return np.concatenate([pressure, difference, (self.previous-0.03)/0.02]).astype(np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.case = ROOT / 'runs' / f'{self.label}_{uuid.uuid4().hex[:10]}'
        self.case.mkdir(parents=True)
        for name in ('constant','system','0'):
            shutil.copytree(self.template/name, self.case/name)
        hashes = {}
        for source in (self.template/'0').iterdir():
            if source.is_file():
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                if hashlib.sha256((self.case/'0'/source.name).read_bytes()).hexdigest() != digest:
                    raise RuntimeError('Initial field copy mismatch')
                hashes[source.name] = digest
        if (self.case/'postProcessing').exists():
            raise RuntimeError('Reset contains old probe outputs')
        count = 3*self.meta['nx_per_block']*self.meta['ny']*self.meta['nz']
        initial_alpha = scalar_field(self.case/'0/alpha.air', count)
        liquid_volume = float(np.mean(1-initial_alpha)*np.prod(self.meta['dimensions_m']))
        expected_volume = self.meta['dimensions_m'][0]*self.meta['dimensions_m'][2]*self.meta['liquid_height_m']
        if not np.isfinite(initial_alpha).all() or initial_alpha.min() < 0 or initial_alpha.max() > 1 or abs(liquid_volume-expected_volume)>1e-8:
            raise RuntimeError('Invalid initial liquid inventory')
        set_entry(self.case/'system/controlDict','deltaT',0.001)
        (self.case/'bubble.foam').touch()
        self.current_time, self.steps = 0.0, 0
        warm = warmup_velocities(seed)
        for patch, speed in zip(PATCHES, warm):
            set_entry(self.case/'0/U.air',f'boundaryField.{patch}.value',f'uniform (0 {speed:.12g} 0)')
        self._advance(self.warmup)
        # Control always starts from equal flow; the perturbation lives only in the flow field.
        self.previous = np.full(3,0.03)
        for patch, speed in zip(PATCHES, self.previous):
            set_entry(self.latest/'U.air',f'boundaryField.{patch}.value',f'uniform (0 {speed:.12g} 0)')
        self.pressure = self._pressure()
        audit = {'seed':seed,'initial_field_sha256':hashes,'initial_liquid_volume_m3':liquid_volume,
             'warmup_velocities':warm.tolist(),
             'initial_velocities':self.previous.tolist(),'control_start':self.current_time,
             'control_duration':self.horizon*self.interval,'initial_observation':self._obs(self.pressure,np.zeros(9)).tolist()}
        (self.case/'reset_audit.json').write_text(json.dumps(audit,indent=2))
        return self._obs(self.pressure,np.zeros(9)), {'case':str(self.case)}

    def step(self, action):
        if self.steps >= self.horizon:
            raise RuntimeError('Episode finished; reset before stepping again')
        applied = velocities(action,self.previous)
        for patch,speed in zip(PATCHES,applied):
            set_entry(self.latest/'U.air',f'boundaryField.{patch}.value',f'uniform (0 {speed:.12g} 0)')
        self._advance(self.current_time+self.interval)
        pressure = self._pressure()
        metrics = self._metrics()
        lateral = pressure.reshape(3,3)
        pressure_cost = float(np.std(lateral,axis=1).mean())
        slew = float(np.square((applied-self.previous)/0.02).mean())
        reward = -metrics['gas_imbalance']-0.1*pressure_cost-0.01*slew
        observation_difference = pressure-self.pressure
        self.previous,self.pressure = applied,pressure
        self.steps += 1
        action_saturated = bool(np.any((applied <= 0.0100001) | (applied >= 0.0499999)))
        info = dict(metrics, pressure_lateral=pressure_cost,
                    pressure_reference_deviation_max_pa=float(np.max(np.abs(pressure))*6867.0),
                velocities=applied.tolist(), action_saturated=action_saturated,
                action_slew=slew, time=self.current_time)
        with (self.case/'trajectory.jsonl').open('a') as handle:
            handle.write(json.dumps(dict(info,reward=reward,observation=self._obs(pressure,observation_difference).tolist()))+'\n')
        return self._obs(pressure,observation_difference),reward,False,self.steps>=self.horizon,info