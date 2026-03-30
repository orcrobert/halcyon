import base64
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ai.app.services.decomposer import decompose
from ai.app.services.generator import generate
from ai.app.config import settings

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
            with open(path, "rb") as f:
                element["audio_b64"] = base64.b64encode(f.read()).decode()

    return {"atmosphere": decomposed["atmosphere"], "elements": elements}
