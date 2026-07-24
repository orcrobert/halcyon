import base64
import io
import sys
from pathlib import Path

import soundfile as sf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate

_mixer_path = str(Path(__file__).resolve().parents[3] / "mixer")
if _mixer_path not in sys.path:
    sys.path.insert(0, _mixer_path)
from mixer.core import analyze

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str


@router.post("/generate")
def generate_atmosphere(req: GenerateRequest):
    try:
        decomposed = decompose(req.prompt)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Decomposition failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {e}")

    try:
        elements = generate(decomposed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    valid, wavs, srs = analyze(elements)

    for element, wav, sr in zip(valid, wavs, srs):
        buf = io.BytesIO()
        sf.write(buf, wav.T, sr, format="WAV")
        element["audio_b64"] = base64.b64encode(buf.getvalue()).decode()

    return {"atmosphere": decomposed["atmosphere"], "elements": valid}
