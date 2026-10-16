from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
PATCHES = ('inletLeft', 'inletCenter', 'inletRight')


def command(args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout.strip()


def set_entry(path, entry, value):
    command(['foamDictionary', str(path), '-entry', entry, '-set', str(value)])


def build(destination, coarse=True):
    if destination.exists():
        raise FileExistsError(f'Refusing to overwrite {destination}')
    source = Path(os.environ['FOAM_TUTORIALS']) / 'multiphase/twoPhaseEulerFoam/laminar/bubbleColumn'
    shutil.copytree(source, destination)
    shutil.copytree(destination / '0.orig', destination / '0')
    mesh = (ROOT / 'blockMeshDict').read_text()
    if coarse:
        mesh = mesh.replace('(10 120 10)', '(4 40 4)')
    (destination / 'system/blockMeshDict').write_text(mesh)
    for field in (destination / '0').iterdir():
        if not field.is_file():
            continue
        inlet = command(['foamDictionary', str(field), '-entry', 'boundaryField.inlet', '-value'])
        for patch in PATCHES:
            set_entry(field, f'boundaryField.{patch}', inlet)
        command(['foamDictionary', str(field), '-entry', 'boundaryField.inlet', '-remove'])
    for patch in PATCHES:
        set_entry(destination / '0/U.air', f'boundaryField.{patch}.value', 'uniform (0 0.03 0)')
        set_entry(destination / '0/alpha.air', f'boundaryField.{patch}.value', 'uniform 1')
    set_entry(destination / '0/U.air', 'internalField', 'uniform (0 0 0)')
    control = destination / 'system/controlDict'
    for key, value in {
        'startFrom': 'latestTime', 'endTime': 0.05, 'deltaT': 0.001,
        'adjustTimeStep': 'yes', 'maxCo': 0.3, 'maxDeltaT': 0.002,
        'writeControl': 'adjustableRunTime', 'writeInterval': 0.05,
        'writePrecision': 12, 'timePrecision': 10, 'purgeWrite': 0,
    }.items():
        set_entry(control, key, value)
    locations = ' '.join(f'({lateral} {height} 0.075)' for height in (0.15, 0.35, 0.55) for lateral in (0.025, 0.075, 0.125))
    functions = '{ pressureProbes { type probes; libs ("libsampling.so"); fields (p); probeLocations (' + locations + '); writeControl timeStep; writeInterval 1; } }'
    set_entry(control, 'functions', functions)
    init = destination / 'system/setFieldsDict'
    set_entry(init, 'regions', '(boxToCell { box (0 0 -0.001) (0.15 0.7 0.151); fieldValues (volScalarFieldValue alpha.air 0); })')
    for executable in ('blockMesh', 'checkMesh', 'setFields'):
        output = command([executable, '-case', str(destination)])
        (destination / f'log.{executable}').write_text(output)
        if executable == 'checkMesh' and ('Mesh OK.' not in output or 'defaultFaces' in output):
            raise RuntimeError('Unexpected mesh topology; inspect log.checkMesh')
    metadata = {'nx_per_block': 4 if coarse else 10, 'ny': 40 if coarse else 120,
                'nz': 4 if coarse else 10, 'dimensions_m': [0.15, 1.0, 0.15],
                'liquid_height_m': 0.7, 'solver': 'twoPhaseEulerFoam',
                'provenance': 'Modified OpenFOAM v2306 tutorial, not a validated Deen reproduction'}
    (destination / 'mesh_meta.json').write_text(json.dumps(metadata, indent=2))
    (destination / 'bubble.foam').touch()
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', type=Path, default=ROOT / 'template')
    parser.add_argument('--fine', action='store_true')
    args = parser.parse_args()
    build(args.destination.resolve(), not args.fine)