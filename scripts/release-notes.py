#!/usr/bin/env python3
"""Extract reviewed notes for one dated changelog release entry."""

import argparse
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    text = Path("CHANGELOG.md").read_text(encoding="utf-8")
    match = re.search(r"^## \[" + re.escape(args.version) + r"\] - \d{4}-\d{2}-\d{2}\s*$", text, re.M)
    if not match:
        parser.error("dated changelog entry missing")
    tail = text[match.end():]
    next_entry = re.search(r"^## \[", tail, re.M)
    notes = tail[:next_entry.start() if next_entry else None].strip()
    if not notes:
        parser.error("release notes empty")
    print(f"# v{args.version}\n\n{notes}")


if __name__ == "__main__":
    main()
