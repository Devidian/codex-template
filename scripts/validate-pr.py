#!/usr/bin/env python3
"""Validate Conventional Commit titles used as squash commit messages."""

import re
import sys

PATTERN = re.compile(r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: [^\s].*$")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-pr.py '<PR title>'", file=sys.stderr)
        return 2
    if not PATTERN.fullmatch(sys.argv[1]):
        print("PR title must be a Conventional Commit, e.g. feat(api): add endpoint", file=sys.stderr)
        return 1
    print("PR title valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
