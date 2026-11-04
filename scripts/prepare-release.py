#!/usr/bin/env python3
"""Validate release metadata and source before an immutable tag is created."""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

VERSION = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--kind", required=True, choices=("stable", "rc"))
    parser.add_argument("--require-main", action="store_true")
    args = parser.parse_args()
    match = VERSION.fullmatch(args.version)
    if not match or (args.kind == "stable") == bool(match and match.group(4)):
        print("Invalid version for release kind", file=sys.stderr)
        return 1
    if args.require_main and git("rev-parse", "HEAD") != git("rev-parse", "refs/remotes/origin/main"):
        print("Stable release must use main", file=sys.stderr)
        return 1
    if git("status", "--porcelain"):
        print("Release checkout must be clean", file=sys.stderr)
        return 1
    tag = "v" + args.version
    if git("tag", "-l", tag) == tag:
        print(f"Tag already exists: {tag}", file=sys.stderr)
        return 1
    changelog = Path("CHANGELOG.md").read_text(encoding="utf-8")
    if not re.search(r"^## \[" + re.escape(args.version) + r"\] - \d{4}-\d{2}-\d{2}$", changelog, re.M):
        print("Missing dated changelog entry", file=sys.stderr)
        return 1
    package = Path("package.json")
    lock = Path("yarn.lock")
    if not package.is_file() or not lock.is_file():
        print("Release requires package.json and yarn.lock", file=sys.stderr)
        return 1
    if json.loads(package.read_text())["version"] != args.version:
        print("Package version must match release", file=sys.stderr)
        return 1
    print(f"Release metadata valid: {tag} at {git('rev-parse', 'HEAD')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
