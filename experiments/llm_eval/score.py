import json
import re
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent

RUNS_DIR = HERE / "runs"
OUT_DIR = HERE
PROMPTS_FILE = HERE / "prompts.json"

MANUAL_SCORING_PROMPTS = ["p02", "p05", "p11", "p15", "p19"]
MODELS = ["mistral", "llama3.1", "gemini-flash"]
ELEMENT_COUNT_MIN = 5
ELEMENT_COUNT_MAX = 10


def load_runs(model: str) -> list[dict]:
    model_dir = RUNS_DIR / model
    if not model_dir.exists():
        return []
    runs = []
    for f in sorted(model_dir.glob("*.json")):
        try:
            runs.append(json.loads(f.read_text()))
        except Exception:
            pass
    return runs


def check_schema(parsed: dict | None) -> bool:
    if not isinstance(parsed, dict):
        return False
    if "elements" not in parsed or not isinstance(parsed["elements"], list):
        return False
    if len(parsed["elements"]) == 0:
        return False
    required_fields = {"label", "type", "prompt"}
    for el in parsed["elements"]:
        if not isinstance(el, dict):
            return False
        if not required_fields.issubset(el.keys()):
            return False
        if el.get("type") not in ("sound", "music"):
            return False
        if not isinstance(el.get("prompt"), str):
            return False
    return True


def compute_metrics_for_model(model: str, embed_fn) -> dict:
    runs = load_runs(model)
    if not runs:
        return {}

    schema_valid = []
    element_counts = []
    in_range = []
    latencies = []
    diversity_scores = []
    relevance_scores = []

    for run in runs:
        parsed = run.get("parsed")
        valid = check_schema(parsed)
        schema_valid.append(int(valid))

        if run.get("latency_ms") is not None:
            latencies.append(run["latency_ms"])

        if valid:
            elements = parsed["elements"]
            count = len(elements)
            element_counts.append(count)
            in_range.append(int(ELEMENT_COUNT_MIN <= count <= ELEMENT_COUNT_MAX))

            scene_prompt = run.get("prompt_text", "")
            def _to_str(p):
                if isinstance(p, list):
                    return ", ".join(str(x) for x in p)
                return str(p)
            element_prompts = [_to_str(el.get("prompt", "")) for el in elements if el.get("prompt")]

            if len(element_prompts) >= 2:
                el_embeddings = embed_fn(element_prompts)
                pairwise = []
                for i in range(len(el_embeddings)):
                    for j in range(i + 1, len(el_embeddings)):
                        a, b = el_embeddings[i], el_embeddings[j]
                        cos = _cosine(a, b)
                        pairwise.append(1.0 - cos)
                if pairwise:
                    diversity_scores.append(statistics.mean(pairwise))

            if scene_prompt and element_prompts:
                scene_emb = embed_fn([scene_prompt])[0]
                sims = [_cosine(scene_emb, embed_fn([ep])[0]) for ep in element_prompts]
                relevance_scores.append(statistics.mean(sims))

    def _safe_mean(lst):
        return round(statistics.mean(lst), 4) if lst else None

    def _safe_std(lst):
        return round(statistics.stdev(lst), 4) if len(lst) > 1 else 0.0

    return {
        "model": model,
        "n_runs": len(runs),
        "schema_validity_rate": _safe_mean(schema_valid),
        "in_range_rate": _safe_mean(in_range) if in_range else None,
        "element_count_mean": _safe_mean(element_counts),
        "element_count_std": _safe_std(element_counts),
        "diversity_mean": _safe_mean(diversity_scores),
        "diversity_std": _safe_std(diversity_scores),
        "relevance_mean": _safe_mean(relevance_scores),
        "relevance_std": _safe_std(relevance_scores),
        "latency_mean_ms": round(statistics.mean(latencies)) if latencies else None,
    }


def _cosine(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def build_embed_fn():
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Loaded sentence-transformers for embedding metrics.")

        def embed(texts: list[str]) -> list[list[float]]:
            arr = model.encode(texts, convert_to_numpy=True)
            if arr.ndim == 1:
                return [arr.tolist()]
            return arr.tolist()

        return embed
    except ImportError:
        print("WARNING: sentence-transformers not installed. Diversity/relevance metrics will be skipped.")
        print("  pip install sentence-transformers")

        def embed(texts):
            return [[0.0] * 384 for _ in texts]

        return embed


def write_csv(results: list[dict]):
    if not results:
        return
    fields = list(results[0].keys())
    lines = [",".join(fields)]
    for r in results:
        lines.append(",".join(str(r.get(f, "")) for f in fields))
    (OUT_DIR / "results.csv").write_text("\n".join(lines))
    print("Wrote results.csv")


def write_md(results: list[dict]):
    lines = ["# LLM Evaluation Results\n"]
    lines.append("## Automated Metrics\n")

    headers = [
        "Model", "n_runs", "Schema Valid %", "In-Range %",
        "Elem Count (mean±std)", "Diversity (mean)", "Relevance (mean)", "Latency (ms)"
    ]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---"] * len(headers)) + "|")

    for r in results:
        schema_pct = f"{r['schema_validity_rate']*100:.1f}%" if r.get("schema_validity_rate") is not None else "—"
        in_range_pct = f"{r['in_range_rate']*100:.1f}%" if r.get("in_range_rate") is not None else "—"
        count = f"{r['element_count_mean']:.1f}±{r['element_count_std']:.1f}" if r.get("element_count_mean") is not None else "—"
        div = f"{r['diversity_mean']:.3f}" if r.get("diversity_mean") is not None else "—"
        rel = f"{r['relevance_mean']:.3f}" if r.get("relevance_mean") is not None else "—"
        lat = f"{r['latency_mean_ms']}" if r.get("latency_mean_ms") is not None else "—"
        lines.append(f"| {r['model']} | {r['n_runs']} | {schema_pct} | {in_range_pct} | {count} | {div} | {rel} | {lat} |")

    lines.append("\n### Metric Definitions\n")
    lines.append("- **Schema Valid %** — percentage of runs that returned parseable JSON with correct fields and valid `type` values (\"sound\"/\"music\")")
    lines.append("- **In-Range %** — percentage of valid runs where element count is 5–10 (per decomposer rules)")
    lines.append("- **Elem Count** — mean ± std of elements per scene (across valid runs)")
    lines.append("- **Diversity** — mean pairwise cosine *distance* (1−similarity) between element prompts within a scene, using sentence-transformers `all-MiniLM-L6-v2`. Higher = less overlap between elements.")
    lines.append("- **Relevance** — mean cosine similarity between the scene prompt and each element prompt. Higher = elements stay on topic.")
    lines.append("- **Latency** — mean wall-clock ms per request (includes model loading time for Ollama)")

    lines.append("\n\n## Manual Scoring\n")
    lines.append("See [manual_scoring.md](manual_scoring.md) for sub-sample scores.\n")

    (OUT_DIR / "results.md").write_text("\n".join(lines))
    print("Wrote results.md")


def write_manual_scoring(results_by_model: dict[str, list[dict]]):
    prompts = json.loads(PROMPTS_FILE.read_text())
    prompt_map = {p["id"]: p for p in prompts}

    lines = ["# Manual Scoring — LLM Decomposition Quality\n"]
    lines.append("Score each model's best run (run 1) for the 5 sub-sample prompts.")
    lines.append("Scale: 1 (poor) to 5 (excellent). Criterion: 'Would these elements, if generated, produce the described atmosphere?'\n")
    lines.append("| Prompt ID | Category | Mistral | Llama 3.1 | Gemini Flash | Notes |")
    lines.append("|-----------|----------|---------|-----------|--------------|-------|")
    for pid in MANUAL_SCORING_PROMPTS:
        p = prompt_map.get(pid, {})
        lines.append(f"| {pid} | {p.get('category','')} | | | | |")

    lines.append("\n---\n")

    for pid in MANUAL_SCORING_PROMPTS:
        p = prompt_map.get(pid, {})
        lines.append(f"## {pid}: {p.get('prompt','')}\n")
        for model in MODELS:
            runs = results_by_model.get(model, [])
            run1 = next((r for r in runs if r.get("prompt_id") == pid and r.get("run") == 1), None)
            lines.append(f"### {model}\n")
            if run1 and run1.get("parsed"):
                elements = run1["parsed"].get("elements", [])
                for el in elements:
                    lines.append(f"- **{el.get('label','')}** ({el.get('type','')}): {el.get('prompt','')}")
            else:
                lines.append("_No valid output_")
            lines.append("")

    (OUT_DIR / "manual_scoring.md").write_text("\n".join(lines))
    print("Wrote manual_scoring.md")


def main():
    embed_fn = build_embed_fn()

    results = []
    runs_by_model = {}
    for model in MODELS:
        runs = load_runs(model)
        runs_by_model[model] = runs
        if not runs:
            print(f"No runs found for {model} — skipping")
            continue
        print(f"Scoring {model} ({len(runs)} run files)...")
        metrics = compute_metrics_for_model(model, embed_fn)
        results.append(metrics)

    if not results:
        print("No results to score yet. Run the runner first.")
        return

    write_csv(results)
    write_md(results)
    write_manual_scoring(runs_by_model)
    print("\nAll done. Check experiments/llm_eval/")


if __name__ == "__main__":
    main()
