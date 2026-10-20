#!/usr/bin/env python3
"""Pack the adopted AI-painted PNGs without repainting or defining a character rig.

Requires Python 3.10+, Pillow and NumPy. Run from any directory:
    python tools/build-art.py

Only alpha is changed in native-resolution cut files. Atlas resizing uses
premultiplied-alpha Lanczos and returns straight RGBA. Source PNGs are read-only.
Extra sprites can be supplied with --extra-spec path.json; this is a JSON array
of the same records as BASE_SPECS below. Sprite cells are always explicit.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFilter


PROJECT = Path(__file__).resolve().parents[1]
BASE_SPECS = [
    {"id": "head.front", "source": "art-source/head-skins-04.png", "cell": [0, 0, 780, 724]},
    {"id": "head.threeQuarter", "source": "art-source/head-skins-04.png", "cell": [780, 0, 695, 724]},
    {"id": "head.side", "source": "art-source/head-skins-04.png", "cell": [1475, 0, 697, 724]},
    {"id": "ear.front", "source": "art-source/ear-skins-05.png", "cell": [180, 25, 480, 810]},
    {"id": "ear.outer", "source": "art-source/ear-skins-11-clean-root.png", "cell": [1280, 25, 470, 810]},
    {"id": "torso.front", "source": "art-source/torso-skins-10-clean.png", "cell": [0, 0, 810, 724]},
    {"id": "torso.threeQuarter", "source": "art-source/torso-skins-10-clean.png", "cell": [810, 0, 720, 724]},
    {"id": "torso.side", "source": "art-source/torso-skins-10-clean.png", "cell": [1530, 0, 642, 724]},
    {"id": "arm.left", "source": "art-source/body-parts-06-draft.png", "cell": [40, 610, 350, 250]},
    {"id": "arm.right", "source": "art-source/body-parts-06-draft.png", "cell": [440, 610, 320, 250]},
    {"id": "foot.left", "source": "art-source/body-parts-06-draft.png", "cell": [780, 640, 230, 220]},
    {"id": "foot.right", "source": "art-source/body-parts-06-draft.png", "cell": [1050, 635, 260, 225]},
    {"id": "tail", "source": "art-source/body-parts-06-draft.png", "cell": [1400, 625, 275, 235]},
]
FEATURE_SPECS = [
    ("eye.open", [0, 60, 362, 410]),
    ("eye.happy", [362, 60, 362, 410]),
    ("eye.closed", [724, 60, 362, 410]),
    ("eye.sleepy", [1086, 60, 362, 410]),
    ("mouth.smile", [0, 480, 362, 250]),
    ("mouth.open", [362, 480, 362, 250]),
    ("mouth.o", [724, 480, 362, 250]),
    ("mouth.sad", [1086, 480, 362, 250]),
    ("brow.left", [0, 730, 362, 340]),
    ("brow.right", [362, 730, 362, 340]),
    ("blush", [724, 730, 362, 340]),
    ("tear", [1086, 730, 362, 340]),
]
for _id, _cell in FEATURE_SPECS:
    _matte = {"defringePixels": 0, "fillHoles": False, "smoothingRadius": 0.45}
    if _id == "blush":
        _matte.update({"selectionThreshold": 4, "solid": False, "smoothingRadius": 0.5})
    _spec = {"id": _id, "source": "art-source/features-08.png", "cell": _cell, "matte": _matte, "meshHint": "quad"}
    if _id == "blush":
        _spec["note"] = "Preserves original soft alpha falloff. The 0.5 contour records the inner glow only; render its complete cut rectangle."
    elif _id == "eye.sleepy":
        _spec["note"] = "The painted source remains visibly open. It is archived as supplied, not asserted to be an accurate half-closed eye."
    BASE_SPECS.append(_spec)
DEFAULT_MATTE = {
    "selectionThreshold": 64,
    "defringePixels": 2,
    "smoothingRadius": 0.55,
    "fillHoles": True,
    "solid": True,
}
EXCLUDED_REGIONS = [
    {"source": "art-source/ear-skins-05.png", "reason": "Middle cell depicts an incorrect pair of ears; neither part is selected."},
    {"source": "art-source/body-parts-06-draft.png", "reason": "Entire upper row is excluded because the torsos have unwanted attached limbs."},
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def project_file(name: str) -> Path:
    path = (PROJECT / name).resolve()
    if not path.is_relative_to(PROJECT):
        raise ValueError(f"File must remain inside this project: {name}")
    return path


def native_box(mask: np.ndarray) -> tuple[int, int, int, int]:
    yy, xx = np.nonzero(mask)
    if not len(xx):
        raise ValueError("Selected cell has no nonempty alpha component")
    return int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1


def xywh(box: tuple[int, int, int, int]) -> list[int]:
    left, top, right, bottom = box
    return [left, top, right - left, bottom - top]


def largest_component(mask: np.ndarray) -> tuple[np.ndarray, dict]:
    """8-connected largest component, using row runs rather than a new dependency."""
    parents: list[int] = []
    weights: list[int] = []
    runs: list[tuple[int, int, int, int]] = []
    previous: list[tuple[int, int, int]] = []

    def root(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(a: int, b: int) -> None:
        a, b = root(a), root(b)
        if a == b:
            return
        if weights[a] < weights[b]:
            a, b = b, a
        parents[b] = a
        weights[a] += weights[b]

    for y, row in enumerate(mask):
        edges = np.diff(np.r_[False, row, False].astype(np.int8))
        starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
        current = []
        first = 0
        for left, right in zip(starts.tolist(), ends.tolist()):
            index = len(parents)
            parents.append(index)
            weights.append(right - left)
            while first < len(previous) and previous[first][1] < left:
                first += 1
            j = first
            while j < len(previous) and previous[j][0] <= right:
                union(index, previous[j][2])
                j += 1
            current.append((left, right, index))
            runs.append((y, left, right, index))
        previous = current
    if not parents:
        raise ValueError("No alpha above selection threshold in this explicit cell")
    roots = {root(i) for i in range(len(parents))}
    winner = max(roots, key=lambda i: (weights[i], -i))
    out = np.zeros_like(mask)
    for y, left, right, index in runs:
        if root(index) == winner:
            out[y, left:right] = True
    return out, {
        "connectivity": 8,
        "componentCount": len(roots),
        "selectedPixels": int(out.sum()),
        "discardedPixelsAboveThreshold": int(mask.sum() - out.sum()),
    }


def fill_holes(mask: np.ndarray) -> np.ndarray:
    image = Image.new("L", (mask.shape[1] + 2, mask.shape[0] + 2), 0)
    image.paste(Image.fromarray(mask.astype(np.uint8) * 255), (1, 1))
    ImageDraw.floodfill(image, (0, 0), 128)
    values = np.asarray(image)[1:-1, 1:-1]
    return values != 128


def clean_alpha(source_alpha: np.ndarray, component: np.ndarray, options: dict) -> np.ndarray:
    mask = fill_holes(component) if options["fillHoles"] else component
    image = Image.fromarray(mask.astype(np.uint8) * 255)
    inset = int(options["defringePixels"])
    if inset:
        image = image.filter(ImageFilter.MinFilter(2 * inset + 1))
        mask, _ = largest_component(np.asarray(image) >= 128)
        image = Image.fromarray(mask.astype(np.uint8) * 255)
    radius = float(options["smoothingRadius"])
    if radius:
        image = image.filter(ImageFilter.GaussianBlur(radius=radius))
    alpha = np.array(image)
    if not options["solid"]:
        alpha = np.rint(alpha.astype(np.float32) * source_alpha / 255.0).astype(np.uint8)
    return alpha


def contour_rows(alpha: np.ndarray, count: int) -> dict:
    """Half-alpha row crossings in cut space, with one-pixel end caps."""
    height, width = alpha.shape
    threshold = 127.5
    lefts, rights = np.full(height, np.nan), np.full(height, np.nan)
    for y in range(height):
        row = alpha[y].astype(np.float64)
        indices = np.flatnonzero(row >= threshold)
        if not len(indices):
            continue
        left, right = int(indices[0]), int(indices[-1])
        before = row[left - 1] if left else 0.0
        after = row[right + 1] if right + 1 < width else 0.0
        lefts[y] = left - 0.5 + (threshold - before) / max(row[left] - before, 1e-6)
        rights[y] = right + 0.5 + (row[right] - threshold) / max(row[right] - after, 1e-6)
    valid = np.flatnonzero(np.isfinite(lefts))
    if not len(valid):
        raise ValueError("Sprite has no half-alpha contour; lower normalization or use a solid sprite")
    for y in range(height):
        if np.isfinite(lefts[y]):
            continue
        nearest = valid[np.argmin(np.abs(valid - y))]
        center = (lefts[nearest] + rights[nearest]) / 2
        lefts[y], rights[y] = center - 0.5, center + 0.5
    result = []
    for v in np.linspace(0.0, 1.0, count):
        y = v * max(height - 1, 0)
        left, right = np.interp(y, np.arange(height), lefts), np.interp(y, np.arange(height), rights)
        center = (left + right) / 2
        half = max((right - left) / 2, 0.5)
        left, right = max(0.0, center - half), min(float(width), center + half)
        if right - left < 1.0:
            left = min(max(0.0, center - 0.5), max(0.0, width - 1.0))
            right = left + 1.0
        result.append({"v": round(float(v), 8), "left": round(left / width, 8), "right": round(right / width, 8)})
    return {
        "space": "normalized-cut",
        "samples": count,
        "threshold": 0.5,
        "vEndpoints": [0, 1],
        "minimumWidthPixels": 1,
        "cutPixelSize": [width, height],
        "method": "Interpolate per-row half-alpha crossings; use a one-pixel cap where a boundary row has no half-alpha pixel. Outer extent only, not an interior-hole fill.",
        "rows": result,
    }


def encode_png(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", compress_level=6)
    data = buf.getvalue()
    with Image.open(io.BytesIO(data)) as check:
        check.load()
        if check.mode != "RGBA" or check.size != image.size:
            raise ValueError("Encoded PNG failed mode/dimension verification")
    return data


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f".tmp-{os.getpid()}")
    try:
        temp.write_bytes(data)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def resize_rgba(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    if image.size == size:
        return image.copy()
    rgba = np.asarray(image).astype(np.float32) / 255.0
    alpha = rgba[:, :, 3]

    def resample(channel: np.ndarray) -> np.ndarray:
        return np.asarray(Image.fromarray(channel).resize(size, Image.Resampling.LANCZOS))

    out_a = np.clip(resample(alpha), 0.0, 1.0)
    out = np.zeros((size[1], size[0], 4), dtype=np.float32)
    for channel in range(3):
        weighted = resample(rgba[:, :, channel] * alpha)
        out[:, :, channel] = np.divide(weighted, out_a, out=np.zeros_like(weighted), where=out_a > 1e-6)
    out[:, :, 3] = out_a
    return Image.fromarray(np.rint(np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")


def intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def contains(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] <= b[0] and a[1] <= b[1] and a[0] + a[2] >= b[0] + b[2] and a[1] + a[3] >= b[1] + b[3]


def pack_rectangles(sizes: dict[str, tuple[int, int]], side: int, gutter: int) -> dict | None:
    free = [(0, 0, side, side)]
    positions = {}
    ordered = sorted(sizes, key=lambda key: (-max(sizes[key]), -math.prod(sizes[key]), key))
    for key in ordered:
        width, height = sizes[key][0] + gutter * 2, sizes[key][1] + gutter * 2
        choices = [(min(f[2] - width, f[3] - height), max(f[2] - width, f[3] - height), f[1], f[0], f) for f in free if width <= f[2] and height <= f[3]]
        if not choices:
            return None
        chosen = min(choices)[-1]
        used = (chosen[0], chosen[1], width, height)
        remaining = []
        for rect in free:
            if not intersects(rect, used):
                remaining.append(rect)
                continue
            x, y, w, h = rect
            ux, uy, uw, uh = used
            if ux > x:
                remaining.append((x, y, ux - x, h))
            if ux + uw < x + w:
                remaining.append((ux + uw, y, x + w - ux - uw, h))
            if uy > y:
                remaining.append((x, y, w, uy - y))
            if uy + uh < y + h:
                remaining.append((x, uy + uh, w, y + h - uy - uh))
        unique = sorted(set(remaining))
        free = [r for i, r in enumerate(unique) if not any(i != j and contains(other, r) for j, other in enumerate(unique))]
        positions[key] = [used[0] + gutter, used[1] + gutter, width - gutter * 2, height - gutter * 2]
    return positions


@contextmanager
def build_lock():
    path = PROJECT / "art-source/cut/.build-art.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError as exc:
        raise RuntimeError(f"Another build may be running: {path}. Confirm it has stopped before removing its lock.") from exc
    try:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas-size", type=int, choices=[2048, 4096], default=2048)
    parser.add_argument("--gutter", type=int, default=4)
    parser.add_argument("--samples", type=int, choices=[64, 96], default=96)
    parser.add_argument("--min-scale", type=float, default=0.70)
    parser.add_argument("--extra-spec", action="append", default=[], help="Project-relative JSON array of additional explicit sprite cells")
    args = parser.parse_args()
    if args.gutter < 4 or not 0.1 <= args.min_scale <= 1:
        parser.error("Gutter must be at least 4 pixels and min-scale within [0.1, 1].")
    specs = [dict(item) for item in BASE_SPECS]
    for name in args.extra_spec:
        specs.extend(json.loads(project_file(name).read_text(encoding="utf-8")))
    ids = [item["id"] for item in specs]
    if len(ids) != len(set(ids)):
        raise ValueError("Sprite IDs must be unique")
    if any(not item.replace(".", "").replace("-", "").replace("_", "").isalnum() for item in ids):
        raise ValueError("Sprite IDs may contain only letters, digits, dots, hyphens and underscores")
    with build_lock():
        source_cache = {}
        native_cuts = {}
        pending = {}
        metadata = {}
        for spec in specs:
            name, cell = spec["source"], list(map(int, spec["cell"]))
            if name not in source_cache:
                data = project_file(name).read_bytes()
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                    if image.mode != "RGBA":
                        raise ValueError(f"Expected actual RGBA source: {name} ({image.mode})")
                    source_cache[name] = (image.copy(), digest(data))
            source, source_hash = source_cache[name]
            x, y, width, height = cell
            if min(x, y) < 0 or min(width, height) < 1 or x + width > source.width or y + height > source.height:
                raise ValueError(f"Explicit cell is outside the source: {spec['id']} {cell}")
            rgba = np.array(source.crop((x, y, x + width, y + height)))
            options = {**DEFAULT_MATTE, **spec.get("matte", {})}
            component, component_stats = largest_component(rgba[:, :, 3] >= options["selectionThreshold"])
            component_box = native_box(component)
            if component_box[0] == 0 or component_box[1] == 0 or component_box[2] == width or component_box[3] == height:
                raise ValueError(f"Main component touches the selection edge: expand {spec['id']} cell; do not silently crop it")
            cleaned = clean_alpha(rgba[:, :, 3], component, options)
            trim = native_box(cleaned > 0)
            left, top, right, bottom = trim
            cut_array = rgba[top:bottom, left:right].copy()
            cut_array[:, :, 3] = cleaned[top:bottom, left:right]
            if not np.array_equal(cut_array[:, :, :3], rgba[top:bottom, left:right, :3]):
                raise AssertionError("Native cut RGB was changed")
            cut = Image.fromarray(cut_array, "RGBA")
            cut_name = "art-source/cut/" + spec["id"] + ".png"
            encoded = encode_png(cut)
            pending[project_file(cut_name)] = encoded
            native_cuts[spec["id"]] = cut
            metadata[spec["id"]] = {
                "sourceFile": name, "sourceSHA256": source_hash, "sourceSize": list(source.size),
                "sourceCell": cell,
                "componentBox": [x + component_box[0], y + component_box[1], component_box[2] - component_box[0], component_box[3] - component_box[1]],
                "trimBox": [x + left, y + top, right - left, bottom - top],
                "cutFile": cut_name, "cutSize": list(cut.size), "cutSHA256": digest(encoded),
                "matte": {**options, **component_stats, "nativeRGBChangedPixels": 0},
                "contour": contour_rows(cut_array[:, :, 3], args.samples),
                "meshHint": spec.get("meshHint", "row-contour"),
            }
            if "note" in spec:
                metadata[spec["id"]]["note"] = spec["note"]
        positions = None
        steps = int(math.ceil((1 - args.min_scale) / 0.01))
        for step in range(steps + 1):
            scale = max(args.min_scale, 1.0 - step * 0.01)
            sizes = {key: (max(1, round(im.width * scale)), max(1, round(im.height * scale))) for key, im in native_cuts.items()}
            positions = pack_rectangles(sizes, args.atlas_size, args.gutter)
            if positions is not None:
                break
        if positions is None:
            raise RuntimeError("Sprites do not fit within the allowed downsampling range. Use --atlas-size 4096 or explicitly revise the scale limit.")
        atlas = Image.new("RGBA", (args.atlas_size, args.atlas_size), (0, 0, 0, 0))
        used = []
        for key, image in native_cuts.items():
            x, y, width, height = positions[key]
            padded = (x - args.gutter, y - args.gutter, width + args.gutter * 2, height + args.gutter * 2)
            if any(intersects(padded, previous) for previous in used):
                raise AssertionError("Atlas packing overlaps a transparent gutter")
            used.append(padded)
            atlas.paste(resize_rgba(image, (width, height)), (x, y))
            metadata[key].update({
                "atlasRect": [x, y, width, height],
                "atlasRectWithGutter": list(padded),
                "uvRect": [round(x / args.atlas_size, 10), round(y / args.atlas_size, 10), round(width / args.atlas_size, 10), round(height / args.atlas_size, 10)],
                "uvTexelCenterBounds": [round((x + 0.5) / args.atlas_size, 10), round((y + 0.5) / args.atlas_size, 10), round((x + width - 0.5) / args.atlas_size, 10), round((y + height - 0.5) / args.atlas_size, 10)],
                "scaleToAtlas": [round(width / image.width, 10), round(height / image.height, 10)],
            })
        atlas_alpha = np.asarray(atlas)[:, :, 3]
        for key, (x, y, width, height) in positions.items():
            g = args.gutter
            strips = [atlas_alpha[y-g:y, x-g:x+width+g], atlas_alpha[y+height:y+height+g, x-g:x+width+g], atlas_alpha[y:y+height, x-g:x], atlas_alpha[y:y+height, x+width:x+width+g]]
            if any(np.any(strip) for strip in strips):
                raise AssertionError(f"Nontransparent gutter around {key}")
        atlas_bytes = encode_png(atlas)
        pending[PROJECT / "pack/assets/atlas.png"] = atlas_bytes
        for name, (_, expected_hash) in source_cache.items():
            if digest(project_file(name).read_bytes()) != expected_hash:
                raise RuntimeError(f"Source changed during build; outputs were not committed: {name}")
        output = {
            "schemaVersion": 1,
            "format": "maodou-raster-atlas-v1",
            "coordinateConvention": "All boxes are [x,y,width,height]. Source boxes use original PNG pixels. Atlas rectangles exclude gutter. UV origin is top-left. No sprites are rotated or mirrored.",
            "atlas": {"file": "assets/atlas.png", "width": args.atlas_size, "height": args.atlas_size, "gutter": args.gutter, "alphaMode": "straight", "sha256": digest(atlas_bytes), "nominalUniformScale": round(scale, 8)},
            "sprites": metadata,
            "excludedRegions": EXCLUDED_REGIONS,
            "buildInfo": {"tool": "tools/build-art.py", "toolSHA256": digest(Path(__file__).read_bytes()), "builtAtUTC": datetime.now(timezone.utc).isoformat(), "python": sys.version.split()[0], "pillow": PIL.__version__, "numpy": np.__version__, "extraSpecs": args.extra_spec, "nativeRGBPolicy": "Unchanged; only alpha matte is replaced before trimming.", "atlasResampling": "Premultiply RGBA, Lanczos resize, unpremultiply to straight RGBA; no enlargement.", "verification": {"sourceHashesStable": True, "nativeRGBChangedPixels": 0, "transparentGutters": True, "nonoverlappingPaddedRectangles": True, "pngDecode": True}},
        }
        pending[PROJECT / "pack/art-data.json"] = (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        # Encode everything before writing; publish metadata last so it identifies
        # one completed build. The lock prevents concurrent script writers.
        for path, data in pending.items():
            atomic_write(path, data)
        print(json.dumps({"status": "complete", "sprites": len(metadata), "atlas": output["atlas"], "outputs": ["pack/assets/atlas.png", "pack/art-data.json", "art-source/cut/*.png"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
