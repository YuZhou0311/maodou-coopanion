#!/usr/bin/env python3
"""Lay out real QA PNGs at their original pixels; never redraw the character.

Usage:
  python tools/build-update-preview.py --angles=docs/qa/v1.3.2/angles-final \
    --motion=docs/qa/v1.3.2/motion-release --out=preview/update

Produces a five-angle comparison, three walking samples per direction for each
available scheme, a stop comparison, and source-map.json. Only fully transparent
outer margins are cropped, using one common crop for each output. There is no
resizing, interpolation, recoloring, retouching, or added shadow over the art.

When a report.json is present it must be complete and is preserved by hash in
the source map. Recorded PNG hashes are checked. Gait sample selection uses the
near paw's shoulder-relative extrema when recorded; older reports fall back to
foot separation and lift. Without a report, three available captures are used.
Angle inputs may use yaw-{signed angle}.png or the native qa-release names
angle-left-75-transparent.png, angle-front-0-transparent.png, etc. A matching
recorded file takes precedence over an unrecorded file from either naming style.

This tool produces static contact sheets. Continuous, non-looping review clips
are produced separately by build-motion-video.py from ordered native captures.
Requires Pillow and a local TrueType/OpenType font. Never accesses the network.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ANGLES = (-75, -45, 0, 45, 75)
SCHEMES = ("gentle", "lively")
BG, PANEL, INK, MUTED, LINE = "#eeebf1", "#f8f6fa", "#51465a", "#847789", "#ded8e4"
MARGIN, GAP, HEADER, FOOTER, PAD = 36, 16, 118, 62, 10


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()
    return (ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def font_source() -> tuple[str, bool]:
    candidates = (
        (ROOT / "tools/fonts/NotoSansCJKsc-Regular.otf", True),
        (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"), True),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), False),
        (Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"), False),
    )
    for path, chinese in candidates:
        if path.is_file():
            return str(path), chinese
    # Pillow/fontconfig may resolve an installed DejaVu font elsewhere.
    try:
        found = ImageFont.truetype("DejaVuSans.ttf", 16)
        return str(found.path), False
    except OSError as error:
        raise RuntimeError("No local font found. Install a TTF font or restore tools/fonts/NotoSansCJKsc-Regular.otf.") from error


class Inputs:
    def __init__(self, directory: Path):
        if not directory.is_dir():
            raise FileNotFoundError(directory)
        self.directory = directory
        self.report = None
        self.report_meta = None
        self.hashes: dict[str, str] = {}
        self.png_records: list[dict] = []
        self.captures: dict[str, dict] = {}
        self.phases: dict[str, dict] = {}
        report_path = directory / "report.json"
        if report_path.is_file():
            raw = report_path.read_bytes()
            self.report = json.loads(raw)
            if self.report.get("status") != "complete" or self.report.get("passed") is False or self.report.get("sourcesUnchanged") is False:
                raise RuntimeError(f"Input report is incomplete, failed or changed: {report_path}")
            self.report_meta = {"file": display_path(report_path), "sha256": sha(raw), "status": self.report.get("status"),
                                "passed": self.report.get("passed"), "sourcesUnchanged": self.report.get("sourcesUnchanged")}
            self._index(self.report)
            self.captures = {Path(record["file"]).name: record for record in self.report.get("screenshots", []) if "file" in record}
            self.phases = {record["id"]: record for record in self.report.get("phases", []) if "id" in record}
        self.used: dict[Path, str] = {}

    def _index(self, value):
        if isinstance(value, dict):
            file, digest = value.get("file"), value.get("sha256")
            if isinstance(file, str) and file.endswith(".png"):
                self.png_records.append(value)
                if isinstance(digest, str):
                    name = Path(file).name
                    if name in self.hashes and self.hashes[name] != digest:
                        raise RuntimeError(f"Conflicting recorded hashes for {name}")
                    self.hashes[name] = digest
            for child in value.values():
                self._index(child)
        elif isinstance(value, list):
            for child in value:
                self._index(child)

    def angle_file(self, angle: int) -> tuple[str, str]:
        direction = "left" if angle < 0 else "right" if angle > 0 else "front"
        names = (f"angle-{direction}-{abs(angle)}-transparent.png", f"yaw-{angle}.png")
        candidates = []
        for record in self.png_records:
            name = Path(record["file"]).name
            if name not in names:
                continue
            declared = record.get("angle", record.get("requestedAngle"))
            if declared is not None and declared != angle:
                raise ValueError(f"Recorded angle disagrees with its filename: {name}: {declared} != {angle}")
            # A report-listed native screenshot with an explicit angle and hash
            # is preferred; an unrecorded alternate can never override it.
            rank = (0 if name in self.hashes else 1, 0 if declared is not None else 1, names.index(name))
            candidates.append((rank, name))
        if candidates:
            name = min(candidates)[1]
            if not (self.directory / name).is_file():
                raise FileNotFoundError(f"Report-selected angle PNG is missing: {self.directory / name}")
            return name, "matching report file; recorded SHA256 checked when present"
        if self.png_records:
            raise RuntimeError(f"Report does not list a capture for {angle} degrees; refusing an unrecorded alternate")
        for name in names:
            if (self.directory / name).is_file():
                return name, "recognized filename; no report PNG index available"
        raise FileNotFoundError(f"No angle capture found for {angle} degrees: {', '.join(names)}")

    def capture(self, name: str, label: str, **extra) -> dict:
        path = self.directory / name
        raw = path.read_bytes()
        digest = sha(raw)
        expected = self.hashes.get(name)
        if expected is not None and expected != digest:
            raise RuntimeError(f"PNG does not match its report: {path}")
        original = Image.open(io.BytesIO(raw))
        if original.format != "PNG":
            raise ValueError(f"Expected PNG: {path}")
        image = original.convert("RGBA")
        image.load()
        alpha = image.getchannel("A")
        box = alpha.getbbox()
        if box is None or alpha.getextrema()[0] == 255:
            raise ValueError(f"Expected a nonempty transparent runtime capture: {path}")
        self.used[path] = digest
        record = self.captures.get(name, {})
        meta = {"source": display_path(path), "sourceSHA256": digest, "sourceSize": list(image.size),
                "nonzeroAlphaBox": list(box), "reportHashVerified": expected is not None,
                "label": label, "frame": record.get("frame"), "seconds": record.get("seconds"),
                "nativeTime": record.get("nativeTime"), **extra}
        return {"image": image, "meta": meta}

    def recheck(self):
        for path, digest in self.used.items():
            if sha(path.read_bytes()) != digest:
                raise RuntimeError(f"Input changed during composition: {path}")
        if self.report_meta and sha((self.directory / "report.json").read_bytes()) != self.report_meta["sha256"]:
            raise RuntimeError(f"Report changed during composition: {self.directory}")


def choose_walk_samples(inputs: Inputs, phase_id: str) -> list[tuple[int, list[str]]]:
    pattern = re.compile(re.escape(phase_id) + r"-f(\d{4})\.png$")
    available = {}
    for path in inputs.directory.glob(phase_id + "-f*.png"):
        match = pattern.fullmatch(path.name)
        if match and 39 <= int(match[1]):
            if inputs.captures and path.name not in inputs.captures:
                continue
            available[int(match[1])] = path.name
    if len(available) < 3:
        raise RuntimeError(f"Need at least 3 actual captures after frame 38 for {phase_id}")
    phase = inputs.phases.get(phase_id, {})
    rows = [row for row in phase.get("rows", []) if row.get("index") in available
            and isinstance(row.get("limbs", {}).get("footSeparationX"), (int, float))]
    chosen: dict[int, list[str]] = {}
    paw_rows = [row for row in rows if isinstance(row.get('limbs', {}).get('parts', {}).get(
        'arm' + row.get('limbs', {}).get('nearSide', ''), {}).get('pawFromShoulder'), list)]
    if len(paw_rows) >= 3:
        def paw_x(row):
            return row['limbs']['parts']['arm' + row['limbs']['nearSide']]['pawFromShoulder'][0]
        low, high = min(paw_rows, key=paw_x), max(paw_rows, key=paw_x)
        chosen[low['index']] = ['minimum actual near-paw horizontal position relative to shoulder']
        chosen[high['index']] = ['maximum actual near-paw horizontal position relative to shoulder']
        middle = (low['index'] + high['index']) / 2
        between = min((row for row in paw_rows if row['index'] not in chosen), key=lambda row: abs(row['index'] - middle))
        chosen[between['index']] = ['actual intermediate phase between the measured paw extremes']
        return sorted(chosen.items())
    if len(rows) >= 3:
        picks = (
            (min(rows, key=lambda row: row["limbs"]["footSeparationX"]), "minimum actual foot-centre separation"),
            (max(rows, key=lambda row: row["limbs"]["footSeparationX"]), "maximum actual foot-centre separation"),
        )
        for row, reason in picks:
            chosen.setdefault(row["index"], []).append(reason)
        ranked = sorted(rows, key=lambda row: max(row.get("pose", {}).get("footLiftL", 0), row.get("pose", {}).get("footLiftR", 0)), reverse=True)
        for row in ranked:
            if row["index"] not in chosen:
                chosen[row["index"]] = ["highest actual sole lift among remaining captured frames"]
                break
    # A missing report or tied extrema must not fabricate a pose.
    ordered = sorted(available)
    for index in (ordered[0], ordered[len(ordered) // 2], ordered[-1], *ordered):
        if len(chosen) >= 3:
            break
        chosen.setdefault(index, ["chronological sample of available actual PNGs"])
    return sorted(chosen.items())


def compose(items: list[dict], columns: int, title: str, subtitle: str, footer: str, font_path: str) -> tuple[Image.Image, list[dict]]:
    sizes = {item["image"].size for item in items}
    if len(sizes) != 1:
        raise ValueError("Each comparison must use equally sized runtime canvases to preserve 1:1 alignment")
    width, height = next(iter(sizes))
    boxes = [item["meta"]["nonzeroAlphaBox"] for item in items]
    crop = (max(0, min(box[0] for box in boxes) - PAD), max(0, min(box[1] for box in boxes) - PAD),
            min(width, max(box[2] for box in boxes) + PAD), min(height, max(box[3] for box in boxes) + PAD))
    crop_w, crop_h = crop[2] - crop[0], crop[3] - crop[1]
    card_w, card_h = crop_w + 24, crop_h + 82
    rows = (len(items) + columns - 1) // columns
    out_w = MARGIN * 2 + columns * card_w + (columns - 1) * GAP
    out_h = HEADER + rows * card_h + (rows - 1) * GAP + FOOTER
    canvas = Image.new("RGBA", (out_w, out_h), BG)
    draw = ImageDraw.Draw(canvas)
    fonts = {size: ImageFont.truetype(font_path, size) for size in (14, 16, 20, 31)}
    draw.text((MARGIN, 24), title, font=fonts[31], fill=INK, anchor="lt")
    draw.text((MARGIN, 73), subtitle, font=fonts[16], fill=MUTED, anchor="lt")
    metadata = []
    for i, item in enumerate(items):
        x = MARGIN + (i % columns) * (card_w + GAP)
        y = HEADER + (i // columns) * (card_h + GAP)
        draw.rectangle((x, y, x + card_w - 1, y + card_h - 1), fill=PANEL, outline=LINE, width=1)
        draw.text((x + card_w // 2, y + 13), item["meta"]["label"], font=fonts[20], fill=INK, anchor="mt")
        frame, seconds = item["meta"].get("frame"), item["meta"].get("seconds")
        detail = item["meta"].get("detail", "")
        if frame is not None:
            detail = f"f{frame:04d}" + (f"  ·  {seconds:.3f} s" if seconds is not None else "")
        if detail:
            draw.text((x + card_w // 2, y + 41), detail, font=fonts[14], fill=MUTED, anchor="mt")
        at = (x + 12, y + 66)
        # Lossless crop only, no resize. Alpha compositing is the sole raster
        # operation; fully opaque source pixels remain byte-identical.
        canvas.alpha_composite(item["image"].crop(crop), at)
        metadata.append({**item["meta"], "commonCropBox": list(crop), "destinationBox": [*at, crop_w, crop_h],
                         "sourceToOutputPixelOffset": [at[0] - crop[0], at[1] - crop[1]], "scale": 1,
                         "resampling": "none", "compositing": "original RGBA over uniform panel; no paint over character"})
    draw.text((MARGIN, out_h - 37), footer, font=fonts[14], fill=MUTED, anchor="lt")
    return canvas.convert("RGB"), metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--angles", required=True, help="Directory containing yaw-{angle}.png or qa-release angle-{left/right/front}-{angle}-transparent.png")
    parser.add_argument("--motion", required=True, help="Directory containing real gentle/lively walking PNGs and optional report.json")
    parser.add_argument("--out", required=True, help="Output directory; paths are relative to the project unless absolute")
    args = parser.parse_args()
    angle_dir, motion_dir, out = map(resolve_path, (args.angles, args.motion, args.out))
    if out in (angle_dir, motion_dir):
        raise ValueError("Keep output separate from source capture directories")
    angle_inputs, motion_inputs = Inputs(angle_dir), Inputs(motion_dir)
    font_path, chinese = font_source()
    font_hash = sha(Path(font_path).read_bytes())
    tr = lambda zh, en: zh if chinese else en
    footer = tr("实际运行透明截图 · 原始像素 1:1 · 仅裁切透明边距", "Actual transparent runtime PNGs · Native pixels 1:1 · Transparent-margin crop only")
    rendered = []
    angles = []
    for angle in ANGLES:
        filename, selection = angle_inputs.angle_file(angle)
        angles.append(angle_inputs.capture(filename, f"{angle:+d}°" if angle else tr("正面 · 0°", "Front · 0°"),
                                           requestedAngle=angle, angleSourceSelection=selection,
                                           detail=tr("原始透明截图", "Original transparent PNG")))
    im, cells = compose(angles, 5, tr("异色大耳帽兜 · 五向转头", "Shiny Maodou · Five viewing angles"),
                        tr("正面与左右侧面，同一像素比例对照。", "Front and both sides at the same pixel scale."), footer, font_path)
    rendered.append(("turning-five-views.png", im, cells))
    stop_items = []
    for scheme in SCHEMES:
        if not any(motion_dir.glob(scheme + "-walk-*-f*.png")):
            continue
        scheme_label = tr("轻柔" if scheme == "gentle" else "活泼", scheme.title())
        walking = []
        for direction in ("left", "right"):
            phase_id = f"{scheme}-walk-{direction}"
            direction_label = tr("向左" if direction == "left" else "向右", direction.title())
            for number, (index, reasons) in enumerate(choose_walk_samples(motion_inputs, phase_id), 1):
                label = tr(f"{direction_label} · 相位 {number}", f"{direction_label} · Sample {number}")
                walking.append(motion_inputs.capture(f"{phase_id}-f{index:04d}.png", label, frame=index,
                                                     scheme=scheme, direction=direction, selectionReasons=reasons))
            stop_name = f"{phase_id}-stop-f0024.png"
            if (motion_dir / stop_name).is_file():
                stop_items.append(motion_inputs.capture(stop_name, tr(f"{scheme_label} · {direction_label}停步", f"{scheme_label} · Stop after {direction}"),
                                                       frame=24, scheme=scheme, direction=direction, selectionReasons=["actual native stand recovery frame 24"]))
        im, cells = compose(walking, 3, tr(f"异色大耳帽兜 · {scheme_label}步态", f"Shiny Maodou · {scheme_label} walking"),
                            tr("左右行走各三帧：按原始时间排列，观察手脚交替与遮挡。", "Three chronological samples per direction: arm/leg alternation and occlusion."), footer, font_path)
        rendered.append((f"walking-{scheme}.png", im, cells))
    if not any(filename.startswith("walking-") for filename, _, _ in rendered):
        raise RuntimeError("No walking scheme found in --motion")
    if stop_items:
        im, cells = compose(stop_items, 2, tr("异色大耳帽兜 · 停步恢复", "Shiny Maodou · Stop recovery"),
                            tr("停止指令后的第 24 个原生帧（0.400 秒）。", "Native frame 24 after stand (0.400 seconds)."), footer, font_path)
        rendered.append(("walking-stop.png", im, cells))
    angle_inputs.recheck()
    motion_inputs.recheck()
    if sha(Path(font_path).read_bytes()) != font_hash:
        raise RuntimeError("Font changed during composition")
    outputs = []
    for filename, im, cells in rendered:
        raw = png_bytes(im)
        atomic(out / filename, raw)
        outputs.append({"file": filename, "sha256": sha(raw), "size": list(im.size), "cards": cells})
    manifest = {"schemaVersion": 1, "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "script": {"file": display_path(Path(__file__)), "sha256": sha(Path(__file__).read_bytes())},
                "scope": "Technical layout of actual runtime captures. Source pixels are not resized, recolored, painted over or sharpened. All nonzero source alpha is included; only common transparent outer margins are cropped. No visual/performance acceptance is inferred.",
                "reports": {"angles": angle_inputs.report_meta, "motion": motion_inputs.report_meta},
                "font": {"file": display_path(Path(font_path)), "sha256": font_hash, "language": "zh" if chinese else "en"},
                "animation": {"gifGenerated": False, "reason": "This tool lays out static contact sheets. Continuous review clips are generated separately by build-motion-video.py and have their own source manifests; no loop, reversal or interpolated motion is implied by these sheets.",
                              "sourceTickSeconds": 1 / 60},
                "outputs": outputs}
    atomic(out / "source-map.json", (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": "complete", "output": display_path(out), "outputs": [{"file": item["file"], "size": item["size"], "cards": len(item["cards"])} for item in outputs],
                      "mapping": display_path(out / "source-map.json"), "gifGenerated": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
