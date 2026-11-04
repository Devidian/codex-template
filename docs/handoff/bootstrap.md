# Bootstrap handoff

## State

- Project-neutral Codex roles, skills, docs, CI, and manual stable/RC release workflows are present.
- No application package or version has been selected; application-specific checks activate when `package.json` is added.
- GitHub repository already has squash merge only, automatic branch deletion, and an active `main` ruleset requiring the `acceptance` status. The remote repository has no default branch until the initial commit is pushed.

## Remaining

- Push the initial commit when authorized, then verify the remote `main` branch and first hosted `acceptance` run.
- Add an application manifest, lockfile, scripts, LCOV output, and `dist/` package contract when the product is defined.
- Enable private vulnerability reporting or secret scanning if available in repository settings.

## Risks

- Hosted CI and release workflows cannot be demonstrated before the initial push; local validation covers syntax and scripts only.
- Release publication creates a tag before GitHub Release creation. If publication fails after tag push, investigate and finish the existing tag rather than replace it.
