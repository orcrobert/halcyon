# Git workflow

The process for every change in this repository. Agents must follow it exactly;
the [`feature-workflow`](../skills/feature-workflow/SKILL.md) skill automates it.

---

## Principles

- `main` is always releasable. Never commit to it directly.
- One branch per unit of work. One logical change per commit.
- Commits and PRs read as if written by a human engineer. **No "Claude", "AI",
  "Anthropic", "generated with", or `Co-Authored-By` trailers. Ever.**

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
- Subject: **`<type>: <imperative summary>`**, ~50 chars total, no trailing
  period, lowercase type, capitalised summary
  (`feat: Add scene-aware volume weighting`).
- Optional body: wrap at ~72 chars; explain *why*, not *what* the diff already
  shows.
- **No attribution of any kind.** Do not pass `--author`, do not add
  `Co-Authored-By`, do not mention AI tooling.

```bash
git add <paths>
git commit -m "feat: Add spatial separation minimum for overlapping elements"
```

#### Commit types

The same set as the branch prefixes, so a branch and its commits agree:

| Type       | Use for |
|------------|---------|
| `feat`     | new user-facing capability |
| `fix`      | bug fix |
| `chore`    | tooling, config, deps, housekeeping |
| `refactor` | behaviour-preserving restructuring |
| `docs`     | documentation only |
| `test`     | tests only |

A branch usually carries more than one type — a `feat/` branch that also fixes a
bug it uncovered should say `fix:` on that commit. Pick the type for the commit,
not the branch.

Scopes (`feat(mixer): …`) are not used. The subject says what changed.

Commit types set the version. After a merge to `main` passes CI, the `Release`
workflow bumps the minor for any `feat:`, the patch for any `fix:`, and the
major for `feat!:` or a `BREAKING CHANGE:` footer, then tags and publishes. A
merge carrying only `chore`/`docs`/`refactor`/`test` does not release. Choose
the type honestly — it is what users see as a version number. See
[SELF_HOSTING.md](../../SELF_HOSTING.md#releases).

### 3. Push and open the PR when done and verified

Only after the work is complete and you've run the checks for what you touched
(the commands table in [`AGENTS.md`](../../AGENTS.md#commands)).

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

The PR body is reviewer-facing. Describe the change and its rationale. **No AI
mentions, no tooling attribution.**

---

## Do / don't

- ✅ Rebase or pull `main` before opening the PR if it has moved.
- ✅ Keep unrelated changes out of your commits — stage only the paths you
  intend to ship.
- ✅ Delete the branch after merge.
- ❌ Never `git push --force` to `main` or shared branches.
- ❌ Never skip hooks with `--no-verify`.
- ❌ Never commit `.env`, keys, `output/`, build artifacts, or `audiocraft/`.
- ❌ Never bypass this flow "just this once".
