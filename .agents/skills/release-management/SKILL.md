---
name: release-management
description: Use for an explicitly requested stable release or release candidate preparation and publication.
---

Read `docs/development/releasing.md`. Determine SemVer from actual changes, verify changelog and version metadata, source commit, CI, and artifact checksums. Never update version during ordinary feature work. Stable tags originate from approved `main`; RC tags may originate from a development branch and remain prereleases. Never replace a tag. Publish stable only with explicit user authorization.
