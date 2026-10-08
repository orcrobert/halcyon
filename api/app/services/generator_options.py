from dataclasses import dataclass, field
from typing import Any

DEPLOY = "deploy"
REQUEST = "request"

DEPLOYABLE_KINDS = ("modal",)


@dataclass(frozen=True)
class Choice:
    value: str
    label: str


@dataclass(frozen=True)
class OptionSpec:
    key: str
    label: str
    hint: str
    kind: str
    scope: str
    default: Any
    env: str | None = None
    choices: tuple[Choice, ...] = ()
    minimum: float | None = None
    maximum: float | None = None
    step: float | None = None
    unit: str | None = None
    hosts: tuple[str, ...] = field(default=())


OPTIONS: tuple[OptionSpec, ...] = (
    OptionSpec(
        key="gpu",
        label="GPU",
        hint="Bigger cards generate faster and hold more models at once.",
        kind="choice",
        scope=DEPLOY,
        default="A10G",
        env="HALCYON_MODAL_GPU",
        choices=(
            Choice("T4", "T4 · 16 GB"),
            Choice("L4", "L4 · 24 GB"),
            Choice("A10G", "A10G · 24 GB"),
            Choice("L40S", "L40S · 48 GB"),
            Choice("A100", "A100 · 40 GB"),
            Choice("A100-80GB", "A100 · 80 GB"),
            Choice("H100", "H100 · 80 GB"),
        ),
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="musicgen_model",
        label="Music model",
        hint="Used for music layers without a style clip.",
        kind="choice",
        scope=DEPLOY,
        default="facebook/musicgen-large",
        env="MUSICGEN_MODEL",
        choices=(
            Choice("facebook/musicgen-small", "MusicGen small"),
            Choice("facebook/musicgen-medium", "MusicGen medium"),
            Choice("facebook/musicgen-large", "MusicGen large"),
        ),
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="audiogen_model",
        label="Sound model",
        hint="Used for every sound layer.",
        kind="choice",
        scope=DEPLOY,
        default="facebook/audiogen-medium",
        env="AUDIOGEN_MODEL",
        choices=(Choice("facebook/audiogen-medium", "AudioGen medium"),),
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="style_model",
        label="Style model",
        hint="Generates music in the style of an uploaded clip. Off ignores style clips.",
        kind="choice",
        scope=DEPLOY,
        default="facebook/musicgen-style",
        env="STYLE_MODEL",
        choices=(
            Choice("facebook/musicgen-style", "MusicGen-Style"),
            Choice("", "Off"),
        ),
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="style_preload",
        label="Load the style model at startup",
        hint="Keeps its weights in the cache volume. Off saves memory but the first styled request downloads it.",
        kind="toggle",
        scope=DEPLOY,
        default=True,
        env="STYLE_PRELOAD",
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="duration",
        label="Fallback length",
        hint="Seconds generated when a request names no length.",
        kind="number",
        scope=DEPLOY,
        default=10,
        env="GENERATION_DURATION",
        minimum=5,
        maximum=60,
        step=1,
        unit="s",
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="loudness_lufs",
        label="Clip loudness",
        hint="Every clip is normalised to this before mixing.",
        kind="number",
        scope=DEPLOY,
        default=-20,
        env="GENERATION_LOUDNESS_LUFS",
        minimum=-30,
        maximum=-10,
        step=1,
        unit="LUFS",
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="scaledown_s",
        label="Idle shutdown",
        hint="How long a container waits for the next request before scaling to zero.",
        kind="number",
        scope=DEPLOY,
        default=300,
        env="HALCYON_MODAL_SCALEDOWN",
        minimum=60,
        maximum=3600,
        step=60,
        unit="s",
        hosts=DEPLOYABLE_KINDS,
    ),
    OptionSpec(
        key="style_eval_q",
        label="Style closeness",
        hint="How much of the clip's character reaches the music, from 1 (loose) to 6 (close).",
        kind="number",
        scope=REQUEST,
        default=3,
        minimum=1,
        maximum=6,
        step=1,
    ),
    OptionSpec(
        key="style_cfg_beta",
        label="Prompt weight against the clip",
        hint="Higher follows the text prompt more, lower follows the clip more.",
        kind="number",
        scope=REQUEST,
        default=5.0,
        minimum=1,
        maximum=10,
        step=0.5,
    ),
)

SPECS: dict[str, OptionSpec] = {spec.key: spec for spec in OPTIONS}


def applies_to(spec: OptionSpec, kind: str) -> bool:
    return not spec.hosts or kind in spec.hosts


def specs_for(kind: str) -> list[OptionSpec]:
    return [spec for spec in OPTIONS if applies_to(spec, kind)]


def _coerce(spec: OptionSpec, value: Any) -> Any:
    if spec.kind == "toggle":
        if not isinstance(value, bool):
            raise ValueError(f"{spec.label} must be on or off.")
        return value
    if spec.kind == "choice":
        allowed = {choice.value for choice in spec.choices}
        if value not in allowed:
            raise ValueError(f"{spec.label} must be one of the listed options.")
        return value
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{spec.label} must be a number.")
    if spec.minimum is not None and value < spec.minimum:
        raise ValueError(f"{spec.label} must be at least {spec.minimum:g}.")
    if spec.maximum is not None and value > spec.maximum:
        raise ValueError(f"{spec.label} must be at most {spec.maximum:g}.")
    if spec.step is not None and float(spec.step).is_integer():
        return int(round(value))
    return float(value)


def validate(kind: str, options: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in options.items():
        spec = SPECS.get(key)
        if spec is None or not applies_to(spec, kind):
            raise ValueError(f"'{key}' is not an option for this generator.")
        clean[key] = _coerce(spec, value)
    return clean


def effective(kind: str, options: dict[str, Any] | None) -> dict[str, Any]:
    stored = options or {}
    return {
        spec.key: stored.get(spec.key, spec.default) for spec in specs_for(kind)
    }


def deploy_options(kind: str, options: dict[str, Any] | None) -> dict[str, Any]:
    values = effective(kind, options)
    return {
        spec.key: values[spec.key]
        for spec in specs_for(kind)
        if spec.scope == DEPLOY
    }


def request_options(kind: str, options: dict[str, Any] | None) -> dict[str, Any]:
    values = effective(kind, options)
    return {
        spec.key: values[spec.key]
        for spec in specs_for(kind)
        if spec.scope == REQUEST
    }


def pending_changes(
    kind: str, options: dict[str, Any] | None, deployed: dict[str, Any] | None
) -> list[str]:
    if kind not in DEPLOYABLE_KINDS:
        return []
    wanted = deploy_options(kind, options)
    live = deploy_options(kind, deployed)
    return [key for key in wanted if wanted[key] != live[key]]


def deploy_env(kind: str, options: dict[str, Any] | None) -> dict[str, str]:
    env: dict[str, str] = {}
    for key, value in deploy_options(kind, options).items():
        spec = SPECS[key]
        if spec.env is None:
            continue
        if isinstance(value, bool):
            env[spec.env] = "1" if value else "0"
        else:
            env[spec.env] = str(value)
    return env
