"""Dissolve country borders into region outlines. Requires shapely>=2,<3.
Run after updating country profiles or the Natural Earth map:
    python3 scripts/build-practice-econ-regions.py
"""
import json
from pathlib import Path
from collections import defaultdict
from shapely import make_valid, set_precision
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

root = Path(__file__).resolve().parents[1]
profiles = json.loads((root / 'data/trade-game/practice-econ.json').read_text())['countries']
regions = {map_id: c['region'] for c in profiles for map_id in c['mapIds'] if c['region']}
geo = json.loads((root / 'assets/geo/ne_50m_admin_0_countries.geojson').read_text())
groups = defaultdict(list)
for feature in geo['features']:
    region = regions.get(feature['properties']['ADM0_A3'])
    if region:
        groups[region].append(set_precision(make_valid(shape(feature['geometry'])), .00001))
features = []
for region, polygons in sorted(groups.items()):
    merged = unary_union(polygons)
    features.append({'type': 'Feature', 'properties': {'region': region}, 'geometry': mapping(merged)})
output = root / 'assets/geo/practice-econ-regions.geojson'
output.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'))+'\n')
print(f'Wrote {len(features)} dissolved regions to {output.name}')
