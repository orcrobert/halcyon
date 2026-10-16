---
paths:
  - ".github/**"
  - "Dockerfile"
  - "compose.yaml"
  - "compose.build.yaml"
  - ".dockerignore"
  - "pyproject.toml"
  - "mixer/pyproject.toml"
---

# CI, release and packaging rules

- **CI** (`.github/workflows/ci.yml`) runs on pushes to `main` only, cancelling
  superseded runs: ruff + pytest, the generator core tests, frontend lint /
  typecheck / vitest / build, and an image job that boots the container
  read-only and runs `.github/scripts/mix_smoke.py` inside it.
- **CodeQL** runs as GitHub's default setup (repository settings), scanning
  Python, TypeScript and the workflows. Do not add a `codeql.yml` workflow: an
  advanced setup conflicts with the default one.
- **Release** (`.github/workflows/release.yml`) runs after CI succeeds on
  `main`. `.github/scripts/next_version.py` derives the next semver from commit
  subjects since the last `v*` tag: `feat!:` or `BREAKING CHANGE:` → major,
  `feat:` → minor, `fix:` → patch, anything else → no release. It then tags the
  commit, pushes `ghcr.io/orcrobert/halcyon` for both Docker targets (`runtime`,
  and `runtime-cli` with a `-cli` suffix) for amd64 + arm64, and attaches the
  `halcyon-mixer` wheel and sdist to a GitHub release.
- **Versions live in tags only.** The release stamps `version` into
  `mixer/pyproject.toml` at build time. Never bump it by hand.
- **Actions are pinned to full commit SHAs** and base images to digests.
  Dependabot (`.github/dependabot.yml`) keeps both current. A new action goes in
  pinned the same way; resolve the SHA with
  `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
- **Dependabot prefixes:** runtime npm and base-image bumps are `fix:` so they
  ship a patch release; dev-dependency and action bumps are `chore:`.
- **The image installs non-editable**, so `DATA_DIR`, `FRONTEND_DIST` and
  `GENERATORS_DIR` are absolute paths set in the Dockerfile. `.dockerignore` is
  an allowlist: a new top-level path the image needs must be added there.
- **`compose.yaml` is what self-hosters copy.** It runs
  `ghcr.io/orcrobert/halcyon:${HALCYON_TAG}`, reads an optional `.env`, and
  must work as the only file in an empty folder: no `build:`, no paths into the
  repo. It pins `DATA_DIR`, `FRONTEND_DIST` and `GENERATORS_DIR` over the
  `.env`. Local builds go in `compose.build.yaml`, layered on top with `-f`.
- **`/tmp` must be writable at runtime.** librosa's numba helpers need a cache
  (`NUMBA_CACHE_DIR=/tmp/numba-cache`); the CI image job proves it under
  `--read-only --tmpfs /tmp`.
