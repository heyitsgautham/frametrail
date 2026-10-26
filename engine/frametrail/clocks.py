"""Each recorder's clock, read from the time it burned into its own frames.

Glyph templates are learned from one header-dated segment and scored by how well they read
every other header-dated segment; the best-scoring font reads the rest. The readings fit
an offset and drift per recorder, which the seizure record then checks to the second.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from . import dvr, nvr, osd
from .dhav import epoch_ms, from_ms
from .errors import EvidenceFormatError
from .media import decode_gray
from .records import Planted, Seizure

DAY_MS = 86_400_000


def stamp(ms: float) -> str:
    return from_ms(round(ms)).isoformat(sep=" ", timespec="milliseconds")


@dataclass
class Clocks:
    font_accuracy: float
    font_seg: dvr.Found
    dvr_fit: osd.Fit
    t0_dvr: int
    nvr_fit: osd.Fit
    t0_nvr: int
    # The headerless tail was dated by where it sits on disk; its own OSD checks that.
    c01_check: float | None

    def to_ref_nvr(self, raw_ms: float) -> float:
        f = self.nvr_fit
        return raw_ms + f.offset_ms + f.drift_ppm * (raw_ms - self.t0_nvr) / 1e6


def _labels(f: dvr.Found, n: int) -> list[str]:
    return [osd.text_at((f.start_ms + i * 40) % DAY_MS) for i in range(n)]


def _learn_font(disk: dvr.Disk) -> tuple[float, dvr.Found, np.ndarray]:
    # Only segments whose video decodes can show their on-screen clock.
    dated = [f for f in disk.found if f.frames and f.state in ("indexed", "recovered-unindexed")]
    if len(dated) < 2:
        # One segment teaches the font and every other one checks it; with fewer than two
        # there is nothing to check the font against, so no reading can be trusted.
        raise EvidenceFormatError(
            f"the disk has {len(dated)} segment(s) dated by an index or segment header; "
            "reading the on-screen clock needs two, one to learn the font and one to check it"
        )
    grey = {f.key: decode_gray(f.ps, "mpeg", 384, 288)[:, :10] for f in dated}
    best: tuple[float, dvr.Found, np.ndarray] | None = None
    for f in dated:
        try:
            font_try = osd.learn(grey[f.key], _labels(f, len(grey[f.key])))
        except ValueError:
            # Too short to show every digit, as a segment cut off by the end of the image
            # is. It cannot teach the font, but it still checks a font another one taught.
            continue
        hits = total = 0
        for g in dated:
            if g is f:
                continue
            want = _labels(g, len(grey[g.key]))
            for i in range(0, len(want), 25):
                x = osd.read(grey[g.key][i], font_try)
                hits += x is not None and osd.text_at(x[0]) == want[i]
                total += 1
        if best is None or hits / total > best[0]:
            best = (hits / total, f, font_try)
    if best is None:
        raise EvidenceFormatError(
            f"none of the {len(dated)} dated segments shows every digit of the on-screen clock, "
            "so no segment can teach its font"
        )
    return best


def _read_points(
    frames: np.ndarray, raw: np.ndarray, every: int, font: np.ndarray
) -> tuple[list, list]:
    r, o = [], []
    for i in range(0, len(frames), every):
        x = osd.read(frames[i], font)
        if x:
            r.append(raw[i])
            o.append(raw[i] - raw[i] % DAY_MS + x[0])
    return r, o


def fit(disk: dvr.Disk, runs: list[nvr.Run]) -> Clocks:
    font_accuracy, font_seg, font = _learn_font(disk)

    dvr_r, dvr_o, c01_r, c01_o = [], [], [], []
    for f in disk.found:
        if not f.frames or f is font_seg:
            continue
        fr = decode_gray(f.ps, "mpeg", 384, 288)[:, :10]
        raw = f.start_ms + np.arange(len(fr)) * 40
        r, o = _read_points(fr, raw, 5 if f.state == "partial" else 25, font)
        if f.state == "partial":
            c01_r, c01_o = r, o
        else:
            dvr_r += r
            dvr_o += o
    if len(dvr_r) < 3:
        raise EvidenceFormatError(
            f"the on-screen clock read in only {len(dvr_r)} disk frame(s) outside the font "
            "segment; fitting the recorder clock needs at least 3"
        )
    t0_dvr = min(dvr_r)
    dvr_fit = osd.fit(np.array(dvr_r), np.array(dvr_o), t0_dvr)
    c01_check = (
        osd.fit(np.array(c01_r), np.array(c01_o), min(c01_r)).offset_ms if len(c01_r) > 3 else None
    )

    if not runs:
        raise EvidenceFormatError("the export holds no DHAV frames to fit its clock from")
    nvr_r, nvr_o = [], []
    for run in runs:
        fr = decode_gray(run.annexb, "h264", 384, 288)[:, :10]
        raw = np.array([x.raw_ms for x in run.frames])[: len(fr)]
        a, b = _read_points(fr, raw, 25, font)
        nvr_r += a
        nvr_o += b
    if len(nvr_r) < 3:
        raise EvidenceFormatError(
            f"the on-screen clock read in only {len(nvr_r)} export frame(s); "
            "fitting the recorder clock needs at least 3"
        )
    t0_nvr = runs[0].start_ms
    nvr_fit = osd.fit(np.array(nvr_r), np.array(nvr_o), t0_nvr)
    return Clocks(font_accuracy, font_seg, dvr_fit, t0_dvr, nvr_fit, t0_nvr, c01_check)


def _seizure_block(s: Seizure, fit: osd.Fit, t0: int) -> dict:
    shown = epoch_ms(s.shown_at())
    ref = epoch_ms(s.reference_at())
    dvr_minus_ref = (shown - ref) / 1000
    predicted = -(fit.offset_ms + fit.drift_ppm * (shown - t0) / 1e6) / 1000
    return {
        "dvrShown": s.dvr_shown,
        "reference": s.reference,
        "offsetSec": dvr_minus_ref,
        "resolutionSec": 1.0,
        "note": s.note,
        "agreementSec": round(abs(predicted - dvr_minus_ref), 3),
        "osdPredictedSec": round(predicted, 3),
    }


def _cross_check(fit: osd.Fit) -> dict:
    return {
        "method": "On-screen clock read from the pixels, least squares",
        "offsetSec": round(fit.offset_ms / 1000, 3),
        "driftPpm": round(fit.drift_ppm, 1),
        "uncertaintySec": round(fit.uncertainty_ms / 1000, 3),
        "residualMs": round(fit.residual_ms, 2),
        "framesRead": fit.used,
        "misreads": fit.rejected,
    }


def cameras(c: Clocks, seizure: dict[str, Seizure], truth: Planted) -> list[dict]:
    cams: list[dict[str, Any]] = [
        {
            "id": "CAM-01",
            "name": "Corridor",
            "sourceId": "EV-001",
            "channel": 1,
            "fps": 25,
            "width": 384,
            "height": 288,
            "clock": {
                "rawTz": "Recorder local time, zone not stored",
                "offsetSec": 0.0,
                "driftPpm": 0.0,
                "uncertaintySec": 1.0,
                "reference": True,
                "method": "Reference recorder. At seizure its screen matched the reference clock",
                "seizure": _seizure_block(seizure["EV-001"], c.dvr_fit, c.t0_dvr),
                "crossCheck": _cross_check(c.dvr_fit),
            },
        },
        {
            "id": "CAM-02",
            "name": "Shop front",
            "sourceId": "EV-002",
            "channel": 3,
            "fps": 25,
            "width": 384,
            "height": 288,
            "clock": {
                "rawTz": "Recorder local time, zone not stored",
                "offsetSec": round(c.nvr_fit.offset_ms / 1000, 3),
                "driftPpm": round(c.nvr_fit.drift_ppm, 1),
                "uncertaintySec": round(c.nvr_fit.uncertainty_ms / 1000, 3),
                "reference": False,
                "method": "Seizure record sets the offset to the second; the on-screen clock, "
                "read from the pixels, refines it to the frame and measures drift",
                "plantedOffsetSec": truth.nvr_offset_ms / 1000,
                "plantedDriftPpm": truth.nvr_drift_ppm,
                "seizure": _seizure_block(seizure["EV-002"], c.nvr_fit, c.t0_nvr),
                "crossCheck": _cross_check(c.nvr_fit),
            },
        },
    ]
    osd_note = {"fontFrom": f"EV-001-{c.font_seg.key}", "fontAccuracy": round(c.font_accuracy, 3)}
    for cam in cams:
        cam["clock"]["crossCheck"].update(osd_note)
    return cams


def alignment(c: Clocks, truth: Planted) -> list[dict]:
    f = c.nvr_fit
    return [
        {
            "a": "CAM-01",
            "b": "CAM-02",
            "offsetSec": round(f.offset_ms / 1000, 3),
            "uncertaintySec": round(f.uncertainty_ms / 1000, 3),
            "score": round(1 - f.rejected / max(f.used + f.rejected, 1), 3),
            "plantedSec": truth.nvr_offset_ms / 1000,
            "driftPpm": round(f.drift_ppm, 1),
            "curve": [[round(x, 2), round(y, 4)] for x, y in f.points],
            "method": "Seizure record, refined by the on-screen clock read from the pixels",
        }
    ]
