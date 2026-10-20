#!/usr/bin/env python3
"""Plan or explicitly build the source/delivery ZIPs; never builds by default.

Python standard library only. Native Coopanion install ZIP validation remains
the responsibility of preview-host/validate-native.mjs. This script records
actual bytes and hashes, not visual acceptance or runtime/FPS claims.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import struct
import sys
import tempfile
import zipfile


PROJECT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "package.json",
    "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock",
    "tsconfig.json", ".gitignore", "requirements.txt",
}
SOURCE_DIRS = {"runtime", "pack", "tools", "preview", "preview-host", "art-source", "references", "docs", "host-fix"}
EXCLUDED_DIRS = {
    "node_modules", ".qa-tmp", ".npm-cache", "test-browser", "__pycache__",
    "upstream", "exports", ".git", "tmp",
}
FAILED_QA_DIRS = {"first-rig", "second-rig", "third-rig", "angles-final"}
# Historical failure media are not distributed by this public source snapshot.
HISTORY_LINK_IMAGES = set()
HISTORY_REPORT_FILES = set()
VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".gif"}
ALREADY_COMPRESSED = {".png", ".jpg", ".jpeg", ".webp", ".zip", ".mp4", ".webm", ".gif", ".woff2", ".gz"}
REQUIRED_SOURCE = {
    'LICENSE',
    'README.md',
    'THIRD_PARTY_NOTICES.md',
    'art-source/front-master-02.png',
    'art-source/user-selected-front.png',
    'docs/asset-production.md',
    'docs/integration.md',
    'docs/qa/acceptance.md',
    'docs/source-package.md',
    'host-fix/README.md',
    'host-fix/base.json',
    'host-fix/pointer-release.patch',
    'pack/art-data.json',
    'pack/assets/atlas.png',
    'pack/figure.js',
    'pack/figure.json',
    'pack/model.json',
    'package.json',
    'preview-host/package-lock.json',
    'preview-host/package.json',
    'preview-host/vendor/coopanion/LICENSE',
    'preview-host/vendor/coopanion/provenance.json',
    'references/source-index.json',
    'requirements.txt',
    'runtime/animation.js',
    'runtime/approved-front-ears.json',
    'runtime/approved-front.json',
    'runtime/atlas-renderer.js',
    'runtime/host-adapter.js',
    'runtime/painted-figure.js',
    'runtime/words.js',
    'tools/fonts/MaodouPreviewUI.woff2',
    'tools/fonts/OFL.txt',
}

MANIFEST_NAME = "PACKAGE-MANIFEST.json"
CHUNK = 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def source_decision(relative: PurePosixPath) -> tuple[bool, str]:
    parts, name = relative.parts, relative.as_posix()
    if name == ".gitignore":
        return True, "public project configuration"
    if any(p in EXCLUDED_DIRS or p.startswith(".") for p in parts):
        return False, "dependencies, cache, temporary or recursive exports"
    native_review_clip = (len(parts) >= 3 and parts[:2] == ("preview", "release")
                          and relative.name in {"walking-lively.mp4", "walking-gentle.mp4"})
    if relative.suffix.lower() in {".pyc", ".pyo"} | VIDEO_SUFFIXES and not native_review_clip:
        return False, "compiled cache or large media"
    if len(parts) == 1:
        return (name in ROOT_FILES, "selected public root configuration")
    if parts[0] not in SOURCE_DIRS:
        return False, "outside public source directories"
    if name.startswith("preview-host/staged/") or name.startswith("preview-host/qa/native-runner/"):
        return False, "rebuildable staging or compiled importer"
    if name == "art-source/user-rejected-early-front.png":
        return False, "private user attachment"
    if name == "tools/fonts/NotoSansCJKsc-Regular.otf":
        return False, "optional full font; download recipe and subset are provided"
    if parts[0] == "references" and (len(parts) != 2 or relative.suffix not in {".md", ".json"}):
        return False, "reference URLs and observations only; no copied third-party media"
    if parts[0] == "preview" and parts[1] != "release":
        return False, "only authored release contact sheets"
    return True, parts[0]


def fingerprint(path: Path, relative: str) -> dict:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular, non-symlink file: {relative}")
    before = path.stat()
    digest, first = hashlib.sha256(), b""
    with path.open("rb") as stream:
        while block := stream.read(CHUNK):
            if not first:
                first = block[:32]
            digest.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise RuntimeError(f"Source changed during hashing: {relative}")
    result = {"path": relative, "bytes": after.st_size, "sha256": digest.hexdigest()}
    if first[:8] == b"\x89PNG\r\n\x1a\n" and first[12:16] == b"IHDR" and len(first) >= 24:
        w, h = struct.unpack(">II", first[16:24])
        result["image"] = {"format": "PNG", "width": w, "height": h}
    return result


def source_inventory(root: Path) -> dict:
    entries, excluded, categories = [], defaultdict(lambda: {"files": 0, "bytes": 0}), defaultdict(lambda: {"files": 0, "bytes": 0})
    for path in sorted(root.rglob("*")):
        if not path.is_file() and not path.is_symlink():
            continue
        relative = path.relative_to(root).as_posix()
        include, reason = source_decision(PurePosixPath(relative))
        if not include:
            excluded[reason]["files"] += 1
            excluded[reason]["bytes"] += path.lstat().st_size
            continue
        entry = fingerprint(path, relative)
        entries.append(entry)
        category = relative.split("/", 1)[0]
        categories[category]["files"] += 1
        categories[category]["bytes"] += entry["bytes"]
    names = {entry["path"] for entry in entries}
    return {
        "files": entries,
        "totals": {"files": len(entries), "bytes": sum(e["bytes"] for e in entries)},
        "categories": dict(sorted(categories.items())),
        "excludedByReason": dict(sorted(excluded.items())),
        "requiredMissing": sorted(REQUIRED_SOURCE - names),
    }


def resolve_output(root: Path, value: str | None, default: str) -> Path:
    candidate = Path(value or default)
    candidate = (root / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    if not candidate.is_relative_to(root / "exports"):
        raise ValueError("Release outputs must be inside this project's exports/ directory.")
    return candidate


def resolve_manifest(root: Path, value: str | None, output: Path | None = None, inputs: set[Path] | None = None) -> Path:
    default = str(output.relative_to(root).with_suffix(".manifest.json")) if output else "exports/source-package-plan.json"
    candidate = resolve_output(root, value, default)
    if candidate.suffix.lower() != ".json":
        raise ValueError("The manifest output must have a .json extension.")
    if candidate == output or candidate in (inputs or set()):
        raise ValueError("The manifest cannot overwrite a release ZIP or selected input artifact.")
    return candidate


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".manifest-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def json_bytes(data: dict) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def safe_archive_name(name: str) -> None:
    p = PurePosixPath(name)
    if p.is_absolute() or not name or "\\" in name or any(c in {"", ".", ".."} for c in p.parts):
        raise ValueError(f"Unsafe archive name: {name}")


def zip_info(name: str) -> zipfile.ZipInfo:
    safe_archive_name(name)
    # Stable ordering, dates, and permissions avoid recording workspace details.
    info = zipfile.ZipInfo(name, date_time=(2026, 10, 20, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    info.compress_type = zipfile.ZIP_STORED if PurePosixPath(name).suffix.lower() in ALREADY_COMPRESSED else zipfile.ZIP_DEFLATED
    return info


def create_verified_zip(root: Path, output: Path, entries: list[dict], manifest: dict, prefix: str, verify_sources) -> dict:
    """Write only to a temporary ZIP until every source and ZIP CRC is verified."""
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=".release-", suffix=".zip.tmp", dir=output.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    expected_names = []
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for entry in entries:
                source = root / entry["path"]
                name = prefix + entry.get("archivePath", entry["path"])
                expected_names.append(name)
                digest, size = hashlib.sha256(), 0
                with source.open("rb") as source_stream, archive.open(zip_info(name), "w", force_zip64=True) as destination:
                    while block := source_stream.read(CHUNK):
                        destination.write(block)
                        digest.update(block)
                        size += len(block)
                if size != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
                    raise RuntimeError(f"Source changed while writing ZIP: {entry['path']}")
            name = prefix + MANIFEST_NAME
            expected_names.append(name)
            archive.writestr(zip_info(name), json_bytes(manifest))
        with zipfile.ZipFile(temporary) as archive:
            if archive.namelist() != expected_names or len(expected_names) != len(set(expected_names)):
                raise RuntimeError("ZIP entry names or ordering do not match the planned payload.")
            damaged = archive.testzip()
            if damaged is not None:
                raise RuntimeError(f"ZIP CRC check failed: {damaged}")
        verify_sources()
        os.replace(temporary, output)
        result = fingerprint(output, output.relative_to(root).as_posix())
        result["entries"] = len(expected_names)
        result["verification"] = {"zipCrcPassed": True, "entryNamesMatch": True, "sourcesUnchanged": True}
        return result
    finally:
        if temporary.exists():
            temporary.unlink()


def check_required_paths(root: Path, required: list[str]) -> None:
    for value in required:
        original = root / value
        path = original.resolve()
        if not path.is_relative_to(root) or original.is_symlink() or not path.is_file() or not path.stat().st_size:
            raise ValueError(f"Required final evidence is missing, empty, or outside the project: {value}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--plan", action="store_true", help="Default: calculate hashes and selection; do not create a ZIP.")
    modes.add_argument("--build-source", action="store_true", help="Explicitly build the source ZIP after final evidence is frozen.")
    modes.add_argument("--build-delivery", action="store_true", help="Explicitly combine only the --artifact files into the delivery ZIP.")
    parser.add_argument("--project", default=str(PROJECT))
    parser.add_argument("--output", help="ZIP output, relative to the project; must be under exports/.")
    parser.add_argument("--manifest", help="Optional plan JSON / override for the build sidecar; must be under exports/.")
    parser.add_argument("--require", action="append", default=[], metavar="PROJECT_PATH", help="Require an existing nonempty final evidence file before build; does not assert its contents passed.")
    parser.add_argument("--artifact", action="append", default=[], metavar="[ZIP_NAME=]PROJECT_PATH", help="Delivery only: explicitly selected artifact; default ZIP_NAME is its basename.")
    args = parser.parse_args()
    root = Path(args.project).resolve()
    version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
    if not isinstance(version, str) or not version or any(c not in "0123456789.-" for c in version):
        raise ValueError("Project version must contain only digits, periods, or hyphens.")

    if args.build_delivery:
        if not args.artifact:
            raise ValueError("Delivery packaging requires an explicit --artifact list; missing outputs are never invented.")
        check_required_paths(root, args.require)
        entries = []
        for spec in args.artifact:
            alias, separator, value = spec.partition("=")
            if not separator:
                value, alias = alias, ""
            original = root / value
            source = original.resolve()
            if not source.is_relative_to(root) or original.is_symlink():
                raise ValueError(f"Delivery artifact must be inside the current project: {value}")
            archive_name = alias or source.name
            safe_archive_name(archive_name)
            if "/" in archive_name or archive_name == MANIFEST_NAME:
                raise ValueError("Delivery artifact names must be unique flat filenames, not a directory or reserved manifest name.")
            entry = fingerprint(source, source.relative_to(root).as_posix())
            if entry["bytes"] == 0:
                raise ValueError(f"Empty delivery artifact: {value}")
            entry["archivePath"] = archive_name
            entries.append(entry)
        entries.sort(key=lambda e: e["archivePath"])
        if len({e["archivePath"] for e in entries}) != len(entries):
            raise ValueError("Duplicate delivery artifact basenames; use ZIP_NAME=PROJECT_PATH aliases.")
        output = resolve_output(root, args.output, f"exports/Maodou-Delivery-v{version}.zip")
        input_paths = {(root / e["path"]).resolve() for e in entries}
        if output in input_paths:
            raise ValueError("The delivery output cannot also be an input artifact.")
        sidecar = resolve_manifest(root, args.manifest, output, input_paths)
        payload = {"schemaVersion": 1, "kind": "explicit-delivery", "version": version, "createdAtUTC": utc_now(),
                   "scope": "Packaging and byte verification only. Consult included acceptance reports for actual runtime, visual, and performance scope.",
                   "files": entries, "totals": {"files": len(entries), "bytes": sum(e["bytes"] for e in entries)}}
        def verify_delivery():
            for old in entries:
                new = fingerprint(root / old["path"], old["path"])
                if (old["bytes"], old["sha256"]) != (new["bytes"], new["sha256"]):
                    raise RuntimeError(f"Delivery input changed: {old['path']}")
        archive = create_verified_zip(root, output, entries, payload, "", verify_delivery)
        report = {**payload, "status": "complete", "archive": archive}
    else:
        if args.artifact:
            raise ValueError("--artifact is only used with --build-delivery.")
        inventory = source_inventory(root)
        payload = {"schemaVersion": 1, "kind": "source", "version": version, "createdAtUTC": utc_now(),
                   "scope": "Editable source, AI-painted originals and layers, public reference URL indices, host patch, and retained runtime evidence. This source ZIP is not the directly installable Coopanion ZIP.",
                   "omittedReferenceMedia": "Official, media, community and user original images/videos are not distributed. references/ contains public URLs and documented observations only.",
                   "historyScope": "Reports retain their original version, scope and hashes. Each version's distributed-evidence.json lists its selected actual captures; large reports are losslessly compressed with summaries. Historical reports and contact sheets do not establish results for a later release. Consult docs/qa/acceptance.md for this release's final evidence.",
                   **inventory}
        if not args.build_source:
            report = {**payload, "status": "planned", "zipCreated": False}
            if args.manifest:
                write_json(resolve_manifest(root, args.manifest), report)
            print(json.dumps({k: report[k] for k in ("status", "version", "zipCreated", "totals", "categories", "excludedByReason", "requiredMissing")}, ensure_ascii=False, indent=2))
            return 0
        if inventory["requiredMissing"]:
            raise ValueError("Required source/release files missing: " + ", ".join(inventory["requiredMissing"]))
        check_required_paths(root, args.require)
        output = resolve_output(root, args.output, f"exports/Maodou-Source-v{version}.zip")
        sidecar = resolve_manifest(root, args.manifest, output)
        def verify_source():
            after = source_inventory(root)
            if inventory["files"] != after["files"]:
                raise RuntimeError("Selected source files or hashes changed during packaging; temporary ZIP was rejected.")
        archive = create_verified_zip(root, output, inventory["files"], payload, f"Maodou-Source-v{version}/", verify_source)
        report = {**payload, "status": "complete", "archive": archive}

    write_json(sidecar, report)
    print(json.dumps({"status": "complete", "kind": report["kind"], "totals": report["totals"],
                      "archive": report["archive"], "manifest": sidecar.relative_to(root).as_posix()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, KeyError, zipfile.BadZipFile) as error:
        print(json.dumps({"status": "error", "message": str(error), "scope": "No successful release is claimed by this invocation."}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
