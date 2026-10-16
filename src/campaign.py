import argparse
import json
import time
from pathlib import Path

from hl_learning import ROOT, LearningRun, atomic_json, fingerprint, lock_run


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('method', choices=('hl', 'sac'))
    parser.add_argument('--run', required=True)
    parser.add_argument('--rounds', type=int, default=30)
    parser.add_argument('--episodes', type=int, default=1000)
    parser.add_argument('--stagnation-limit', type=int, default=20)
    parser.add_argument('--continue-from', type=Path)
    parser.add_argument('--sac-history', type=int, default=4)
    parser.add_argument('--sac-seed', type=int, default=42)
    parser.add_argument('--horizon', type=int, default=50)
    parser.add_argument('--prompt-variant', choices=('sac_hint', 'nohint'), default='sac_hint')
    parser.add_argument('--evaluator', choices=('promote3', 'paired_t'), default='promote3')
    args = parser.parse_args()
    if args.prompt_variant == 'nohint' and args.continue_from:
        raise ValueError('nohint runs must start from equal flow: inherited programs carry the hint')
    if args.horizon <= 0:
        raise ValueError('--horizon must be positive')
    directory = ROOT / 'results' / args.run
    directory.mkdir(parents=True, exist_ok=True)
    settings = dict(horizon=args.horizon, interval=0.1, warmup=0.2)
    evaluation_note = ('Development conditions = distinct 1e-4 m/s warmup inlet perturbations (seed 0 unperturbed). '
                       'Held-out conditions use other perturbation patterns. Same geometry, mesh and operating point.')
    with lock_run(directory):
        if args.method == 'hl':
            if args.rounds <= 0:
                raise ValueError('--rounds must be positive')
            if args.stagnation_limit <= 0:
                raise ValueError('--stagnation-limit must be positive')
            stat = args.evaluator == 'paired_t'
            dev_seeds, test_seeds = ([0, 1, 2, 3, 4, 5] if stat else [0, 1, 2]), [7, 8]
            confirm_seeds = [9, 10, 11] if stat else []
            screen = 50
            # per candidate: screen + full on each dev seed (+ confirmation); plus baselines, legacy re-eval and paired final test
            per_candidate = len(dev_seeds) * ((settings['horizon'] + 1) + (screen + 1)) + len(confirm_seeds) * (settings['horizon'] + 1)
            overhead = (len(dev_seeds) * ((settings['horizon'] + 1) * 3 + (screen + 1)) + len(confirm_seeds) * (settings['horizon'] + 1)
                        + len(test_seeds) * (settings['horizon'] + 1) * 2)
            config = dict(settings, dev_seeds=dev_seeds, test_seeds=test_seeds,
                          minimum_gain=0.3 if stat else 0.5, max_regression=2.0 if stat else 0.75,
                          screen_horizon=screen, screen_tolerance=0.5,
                          max_segments=args.rounds * per_candidate + overhead,
                          max_api_calls=args.rounds, api_retries=5,
                          population_size=8, explore_every=2,
                          stagnation_limit=args.stagnation_limit, stagnation_gain=0.25,
                          prompt_variant=args.prompt_variant,
                          evaluation_note=evaluation_note,
                          fingerprint=fingerprint(ROOT / 'template'))
            if stat:
                config.update(acceptance='paired_t', kappa=2.0, confirm_seeds=confirm_seeds,
                              parallel_episodes=len(dev_seeds), cleanup_cases=True, target_cells=True)
            run = LearningRun(directory, config)
            run.recover()
            if args.continue_from and not run.state.get('incumbent'):
                run.inherit_from(args.continue_from)
            if run.state['sealed']:
                raise RuntimeError('Run already sealed; inspect final results')
            run.learn(max(0, args.rounds - run.state['rounds']))
            if run.state['rounds'] >= args.rounds or run.state.get('stagnation', {}).get('count', 0) >= args.stagnation_limit:
                run.finalize()
            else:
                raise RuntimeError('Learning paused before requested proposals; rerun after network recovery')
        else:
            import numpy as np
            import torch
            from stable_baselines3.common.monitor import Monitor
            from stable_baselines3 import SAC
            from bubble_env import BubbleEnv
            from compare import evaluate
            from sac_controller import TimeHistoryEnv, make_sac

            if args.episodes <= 0:
                raise ValueError('--episodes must be positive')
            total_episodes = args.episodes
            total_steps = total_episodes * settings['horizon']
            protocol_path = directory / 'protocol.json'
            progress_path = directory / 'progress.json'
            existing = protocol_path.exists()
            if existing:
                protocol = json.loads(protocol_path.read_text())
                if any(protocol.get(key) != value for key, value in dict(settings, training_episodes=total_episodes).items()):
                    raise RuntimeError('Existing SAC protocol does not match requested settings')
                if not (directory / 'sac_latest.zip').exists():
                    raise RuntimeError('Existing SAC run has no checkpoint; use a new run name')
            else:
                atomic_json(protocol_path, dict(settings, training_episodes=total_episodes,
                            training_steps=total_steps,
                            training_seed=args.sac_seed, test_seeds=[0, 1, 2, 7, 8], evaluation_note=evaluation_note,
                            fingerprint=fingerprint(ROOT / 'template')))
            protocol = json.loads(protocol_path.read_text())
            final_seeds = protocol.get('test_seeds', [0])
            progress = json.loads(progress_path.read_text()) if progress_path.exists() else dict(steps=0, seconds=0.0)
            torch.set_num_threads(1)
            if args.sac_history <= 0:
                raise ValueError('--sac-history must be positive')
            training_base = BubbleEnv(label=args.run + '_train', **settings)
            testing_base = BubbleEnv(label=args.run + '_test', **settings)
            # Monitor truncates its CSV unless override_existing is False; reruns must keep the training log
            training = Monitor(TimeHistoryEnv(training_base, history=args.sac_history),
                               str(directory / 'train'), override_existing=not existing)
            testing = TimeHistoryEnv(testing_base, history=args.sac_history)
            if existing:
                model = SAC.load(directory / 'sac_latest', env=training, device='cpu')
                if model.num_timesteps < total_steps:
                    model.load_replay_buffer(directory / 'replay_latest.pkl')
                    print('SAC resuming from step', model.num_timesteps, flush=True)
            else:
                model = make_sac(training, seed=protocol['training_seed'], learning_starts=250,
                                 batch_size=64, buffer_size=50000, net_arch=(64, 64))
            started = time.perf_counter() - float(progress.get('seconds', 0.0))
            try:
                for checkpoint in range(model.num_timesteps + 100, total_steps + 1, 100):
                    model.learn(total_timesteps=100, reset_num_timesteps=(checkpoint == 100))
                    model.save(directory / 'sac_latest')
                    model.save_replay_buffer(directory / 'replay_latest.pkl')
                    atomic_json(directory / 'progress.json', dict(steps=model.num_timesteps,
                                updates=model._n_updates, seconds=time.perf_counter() - started))
                    print('SAC training steps', model.num_timesteps, flush=True)
                fixed = evaluate(lambda observation: np.zeros(3), testing, final_seeds)
                learned = evaluate(lambda observation: model.predict(observation, deterministic=True)[0],
                           testing, final_seeds)
                atomic_json(directory / 'final_test.json', dict(fixed=fixed, learned=learned,
                    evaluation_note=evaluation_note, test_seeds=final_seeds, training_seed=protocol['training_seed'],
                    sac_history=args.sac_history, learning_starts=250,
                    batch_size=64, buffer_size=50000, net_arch=[64, 64],
                    steps=model.num_timesteps, updates=model._n_updates,
                    seconds=time.perf_counter() - started))
            finally:
                training.close()
                testing.close()
        print('FINISHED', directory, flush=True)


if __name__ == '__main__':
    main()