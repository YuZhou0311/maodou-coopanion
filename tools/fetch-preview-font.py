#!/usr/bin/env python3
"""Fetch the exact public Noto source font, or --check a local copy only."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "tools/fonts/NotoSansCJKsc-Regular.otf"
URL = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"
SHA256 = "2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b"


def valid(raw: bytes) -> bool:
    return hashlib.sha256(raw).hexdigest() == SHA256


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the local font; never download.")
    args = parser.parse_args()
    if DESTINATION.exists():
        if valid(DESTINATION.read_bytes()):
            print("Verified tools/fonts/NotoSansCJKsc-Regular.otf")
            return
        raise SystemExit("Existing font has a different SHA-256. Keep a backup and resolve its provenance before replacing it.")
    if args.check:
        raise SystemExit("Original OTF is absent. The committed WOFF2 still supports normal preview; run without --check only when rebuilding fonts or contact sheets.")
    request = urllib.request.Request(URL, headers={"User-Agent": "maodou-coopanion-font-builder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(32 * 1024 * 1024 + 1)
    if not valid(raw):
        raise SystemExit("Downloaded font SHA-256 differs from the recorded source. No file was written.")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=DESTINATION.parent, suffix=".tmp", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(raw)
    try:
        temporary.replace(DESTINATION)
    finally:
        temporary.unlink(missing_ok=True)
    print("Downloaded and SHA-256 verified tools/fonts/NotoSansCJKsc-Regular.otf")


if __name__ == "__main__":
    main()
