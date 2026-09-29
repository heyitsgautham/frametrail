"""Thin wrappers around the ffmpeg and ffprobe binaries on PATH."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def run(*args: str | Path, stdin: bytes | None = None) -> bytes:
    out = subprocess.run([str(a) for a in args], input=stdin, capture_output=True, check=False)
    if out.returncode != 0:
        raise RuntimeError(f"{args[0]} failed: {out.stderr.decode(errors='replace')[-800:]}")
    return out.stdout


def ffmpeg(*args: str | Path, stdin: bytes | None = None) -> bytes:
    return run(FFMPEG, "-hide_banner", "-v", "error", "-y", *args, stdin=stdin)


def version() -> str:
    first = run(FFMPEG, "-version").decode().splitlines()[0]
    return first.split(" Copyright")[0].replace("ffmpeg version ", "ffmpeg ")


def probe_frames(path: Path, fmt: str | None = None) -> int:
    """Frames a demuxer and decoder actually deliver, counted by decoding."""
    args = [FFPROBE, "-v", "error"]
    if fmt:
        args += ["-f", fmt]
    args += [
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "json",
        str(path),
    ]
    data = json.loads(run(*args))
    streams = data.get("streams") or [{}]
    return int(streams[0].get("nb_read_frames") or 0)


def decode_gray(data: bytes, fmt: str, w: int, h: int) -> np.ndarray:
    """Decode a stream held in memory into small grey frames, shape (n, h, w)."""
    raw = ffmpeg(
        "-f",
        fmt,
        "-i",
        "pipe:0",
        "-vf",
        f"scale={w}:{h}",
        "-fps_mode",
        "passthrough",
        "-pix_fmt",
        "gray",
        "-f",
        "rawvideo",
        "pipe:1",
        stdin=data,
    )
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w)


def decode_bgr(path: Path, every: int, w: int, h: int) -> np.ndarray:
    """Every `every`-th frame of a file, as BGR arrays at w x h."""
    raw = ffmpeg(
        "-i",
        path,
        "-vf",
        f"select=not(mod(n\\,{every})),scale={w}:{h}",
        "-fps_mode",
        "passthrough",
        "-pix_fmt",
        "bgr24",
        "-f",
        "rawvideo",
        "pipe:1",
    )
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
