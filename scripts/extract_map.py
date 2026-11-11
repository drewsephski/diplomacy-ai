"""Extract jDip's standard-map geometry, preserving attribution in docs/THIRD_PARTY.md."""
import json
from pathlib import Path
from xml.etree import ElementTree as ET
import diplomacy
source = Path(diplomacy.__file__).parent / 'maps/svg/standard.svg'
root = ET.parse(source).getroot()
aliases = {'nat':'NAO','nrg':'NWG','mid':'MAO','gol':'LYO','tyn':'TYS'}
def code(s):
    return aliases.get(s, s.upper().replace('-', '/'))
paths = []
for el in root.find(".//*[@id='MapLayer']"):
    if el.tag.endswith('path'):
        paths.append({'id': code(el.get('id').lstrip('_')), 'd': el.get('d'), 'water': el.get('class') == 'water', 'impassable': el.get('class') == 'impassable'})
coords = {}
for el in root.iter():
    if el.tag.endswith('}PROVINCE'):
        unit = next((e for e in el if e.tag.endswith('}UNIT')), None)
        if unit is not None:
            coords[code(el.get('name'))] = {'x': float(unit.get('x')), 'y': float(unit.get('y'))}
centers = {}
for el in root.find(".//*[@id='SupplyCenterLayer']"):
    centers[el.get('id').replace('sc_', '')] = {'x': float(el.get('x')) + 10, 'y': float(el.get('y')) + 10}
Path('src/map-data.json').write_text(json.dumps({'paths': paths, 'coords': coords, 'centers': centers}, separators=(',', ':')))
