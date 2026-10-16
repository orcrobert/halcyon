---
name: feature-workflow
description: Take a requested change from a clean main to an open pull request (branch, logical commits, checks, push, PR). Use for any feature, fix, chore, refactor, docs or test change in this repo.
---

# Feature workflow

The policy is [`.claude/docs/git-workflow.md`](../../docs/git-workflow.md). Read
it if anything below is unclear; this is only the procedure.

1. **Branch from a fresh `main`.**
   ```bash
   git checkout main && git pull --ff-only
   git checkout -b <type>/<short-kebab-description>
   ```
   Leave unrelated working-tree changes unstaged.

2. **Implement.** Read the `.claude/rules/` file for each area you touch. No
   comments in code; the `no_comments` hook rejects them.

3. **Commit logically**, one coherent change per commit, staging only the
   intended paths:
   ```bash
   git add <paths>
   git commit -m "<type>: <Imperative summary>"
   ```
   Pick the type per commit; `feat` and `fix` cut a release. No attribution.

4. **Run the checks for what you touched** (the commands table in `AGENTS.md`):
   `pytest`, `ruff check .`, `cd generators/core && pytest`,
   `cd frontend && npm run lint && npx tsc --noEmit && npm test`. Report any
   failure instead of pushing past it.

5. **Push and open the PR** with a What / Why / Notes body:
   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "<type>: <what the branch delivers>" --body "$(cat <<'BODY'
   ## What
   <what changed>

   ## Why
   <why it was needed>

   ## Notes
   <how it was verified, risks, follow-ups>
   BODY
   )"
   ```
