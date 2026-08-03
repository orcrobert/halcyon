from dataclasses import dataclass

DOCS_BASE = "https://github.com/orcrobert/halcyon/blob/main/generators"


@dataclass(frozen=True)
class Host:
    key: str
    label: str
    hint: str
    url_example: str
    docs_url: str


HOSTS: dict[str, Host] = {
    "colab": Host(
        key="colab",
        label="Google Colab",
        hint="Free GPU while the notebook tab stays open. The URL changes every session.",
        url_example="https://xxxx-xx-xx-xx-xx.ngrok-free.app",
        docs_url=f"{DOCS_BASE}/colab/README.md",
    ),
    "modal": Host(
        key="modal",
        label="Modal",
        hint="Scales to zero between requests. Stable URL, pays a cold start when idle.",
        url_example="https://you--halcyon-generator-generator-web.modal.run",
        docs_url=f"{DOCS_BASE}/modal/README.md",
    ),
    "huggingface": Host(
        key="huggingface",
        label="Hugging Face Space",
        hint="Always on, needs paid GPU hardware. Free Spaces are CPU-only and time out.",
        url_example="https://you-halcyon-generator.hf.space",
        docs_url=f"{DOCS_BASE}/huggingface/README.md",
    ),
    "local": Host(
        key="local",
        label="Local machine",
        hint="A GPU box on your network running halcyon-generator serve.",
        url_example="http://localhost:9000",
        docs_url=f"{DOCS_BASE}/README.md",
    ),
    "custom": Host(
        key="custom",
        label="Custom",
        hint="Anything else implementing POST /generate.",
        url_example="https://generator.example.com",
        docs_url=f"{DOCS_BASE}/README.md",
    ),
}


def get_host(key: str) -> Host:
    try:
        return HOSTS[key]
    except KeyError:
        raise ValueError(f"Unknown generator host '{key}'.")
