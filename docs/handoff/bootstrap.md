# Bootstrap handoff

## State

- Project-neutral Codex roles, skills, docs, CI, manual stable/RC release workflows, and an approval-gated GitHub configuration tool are present.
- Tooling uses Node.js 24, Yarn 4, TypeScript, typia, and Jest. The private package version is `0.0.0`; no application version has been selected.
- GitHub repository already has squash merge only, automatic branch deletion, and an active `main` ruleset requiring the `acceptance` status. The remote repository has no default branch until the initial commit is pushed.

## Remaining

- After the first push, verify the remote `main` branch and hosted `acceptance` run.
- Run `corepack yarn repo:configure --dry-run` and obtain explicit approval before applying GitHub setting changes.
- Extend the existing Yarn scripts, LCOV output, and `dist/` package contract when the product is defined.
- Enable private vulnerability reporting or secret scanning if available in repository settings.

## Risks

- Hosted CI and release workflows cannot be demonstrated before the initial push; local validation includes Yarn install, typecheck, lint, build, Jest coverage, audit, workflow syntax, and the diff-coverage gate.
- GitHub settings still show read/write workflow defaults and lack the release tag ruleset; the tool has inspected them but has not applied changes.
- Release publication creates a tag before GitHub Release creation. If publication fails after tag push, investigate and finish the existing tag rather than replace it.
