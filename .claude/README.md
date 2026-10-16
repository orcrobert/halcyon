# `.claude/`

Shared agent tooling for this repository, committed so every contributor and
every Claude Code session starts from the same context. Local, machine-specific
overrides go in `settings.local.json` (gitignored).

| Path | Purpose |
|------|---------|
| `settings.json` | Shared Claude Code permissions, hooks, and attribution off |
| `hooks/guard.py` | Blocks edits to secrets, `data/`, build output and generated files |
| `hooks/no_comments.py` | Rejects newly added code comments |
| `hooks/lint.py` | Runs ruff or eslint on each edited file |
| `rules/` | Per-area rules (`api`, `frontend`, `mixer`, `generators`, `release`), loaded by path |
| `docs/architecture.md` | Definitive system architecture and data flow |
| `docs/conventions.md` | Coding standards per language |
| `docs/design-tokens.md` | Frontend colour and type tokens |
| `docs/git-workflow.md` | Branch / commit / PR policy (no attribution) |
| `plans/` | Approved plans with open work packages |
| `AUDIT.md` | Known issues and the prioritized cleanup backlog |
| `skills/feature-workflow/` | Branch → commits → checks → PR |
| `skills/run-stack/` | Bring up the stack in Docker or for local development |

Start at the repo-root [AGENTS.md](../AGENTS.md) (agents; `CLAUDE.md` imports it) or
[MANUAL.md](../MANUAL.md) (humans).
