# Testing and acceptance

During development, use targeted tests, type checking, linting, and critical-path checks. Ready PRs require `corepack yarn install --immutable`, `typecheck`, `lint`, `build`, `test:coverage`, and `corepack yarn npm audit --severity high`. The committed `yarn.lock` is required. Tests must verify behavior and failure cases.

The project must emit `coverage/lcov.info` from `test:coverage`. CI compares executable changed lines against the PR base with `scripts/check-coverage.py` and fails below 90%. Files under test paths, generated code, declarations, and the Jest runner configuration are excluded; review exclusions when the application is added. The report prints changed-line, overall line, and branch coverage, plus uncovered changed lines. With no coverable changed lines, the check passes explicitly. Never omit difficult source paths to inflate coverage.

The template's configuration tool is tested with Jest and typia. Future applications extend the same commands. A missing LCOV report fails CI when coverable TypeScript or JavaScript changed. Configure branch protection to require the `acceptance` job; the existing repository ruleset already names it.
