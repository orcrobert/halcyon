import modal

CORE = "halcyon-generator @ git+https://github.com/orcrobert/soundscape-generator@main#subdirectory=generators/core"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.1.2",
        "torchaudio==2.1.2",
        "numpy<2",
        "transformers==4.40.2",
        "av==12.0.0",
        "encodec",
        "lameenc",
        "num2words",
        "spacy",
        "demucs",
        "cloudpickle",
        "flashy",
        "torchmetrics",
        "torchdiffeq",
        "julius",
        "einops",
        "omegaconf",
        "hydra-core",
        "hydra-colorlog",
        "sentencepiece",
        "soundfile",
        "librosa",
        extra_index_url="https://download.pytorch.org/whl/cu121",
    )
    .run_commands(
        "pip install --no-deps git+https://github.com/facebookresearch/audiocraft.git"
    )
    .pip_install(CORE)
    .env({"HF_HOME": "/cache/hf", "HF_HUB_CACHE": "/cache/hf"})
)

app = modal.App("halcyon-generator", image=image)
cache = modal.Volume.from_name("halcyon-model-cache", create_if_missing=True)


@app.cls(
    gpu="A10G",
    volumes={"/cache": cache},
    scaledown_window=300,
    timeout=900,
    max_containers=1,
)
class Generator:
    @modal.enter()
    def load(self):
        from halcyon_generator import AudioCraftEngine

        self.engine = AudioCraftEngine()
        self.engine.load()

    @modal.asgi_app()
    def web(self):
        from halcyon_generator import create_app

        return create_app(engine=self.engine, eager=False)
