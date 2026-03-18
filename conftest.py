from __future__ import annotations

import sys
from pathlib import Path

import pytest


# Ensure the project root is importable when pytest is executed via the venv entrypoint.
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def anyio_backend():
    return "asyncio"
