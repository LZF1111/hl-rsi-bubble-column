import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import io
import json
from hl_runtime import CodePolicy, PolicyError, BASELINE
from hl_learning import LearningRun, generate_code, behaviour_descriptor


class FakeEnvironment:
    """Reward = action[0] + seed-dependent offset, so fixed flow differs per seed but gains do not."""
    def __init__(self, **kwargs):
        self.horizon = kwargs['horizon']
        self.seed = 0

    def reset(self, seed=None):
        self.step_count = 0
        self.seed = seed or 0
        return [0.0]*21, {'case':'unit-test-only'}

    def step(self, action):
        self.step_count += 1
        velocities = [0.03 + 0.02 * float(a) for a in action]
        reward = float(action[0]) - 0.01 * self.seed
        return [0.0]*21, reward, False, self.step_count == self.horizon, {
            'gas_imbalance':0.1,'gas_hold_up':0.1,'pressure_reference_deviation_max_pa':12.0,
            'action_saturated':False,'action_slew':0.0,'velocities':velocities}

    def close(self):
        pass


BASE = {'horizon':50,'interval':0.1,'warmup':0.2,'dev_seeds':[0],'test_seeds':[3100],
        'max_segments':5000,'minimum_gain':0.001,'max_regression':0,'max_api_calls':0}


class LearningTests(unittest.TestCase):
    def test_nohint_notebook_persists_and_feedback_is_data_only(self):
        config = dict(BASE, population_size=4, max_api_calls=2, prompt_variant='nohint')
        proposals = iter([
            {'source':'action = [0.1,0,0]', 'rationale':'try left', 'notes':'H1: left helps?'},
            {'source':'action = [0.2,0,0]', 'rationale':'more left', 'notes':'H1 supported; H2 next'}])
        seen = []
        def fake_generate(context, variant):
            self.assertEqual(variant, 'nohint')
            seen.append(context)
            return next(proposals), {'unit_test': True}
        with tempfile.TemporaryDirectory() as directory, patch('hl_learning.generate_code', fake_generate), \
                patch.dict('os.environ', {'HL_API_KEY': 'unit-test'}):
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            run.learn(2)
            self.assertEqual(seen[0]['notebook'], '')
            self.assertEqual(seen[1]['notebook'], 'H1: left helps?')
            self.assertEqual(run.state['notes'], 'H1 supported; H2 next')
            self.assertEqual(seen[1]['experiments_newest_first'][0]['rationale'], 'try left') if seen[1]['experiments_newest_first'] else None
            text = json.dumps(seen).lower()
            for prior in ('plume', 'set point', 'sac', 'neural', 'feedback-controller', 'closing the loop'):
                self.assertNotIn(prior, text)
            reloaded = LearningRun(directory, config, FakeEnvironment)
            self.assertEqual(reloaded.state['notes'], 'H1 supported; H2 next')

    def test_paired_t_needs_confirmation(self):
        config = dict(BASE, dev_seeds=[0, 1, 2, 3], confirm_seeds=[9, 10], acceptance='paired_t', kappa=2.0,
                      minimum_gain=0.3, max_regression=2.0, parallel_episodes=4, max_segments=100000)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            self.assertEqual(run.state['champion_confirm']['gains'], [0.0, 0.0])
            # FakeEnvironment gain = 50*action[0] on every seed: consistent effect, zero spread
            self.assertTrue(run.candidate('action = [0.02, 0, 0]'))
            record = run.state['candidates'][run.state['incumbent']]
            self.assertTrue(record['test']['accepted'])
            self.assertEqual(len(record['confirm_gains']), 2)
            self.assertFalse(run.candidate('action = [0.021, 0, 0]'))  # +0.05 below the 0.3 floor
            self.assertIn('confirmation', run.evaluation_rule())

    def test_sides_bias_cell(self):
        trace = [{'velocities': [0.035, 0.02, 0.035], 'gas_imbalance': 0.1}] * 10
        self.assertEqual(behaviour_descriptor({'trace': trace})['bias'], 'sides')
        trace = [{'velocities': [0.04, 0.02, 0.03], 'gas_imbalance': 0.1}] * 10
        self.assertEqual(behaviour_descriptor({'trace': trace})['bias'], 'left')

    def test_population_keeps_nonchampion_parent(self):
        config = dict(BASE, population_size=3, explore_every=2)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            # worse return but a different behaviour cell (right inlet biased, large actuation)
            self.assertFalse(run.candidate('action = [-0.1,0,0.5]', parent=run.state['incumbent']))
            self.assertEqual(len(run.state['population']), 2)
            self.assertIn(run.state['incumbent'], run.state['population'])
            cells = run.state['archive_cells']
            self.assertEqual(len(cells), 2)
            other = [i for i in run.state['population'] if i != run.state['incumbent']][0]
            self.assertEqual(run.state['candidates'][other]['behaviour']['bias'], 'right')
            run.state['rounds'] = 1
            parent = run.select_parent()
            self.assertEqual(parent, other)
            run.state['rounds'] = 2
            self.assertEqual(run.select_parent(), run.state['incumbent'])

    def test_same_cell_keeps_only_elite(self):
        config = dict(BASE, population_size=8)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            run.candidate('action = [-0.2,0,0.5]')
            run.candidate('action = [-0.1,0,0.5]')  # same cell, better return
            cells = run.state['archive_cells']
            right_cells = [c for c in cells if '_right_' in c]
            self.assertEqual(len(right_cells), 1)
            elite = run.state['candidates'][cells[right_cells[0]]]
            self.assertAlmostEqual(elite['mean_return'], -0.1 * 50)

    def test_differential_gain_and_multi_condition(self):
        config = dict(BASE, dev_seeds=[0, 1, 2], minimum_gain=0.5, max_regression=0.75)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            baselines = run.state['baselines']['50']
            self.assertEqual(set(baselines), {'0', '1', '2'})
            self.assertAlmostEqual(baselines['2'], -0.01 * 2 * 50)
            champion = run.state['candidates'][run.state['incumbent']]
            self.assertEqual(champion['gains'], [0.0, 0.0, 0.0])
            # +0.05 per step -> +2.5 gain on every condition, clears 0.5 threshold
            self.assertTrue(run.candidate('action = [0.05,0,0]'))
            rec = run.state['candidates'][run.state['incumbent']]
            for g in rec['gains']:
                self.assertAlmostEqual(g, 2.5)
            # +0.005 per step -> +0.25 gain: below threshold, must be rejected
            self.assertFalse(run.candidate('action = [0.055,0,0]'))

    def test_screening_rejects_before_full_evaluation(self):
        config = dict(BASE, screen_horizon=10, screen_tolerance=0.0)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            before = run.state['reserved_segments']
            self.assertFalse(run.candidate('action = [-0.5,0,0.5]'))
            # screen only: 10+1 segments, no 50-step run charged
            self.assertEqual(run.state['reserved_segments'] - before, 11)
            kinds = [json.loads(l)['kind'] for l in (Path(directory)/'events.jsonl').read_text().splitlines()]
            self.assertIn('rejected_screen', kinds)
            screened = [c for c in run.state['candidates'].values() if c['status'] == 'screened_out']
            self.assertEqual(len(screened), 1)
            self.assertNotIn(screened[0]['id'], run.state['population'])

    def test_feedback_includes_population_and_parent_source(self):
        config = dict(BASE, population_size=4)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            feedback = run.feedback()
            for key in ('champion_source', 'parent_source', 'top_programs', 'diverse_programs',
                        'archive_cells', 'evaluation_rule', 'fixed_flow_returns_per_condition'):
                self.assertIn(key, feedback)
            self.assertTrue(feedback['unexplored_behaviour_cells'])
            self.assertNotIn('episodes', feedback['development'])

    def test_inherit_reevaluates_under_new_protocol(self):
        old = dict(BASE, dev_seeds=[0])
        new = dict(BASE, dev_seeds=[0, 1, 2], minimum_gain=0.5, max_regression=0.75)
        with tempfile.TemporaryDirectory() as root:
            parent_dir = Path(root) / 'parent'
            child_dir = Path(root) / 'child'
            parent = LearningRun(parent_dir, old, FakeEnvironment)
            parent.initialize()
            self.assertTrue(parent.candidate('action = [0.1,0,0]', parent=parent.state['incumbent']))
            legacy_champion = parent.state['incumbent']
            parent.finalize()
            child = LearningRun(child_dir, new, FakeEnvironment)
            child.inherit_from(parent_dir)
            # legacy champion was re-run on the 3 new conditions and still wins -> adopted
            self.assertEqual(child.state['incumbent'], legacy_champion)
            rec = child.state['candidates'][legacy_champion]
            self.assertEqual(len(rec['gains']), 3)
            self.assertNotIn('3100', json.dumps(child.feedback()))

    def test_budget_and_protocol(self):
        # baseline (51) + incumbent dev run (51) consumed at initialize; one more candidate must fail
        config = dict(BASE, max_segments=102)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            self.assertEqual(run.state['reserved_segments'], 102)
            self.assertFalse(run.candidate('action=[0.1,0,0]'))
            self.assertEqual(run.state['reserved_segments'], 102)
            with self.assertRaises(ValueError):
                LearningRun(directory, dict(config, interval=0.2), FakeEnvironment)
            run.state['pending'] = {'policy':'interrupted-fixture'}
            run.save()
            run.recover()
            self.assertIsNone(run.state['pending'])
            self.assertEqual(run.state['reserved_segments'], 102)

    def test_lifecycle(self):
        config = dict(BASE, dev_seeds=[0,1], test_seeds=[3100,3101], max_api_calls=2)
        with tempfile.TemporaryDirectory() as directory:
            run = LearningRun(directory, config, FakeEnvironment)
            run.initialize()
            self.assertTrue(run.candidate('action = [0.1,0,0]'))
            accepted = run.state['incumbent']
            self.assertFalse(run.candidate('action = [-0.1,0,0]'))
            self.assertEqual(run.state['incumbent'], accepted)
            budget = run.state['reserved_segments']
            self.assertFalse(run.candidate("import os"))
            self.assertEqual(run.state['reserved_segments'], budget)
            resumed = LearningRun(directory, config, FakeEnvironment)
            self.assertEqual(resumed.state['incumbent'], accepted)
            resumed.finalize()
            self.assertTrue(resumed.state['sealed'])
            with self.assertRaises(RuntimeError):
                resumed.candidate(BASELINE)
            feedback = json.dumps(resumed.feedback())
            self.assertNotIn('3100', feedback)
            final = json.loads((Path(directory)/'final_test.json').read_text())
            self.assertEqual(len(final['gains_vs_fixed']), 2)
            self.assertAlmostEqual(final['mean_gain_vs_fixed'], 5.0)

    def test_api_contract(self):
        response = {'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'source':BASELINE,'rationale':'test'})}}], 'usage':{'total_tokens':20}}
        opener = unittest.mock.Mock()
        opener.open.return_value = io.BytesIO(json.dumps(response).encode())
        with patch.dict('os.environ', {'HL_API_KEY':'unit-test-not-a-secret','HL_API_URL':'https://example.invalid/v1/chat/completions'}):
            with patch('urllib.request.build_opener', return_value=opener):
                proposal, meta = generate_code({})
        self.assertEqual(proposal['source'], BASELINE)
        self.assertEqual(meta['usage']['total_tokens'], 20)

    def test_nohint_prompt_has_no_sac_answer(self):
        prompts = {}
        for variant in ('sac_hint', 'nohint'):
            body = {'source':BASELINE,'rationale':'test'} if variant == 'sac_hint' else {'source':BASELINE,'rationale':'test','notes':'n'}
            response = {'choices':[{'finish_reason':'stop','message':{'content':json.dumps(body)}}]}
            opener = unittest.mock.Mock()
            opener.open.return_value = io.BytesIO(json.dumps(response).encode())
            with patch.dict('os.environ', {'HL_API_KEY':'unit-test-not-a-secret','HL_API_URL':'https://example.invalid/v1/chat/completions'}):
                with patch('urllib.request.build_opener', return_value=opener):
                    generate_code({}, variant)
            prompts[variant] = json.loads(opener.open.call_args[0][0].data)['messages'][0]['content']
        for leak in ('neural', '+3.9', '0.033', '0.02-0.024', 'plume', 'CLOSING THE LOOP', 'a2-a3'):
            self.assertIn(leak, prompts['sac_hint'])
            self.assertNotIn(leak, prompts['nohint'])
        with self.assertRaises(ValueError):
            generate_code({}, 'other')


class RuntimeTests(unittest.TestCase):
    def test_memory_and_reset(self):
        source = "if step == 0:\n    memory['value'] = 0.0\nmemory['value'] = memory['value'] + 0.1\naction = [memory['value'], 0, 0]"
        policy = CodePolicy(source)
        self.assertAlmostEqual(policy([0]*21)[0], 0.1)
        self.assertAlmostEqual(policy([0]*21)[0], 0.2)
        policy.reset()
        self.assertAlmostEqual(policy([0]*21)[0], 0.1)

    def test_feature_loop(self):
        policy = CodePolicy('total = 0\nfor index in range(9):\n    total = total + obs[index]\naction = [tanh(total), 0, 0]')
        self.assertEqual(policy([0]*21), [0,0,0])

    def test_forbidden(self):
        for source in ('import os', "open('x')", 'obs.__class__', 'while True:\n    pass', 'action = [0]*10000000'):
            with self.assertRaises((PolicyError, SyntaxError)):
                CodePolicy(source)([0]*21)

    def test_limits(self):
        for source in ('for index in range(100000):\n    action = [0,0,0]', 'action = [1e100,0,0]', 'action = [0,0]', 'action=[0/0,0,0]'):
            with self.assertRaises(PolicyError):
                CodePolicy(source)([0]*21)
        with self.assertRaises(PolicyError):
            CodePolicy('for outer in range(128):\n    for inner in range(128):\n        action=[0,0,0]')([0]*21)

    def test_baseline(self):
        self.assertEqual(CodePolicy(BASELINE)([0]*21), [0,0,0])


if __name__ == '__main__':
    unittest.main()