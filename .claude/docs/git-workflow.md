# Git workflow

The process for every change in this repository. Agents must follow it exactly;
the [`feature-workflow`](../skills/feature-workflow/SKILL.md) skill automates it.

---

## Principles

- `main` is always releasable. Never commit to it directly.
- One branch per unit of work. One logical change per commit.
- Every merge to `main` that carries a `feat` or `fix` commit ships a release,
  so a commit type is a promise to users, not a label.

---

## Steps

### 1. Branch from an up-to-date `main`

```bash
git checkout main
git pull --ff-only
git checkout -b <type>/<short-kebab-description>
```

Branch `<type>` prefixes:

| Prefix     | Use for |
|------------|---------|
| `feat/`    | new user-facing capability |
| `fix/`     | bug fix |
| `chore/`   | tooling, config, deps, housekeeping |
| `refactor/`| behaviour-preserving restructuring |
| `docs/`    | documentation only |
| `test/`    | tests only |

Examples: `feat/binaural-presets`, `fix/muted-sliders`, `refactor/mixer-core`.

### 2. Commit logically

- Group changes so each commit is coherent and independently reviewable.
- Subject: **`<type>: <Imperative summary>`**, ~50 chars total, no trailing
  period, lowercase type, capitalised summary
  (`feat: Add scene-aware volume weighting`).
- Optional body: wrap at ~72 chars; explain *why*, not *what* the diff already
  shows.
- Do not pass `--author`; commits carry the configured git identity.

```bash
git add <paths>
git commit -m "feat: Add spatial separation minimum for overlapping elements"
```

#### Commit types

The same set as the branch prefixes, so a branch and its commits agree:

| Type       | Use for | Release |
|------------|---------|---------|
| `feat`     | new user-facing capability | minor (`X.Y.Z` → `X.Y+1.0`) |
| `fix`      | bug fix | patch (`X.Y.Z` → `X.Y.Z+1`) |
| `chore`    | tooling, config, deps, housekeeping | none |
| `refactor` | behaviour-preserving restructuring | none |
| `docs`     | documentation only | none |
| `test`     | tests only | none |

A branch usually carries more than one type — a `feat/` branch that also fixes a
bug it uncovered should say `fix:` on that commit. Pick the type for the commit,
not the branch.

Scopes (`feat(mixer): …`) are not used. The subject says what changed, and the
release script only recognises the bare `feat:` / `fix:` form, so a scoped
subject releases nothing.

#### Breaking changes

A `!` after any type (`feat!:`, `fix!:`, `refactor!:`) or a line starting
`BREAKING CHANGE:` in the body bumps the major version (`X.Y.Z` → `X+1.0.0`). Use
it when a self-hoster must act on upgrade: a removed or renamed environment
variable, a changed generator contract, a data change that cannot be rolled
back. Explain what to do in the commit body; it ends up in the release notes.
Automatic updates in the app never cross a major version.

#### How a merge becomes a version

After a merge to `main` passes CI, the `Release` workflow runs
`.github/scripts/next_version.py`. It reads the full message of every commit
since the newest `v*.*.*` tag reachable from `main` and takes the largest bump
it finds. PRs are merged with merge commits, so every commit on the branch
counts. If a PR is ever squashed, the squashed subject (the PR title by default)
is the only one that counts.

The workflow then tags the merge commit `vX.Y.Z`, pushes the images and creates
the GitHub release. Never create or push `v*` tags yourself: a hand-made tag
becomes the base for the next bump and publishes nothing. What a tag publishes
is in [SELF_HOSTING.md](../../SELF_HOSTING.md#versions-tags-and-releases).

### 3. Push and open the PR when done and verified

Only after the work is complete and you've run the checks for what you touched
(the commands table in [`AGENTS.md`](../../AGENTS.md#commands)). Pull requests do
not run CI; `main` does, after the merge.

```bash
git push -u origin <branch>
gh pr create --base main \
  --title "<type>: <what the branch delivers>" \
  --body "$(cat <<'EOF'
## What
<what changed, at a glance>

## Why
<the motivation / the problem being solved>

## Notes
<risks, follow-ups, how it was verified — optional>
EOF
)"
```

The PR body is reviewer-facing. Describe the change and its rationale.

---

## Do / don't

- ✅ Rebase or pull `main` before opening the PR if it has moved.
- ✅ Keep unrelated changes out of your commits — stage only the paths you
  intend to ship.
- ✅ Update the document that owns a behaviour in the same PR that changes it.
- ✅ Delete the branch after merge.
- ❌ Never `git push --force` to `main` or shared branches.
- ❌ Never skip hooks with `--no-verify`.
- ❌ Never commit `.env`, keys, `output/`, build artifacts, or `audiocraft/`.
- ❌ Never create, move or delete `v*` tags by hand.
- ❌ Never bypass this flow "just this once".
