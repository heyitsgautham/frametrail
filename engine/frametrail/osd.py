"""Read the time a camera burns into its picture, and fit it against the recorder clock.

CCTV cameras print an on-screen display (OSD) clock into the top-left of every frame.
It is part of the pixels, so it survives export and remux. Reading it at many frames and
comparing it with the time the recorder stored for the same frames gives that recorder's
offset and drift, with residuals that show how well the fit holds.

The reader matches each character cell against digit templates. The templates come from
labelled frames of one clip (FONT_SOURCE); every other clip is read blind.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

PITCH = 8.6  # character pitch, pixels, at 384 wide
ORIGIN = 3.0
ROWS = 8
CELL = 5
LIT = 0.3  # a stroke split across two pixel columns can be this faint
# Character slots of "HH:MM:SS.mmm" in the OSD line.
SLOTS = {"h": (0, 1), "m": (3, 4), "s": (6, 7), "ms": (9, 10, 11)}


def cell(img: np.ndarray, k: int, dx: int = 0) -> np.ndarray:
    """The glyph in slot k, cut from its first lit column so sub-pixel drift cancels out."""
    x = int(round(ORIGIN + PITCH * k))
    win = img[:ROWS, x - 2 : x + 8].astype(np.float32) / 255
    lit = np.flatnonzero((win > LIT).any(0))
    out = np.zeros((ROWS, CELL), np.float32)
    if len(lit):
        g = win[:, lit[0] : lit[0] + CELL]
        out[:, : g.shape[1]] = g
    return out


def learn(frames: np.ndarray, texts: list[str]) -> np.ndarray:
    """Average glyph per digit from frames whose OSD text is known."""
    acc = np.zeros((10, ROWS, CELL), np.float32)
    n = np.zeros(10)
    for img, text in zip(frames, texts, strict=True):
        for k, ch in enumerate(text):
            if ch.isdigit():
                acc[int(ch)] += cell(img, k)
                n[int(ch)] += 1
    if (n == 0).any():
        raise ValueError(f"no samples for digits {np.flatnonzero(n == 0).tolist()}")
    return acc / n[:, None, None]


def read(img: np.ndarray, font: np.ndarray) -> tuple[int, float] | None:
    """Milliseconds since midnight shown in the OSD, and the worst glyph match distance."""
    digits = {}
    worst = 0.0
    for part, ks in SLOTS.items():
        v = 0
        for k in ks:
            best = min(
                ((float(((cell(img, k) - font[d]) ** 2).mean()), d) for d in range(10)),
            )
            worst = max(worst, best[0])
            v = v * 10 + best[1]
        digits[part] = v
    if digits["h"] > 23 or digits["m"] > 59 or digits["s"] > 59:
        return None
    return ((digits["h"] * 60 + digits["m"]) * 60 + digits["s"]) * 1000 + digits["ms"], worst


def text_at(ms_of_day: int) -> str:
    h, r = divmod(ms_of_day, 3_600_000)
    m, r = divmod(r, 60_000)
    s, ms = divmod(r, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


@dataclass
class Fit:
    offset_ms: float  # OSD minus recorder, at t0
    drift_ppm: float
    residual_ms: float  # RMS of what the line leaves unexplained
    uncertainty_ms: float
    points: list[tuple[float, float]]  # (seconds since t0, measured offset in seconds)
    used: int
    rejected: int


def fit(raw_ms: np.ndarray, osd_ms: np.ndarray, t0: int) -> Fit:
    """Least-squares line through OSD minus recorder time, dropping misreads."""
    x = (raw_ms - t0) / 1000.0
    y = osd_ms - raw_ms
    keep = np.abs(y - np.median(y)) < 1000
    for _ in range(2):
        b, a = np.polyfit(x[keep], y[keep], 1) if keep.sum() > 2 else (0.0, float(np.median(y)))
        res = y - (a + b * x)
        keep = keep & (np.abs(res) < max(3 * res[keep].std(), 25))
    b, a = np.polyfit(x[keep], y[keep], 1)
    res = y[keep] - (a + b * x[keep])
    rms = float(np.sqrt((res**2).mean()))
    # Standard error of the intercept, floored at half a frame because the OSD ticks per frame.
    se = rms * np.sqrt(
        1 / keep.sum() + x[keep].mean() ** 2 / ((x[keep] - x[keep].mean()) ** 2).sum()
    )
    return Fit(
        float(a),
        float(b * 1000),
        rms,
        float(max(se * 2, 20.0)),
        [(float(xx), float(yy / 1000)) for xx, yy in zip(x[keep], y[keep], strict=True)],
        int(keep.sum()),
        int((~keep).sum()),
    )
