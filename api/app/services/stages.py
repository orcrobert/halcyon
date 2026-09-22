from urllib.parse import urlparse

from api.app.services.hosts import HOSTS
from api.app.services.providers import PROVIDERS
from api.app.services.runconfig import RunConfig

STAGE_PROGRESS = {
    "decomposing": 10,
    "waking": 20,
    "generating": 30,
    "mixing": 70,
    "persisting": 90,
}


def host_label(config: RunConfig) -> str:
    if config.generator_name:
        return config.generator_name
    host = HOSTS.get(config.generator_kind)
    if host is not None and config.generator_kind != "custom":
        return host.label
    return urlparse(config.generator_url).hostname or config.generator_url


WAKING_BY_KIND = {
    "modal": "Modal is starting a GPU container, cold starts usually take under a minute",
    "colab": "Waiting for the Colab notebook to answer",
    "huggingface": "Waiting for the Space to wake up",
}


def waking_detail(config: RunConfig, probe_status: str, elapsed_s: int) -> str:
    if probe_status == "loading":
        text = f"{host_label(config)} is loading the AudioCraft models"
    else:
        text = WAKING_BY_KIND.get(
            config.generator_kind,
            f"Waiting for the generator at {host_label(config)} to answer",
        )
    return f"{text} ({elapsed_s}s)"


def decomposing_detail(config: RunConfig) -> str:
    provider = PROVIDERS.get(config.decomposer_provider)
    if provider is None:
        return f"Asking {config.decomposer_provider} to split the scene into layers"
    model = config.decomposer_model or provider.default_model
    return f"Asking {provider.label} ({model}) to split the scene into layers"


def generating_detail(config: RunConfig, elements: list[dict]) -> str:
    music = sum(1 for element in elements if element.get("type") == "music")
    sounds = len(elements) - music
    parts = []
    if sounds:
        parts.append(f"{sounds} sound{'s' if sounds != 1 else ''}")
    if music:
        parts.append(f"{music} music")
    layers = f"{len(elements)} layer{'s' if len(elements) != 1 else ''}"
    return f"Rendering {layers} on {host_label(config)}: {', '.join(parts)}"


def mixing_detail(elements: list[dict]) -> str:
    return (
        f"Analysing {len(elements)} clip{'s' if len(elements) != 1 else ''}: "
        "loudness, EQ, placement, loop points"
    )


PERSISTING_DETAIL = "Writing layers to disk"
