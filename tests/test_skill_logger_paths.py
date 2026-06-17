"""Regression: Python skill log dirs live under runtime/logs/skills/<name>/."""
from __future__ import annotations

import builtins
import importlib.util
import tempfile
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / ".pi" / "skills" / "_shared" / "logger.py"


def _load_logger_mod():
    spec = importlib.util.spec_from_file_location("skill_logger_paths", MODULE_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_resolve_skill_log_dir_under_runtime_logs_skills() -> None:
    with tempfile.TemporaryDirectory(prefix="skill-log-dir-") as tmp:
        mod = _load_logger_mod()
        got = mod.resolve_skill_log_dir(Path(tmp), "news")
        assert got == Path(tmp) / "runtime" / "logs" / "skills" / "news"


def test_make_skill_logger_falls_back_when_loguru_missing() -> None:
    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "loguru":
            raise ModuleNotFoundError("No module named 'loguru'")
        return original_import(name, globals, locals, fromlist, level)

    try:
        builtins.__import__ = fake_import
        mod = _load_logger_mod()
    finally:
        builtins.__import__ = original_import

    with tempfile.TemporaryDirectory(prefix="skill-log-fallback-") as tmp:
        logger = mod.make_skill_logger("macros", cwd=Path(tmp))
        logger.info("wrote {}", "artifact")
        log_path = Path(tmp) / "runtime" / "logs" / "skills" / "macros" / "console.log"
        assert log_path.exists()
        assert "wrote artifact" in log_path.read_text()


def _run_all() -> None:
    test_resolve_skill_log_dir_under_runtime_logs_skills()
    test_make_skill_logger_falls_back_when_loguru_missing()
    print("OK: skill logger path tests passed")


if __name__ == "__main__":
    _run_all()
