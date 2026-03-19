from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_INDEX = PROJECT_ROOT / "app" / "static" / "index.html"


def _is_venv_python(executable: Path) -> bool:
    venv_root = PROJECT_ROOT / ".venv"
    return sys.prefix != sys.base_prefix and Path(sys.prefix).resolve() == venv_root.resolve()


def _assert_runtime(require_static: bool) -> list[str]:
    messages: list[str] = []

    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11+ is required for the demo environment.")

    executable = Path(sys.executable)
    if not _is_venv_python(executable):
        raise SystemExit("Use the project virtualenv: run commands through '.venv/bin/python' or 'make'.")
    messages.append(f"Python: {executable}")

    try:
        import fastapi  # noqa: F401
        import pydantic
        import uvicorn  # noqa: F401
    except ImportError as exc:
        raise SystemExit(f"Missing dependency in virtualenv: {exc.name}") from exc

    pydantic_major = int(pydantic.__version__.split(".", maxsplit=1)[0])
    if pydantic_major != 2:
        raise SystemExit(f"Expected Pydantic v2, found {pydantic.__version__}.")
    messages.append(f"Pydantic: {pydantic.__version__}")

    package_lock = PROJECT_ROOT / "package-lock.json"
    node_modules = PROJECT_ROOT / "node_modules"
    if not package_lock.exists():
        raise SystemExit("package-lock.json is missing. Frontend dependencies are not pinned.")
    if not node_modules.exists():
        messages.append("Node modules are not installed yet. Run 'npm install' before frontend build or e2e.")
    else:
        messages.append("Frontend dependencies: installed")

    if require_static:
        if not STATIC_INDEX.exists():
            raise SystemExit("Frontend build is missing. Run 'npm run build' or 'make frontend-build' before demo.")
        messages.append(f"Static bundle: {STATIC_INDEX.relative_to(PROJECT_ROOT)}")

    return messages


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate demo runtime expectations.")
    parser.add_argument("--require-static", action="store_true", help="Fail if app/static/index.html is missing.")
    args = parser.parse_args()

    for line in _assert_runtime(require_static=args.require_static):
        print(line)


if __name__ == "__main__":
    main()
