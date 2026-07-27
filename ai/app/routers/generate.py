import base64
import io
import tempfile
from pathlib import Path

import soundfile as sf
from fastapi import APIRouter, HTTPException
from mixer.core import analyze

from ai.app.models.schemas import GenerateRequest
from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate
from ai.app.services.runconfig import default_config

router = APIRouter(tags=["legacy"])


@router.post("/generate", deprecated=True)
def generate_atmosphere(req: GenerateRequest):
    config = default_config()

    try:
        decomposed = decompose(req.prompt, config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Decomposition failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decomposition failed: {e}")

    try:
        elements = generate(decomposed, config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    with tempfile.TemporaryDirectory(prefix="halcyon-") as scratch:
        for index, element in enumerate(elements):
            path = Path(scratch) / f"{index:02d}.wav"
            path.write_bytes(element.pop("audio"))
            element["file"] = str(path)

        valid, wavs, srs = analyze(elements)

        for element, wav, sr in zip(valid, wavs, srs):
            buffer = io.BytesIO()
            sf.write(buffer, wav.T, sr, format="WAV")
            element["audio_b64"] = base64.b64encode(buffer.getvalue()).decode()
            element.pop("file", None)

    return {"atmosphere": decomposed["atmosphere"], "elements": valid}
