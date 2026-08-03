---
name: feature-workflow
description: Standard branch → logical commits → push → PR flow for this repo. Use whenever the user asks for a feature, fix, or chore. Enforces the no-attribution commit/PR policy.
---

# Feature workflow

Use this for any change the user requests (feature, bug fix, chore, refactor,
docs, test). It encodes the mandatory Git policy in
[`.claude/docs/git-workflow.md`](../../docs/git-workflow.md).

## Steps

1. **Start from a clean `main`:**
   ```bash
   git checkout main
   git pull --ff-only
   git checkout -b <type>/<short-kebab-description>
   ```
   `<type>` ∈ `feat | fix | chore | refactor | docs | test`.
   Leave unrelated working-tree changes unstaged.

2. **Implement the change.** Follow
   [`.claude/docs/conventions.md`](../../docs/conventions.md) — most importantly:
   **no comments in code.**

3. **Commit logically.** One coherent change per commit, subject in the form
   `<type>: <imperative summary>`, no body noise. Types are the same set as the
   branch prefixes and are chosen per commit — a `feat/` branch that also fixes
   a bug it uncovered uses `fix:` on that commit. **No author flag, no
   `Co-Authored-By`, no mention of Claude / AI / Anthropic / "generated with".**
   ```bash
   git add <intended paths only>
   git commit -m "feat: <imperative summary>"
   ```

4. **Verify before pushing.** Run the checks relevant to what you touched:
   - frontend: `cd frontend && npm run lint`
   - python (api + mixer): `pytest` from the repo root

5. **Push and open the PR:**
   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "<type>: <what the branch delivers>" --body "$(cat <<'EOF'
   ## What
   <what changed>

   ## Why
   <why it was needed>

   ## Notes
   <how it was verified / risks / follow-ups>
   EOF
   )"
   ```
   Reviewer-facing prose only. **No AI attribution anywhere in the PR.**

## Guardrails

- Never commit to `main`.
- Never `git push --force` to shared branches.
- Never stage `.env`, keys, `output/`, `audiocraft/`, or build artifacts.
- If `main` moved, rebase/pull before opening the PR.
