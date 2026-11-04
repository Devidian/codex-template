# Branching and integration

- `main` receives the initial bootstrap and accepted PRs only.
- New work from `main` uses `feature/<description>`, `fix/<description>`, `chore/<description>`, or `docs/<description>`; use `release/<version>` only when a release branch is needed.
- Never branch again from an existing development branch unless explicitly requested. Never switch branches with uncommitted work silently. Do not create agent-specific branches or worktrees without authorization.
- PRs target `main`; the title is a Conventional Commit suitable for the final squash commit. Squash merge only after CI and explicit human acceptance. Delete completed branches when appropriate.
- `main` is protected by a repository ruleset requiring PRs, linear history, resolved conversations, and the `acceptance` check. Verify settings in GitHub before relying on them.
