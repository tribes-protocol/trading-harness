#!/usr/bin/env bash
# Byte-compile Python scripts used by the harness.

set -euo pipefail

PY="./.venv/bin/python3"

SOURCES=(
  tests/test_skill_logger_paths.py
)

exec "$PY" -m py_compile "${SOURCES[@]}"
