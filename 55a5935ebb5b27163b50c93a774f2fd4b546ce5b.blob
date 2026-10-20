#!/usr/bin/env python3
"""Lay out the exact 22-degree render and adjacent native views, without repainting."""
from pathlib import Path
import argparse
import importlib.util
import json
import hashlib

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
tool = Path(__file__).with_name('build-update-preview.py')
spec = importlib.util.spec_from_file_location('maodou_contact', tool)
contact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contact)
source = contact.Inputs(Path(args.input).resolve())
output = Path(args.out).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
font, chinese = contact.font_source()
items = []
for angle in (21, 22, 23, -22):
    name, reason = source.angle_file(angle)
    items.append(source.capture(name, f'{angle:+d}°', requestedAngle=angle,
        angleSourceSelection=reason, detail='实际运行截图' if chinese else 'Native runtime capture'))
title = '22° 头耳融合 · 相邻角度与左右对照' if chinese else '22-degree hood join - neighbouring and mirrored views'
subtitle = '最终 v1.3.3，同一时刻与像素比例；观察轮廓和材质的连续过渡。' if chinese else 'Final v1.3.3, same native time and pixel scale; inspect shape and material continuity.'
footer = '实际渲染 · 原始像素 1:1 · 仅裁切透明边距' if chinese else 'Actual render - Native pixels 1:1 - Transparent-margin crop only'
im, cells = contact.compose(items, 4, title, subtitle, footer, font)
source.recheck()
data = contact.png_bytes(im)
contact.atomic(output, data)
metadata = {'file': output.name, 'sha256': hashlib.sha256(data).hexdigest(),
    'inputReport': source.report_meta, 'cells': cells, 'scope': 'Unretouched native frames; only common transparent margins cropped.'}
contact.atomic(output.with_suffix('.sources.json'), (json.dumps(metadata, ensure_ascii=False, indent=2)+'\n').encode())
print(json.dumps({'output': str(output), 'cards': len(cells), 'bytes': len(data), 'sha256': metadata['sha256']}))
