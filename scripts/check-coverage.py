#!/usr/bin/env python3
"""Enforce changed-line coverage using Git's diff and standard LCOV data."""

import argparse
import re
import subprocess
import sys
from pathlib import Path

SOURCE = re.compile(r"\.(?:[cm]?js|[cm]?ts|jsx|tsx)$")
EXCLUDED = re.compile(r"(?:^|/)(?:__tests__|tests?|fixtures|generated|dist|coverage)/|(?:\.d\.[cm]?ts|\.(?:test|spec)\.[cm]?[jt]sx?)$|(?:^|/)jest\.config\.cjs$")


def changed_lines(base: str) -> dict[str, set[int]]:
    result = subprocess.run(
        ["git", "diff", "--unified=0", "--diff-filter=ACMR", "--no-ext-diff", f"{base}...HEAD", "--"],
        check=True, capture_output=True, text=True,
    )
    changes: dict[str, set[int]] = {}
    path = None
    for line in result.stdout.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
            if SOURCE.search(path) and not EXCLUDED.search(path):
                changes.setdefault(path, set())
            else:
                path = None
        elif path and line.startswith("@@"):
            match = re.search(r"\+(\d+)(?:,(\d+))?", line)
            if match:
                start, count = int(match[1]), int(match[2] or 1)
                changes[path].update(range(start, start + count))
    return changes


def lcov_data(path: Path) -> tuple[dict[str, dict[int, int]], int, int, int, int]:
    files: dict[str, dict[int, int]] = {}
    current = None
    lines_found = lines_hit = branches_found = branches_hit = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.startswith("SF:"):
            current = raw[3:].removeprefix("./")
            files.setdefault(current, {})
        elif raw.startswith("DA:") and current:
            number, hits, *_ = raw[3:].split(",")
            files[current][int(number)] = int(hits)
            lines_found += 1
            lines_hit += int(int(hits) > 0)
        elif raw.startswith("BRDA:"):
            branches_found += 1
            branches_hit += int(raw[5:].split(",")[3] not in ("-", "0"))
    return files, lines_found, lines_hit, branches_found, branches_hit


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="PR base commit or ref")
    parser.add_argument("--lcov", default="coverage/lcov.info")
    parser.add_argument("--minimum", type=float, default=90.0)
    args = parser.parse_args()
    changes = changed_lines(args.base)
    if not changes or not any(changes.values()):
        print("Changed-line coverage: no coverable source lines changed; pass")
        return 0
    path = Path(args.lcov)
    if not path.is_file():
        print(f"Missing LCOV report: {path}", file=sys.stderr)
        return 1
    files, total, hit, branches, branch_hit = lcov_data(path)
    missing = sorted(name for name in changes if name not in files)
    if missing:
        print("Changed source missing from LCOV: " + ", ".join(missing), file=sys.stderr)
        return 1
    coverable = [(name, line, files[name][line]) for name, lines in changes.items() for line in lines if line in files[name]]
    uncovered = [(name, line) for name, line, hits in coverable if hits == 0]
    ratio = 100 * (len(coverable) - len(uncovered)) / len(coverable) if coverable else 100.0
    print(f"Changed-line coverage: {ratio:.1f}% ({len(coverable) - len(uncovered)}/{len(coverable)})")
    print(f"Overall line coverage: {100 * hit / total:.1f}% ({hit}/{total})" if total else "Overall line coverage: unavailable")
    print(f"Branch coverage: {100 * branch_hit / branches:.1f}% ({branch_hit}/{branches})" if branches else "Branch coverage: unavailable")
    for name, line in uncovered:
        print(f"Uncovered: {name}:{line}")
    if ratio < args.minimum:
        print(f"Changed-line coverage below {args.minimum:.0f}%", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
