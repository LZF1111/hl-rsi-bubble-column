"""Extract held-out field frames for the best HL program (hl_h200_robust03 champion 16b35b06).

Run on the CFD server: python3 extract_best.py; writes /tmp/hl_site_export/fields_best.json
(same layout as extract_fields.py, so tools/pack_fields.py can pack it).
"""
import json, os, sys
os.chdir('/home/lzf/mount/bubble_hl_sac_demo')
sys.argv = ['x']
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extract_fields.py')).read()
exec(src[:src.index('out = {}')])          # reuse scalar/vector/plane/episode helpers

RUN = 'hl_h200_robust03'
ft = json.load(open('results/%s/final_test.json' % RUN))
out = {RUN: {}}
for split in ('fixed', 'learned'):
    for ep in ft[split]['episodes']:
        key = '%s_s%d' % (split, ep['seed'])
        out[RUN][key] = episode(ep['case'])
        print(key, len(out[RUN][key]['frames']), round(out[RUN][key]['return'], 3), flush=True)
os.makedirs('/tmp/hl_site_export', exist_ok=True)
json.dump(out, open('/tmp/hl_site_export/fields_best.json', 'w'), separators=(',', ':'))
print('size MB', os.path.getsize('/tmp/hl_site_export/fields_best.json') / 1e6)
