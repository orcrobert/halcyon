import os
from pathlib import Path

import modal

AUDIOCRAFT = "git+https://github.com/facebookresearch/audiocraft.git"

CORE_SRC = Path(__file__).resolve().parents[1] / "core"
CORE_DST = "/opt/halcyon-core"

CACHE_DIR = "/cache"
GPU = os.getenv("HALCYON_MODAL_GPU", "A10G")
CUDA_INDEX = "https://download.pytorch.org/whl/cu121"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.1.2",
        "torchvision==0.16.2",
        "torchaudio==2.1.2",
        "xformers==0.0.23.post1",
        extra_index_url=CUDA_INDEX,
    )
    .add_local_dir(CORE_SRC, CORE_DST, copy=True, ignore=["__pycache__", "*.egg-info"])
    .run_commands(f"pip install '{CORE_DST}[audiocraft]'")
    .run_commands(f"pip install --no-deps {AUDIOCRAFT}")
    .env(
        {
            "HF_HOME": f"{CACHE_DIR}/hf",
            "HF_HUB_CACHE": f"{CACHE_DIR}/hf",
            "AUDIOGEN_MODEL": os.getenv("AUDIOGEN_MODEL", "facebook/audiogen-medium"),
            "MUSICGEN_MODEL": os.getenv("MUSICGEN_MODEL", "facebook/musicgen-large"),
            "GENERATION_DURATION": os.getenv("GENERATION_DURATION", "10"),
            "GENERATION_DEVICE": "cuda",
        }
    )
)

app = modal.App("halcyon-generator", image=image)
cache = modal.Volume.from_name("halcyon-model-cache", create_if_missing=True)


@app.cls(
    gpu=GPU,
    volumes={CACHE_DIR: cache},
    scaledown_window=300,
    startup_timeout=900,
    timeout=900,
    max_containers=1,
)
class Generator:
    @modal.enter()
    def load(self):
        from halcyon_generator import AudioCraftEngine

        self.engine = AudioCraftEngine()
        self.engine.load()
        cache.commit()

    @modal.asgi_app()
    def web(self):
        from halcyon_generator import create_app

        return create_app(engine=self.engine, eager=False)
