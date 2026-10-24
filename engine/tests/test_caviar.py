"""The same checks on the CAVIAR fixture, real CCTV in a synthetic disk. They skip until
`frametrail fixtures` has downloaded the footage and `frametrail analyse` has run."""

import json
from pathlib import Path

import pytest

from frametrail import custody, dvr, hikfs

ROOT = Path(__file__).resolve().parents[2]
FX = ROOT / "data" / "local" / "fixtures"
needs_fixture = pytest.mark.skipif(
    not (FX / "EV-001_dvr-disk.img").exists(), reason="run `frametrail fixtures` first"
)


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
