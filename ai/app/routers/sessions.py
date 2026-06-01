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
from mixer.effects.eq import apply_eq
from mixer.effects.auto_eq import auto_eq
from mixer.effects.volume import assign_volumes
from mixer.effects.spatial import assign_spatial

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

    wavs = []
    srs = []
    valid = []
    for element in elements:
        path = element.get("file", "")
        if path and os.path.exists(path):
            wav, sr = sf.read(path, always_2d=True)
            wav = wav.T
            wav = make_loopable(wav, sr)
            wavs.append(wav)
            srs.append(sr)
            valid.append(element)

    eq_bands_per_element = auto_eq(wavs, srs, valid)
    for element, eq_bands in zip(valid, eq_bands_per_element):
        element["eq_json"] = eq_bands

    eqd_wavs = [
        apply_eq(wav, sr, bands)
        for wav, sr, bands in zip(wavs, srs, eq_bands_per_element)
    ]

    volumes = assign_volumes(valid, eqd_wavs, srs)
    spatial = assign_spatial(list(zip(eqd_wavs, srs)))

    for element, wav, sr, vol, (pan, depth) in zip(valid, wavs, srs, volumes, spatial):
        element["volume"] = vol
        element["pan"] = round(pan, 4)
        element["depth"] = round(depth, 4)
        buf = io.BytesIO()
        sf.write(buf, wav.T, sr, format="WAV")
        element["audio_b64"] = base64.b64encode(buf.getvalue()).decode()

    return {"atmosphere": decomposed["atmosphere"], "elements": elements}
