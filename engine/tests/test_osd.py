import numpy as np
import pytest

from frametrail import osd
from frametrail.fixture import synthetic

W, H = synthetic.W, synthetic.H
DAY = synthetic.DAY_MS


def grey(start_ms: int, n: int) -> np.ndarray:
    return np.frombuffer(synthetic.frames(start_ms, n, seed=7), np.uint8).reshape(n, H, W)


def labels(start_ms: int, n: int) -> list[str]:
    return [osd.text_at((start_ms + i * 40) % DAY) for i in range(n)]


def test_text_at_formats_milliseconds_since_midnight():
    assert osd.text_at(0) == "00:00:00.000"
    assert osd.text_at(((10 * 60 + 7) * 60 + 33) * 1000 + 997) == "10:07:33.997"
    assert osd.text_at(DAY - 1) == "23:59:59.999"


def test_a_font_learned_on_one_clip_reads_another_clip_blind():
    a, b = 36_000_000, 37_234_560  # 10:00:00.000 and 10:20:34.560
    font = osd.learn(grey(a, 30), labels(a, 30))
    frames = grey(b, 50)
    for i, want in enumerate(labels(b, 50)):
        got = osd.read(frames[i], font)
        assert got is not None
        assert osd.text_at(got[0]) == want
        assert got[1] < 0.01


def test_learning_needs_every_digit():
    with pytest.raises(ValueError, match="no samples for digits"):
        osd.learn(grey(0, 1), ["00:00:00.000"])


def test_an_impossible_reading_is_refused():
    font = osd.learn(grey(36_000_000, 30), labels(36_000_000, 30))
    # Draw 99 in the hour slots: no clock shows hour 99.
    img = grey(36_000_000, 1)[0].copy()
    nine = synthetic._FONT["9"]
    for k in (0, 1):
        x = int(round(osd.ORIGIN + osd.PITCH * k))
        img[0:7, x : x + 5] = nine
    assert osd.read(img, font) is None


def test_fit_recovers_offset_and_drift_despite_misreads():
    raw = np.arange(0, 900_000, 1000) + 1_074_593_150_000
    osd_ms = raw + 97_400 + np.round((raw - raw[0]) * 120e-6)
    osd_ms[::7] += 5000  # a misread seconds digit on every seventh frame
    fit = osd.fit(raw, osd_ms, int(raw[0]))
    assert abs(fit.offset_ms - 97_400) < 2
    assert abs(fit.drift_ppm - 120) < 2
    assert fit.rejected == len(raw[::7])
    assert fit.used + fit.rejected == len(raw)
    assert fit.residual_ms < 1
    # Floored at half a frame, as the on-screen clock ticks once a frame.
    assert fit.uncertainty_ms == 20.0


def test_fit_of_a_clock_with_no_drift():
    raw = np.arange(0, 60_000, 40) + 1_000_000
    fit = osd.fit(raw, raw - 3_000, int(raw[0]))
    assert abs(fit.offset_ms + 3_000) < 1e-6
    assert abs(fit.drift_ppm) < 1e-6
    assert fit.rejected == 0
