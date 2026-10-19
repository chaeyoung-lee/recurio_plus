"""Build full-history monthly traffic counts with representative image provenance."""
import argparse
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def build(root, output):
    cameras = {p.name.removeprefix('camera_'): p for p in (root / 'images').glob('*/camera_*') if p.is_dir()}
    bins = {c: defaultdict(lambda: {'count': 0, 'latest': None}) for c in cameras}
    seen = set()
    skipped = {'duplicateImages': 0, 'missingImages': 0, 'invalidTimestamps': 0}
    with ZipFile(root / 'tbl_cameradata_species_info.xlsx') as z:
        strings = [''.join(el.itertext()) for el in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')]
        with z.open('xl/worksheets/sheet1.xml') as stream:
            for _, row in ET.iterparse(stream, events=('end',)):
                if row.tag != NS + 'row':
                    continue
                values = {}
                for cell in row:
                    v = cell.findtext(NS + 'v', '')
                    values[''.join(c for c in cell.get('r', '') if c.isalpha())] = strings[int(v)] if cell.get('t') == 's' and v else v
                row.clear()
                camera = values.get('F')
                if camera not in bins:
                    continue
                relative = Path(values.get('D', '')) / values.get('E', '')
                path = relative.as_posix()
                if path in seen:
                    skipped['duplicateImages'] += 1
                    continue
                image = root / 'images' / relative
                if not image.is_file() or not image.resolve().is_relative_to((root / 'images').resolve()):
                    skipped['missingImages'] += 1
                    continue
                try:
                    date = (datetime(1899, 12, 30) + timedelta(days=float(values['C']))).replace(microsecond=0).isoformat()
                except (ValueError, KeyError, OverflowError):
                    skipped['invalidTimestamps'] += 1
                    continue
                seen.add(path)
                bucket = bins[camera][date[:7]]
                bucket['count'] += 1
                if bucket['latest'] is None or date > bucket['latest']['timestamp']:
                    bucket['latest'] = {'id': values['A'], 'species': values['B'], 'timestamp': date, 'file': path}
    months_found = sorted({m for camera in bins.values() for m in camera})
    if not months_found:
        raise ValueError('No valid image records found')
    year, month = map(int, months_found[0].split('-'))
    months = []
    while f'{year:04d}-{month:02d}' <= months_found[-1]:
        months.append(f'{year:04d}-{month:02d}')
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    result = {'kind': 'JRBP full-history monthly traffic', 'schemaVersion': 2,
              'playback': 'One shared chronological calendar; monthly counts of unique image files',
              'months': months, 'totalImages': len(seen), 'skipped': skipped,
              'cameras': [{'id': c, 'bins': [dict(month=m, **entries[m]) for m in sorted(entries)]}
                          for c, entries in sorted(bins.items()) if entries]}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(',', ':')))
    print(f"Indexed {len(seen):,} unique images, {len(result['cameras'])} cameras, {len(months)} months → {output}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/data/JR_CAMERA_TRAPS'))
    parser.add_argument('--output', type=Path, default=Path('web/data/jrbp.json'))
    args = parser.parse_args()
    build(args.root, args.output)
