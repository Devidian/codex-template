# Codex development template

Project-neutral repository infrastructure for Codex-assisted TypeScript/Node.js development. It provides local agent roles and skills, branch and acceptance rules, CI gates, and manual stable/RC release workflows. No application framework or package manager has been selected beyond the Node/npm contract used by CI when an application is added.

## Start a project

1. Define the product and scope in `docs/roadmap/roadmap.md` and an active phase.
2. Add `package.json` and a committed `package-lock.json`. Provide `typecheck`, `lint`, `build`, `test:coverage`, and `pack:release` scripts. `test:coverage` must produce `coverage/lcov.info`; `pack:release` must place distributable files in `dist/`.
3. Open a PR to `main`. Ready PRs run the full `acceptance` check; draft PRs can remain in progress. The CI check fails if an application has a manifest but misses this contract.
4. Request human acceptance after the PR is green. Squash merge only after approval.

See [contributing](CONTRIBUTING.md), [branching](docs/development/branching.md), [testing](docs/development/testing.md), and [releasing](docs/development/releasing.md). The repository's [agent rules](AGENTS.md) govern Codex work.

The initial template has no executable application code, so the bootstrap CI validates repository scripts and configuration; application checks activate once `package.json` exists.
