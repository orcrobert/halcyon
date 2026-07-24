# Coding conventions

Applies to all contributors, human and agent. The overriding rule is: **match the
file you are editing.** These are the defaults when there is no local precedent.

---

## Universal

- **No comments in code.** Anywhere, any language. Explanation belongs in PR
  descriptions and in `.claude/docs/`. The only exception is the existing
  domain-citation comments in `mixer/` (DSP references) — leave them, don't add
  new ones.
- Small, pure, named functions over large procedural blocks.
- No dead code. If you replace something, delete the old path.
- Keep secrets out of source. Config comes from `.env` / Laravel config.

---

## Python (`ai/`, `mixer/`, `scripts/`, `pan_model/`)

- Target **3.11**. Use modern typing (`X | None`, `list[dict]`).
- Type-hint public functions. Private helpers prefixed `_`.
- `snake_case` for functions/variables, `UPPER_CASE` module constants (the mixer
  keeps every DSP tuning constant at module level — follow that pattern).
- Prefer NumPy vectorization over Python loops in DSP paths.
- **Graceful degradation**: mixer effects must work when `librosa` is absent
  (there is a NumPy fallback in `auto_eq`, `volume`, `spatial`). Preserve it.
- FastAPI: validation via Pydantic models; raise `HTTPException` with the right
  status (422 for bad decomposition input, 5xx for upstream failures).
- Tests with `pytest`. New DSP behaviour should ship with a regression test.

## PHP (`backend/`)

- Laravel 12 / PHP 8.2 conventions; PSR-12 formatting.
- Controllers stay thin: validate → delegate → return a Resource. Business logic
  in jobs/services/models, not controllers.
- Validate every request with `$request->validate([...])`.
- Shape all API responses through `Http/Resources` — never return raw models.
- **Authorize ownership** on every atmosphere/element action
  (`authorizeOwnership` / `abort_unless`).
- Long-running or external work goes through queued jobs, not request handlers.
- Migrations: one concern per file, **unique timestamps** (a past batch reused a
  timestamp — don't repeat that).

## TypeScript / React (`frontend/`)

- Functional components + hooks only. No class components.
- `type`-only imports (`import type { ... }`) for types.
- Audio/graph and side-effectful logic live in `hooks/`; components stay
  presentational. `useAudioEngine.ts` is the imperative audio boundary.
- `types/index.ts` mirrors the Laravel resource shapes — update it in the same
  change as any backend contract change.
- Keep magic audio constants named and centralized rather than scattered
  (current code has duplicated literals like the `* 0.5` gain scale — new code
  should not add more).
- Lint clean: `npm run lint` before pushing.

---

## Commit & PR conventions

See [git-workflow.md](git-workflow.md). In short: branch per change, logical
commits, imperative subjects, **no author name / no AI attribution / no
co-author trailer**, PR body describes what and why for a reviewer.
