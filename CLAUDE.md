@AGENTS.md

## Claude Code specifics

- `.claude/rules/*.md` load automatically when you touch files under their
  `paths:`. They hold every area-specific rule; `AGENTS.md` holds the rest.
- Hooks in `.claude/hooks/` run on every edit: `guard.py` blocks writes to
  secrets, `data/`, build output and generated files; `no_comments.py` rejects
  newly added comments; `lint.py` runs ruff or eslint on the edited file. Fix
  what they report instead of working around them.
- Skills: `feature-workflow` for branch → commits → PR, `run-stack` to bring the
  stack up locally or in Docker.
- `.claude/settings.json` scopes permissions and turns off commit and PR
  attribution. Do not re-add it by hand.
