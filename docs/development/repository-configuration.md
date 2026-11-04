# GitHub repository configuration

The versioned tool compares GitHub settings with `.github/repository-config/repository.json`, `.git-rulesets.json`, and `.github/repository-config/release-tags-ruleset.json`. It uses `gh api` and the existing GitHub CLI login. It never changes visibility, secrets, branches, releases, or unrelated rulesets.

## Prerequisites and target

Use Node.js 24, Corepack, Yarn 4, and GitHub CLI. Run `gh auth login` separately if needed; the tool never asks for or stores a token. Install dependencies with `corepack yarn install --immutable`. `yarn repo:configure` works after Corepack is enabled; `corepack yarn repo:configure` is equivalent without a global Yarn shim. By default, `gh repo view --json nameWithOwner` selects the current repository. Use `--repo OWNER/REPO` to select another repository explicitly. The plan displays the resolved target before approval. Admin permission is needed to apply settings; read-only inspection can still report drift without it.

For a repository created from this template, first set its GitHub remote and authenticate, then run:

```bash
corepack yarn repo:configure --repo YOUR-OWNER/YOUR-REPO --dry-run
corepack yarn repo:configure --repo YOUR-OWNER/YOUR-REPO --check
```

The tool detects whether the target is itself marked as a template. Generated repositories do not inherit the source repository's settings, so inspect each new target.

## Commands and exit codes

| Command | Behavior |
| --- | --- |
| `yarn repo:configure` | Show plan, then require typing the exact repository name before applying. |
| `--dry-run` | Show plan; never mutate. |
| `--check` | Return 0 if compliant, 1 for drift or unresolved settings, 2 for API/auth/permission errors. |
| `--apply` | Show plan and require exact repository name before applying. |
| `--repo OWNER/REPO` | Set target explicitly. |
| `--json` | Emit one JSON object; no human progress or prompt on stdout. Without `--apply`, it is read-only. |
| `--apply --yes --repo OWNER/REPO` | Noninteractive confirmation for one explicitly named target and the displayed versioned plan. Use only after a human approves that plan; `--yes` is rejected without both flags. |

`--dry-run` exits 0 even with drift, while `--check` exits 1. A canceled interactive application exits 1. A failed mutation reports completed steps and exits 2. JSON mode with `--apply` requires the scoped `--yes` form.

## Managed settings

- Repository: squash-only merging, automatic merged-branch deletion, no auto-merge, PR title as squash title, Issues on, Wiki off. `has_discussions` may be added to `repository.json` to manage Discussions; absent means preserve the existing choice. Visibility is always preserved.
- Actions: default `GITHUB_TOKEN` permissions read-only and workflow PR approvals disabled. Release workflows request their required write permission explicitly; PR CI uses read permissions.
- Private fork PRs: workflows may run only with read tokens, no secrets or variables, and required approval. Public repositories skip this private-only endpoint.
- Main ruleset: PRs, squash-only integration, linear history, deletion and force-update protection, resolved conversations, and the `acceptance` check.
- Release tag ruleset: `refs/tags/v*` cannot be deleted or rewritten. New tag creation remains permitted for the approved manual release workflows. No bypass actors are configured.

The tool identifies rulesets by name, checks target type, reads their full configuration, and compares managed fields without API metadata or rule ordering. Existing extra rule parameters are preserved. Duplicate names or mismatched targets need manual review. It does not delete unrelated rulesets. A newly required `acceptance` check is warned about until a successful hosted run exists.

## Example dry-run

```text
Repository: Devidian/codex-template (template)
[CHANGE] Repository settings
  squash_merge_commit_title: "COMMIT_OR_PR_TITLE" -> "PR_TITLE"
[CHANGE] Actions default permissions
  can_approve_pull_request_reviews: true -> false
  default_workflow_permissions: "write" -> "read"
[MISSING] Protect release tags — immutable
  {"name":"Protect release tags — immutable","target":"tag", ...}
[WARNING] acceptance status could not be verified yet
Summary: 3 changes, 1 notice
```

The ruleset JSON line is shortened here. The example reflects the initial local read-only inspection; actual settings may differ later.

## Permissions, limitations, and recovery

The tool reads `GET /repos/{owner}/{repo}`, Actions workflow and private-fork settings, commit check runs, and repository rulesets. After confirmation it may call `PATCH /repos/{owner}/{repo}`, `PUT` on Actions settings, or `POST`/`PUT` on rulesets. GitHub plan and organization policy can deny some endpoints. A denied or unsupported setting is reported; the tool does not silently substitute weaker protection. Check your account's repository admin rights, organization policy, and plan if a setting is unavailable. See [GitHub's ruleset availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) and [Actions permissions API](https://docs.github.com/en/rest/actions/permissions).

Changes are separate GitHub API calls and cannot be rolled back atomically. If one fails, note the reported completed steps, rerun `--dry-run`, fix the API or plan limitation, and apply only the remaining approved drift. Do not delete or recreate rulesets to recover. If tag creation fails after enabling the tag ruleset, inspect the release workflow's `contents: write` token and repository policy; keep deletion and rewrite protection intact.
