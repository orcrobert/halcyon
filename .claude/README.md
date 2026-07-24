# `.claude/`

Shared AI-agent tooling for this repository, committed so every contributor and
every Claude Code session starts from the same context. Local, machine-specific
overrides go in `settings.local.json` (gitignored).

| Path | Purpose |
|------|---------|
| `settings.json` | Shared Claude Code permissions for common dev commands |
| `docs/architecture.md` | Definitive system architecture and data flow |
| `docs/conventions.md` | Coding standards per language |
| `docs/git-workflow.md` | Branch / commit / PR policy (no attribution) |
| `AUDIT.md` | Known issues and the prioritized cleanup backlog |
| `skills/feature-workflow/` | Automates the branch→commit→PR flow |
| `skills/run-stack/` | Bring up the full stack locally |
| `skills/mixer/` | Safely change the mixer DSP core |

Start at the repo-root [CLAUDE.md](../CLAUDE.md) (agents) or
[MANUAL.md](../MANUAL.md) (humans).
