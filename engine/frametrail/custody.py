"""A hash-chained custody log. Each event's hash covers the previous hash and the event,
so changing any past event breaks every hash after it."""

from __future__ import annotations

import hashlib
import json

GENESIS = "0" * 64


def _hash(prev: str, event: dict) -> str:
    body = {k: v for k, v in event.items() if k not in ("hash", "prev")}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256((prev + canonical).encode()).hexdigest()


class Log:
    def __init__(self) -> None:
        self.events: list[dict] = []

    def add(self, at: str, actor: str, action: str, object_id: str, sha256: str) -> dict:
        prev = self.events[-1]["hash"] if self.events else GENESIS
        e = {
            "seq": len(self.events) + 1,
            "at": at,
            "actor": actor,
            "action": action,
            "objectId": object_id,
            "sha256": sha256,
        }
        e["prev"] = prev
        e["hash"] = _hash(prev, e)
        self.events.append(e)
        return e


def verify(events: list[dict]) -> int | None:
    """The seq of the first event whose hash no longer matches, or None if all hold."""
    prev = GENESIS
    for e in events:
        if e["prev"] != prev or _hash(prev, e) != e["hash"]:
            return e["seq"]
        prev = e["hash"]
    return None
