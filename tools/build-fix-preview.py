#!/usr/bin/env python3
"""Compose unretouched runtime captures for the v1.3.4 hood regression review."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before', required=True)
parser.add_argument('--after', required=True)
parser.add_argument('--out', default='preview/release/v1.3.4')
args = parser.parse_args()
before, after, output = [(ROOT / p).resolve() for p in (args.before, args.after, args.out)]
output.mkdir(parents=True, exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture(directory, angle):
    direction = 'left' if angle < 0 else 'right' if angle > 0 else 'front'
    candidates = [directory / f'angle-{direction}-{abs(angle)}-transparent.png', directory / f'yaw-{angle}.png']
    path = next((p for p in candidates if p.is_file()), None)
    if path is None:
        raise FileNotFoundError(f'No actual {angle} degree capture in {directory}')
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path), 'angle': angle,
            'image': Image.open(path).convert('RGBA')}


def font(size):
    return ImageFont.truetype('DejaVuSans.ttf', size)


def compose(filename, title, subtitle, cells, columns):
    images = [cell['capture']['image'] for cell in cells]
    boxes = [im.getchannel('A').getbbox() for im in images]
    crop = (min(b[0] for b in boxes)-5, min(b[1] for b in boxes)-5,
            max(b[2] for b in boxes)+5, max(b[3] for b in boxes)+5)
    width, height = crop[2]-crop[0], crop[3]-crop[1]
    card_w, card_h, gap, margin, header = max(width+30, 350), height+70, 16, 28, 96
    rows = (len(cells)+columns-1)//columns
    page = Image.new('RGB', (margin*2+columns*card_w+(columns-1)*gap,
                            header+rows*card_h+(rows-1)*gap+54), '#efedf3')
    draw = ImageDraw.Draw(page)
    draw.text((margin, 20), title, font=font(25), fill='#423c4b')
    draw.text((margin, 57), subtitle, font=font(14), fill='#756c80')
    records = []
    for i, cell in enumerate(cells):
        x, y = margin+(i % columns)*(card_w+gap), header+(i//columns)*(card_h+gap)
        draw.rounded_rectangle((x, y, x+card_w, y+card_h), radius=12, fill='#fbfaff')
        draw.text((x+16, y+14), cell['label'], font=font(18), fill='#4a4355')
        image = cell['capture']['image'].crop(crop)
        page.paste(image, (x+(card_w-width)//2, y+49), image)
        records.append({k: v for k, v in cell['capture'].items() if k != 'image'} | {'label': cell['label']})
    draw.text((margin, page.height-32), 'Actual WebGL captures | native pixels 1:1 | common transparent margins cropped only',
              font=font(13), fill='#756c80')
    path = output / filename
    buffer = io.BytesIO()
    page.save(buffer, format='PNG')
    data = buffer.getvalue()
    with Image.open(io.BytesIO(data)) as check:
        check.verify()
    temporary = path.with_suffix('.png.tmp')
    temporary.write_bytes(data)
    temporary.replace(path)
    if path.read_bytes() != data:
        raise OSError(f'PNG readback mismatch: {path}')
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path), 'crop': crop, 'cells': records}


comparison = [{'label': f'{version}  |  {angle:+d} degrees' if angle else f'{version}  |  front',
               'capture': capture(directory, angle)}
              for version, directory in [('v1.3.3', before), ('v1.3.4', after)] for angle in [0, 30, -30]]
turns = [{'label': f'{angle:+d} degrees' if angle else 'Front', 'capture': capture(after, angle)}
         for angle in [-75, -45, -35, -22, -15, 0, 15, 22, 35, 45, 60, 75]]
figures = [
    compose('front-and-turning-comparison.png', 'Hood correction - v1.3.3 / v1.3.4',
            'Front attachment paint and the rear silhouette at both 30-degree turns.', comparison, 3),
    compose('turning-key-angles.png', 'v1.3.4 - front, intermediate turns and side views',
            'The 15-35 degree interval exposes the formerly hidden head branch.', turns, 4),
]
reports = []
for directory in [before, after]:
    path = directory / 'report.json'
    report = json.loads(path.read_text())
    if report.get('status') != 'complete' or report.get('passed') is False or report.get('errors'):
        raise RuntimeError(f'Capture report did not complete cleanly: {path}')
    reports.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path),
                    'status': report['status'], 'passed': report.get('passed'),
                    'sourcesUnchanged': report.get('sourcesUnchanged')})
metadata = {'scope': 'Unretouched runtime pixels, composited on a neutral background at native resolution. '
                     'Each run uses the requested native yaw; separate startup clocks are not asserted identical.',
            'reports': reports, 'figures': figures}
(output / 'source-map.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'figures': [f['path'] for f in figures]}))
