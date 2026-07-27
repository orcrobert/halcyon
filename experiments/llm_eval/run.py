import argparse
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

load_dotenv(ROOT / ".env")

PROMPTS_FILE = HERE / "prompts.json"
RUNS_DIR = HERE / "runs"
SYSTEM_PROMPT_FILE = ROOT / "api/prompts/decomposer.txt"

MODELS = ["mistral", "llama3.1", "gemini-flash"]


def load_system_prompt() -> str:
    return SYSTEM_PROMPT_FILE.read_text()


def load_prompts() -> list[dict]:
    return json.loads(PROMPTS_FILE.read_text())


def _parse_json_from_response(raw: str) -> dict | None:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def run_ollama(model_tag: str, system_prompt: str, scene: str) -> dict:
    import requests

    ollama_url = os.environ["OLLAMA_URL"]

    payload = {
        "model": model_tag,
        "prompt": f"{system_prompt}\n\nScene: {scene}",
        "stream": False,
        "format": "json",
    }

    t0 = time.time()
    resp = requests.post(ollama_url, json=payload, timeout=120)
    resp.raise_for_status()
    latency_ms = round((time.time() - t0) * 1000)

    raw = resp.json()["response"].strip()
    parsed = _parse_json_from_response(raw)

    return {
        "raw": raw,
        "parsed": parsed,
        "valid": parsed is not None,
        "latency_ms": latency_ms,
        "model_tag": model_tag,
    }


def run_gemini(system_prompt: str, scene: str) -> dict:
    from google import genai
    from google.genai import types

    api_key = os.environ["GEMINI_API_KEY"]
    client = genai.Client(api_key=api_key)

    t0 = time.time()
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=f"Scene: {scene}",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )
    latency_ms = round((time.time() - t0) * 1000)

    raw = response.text.strip()
    parsed = _parse_json_from_response(raw)

    return {
        "raw": raw,
        "parsed": parsed,
        "valid": parsed is not None,
        "latency_ms": latency_ms,
        "model_tag": "gemini-2.5-flash-lite",
    }


ADAPTERS = {
    "mistral": lambda sp, scene: run_ollama(os.environ.get("OLLAMA_MODEL", "mistral"), sp, scene),
    "llama3.1": lambda sp, scene: run_ollama("llama3.1:8b", sp, scene),
    "gemini-flash": lambda sp, scene: run_gemini(sp, scene),
}


def run_model(model_name: str, n_runs: int):
    system_prompt = load_system_prompt()
    prompts = load_prompts()
    adapter = ADAPTERS[model_name]
    out_dir = RUNS_DIR / model_name
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n=== {model_name} | {len(prompts)} prompts × {n_runs} runs ===")

    for p in prompts:
        for run_idx in range(1, n_runs + 1):
            out_file = out_dir / f"{p['id']}_run{run_idx}.json"
            if out_file.exists():
                print(f"  skip {p['id']} run{run_idx} (exists)")
                continue

            print(f"  {p['id']} run{run_idx} [{p['category']}] ... ", end="", flush=True)
            try:
                result = adapter(system_prompt, p["prompt"])
                record = {
                    "prompt_id": p["id"],
                    "prompt_text": p["prompt"],
                    "category": p["category"],
                    "run": run_idx,
                    "model": model_name,
                    **result,
                }
                out_file.write_text(json.dumps(record, indent=2, ensure_ascii=False))
                status = "OK" if result["valid"] else "INVALID_JSON"
                print(f"{status} ({result['latency_ms']}ms)")
            except Exception as e:
                print(f"ERROR: {e}")
                error_record = {
                    "prompt_id": p["id"],
                    "prompt_text": p["prompt"],
                    "category": p["category"],
                    "run": run_idx,
                    "model": model_name,
                    "raw": None,
                    "parsed": None,
                    "valid": False,
                    "latency_ms": None,
                    "error": str(e),
                }
                out_file.write_text(json.dumps(error_record, indent=2, ensure_ascii=False))

            if model_name == "gemini-flash":
                time.sleep(4)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=MODELS + ["all"], required=True)
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()

    targets = MODELS if args.model == "all" else [args.model]
    for m in targets:
        run_model(m, args.runs)

    print("\nDone. Run `python experiments/llm_eval/score.py` to compute metrics.")


if __name__ == "__main__":
    main()
