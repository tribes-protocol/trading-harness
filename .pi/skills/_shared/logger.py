"""Shared logger for Python skills in the autonomous-trading-agent harness.

Each call to ``make_skill_logger(name)`` returns a loguru logger configured
with two file sinks under ``runtime/logs/skills/<name>/``:

    - ``console.log`` captures INFO and above.
    - ``error.log`` captures WARNING and above.

Both rotate at 10MB and retain 7 historical files. The level is taken from
the ``LOG_LEVEL`` env var (default ``INFO``).

Critical: stdout/stderr sinks are removed by default so that scripts which
emit JSON on stdout (the orchestrator's ``run()`` exec capture contract)
stay uncontaminated. Set ``LOG_TO_STDOUT=1`` to mirror to stderr for local
debugging — stdout is reserved for the script's machine-readable payload.
"""
from __future__ import annotations

import os
import sys
import logging
from pathlib import Path
from typing import Any

try:
    from loguru import logger as _root_logger
except ModuleNotFoundError:  # pragma: no cover - exercised via import-hook regression test
    _root_logger = None

ROTATE_SIZE = "10 MB"
RETAIN_COUNT = 7
LOG_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> "
    "<level>{level: <8}</level> "
    "<cyan>{extra[name]}</cyan> "
    "<level>{message}</level>"
)


def _resolve_cwd(cwd: Path | str | None) -> Path:
    if cwd is None:
        return Path.cwd()
    if isinstance(cwd, str):
        return Path(cwd)
    return cwd


def resolve_skill_log_dir(cwd: Path | str | None, name: str) -> Path:
    """Absolute directory where skill file sinks for ``name`` are written."""
    return _resolve_cwd(cwd) / "runtime" / "logs" / "skills" / name


_installed_sinks: dict[str, tuple[int, int] | tuple[logging.Handler, logging.Handler]] = {}


class _StdlibSkillLogger:
    """Small loguru-compatible fallback used when the optional dependency is absent."""

    def __init__(self, name: str):
        self._logger = logging.getLogger(f"skill.{name}")

    def bind(self, **_kwargs: Any) -> "_StdlibSkillLogger":
        return self

    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.DEBUG, message, *args, **kwargs)

    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.INFO, message, *args, **kwargs)

    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.WARNING, message, *args, **kwargs)

    def error(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log(logging.ERROR, message, *args, **kwargs)

    def exception(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._logger.exception(_format_loguru_message(message, *args, **kwargs))

    def _log(self, level: int, message: str, *args: Any, **kwargs: Any) -> None:
        self._logger.log(level, _format_loguru_message(message, *args, **kwargs))


def _format_loguru_message(message: str, *args: Any, **kwargs: Any) -> str:
    if not args and not kwargs:
        return message
    try:
        return message.format(*args, **kwargs)
    except Exception:
        joined_args = " ".join(str(arg) for arg in args)
        joined_kwargs = " ".join(f"{key}={value}" for key, value in kwargs.items())
        suffix = " ".join(part for part in [joined_args, joined_kwargs] if part)
        return f"{message} {suffix}" if suffix else message


def _filter_by_name(target: str):
    def _filter(record) -> bool:
        return record["extra"].get("name") == target

    return _filter


def _ensure_sinks(name: str, skill_dir: Path) -> None:
    """Install per-skill file sinks once per process. Subsequent calls noop."""
    skill_dir.mkdir(parents=True, exist_ok=True)
    if name in _installed_sinks:
        return

    if _root_logger is None:
        _ensure_stdlib_sinks(name, skill_dir)
        return

    # First-time root cleanup: drop loguru's default stderr sink and the
    # optional stdout mirror. Both are scoped to this whole process, not
    # per-name, so do them once.
    if not _installed_sinks:
        _root_logger.remove()
        if os.environ.get("LOG_TO_STDOUT") == "1":
            level = os.environ.get("LOG_LEVEL", "INFO").upper()
            _root_logger.add(sys.stderr, level=level, format=LOG_FORMAT)

    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    console_id = _root_logger.add(
        skill_dir / "console.log",
        level=level,
        rotation=ROTATE_SIZE,
        retention=RETAIN_COUNT,
        format=LOG_FORMAT,
        filter=_filter_by_name(name),
        enqueue=True,
        backtrace=False,
        diagnose=False,
    )
    error_id = _root_logger.add(
        skill_dir / "error.log",
        level="WARNING",
        rotation=ROTATE_SIZE,
        retention=RETAIN_COUNT,
        format=LOG_FORMAT,
        filter=_filter_by_name(name),
        enqueue=True,
        backtrace=True,
        diagnose=False,
    )
    _installed_sinks[name] = (console_id, error_id)


def _ensure_stdlib_sinks(name: str, skill_dir: Path) -> None:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logger = logging.getLogger(f"skill.{name}")
    logger.setLevel(level)
    logger.propagate = False
    for handler in list(logger.handlers):
        logger.removeHandler(handler)

    formatter = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s %(message)s")
    console_handler = logging.FileHandler(skill_dir / "console.log")
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    error_handler = logging.FileHandler(skill_dir / "error.log")
    error_handler.setLevel(logging.WARNING)
    error_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    logger.addHandler(error_handler)

    if os.environ.get("LOG_TO_STDOUT") == "1":
        stream_handler = logging.StreamHandler(sys.stderr)
        stream_handler.setLevel(level)
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

    _installed_sinks[name] = (console_handler, error_handler)


def make_skill_logger(name: str, cwd: Path | str | None = None):
    """Return a skill logger writing under runtime/logs/skills/<name>/.

    Uses loguru when installed; otherwise falls back to the Python stdlib
    logger so skill CLIs keep running in lean environments.

    The ``cwd`` argument lets tests point the sinks at a temp dir. By default
    sinks resolve relative to ``Path.cwd()`` so the harness writes under the
    autonomous-trading-agent package root at run time.
    """
    skill_dir = resolve_skill_log_dir(cwd, name)
    _ensure_sinks(name, skill_dir)
    if _root_logger is None:
        return _StdlibSkillLogger(name)
    return _root_logger.bind(name=name)
