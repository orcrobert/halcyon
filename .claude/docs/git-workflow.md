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
- Subject: **imperative mood, ~50 chars, no trailing period**
  (`Add scene-aware volume weighting`).
- Optional body: wrap at ~72 chars; explain *why*, not *what* the diff already
  shows.
- **No attribution of any kind.** Do not pass `--author`, do not add
  `Co-Authored-By`, do not mention AI tooling.

```bash
git add <paths>
git commit -m "Add spatial separation minimum for overlapping elements"
```

### 3. Push and open the PR when done and verified

Only after the work is complete and you've run the relevant checks
(`npm run lint`, `pytest`).

```bash
git push -u origin <branch>
gh pr create --base main \
  --title "<same as the main commit subject>" \
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
- ✅ Keep unrelated changes (e.g. the working-tree `colab/` notebook edit) out of
  your commits — stage only the paths you intend to ship.
- ✅ Delete the branch after merge.
- ❌ Never `git push --force` to `main` or shared branches.
- ❌ Never commit `.env`, keys, `output/`, build artifacts, or `audiocraft/`.
- ❌ Never bypass this flow "just this once".
