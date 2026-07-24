# Halcyon

Turn a natural-language scene into an infinite, mixable ambient soundscape.

```
prompt → LLM decomposition → per-element audio generation → rule-based mixer → browser playback
```

You describe a place or a mood — *"a rainy Kyoto garden at dusk"*, *"cold and
lonely"*, *"a distant foghorn"* — and the system breaks it into individual audio
layers, generates each one, mixes them automatically, and plays them back as a
seamless, endlessly looping atmosphere you can re-mix live in the browser.

The core of the system is the **mixer**: it assigns EQ, level, and spatial
placement to every generated layer automatically, from audio analysis alone —
the language model never touches mixing decisions.

---

## How it works

| Stage | What happens |
|-------|--------------|
| **Decompose** | An LLM (Gemini by default) turns the prompt into typed audio elements — distinct sound and music layers, each with a generation prompt. |
| **Generate** | AudioGen (sound) and MusicGen (music) synthesize each element on a GPU host. |
| **Mix** | The `mixer` package analyzes the clips and computes per-element auto-EQ, perceptual volume, stereo pan, and reverb depth — plus seamless looping. |
| **Play** | The browser builds a live Web Audio graph: play/pause, per-track volume/EQ/pan/depth, global tuning, binaural beats, an autonomous "animate" drift, and offline WAV export. |

Ambient by design — the output stays calm, soft, and immersive.

## Tech stack

- **Frontend** — React 19 + TypeScript + Vite + Tailwind, Web Audio API
- **Backend** — Laravel 12 (PHP 8.2), Sanctum auth, queued jobs, SQLite
- **AI service** — FastAPI (Python 3.11) orchestrating decomposition, generation, and mixing
- **Mixer** — standalone Python/NumPy/librosa DSP package (the core IP)
- **Generator** — Meta's AudioCraft (AudioGen / MusicGen) on Colab, exposed via ngrok

## Quickstart

Full setup and run instructions are in **[MANUAL.md](MANUAL.md)**. In brief:

```bash
cp .env.example .env            # fill in GEMINI_API_KEY, COLAB_URL, AI_SERVICE_SECRET
python -m venv .venv && source .venv/bin/activate && pip install -e ai -e mixer
cd backend && composer install && php artisan migrate && cd ..
cd frontend && npm install && cd ..
```

Then bring up the stack (AI service, `php artisan serve`, `php artisan queue:work`,
`npm run dev`, and the Colab generator). See MANUAL.md §4.

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | React UI + browser audio engine |
| `backend/` | Laravel API, auth, persistence, job queue |
| `ai/` | FastAPI orchestration service |
| `mixer/` | Auto-EQ / volume / spatial / looping DSP package |
| `colab/` | GPU generator notebook |
| `experiments/`, `pan_model/`, `scripts/` | Thesis experiments and utilities |

## Documentation

- **[MANUAL.md](MANUAL.md)** — set up and run the whole stack
- **[CLAUDE.md](CLAUDE.md)** — guide for contributors and AI coding agents
- **[.claude/docs/architecture.md](.claude/docs/architecture.md)** — system architecture and data flow

## Contributing

Branch from `main` with a `feat/`, `fix/`, or `chore/` prefix, keep commits
logical, and open a PR. See [.claude/docs/git-workflow.md](.claude/docs/git-workflow.md).

## License

[MIT](LICENSE).
