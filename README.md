# Codex development template

Project-neutral repository infrastructure for Codex-assisted TypeScript/Node.js development. It provides local agent roles and skills, branch and acceptance rules, CI gates, manual stable/RC release workflows, and a GitHub repository configuration tool. Tooling uses Node.js 24 and Yarn 4; no application framework is selected.

## Start a project

1. Define the product and scope in `docs/roadmap/roadmap.md` and an active phase.
2. Use the committed `package.json` and `yarn.lock`. Add application scripts to the existing `typecheck`, `lint`, `build`, `test:coverage`, and `pack:release` commands. `test:coverage` must produce `coverage/lcov.info`; `pack:release` must place distributable files in `dist/`.
3. Open a PR to `main`. Ready PRs run the full `acceptance` check; draft PRs can remain in progress. The CI check fails if an application has a manifest but misses this contract.
4. Request human acceptance after the PR is green. Squash merge only after approval.

See [contributing](CONTRIBUTING.md), [branching](docs/development/branching.md), [testing](docs/development/testing.md), and [releasing](docs/development/releasing.md). The repository's [agent rules](AGENTS.md) govern Codex work.

Run `corepack yarn install`, then `corepack yarn repo:configure --check` or `--dry-run` to inspect GitHub settings. See [repository configuration](docs/development/repository-configuration.md) before applying remote changes. The template contains tooling code but no application code.
