# Testing and acceptance

During development, use targeted tests, type checking, linting, and critical-path checks. Ready PRs require `npm ci`, `typecheck`, `lint`, `build`, `test:coverage`, and `npm audit --audit-level=high` when `package.json` exists. The committed lockfile is required. Tests must verify behavior and failure cases.

The project must emit `coverage/lcov.info` from `test:coverage`. CI compares executable changed lines against the PR base with `scripts/check-coverage.py` and fails below 90%. Files under test paths, generated code, declarations, and non-executable file types are excluded; review exclusions when the application is added. The report prints changed-line, overall line, and branch coverage, plus uncovered changed lines. With no coverable changed lines, the check passes explicitly. Never omit difficult source paths to inflate coverage.

The bare template contains no application or manifest. Its CI validates Python scripts and configuration; application gates activate as soon as `package.json` is added. A manifest with missing scripts or LCOV fails CI. Configure branch protection to require the `acceptance` job; the existing repository ruleset already names it.
