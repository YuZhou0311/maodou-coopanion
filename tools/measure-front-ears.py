#!/usr/bin/env python3
"""Measure the selected front's ear silhouette. No artwork pixels are changed.

The shared white root is hidden under the measured head. Below it, exterior
alpha runs supply the actual selected silhouette, including the long paddles.
"""
from pathlib import Path
from PIL import Image
import numpy as np
import json
import hashlib

root = Path(__file__).resolve().parents[1]
path = root / 'art-source/user-selected-front.png'
a = np.asarray(Image.open(path).convert('RGBA'))[:, :, 3]
rows = []
for y in range(275, 1067):
    runs = np.flatnonzero(np.diff(np.r_[False, a[y] > 160, False])).reshape(-1, 2)
    runs = [r for r in runs if r[1] - r[0] > 5]
    if not runs:
        continue
    left_outer = float(runs[0][0])
    right_outer = float(runs[-1][1])
    if y < 320:
        left_outer = float(np.interp(y, [275, 300, 320], [430, 390, 342]))
        right_outer = float(np.interp(y, [275, 300, 320], [825, 865, 914]))
    if y < 690:
        left_inner = float(np.interp(y, [275,300,320,345,395,475,575,660,690], [431,455,460,455,430,408,390,376,373]))
        right_inner = 1255-left_inner
    else:
        left_candidates = [r for r in runs if r[0] < 350]
        right_candidates = [r for r in runs if r[1] > 900]
        if not left_candidates or not right_candidates:
            continue
        left_inner = float(left_candidates[0][1])
        right_inner = float(right_candidates[-1][0])
    rows.append({'v': (y-275)/791, 'y': y, 'L': [left_outer,left_inner], 'R': [right_inner,right_outer]})
data = {
    'source': 'art-source/user-selected-front.png', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    'method': 'Alpha exterior runs at threshold160; hidden top root reconstructed inside the selected head. No pixel edits.',
    'rootScope': 'y275–320 and inner join through y690 are hidden geometric completion, not separately visible source measurements.',
    'rows': rows,
}
(root/'runtime/approved-front-ears.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
print(json.dumps({'rows':len(rows),'firstY':rows[0]['y'],'lastY':rows[-1]['y'],'sourceSHA':data['sha256']}))
