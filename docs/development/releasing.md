# Releasing

Version only during an explicit release or RC preparation. Use SemVer; start an unreleased application at `0.1.0` unless its compatibility policy warrants a different version. Maintain `CHANGELOG.md` with `Unreleased` and dated version entries. Review actual changes, then update package version and lockfile together. Use annotated immutable tags `vMAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH-rc.N`.

Stable release: obtain explicit approval; prepare and merge version/changelog changes to `main`; verify the chosen commit's CI; manually run `release.yml` with the version. The workflow checks `main`, matching package metadata and changelog, runs the application gates, packs `dist/`, computes SHA-256, creates an annotated tag, and publishes a GitHub Release. No release is triggered merely by a merge.

RC: prepare version/changelog on the source branch, then manually run `release-candidate.yml` with a source ref and RC version. It uses the same gates and publishes a prerelease without merging. Use a unique tag each time. In both cases, `pack:release` must populate `dist/` and versioned artifacts must agree with the tag. Check workflow evidence and public assets after publication.

Application owners must extend the Yarn scripts and `coverage/lcov.info` as described in [testing](testing.md). The template itself contains tooling but no application artifact.
