import tempfile
from pathlib import Path
from unittest.mock import patch
import io
import json
import numpy as np
from stable_baselines3 import SAC
from hl_auto import DEFAULT, ProgramPolicy, propose, validate
from bubble_env import scalar_field, ROOT

for mode in ('feedback','pulse','hybrid'):
    policy=ProgramPolicy(dict(DEFAULT,mode=mode,amplitude=0.3),0.1)
    for observation in np.random.default_rng(0).normal(size=(20,21)):
        action=policy(observation)
        assert action.shape==(3,) and np.isfinite(action).all() and np.max(np.abs(action))<=1
try:
    validate(dict(DEFAULT,gain=float('nan')))
    raise AssertionError('Invalid program accepted')
except ValueError:
    pass
reply={'choices':[{'message':{'content':json.dumps(DEFAULT)}}],'usage':{'total_tokens':10}}
with patch.dict('os.environ',{'HL_API_KEY':'test-only','HL_API_URL':'https://example.invalid/chat/completions','HL_MODEL':'mock'}):
    with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(reply).encode())):
        program,metadata=propose([])
        assert program==DEFAULT and metadata['usage']['total_tokens']==10
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory)/'alpha.air'
    path.write_text('internalField nonuniform List<scalar> 3 (0.1 0.2 0.3);')
    assert np.allclose(scalar_field(path,3),[0.1,0.2,0.3])
model=SAC.load(ROOT/'results/comparison.sac.zip')
action,_=model.predict(np.zeros(21,dtype=np.float32),deterministic=True)
assert action.shape==(3,) and model._n_updates>0
print('FRAMEWORK_TEST_PASS: policies, schema, mocked API, field parser, SAC reload')