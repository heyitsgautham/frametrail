import hashlib
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pytest

from frametrail import custody, dhav, dvr, hikfs, intake, nvr, osd
from frametrail.fixture.build import access_units, is_idr
from frametrail.media import ffmpeg, probe_frames

ROOT = Path(__file__).resolve().parents[2]
FX = ROOT / "data" / "local" / "fixtures"
needs_fixture = pytest.mark.skipif(
    not (FX / "EV-001_dvr-disk.img").exists(), reason="run `frametrail fixtures` first"
)


def test_streamed_hashes_match_hashlib(tmp_path):
    data = np.random.default_rng(1).bytes(3 * intake.CHUNK + 123)
    p = tmp_path / "x.bin"
    p.write_bytes(data)
    d = intake.digest(p)
    assert d.md5 == hashlib.md5(data).hexdigest()
    assert d.sha256 == hashlib.sha256(data).hexdigest()
    assert d.size == len(data)


def test_index_and_log_records_round_trip():
    e = hikfs.Entry(3, True, 1, 1_074_593_253_997, 1_074_593_277_997, 72, 44, 1_400_000)
    assert hikfs.unpack_entry(3, hikfs.pack_entry(e)) == e
    rec = hikfs.pack_log(1_074_594_665_000, 7, 0, "HDD 1 initialised, user admin")
    (got,) = hikfs.unpack_logs(rec, 0x10000)
    assert (got.ms, got.type, got.text) == (1_074_594_665_000, 7, "HDD 1 initialised, user admin")


def test_custody_chain_catches_an_edited_event():
    log = custody.Log()
    for n in range(5):
        log.add(f"2026-09-30T02:0{n}:00", "Examiner 1", "step", f"EV-{n}", "ab" * 32)
    events = json.loads(json.dumps(log.events))
    assert custody.verify(events) is None
    events[2]["actor"] = "Someone else"
    assert custody.verify(events) == 3


def test_osd_fit_recovers_offset_and_drift_despite_misreads():
    raw = np.arange(0, 900_000, 1000) + 1_074_593_150_000
    osd_ms = raw + 97_400 + np.round((raw - raw[0]) * 120e-6)
    osd_ms[::7] += 5000  # a misread seconds digit on every seventh frame
    fit = osd.fit(raw, osd_ms, int(raw[0]))
    assert abs(fit.offset_ms - 97_400) < 2
    assert abs(fit.drift_ppm - 120) < 2
    assert fit.rejected == len(raw[::7])


def test_dhav_round_trip_through_ffmpeg(tmp_path):
    h264 = ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=384x288:rate=25:duration=2",
        "-c:v",
        "libx264",
        "-g",
        "25",
        "-bf",
        "0",
        "-x264-params",
        "aud=1",
        "-f",
        "h264",
        "pipe:1",
    )
    aus = access_units(h264)
    start = dhav.epoch_ms(datetime(2004, 1, 20, 10, 5, 53, 477_000))
    dav = b"".join(
        dhav.pack_frame(au, is_idr(au), n, start + n * 40, 3, 384, 288, 25)
        for n, au in enumerate(aus)
    )
    p = tmp_path / "t.dav"
    p.write_bytes(dav)
    assert probe_frames(p, "dhav") == len(aus) == 50
    (run,) = nvr.parse(dav)
    assert [f.raw_ms - start for f in run.frames[:3]] == [0, 40, 80]
    assert run.byte_end == len(dav)


@needs_fixture
def test_carver_recovers_footage_from_before_initialisation_and_rejects_the_decoy():
    truth = json.loads((FX / "truth.json").read_text())
    disk = dvr.parse((FX / "EV-001_dvr-disk.img").read_bytes())
    by = {f.key: f for f in disk.found}
    carved = [f for f in disk.found if f.state == "recovered-unindexed"]
    before = truth["segmentsBefore"]
    # Segments 3 to 8 keep their headers; each is found at its true start time.
    assert sorted(f.start_ms for f in carved) == [s["start"] for s in before[2:]]
    # Segment 2 lost its head; the tail is dated to its first keyframe, 6 s in.
    assert by["C01"].state == "partial"
    assert by["C01"].start_ms == before[1]["start"] + 150 * 40
    assert [r["byteStart"] for r in disk.rejected] == [truth["decoyByte"]]


@needs_fixture
def test_overwritten_range_and_initialisation_are_flagged():
    truth = json.loads((FX / "truth.json").read_text())
    disk = dvr.parse((FX / "EV-001_dvr-disk.img").read_bytes())
    lost = next(f for f in disk.found if f.state == "overwritten")
    after_end = max(f.byte_end for f in disk.found if f.state == "indexed")
    assert (lost.byte_start, lost.byte_end) == (hikfs.DATA_AT, after_end)
    assert lost.start_ms == truth["segmentsBefore"][0]["start"]
    assert disk.reformat and disk.reformat["at"] == truth["initialisedAt"]
    assert disk.backup_matches and disk.index_copies_match


@needs_fixture
def test_case_matches_planted_clock():
    case = json.loads((ROOT / "data" / "demo" / "derived" / "case.json").read_text())
    s = case["stats"]
    assert abs(s["offsetErrorMs"]) < 40  # within one frame
    assert abs(s["driftPpm"] - s["driftPlantedPpm"]) < 10
    assert s["ffmpegDhavFrames"] == s["nvrFrames"]
    assert s["remuxIdentical"] == s["clips"]
    assert custody.verify(case["custody"]) is None
