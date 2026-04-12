import base64
import io
import os
import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate
from ai.app.config import settings
import sys
from pathlib import Path
_mixer_path = str(Path(__file__).resolve().parents[3] / "mixer")
if _mixer_path not in sys.path:
    sys.path.insert(0, _mixer_path)
from mixer.effects.looping import make_loopable

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str


@router.post("/generate")
def generate_atmosphere(req: GenerateRequest):
    try:
        decomposed = decompose(req.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {e}")

    try:
        elements = generate(decomposed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    for element in elements:
        path = element.get("file", "")
        if path and os.path.exists(path):
            wav, sr = sf.read(path, always_2d=True)
            wav = wav.T
            looped = make_loopable(wav, sr)
            buf = io.BytesIO()
            sf.write(buf, looped.T, sr, format="WAV")
            element["audio_b64"] = base64.b64encode(buf.getvalue()).decode()

    return {"atmosphere": decomposed["atmosphere"], "elements": elements}
