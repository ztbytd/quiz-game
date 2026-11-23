"""Atomic static release on Linux. Receives explicit reviewed baseline and archive hashes.

Usage: python3 deploy-release.py archive sha256 baseline.json baseline_sha256 revision
The baseline is {"files": {"relative/path": "sha256"}, "normalize_crlf": false}.
Only /var/www/quiz is exchanged; the previous directory is retained beside it.
"""
import ctypes
import hashlib
import json
import os
import re
import sys
import tarfile
from pathlib import Path, PurePosixPath


def digest(value):
    return hashlib.sha256(value).hexdigest()


def safe_name(name):
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and ".." not in path.parts and "\\" not in name and str(path) == name


def read_payload(package, checksum):
    if digest(package.read_bytes()) != checksum:
        raise RuntimeError("Archive checksum mismatch")
    result = {}
    with tarfile.open(package, "r:gz") as archive:
        for member in archive:
            if not member.isfile() or not safe_name(member.name) or member.name in result:
                raise RuntimeError("Unsafe or duplicate archive member")
            if member.size > 8 * 1024 * 1024:
                raise RuntimeError("Unexpectedly large release file")
            result[member.name] = archive.extractfile(member).read()
    if not {"index.html", "sw.js", "manifest.webmanifest"}.issubset(result):
        raise RuntimeError("Incomplete PWA release")
    return result


def matches(root, expected, normalize_crlf=False):
    if not root.is_dir() or root.resolve() != root:
        return False
    files = {}
    for item in root.rglob("*"):
        if item.is_symlink():
            return False
        if item.is_file():
            content = item.read_bytes()
            if normalize_crlf:
                content = content.replace(b"\r\n", b"\n")
            files[item.relative_to(root).as_posix()] = digest(content)
        elif not item.is_dir():
            return False
    return files == expected


def exchange(left, right):
    operation = ctypes.CDLL(None, use_errno=True).renameat2
    operation.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    if operation(-100, os.fsencode(left), -100, os.fsencode(right), 2) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def main():
    package, checksum, baseline_path, baseline_checksum, revision = sys.argv[1:]
    if not re.fullmatch(r"[0-9a-f]{7,40}", revision):
        raise RuntimeError("Invalid revision")
    raw_baseline = Path(baseline_path).read_bytes()
    if digest(raw_baseline) != baseline_checksum:
        raise RuntimeError("Baseline checksum mismatch")
    baseline = json.loads(raw_baseline)
    old_hashes = baseline["files"]
    if not old_hashes or any(not safe_name(name) for name in old_hashes):
        raise RuntimeError("Invalid baseline")
    payload = read_payload(Path(package), checksum)
    new_hashes = {name: digest(value) for name, value in payload.items()}
    live = Path("/var/www/quiz")
    standby = Path("/var/www/.quiz-before-" + revision[:12])
    if matches(live, new_hashes):
        print(revision + " already live")
        return
    if not matches(live, old_hashes, baseline.get("normalize_crlf", False)):
        raise RuntimeError("Production differs from reviewed baseline; no changes made")
    if standby.exists() or standby.is_symlink():
        raise RuntimeError("Backup path already exists; refusing to replace it")
    standby.mkdir(mode=0o755)
    for name, content in payload.items():
        destination = standby / name
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        destination.write_bytes(content)
        destination.chmod(0o644)
    if not matches(standby, new_hashes) or not matches(live, old_hashes, baseline.get("normalize_crlf", False)):
        raise RuntimeError("Final preflight failed; production not exchanged")
    exchange(standby, live)
    if not matches(live, new_hashes):
        exchange(standby, live)
        raise RuntimeError("New release verification failed; previous production restored")
    if not matches(standby, old_hashes, baseline.get("normalize_crlf", False)):
        raise RuntimeError("Previous-release backup verification failed")
    print(json.dumps({"revision": revision, "files": len(payload), "backup": str(standby), "status": "live"}))


if __name__ == "__main__":
    main()
