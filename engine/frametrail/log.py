"""Structured logging for the engine.

Every step logs one event, a short fixed name plus fields, so a run can be read by a person
or parsed line by line. The CLI writes events to stderr and keeps stdout for the stats, as
text by default or as one JSON object per line with --log-format json.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

ROOT = "frametrail"


def get(name: str) -> logging.Logger:
    return logging.getLogger(f"{ROOT}.{name}")


def event(log: logging.Logger, name: str, level: int = logging.INFO, **fields: object) -> None:
    """Log `name` with `fields`; the formatters below print the fields after it."""
    log.log(level, name, extra={"fields": fields})


def _fields(record: logging.LogRecord) -> dict:
    return getattr(record, "fields", {}) or {}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": record.getMessage(),
            **_fields(record),
        }
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        kv = " ".join(f"{k}={v}" for k, v in _fields(record).items())
        line = f"{record.levelname.lower():7} {record.getMessage()}"
        return f"{line}  {kv}" if kv else line


def configure(fmt: str = "text", level: int = logging.INFO) -> None:
    """Send the engine's events to stderr. Calling it again replaces the earlier handler."""
    root = logging.getLogger(ROOT)
    for h in list(root.handlers):
        root.removeHandler(h)
    h = logging.StreamHandler(sys.stderr)
    h.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    root.addHandler(h)
    root.setLevel(level)
    root.propagate = False
