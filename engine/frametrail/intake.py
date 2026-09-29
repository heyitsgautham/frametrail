"""Read-only intake: streamed hashes and vendor detection by signature."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from pathlib import Path

CHUNK = 1 << 20


@dataclass
class Digest:
    md5: str
    sha256: str
    size: int
    seconds: float


def digest(path: Path) -> Digest:
    """MD5 and SHA-256 in one streamed pass. The file is opened read-only."""
    md5, sha = hashlib.md5(), hashlib.sha256()
    size = 0
    t = time.perf_counter()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            md5.update(chunk)
            sha.update(chunk)
            size += len(chunk)
    return Digest(md5.hexdigest(), sha.hexdigest(), size, time.perf_counter() - t)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


# Signature, where it may sit (None means anywhere in the first MiB), and the family.
SIGNATURES: list[tuple[bytes, int | None, str]] = [
    (b"HIKVISION@HANGZHOU", None, "Hikvision-style disk"),
    (b"HIKBTREE", None, "Hikvision-style disk"),
    (b"IMKH", 0, "Hikvision-style export"),
    (b"DAHUA", 0, "Dahua-style export"),
    (b"DHAV", 0, "Dahua-style export"),
]


def identify(path: Path) -> dict:
    with open(path, "rb") as f:
        head = f.read(CHUNK)
    for sig, at, family in SIGNATURES:
        pos = head.find(sig) if at is None else (at if head[at : at + len(sig)] == sig else -1)
        if pos >= 0:
            window = head[pos : pos + 24]
            ascii_ = "".join(chr(b) if 32 <= b < 127 else "." for b in window)
            return {
                "family": family,
                "signature": {"offset": pos, "hex": window.hex(" "), "ascii": ascii_},
                "matched": sig.decode(),
            }
    return {"family": "unknown", "signature": {"offset": -1, "hex": "", "ascii": ""}, "matched": ""}
