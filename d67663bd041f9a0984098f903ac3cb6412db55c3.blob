#!/usr/bin/env python3
"""Encode complete, hash-verified native walking captures as a review video.

No poses are generated, interpolated, recoloured or retimed. Each input frame
is shown once at its recorded 60 Hz simulation cadence. A plain background
and left/right labels are presentation only. This is not an FPS benchmark.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--scheme', choices=('gentle', 'lively'), default='lively')
args = parser.parse_args()
root = Path(args.input).resolve()
out = Path(args.out).resolve()
report_bytes = (root / 'report.json').read_bytes()
report = json.loads(report_bytes)
if report.get('status') != 'complete' or not report.get('passed') or not report.get('sourcesUnchanged'):
    raise SystemExit('A complete successful unchanged-source native report is required.')
captures = {row['file']: row for row in report['screenshots']}
out.parent.mkdir(parents=True, exist_ok=True)
manifest = {'reportSHA256': hashlib.sha256(report_bytes).hexdigest(), 'scheme': args.scheme,
            'fps': 60, 'scope': 'Complete native fixed-step capture including stop; no image interpolation. Not a device FPS measurement.',
            'tracks': {}}
with tempfile.TemporaryDirectory(prefix='maodou-motion-', dir=out.parent) as temporary:
    tmp = Path(temporary)
    for direction in ('left', 'right'):
        name = f'{args.scheme}-walk-{direction}'
        phase = next(p for p in report['phases'] if p['id'] == name)
        expected = list(range(1, phase['expectedFrames'] + 1))
        walk = sorted((captures[f] for f in phase['files']), key=lambda f: f['frame'])
        recovery = phase['recovery']
        stop = sorted((captures[f] for f in recovery['files']), key=lambda f: f['frame'])
        if [f['frame'] for f in walk] != expected or [f['frame'] for f in stop] != list(range(1, recovery['expectedFrames'] + 1)):
            raise SystemExit(f'{name}: incomplete sequence; use --capture-all when recording.')
        sequence = walk + stop
        manifest['tracks'][direction] = sequence
        directory = tmp / direction
        directory.mkdir()
        for i, row in enumerate(sequence, start=1):
            data = (root / row['file']).read_bytes()
            if hashlib.sha256(data).hexdigest() != row['sha256']:
                raise SystemExit('Capture hash mismatch: ' + row['file'])
            (directory / f'{i:04d}.png').write_bytes(data)
    left, right = manifest['tracks']['left'], manifest['tracks']['right']
    if len(left) != len(right) or any((p['width'], p['height']) != (left[0]['width'], left[0]['height']) for p in left + right):
        raise SystemExit('Frame counts or canvas dimensions differ.')
    width, height = left[0]['width'], left[0]['height']
    total = len(left)
    # Source pixels remain 1:1. H.264 requires even dimensions; source canvas is even.
    filters = (
        f'color=c=0xf8f6fa:s={width*2}x{height+40}:r=60:d={total/60}[bg];'
        '[0:v][1:v]hstack=inputs=2[characters];'
        '[bg][characters]overlay=0:40:shortest=1,'
        f'drawtext=text=LEFT:x={width//2-20}:y=12:fontsize=16:fontcolor=0x51465a,'
        f'drawtext=text=RIGHT:x={width+width//2-24}:y=12:fontsize=16:fontcolor=0x51465a[v]'
    )
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
               '-framerate', '60', '-start_number', '1', '-i', str(tmp/'left/%04d.png'),
               '-framerate', '60', '-start_number', '1', '-i', str(tmp/'right/%04d.png'),
               '-filter_complex', filters, '-map', '[v]', '-frames:v', str(total),
               '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
               '-movflags', '+faststart', str(out)]
    subprocess.run(command, check=True)
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_read_frames,width,height,avg_frame_rate:format=duration', '-of', 'json', str(out)]))
if int(probe['streams'][0]['nb_read_frames']) != total:
    raise SystemExit('Encoded frame count differs from native captures.')
manifest.update({'frames': total, 'durationSeconds': total/60, 'video': out.name,
                 'bytes': out.stat().st_size, 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'probe': probe})
out.with_suffix('.sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({key: manifest[key] for key in ['video','frames','durationSeconds','bytes','sha256']}))
