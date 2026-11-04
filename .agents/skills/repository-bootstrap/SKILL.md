---
name: repository-bootstrap
description: Use when setting up or checking GitHub settings for a repository created from this template.
---

Read `docs/development/repository-configuration.md`. Run `corepack yarn repo:configure --check` or `--dry-run` first, select the intended `OWNER/REPO`, and present the exact change plan and any unsupported settings. Obtain explicit user approval before applying remote changes. After approval, use the interactive confirmation or the documented scoped `--apply --yes --repo OWNER/REPO` form. Re-read the repository and report verification and manual follow-up. Never configure a repository merely because it was opened.
