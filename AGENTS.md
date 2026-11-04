# Repository instructions

This is a project-neutral Codex development template for future TypeScript/Node.js projects. Keep the template lean; application choices belong to the adopting project.

## Non-negotiable rules

- Never create a new branch while already on a non-main development branch unless explicitly requested.
- Never merge a feature without explicit human acceptance.
- Never modify the project version outside explicit release preparation.
- Never publish a stable release without explicit authorization.
- Never bypass required CI checks or branch protection.

## Work

Use `main` only for initial bootstrap and accepted integration. Start one `feature/`, `fix/`, `chore/`, or `docs/` branch from `main` for new work. Keep implementation, tests, docs, and acceptance fixes on that branch. Preserve unrelated changes. Prefer small, scoped diffs and Conventional Commits. Squash merge through a PR; the PR title becomes the squash commit title.

The main session coordinates. Delegate only bounded, useful tasks, avoid simultaneous edits to the same files, and keep agents on the current branch. Do not create worktrees without authorization. Consult relevant `.agents/skills/` workflows and `docs/development/` policies. Keep active plans in `docs/roadmap/active/`; archive only after acceptance.

Run targeted checks during development. Before acceptance, run full Yarn install, typecheck, lint, build, tests, vulnerability audit, and at least 90% changed executable line coverage. CI enforces these gates for ready PRs. Future applications must extend the commands and LCOV output. Report test evidence, uncovered paths, and risks. No meaningless coverage tests.

Use Node.js 24 and Yarn 4 (`corepack yarn`) for this repository. Before proposing GitHub settings changes, run `yarn repo:configure --check` or `--dry-run`, show the plan, request explicit approval, apply only approved changes, and verify. Never run remote configuration changes merely because the repository was opened. See `docs/development/repository-configuration.md`.

Use SemVer and `CHANGELOG.md`. Release preparation alone may update version metadata. Stable releases require an approved `main` commit; RCs may come from development branches and must remain prereleases. Never overwrite tags. Keep docs aligned with behavior and record substantial architectural decisions in `docs/decisions/`. Never commit credentials, bypass protection, or perform external repository mutations without approval.
