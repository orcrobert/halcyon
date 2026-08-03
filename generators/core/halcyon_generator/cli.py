import argparse
import json
import sys
from dataclasses import replace

from .config import GeneratorConfig


def _serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .app import create_app

    overrides = {
        "audiogen_model": args.audiogen,
        "musicgen_model": args.musicgen,
        "duration": args.duration,
        "device": args.device,
        "port": args.port,
    }
    config = replace(
        GeneratorConfig.from_env(),
        **{key: value for key, value in overrides.items() if value},
    )

    port = config.port
    print(f"Loading {config.audiogen_model} and {config.musicgen_model} on {config.device}")
    app = create_app(config)
    print(f"GENERATOR_URL=http://{args.host}:{port}")
    uvicorn.run(app, host=args.host, port=port)
    return 0


def _check(args: argparse.Namespace) -> int:
    import urllib.error
    import urllib.request

    target = args.url.rstrip("/") + "/"
    try:
        with urllib.request.urlopen(target, timeout=args.timeout) as response:
            payload = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"unreachable: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(payload, indent=2))
    return 0 if payload.get("status") == "ok" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="halcyon-generator",
        description="Run a Halcyon audio generator.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    serve = subcommands.add_parser("serve", help="load the models and serve POST /generate")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=None)
    serve.add_argument("--audiogen", default=None, help="AudioGen model id")
    serve.add_argument("--musicgen", default=None, help="MusicGen model id")
    serve.add_argument("--duration", type=int, default=None, help="seconds per element")
    serve.add_argument("--device", default=None, help="torch device (cuda, cpu, mps)")
    serve.set_defaults(handler=_serve)

    check = subcommands.add_parser("check", help="probe a running generator")
    check.add_argument("url")
    check.add_argument("--timeout", type=float, default=10.0)
    check.set_defaults(handler=_check)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
