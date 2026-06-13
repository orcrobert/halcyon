# LLM Evaluation Results

## Automated Metrics

| Model | n_runs | Schema Valid % | In-Range % | Elem Count (mean±std) | Diversity (mean) | Relevance (mean) | Latency (ms) |
|---|---|---|---|---|---|---|---|
| mistral | 60 | 96.7% | 37.9% | 4.4±0.9 | 0.613 | 0.423 | 42687 |
| llama3.1 | 60 | 90.0% | 25.9% | 4.0±0.8 | 0.609 | 0.433 | 30484 |
| gemini-flash | 60 | 98.3% | 49.1% | 4.7±1.0 | 0.571 | 0.439 | 1953 |

### Metric Definitions

- **Schema Valid %** — percentage of runs that returned parseable JSON with correct fields and valid `type` values ("sound"/"music")
- **In-Range %** — percentage of valid runs where element count is 5–10 (per decomposer rules)
- **Elem Count** — mean ± std of elements per scene (across valid runs)
- **Diversity** — mean pairwise cosine *distance* (1−similarity) between element prompts within a scene, using sentence-transformers `all-MiniLM-L6-v2`. Higher = less overlap between elements.
- **Relevance** — mean cosine similarity between the scene prompt and each element prompt. Higher = elements stay on topic.
- **Latency** — mean wall-clock ms per request (includes model loading time for Ollama)


## Manual Scoring

See [manual_scoring.md](manual_scoring.md) for sub-sample scores.
