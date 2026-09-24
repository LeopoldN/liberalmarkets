"""Copy only this prototype's assets; generated copies stay out of Git."""
from pathlib import Path
import argparse
import shutil
import subprocess
from godot_glb import convert

project = Path(__file__).resolve().parents[1]
repo = project.parent
parser = argparse.ArgumentParser()
parser.add_argument('--node', default=shutil.which('node'))
args = parser.parse_args()
if not args.node:
    parser.error('Node is required to export the original procedural harbor; pass --node /path/to/node')
files = [
    'models/trading-sloop.glb',
    'models/clean-character-harbor.glb',
    'models/west-indies-chart.glb',
    'coast.json', 'chart-layout.json',
    'sounds/boat_sailing_loop.mp3',
    'sounds/trade_post_main_background.mp3',
    'sounds/coin1.mp3',
]
for relative in files:
    source = repo / 'assets/trade-winds' / relative
    destination = project / 'assets' / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if destination.suffix == '.glb':
        convert(destination)
        # These vertex-colored models do not need UV-based tangent generation.
        settings = destination.with_suffix('.glb.import')
        if settings.exists():
            settings.write_text(settings.read_text().replace('meshes/ensure_tangents=true', 'meshes/ensure_tangents=false'))
        else:
            settings.write_text('[remap]\nimporter="scene"\nimporter_version=1\ntype="PackedScene"\n\n[deps]\nsource_file="res://assets/' + relative + '"\n\n[params]\nmeshes/ensure_tangents=false\nmeshes/generate_lods=true\nanimation/import=true\n')
subprocess.run([args.node, str(project / 'tools/export-assets.mjs')], check=True)
print(f'Ready: {project / "project.godot"}')
