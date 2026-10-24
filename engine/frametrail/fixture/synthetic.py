"""A small, fully synthetic copy of the two evidence fixtures, built without a download.

The CAVIAR fixture needs 43 MB of footage from the University of Edinburgh. This one
draws its own frames: a moving pattern under a black band with the time burned in at the
same place and pitch as the CAVIAR on-screen clock, so the OSD reader works on it
unchanged. It plants the same things as fixture.build (a wiped index, a disk initialised
and recorded over, a decoy header, a slow NVR clock with drift) at a size that builds in
a few seconds. Tests and CI use it; nothing about it stands in for real footage.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np

from .. import dhav, osd
from ..media import ffmpeg
from .build import FPS, FRAME_MS, H, W, access_units, nvr_clock, pack_dvr, pack_nvr

# 5 x 7 glyphs, one string per row, "#" lit.
GLYPHS = {
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
}
_FONT = {
    d: np.array([[c == "#" for c in row] for row in rows], np.uint8) * 255
    for d, rows in GLYPHS.items()
}
BAND = 10  # rows of black behind the clock

DAY_MS = 86_400_000
T = dhav.epoch_ms  # recorder-local wall time, as the fixture builder stores it


def _wall(h: int, m: int, s: int, ms: int = 0) -> int:
    return T(datetime(2004, 1, 20, h, m, s, ms * 1000))


# Recorded before the disk was initialised: two bursts of motion, three segments each,
# each burst one continuous recording. Then two more after it.
SEGMENT = 100  # frames, four keyframes each at one a second
BURSTS = [_wall(10, 7, 34), _wall(10, 22, 24)]
INIT = _wall(10, 31, 5)
AFTER = _wall(10, 32, 32)
AFTER_FRAMES = [75, 75]
SEIZED = _wall(10, 34, 10)
NVR_RUNS = [(_wall(10, 7, 31), 100), (_wall(10, 22, 21), 100)]
NVR_OFFSET_MS = 97_400
NVR_DRIFT_PPM = 120.0


def frames(start_ms: int, n: int, seed: int) -> bytes:
    """n grey frames, W x H, with the OSD clock showing start_ms plus 40 ms a frame."""
    rng = np.random.default_rng(seed)
    # A texture panned one pixel a frame, so motion is smooth and never cuts.
    texture = rng.integers(40, 200, (H + n, W + n), dtype=np.uint8)
    out = np.empty((n, H, W), np.uint8)
    for i in range(n):
        f = texture[i : i + H, i : i + W].copy()
        f[:BAND] = 0
        for k, ch in enumerate(osd.text_at((start_ms + i * FRAME_MS) % DAY_MS)):
            if ch in _FONT:
                x = int(round(osd.ORIGIN + osd.PITCH * k))
                f[0:7, x : x + 5] = _FONT[ch]
        out[i] = f
    return out.tobytes()


def encode(start_ms: int, n: int, seed: int, fmt: str) -> bytes:
    """The frames as H.264, one keyframe a second, the way fixture.build encodes CAVIAR.
    Scene-cut keyframes are off so every keyframe falls on a whole second."""
    extra = ["-muxpreload", "0", "-muxdelay", "0"] if fmt == "mpeg" else []
    return ffmpeg(
        *("-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{W}x{H}", "-r", str(FPS)),
        *("-i", "pipe:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18"),
        *(
            "-g",
            str(FPS),
            "-bf",
            "0",
            "-pix_fmt",
            "yuv420p",
            "-x264-params",
            "aud=1:scenecut=0:threads=1",
        ),
        *extra,
        *("-f", fmt, "pipe:1"),
        stdin=frames(start_ms, n, seed),
    )


def build(fx: Path) -> dict:
    """Write EV-001, EV-002, truth.json and seizure.json into fx, as fixture.build does."""
    fx.mkdir(parents=True, exist_ok=True)
    before, log = [], [(_wall(9, 58, 12), 1, 0, "System power on")]
    for b, t in enumerate(BURSTS):
        log.append((t, 3, 1, "Motion recording, camera 1"))
        for k in range(3):
            start = t + k * SEGMENT * FRAME_MS
            before.append((start, SEGMENT, encode(start, SEGMENT, 10 * b + k, "mpeg")))
        log.append((t + 3 * SEGMENT * FRAME_MS, 4, 1, "Recording stopped, camera 1"))
    log += [
        (_wall(10, 30, 48), 8, 0, "Local login, user admin"),
        (INIT, 7, 0, "HDD 1 initialised, user admin"),
        (AFTER, 3, 1, "Motion recording, camera 1"),
    ]
    after, start = [], AFTER
    for k, n in enumerate(AFTER_FRAMES):
        after.append((start, n, encode(start, n, 100 + k, "mpeg")))
        start += n * FRAME_MS
    log += [(start, 4, 1, "Recording stopped, camera 1"), (SEIZED, 2, 0, "System power off")]
    image, dvr_truth = pack_dvr(before, after, INIT, SEIZED, log)
    (fx / "EV-001_dvr-disk.img").write_bytes(image)

    runs = [(t, access_units(encode(t, n, 200 + i, "h264"))) for i, (t, n) in enumerate(NVR_RUNS)]
    dav, count = pack_nvr(runs, NVR_OFFSET_MS, NVR_DRIFT_PPM)
    (fx / "EV-002_nvr-export.dav").write_bytes(dav)

    truth = {
        "footage": "Synthetic frames with a burned-in clock, no real footage",
        **dvr_truth,
        "nvrOffsetMs": NVR_OFFSET_MS,
        "nvrDriftPpm": NVR_DRIFT_PPM,
        "nvrFrames": count,
        "nvrEpochMs": runs[0][0],
    }
    nvr_ref = _wall(10, 40, 0)
    shown = nvr_clock(nvr_ref, runs[0][0], NVR_OFFSET_MS, NVR_DRIFT_PPM)
    seizure = {
        "EV-001": {
            "dvrShown": dhav.from_ms(SEIZED - 8000).isoformat(sep=" "),
            "reference": dhav.from_ms(SEIZED - 8000).isoformat(sep=" "),
            "note": "Synthetic seizure record.",
        },
        "EV-002": {
            "dvrShown": dhav.from_ms(shown - shown % 1000).isoformat(sep=" "),
            "reference": dhav.from_ms(nvr_ref).isoformat(sep=" "),
            "note": "Synthetic seizure record.",
        },
    }
    (fx / "truth.json").write_text(json.dumps(truth, indent=2))
    (fx / "seizure.json").write_text(json.dumps(seizure, indent=2))
    return truth
