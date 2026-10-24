"""The whole examination, run on the synthetic case without detection."""

import stat

from frametrail import custody, intake


def test_the_planted_nvr_clock_is_recovered_from_the_pixels(analysed):
    c, case = analysed
    s = case["stats"]
    assert abs(s["offsetErrorMs"]) < 40  # within one frame
    assert abs(s["driftPpm"] - c.truth["nvrDriftPpm"]) < 5
    assert s["osdFontAccuracy"] == 1.0
    assert s["osdMisreads"] == 0


def test_every_ffmpeg_frame_is_ours_and_every_clip_matches_its_source(analysed):
    _, case = analysed
    s = case["stats"]
    assert s["ffmpegDhavFrames"] == s["nvrFrames"] == 200
    assert s["clips"] == s["remuxIdentical"] == 9


def test_recovery_totals_match_the_planted_disk(analysed):
    _, case = analysed
    s = case["stats"]
    assert (s["indexedSegments"], s["recoveredSegments"]) == (2, 5)
    assert (s["carveCandidates"], s["carveRejected"]) == (5, 1)
    assert s["recoveredSeconds"] == 18.0
    assert s["overwrittenSeconds"] == 6.0
    assert s["initialisedAt"] == "2004-01-20 10:31:05.000"
    # The tail was dated by where it sits on disk; its own on-screen clock agrees.
    assert abs(s["partialDatingCheckMs"]) < 40


def test_the_custody_chain_verifies_and_ends_with_unchanged_rehashes(analysed):
    _, case = analysed
    events = case["custody"]
    assert custody.verify(events) is None
    assert len(events) == case["stats"]["custodyEvents"]
    assert [e["action"] for e in events[-2:]] == ["Re-hashed after analysis; unchanged"] * 2


def test_evidence_is_left_read_only_and_unchanged(analysed):
    c, case = analysed
    for src in case["sources"]:
        p = c.fixtures / src["fileName"]
        assert not p.stat().st_mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)
        assert src["writeBlocked"]
        assert intake.digest(p).sha256 == src["sha256"]


def test_each_segment_hash_covers_exactly_its_byte_extent(analysed):
    c, case = analysed
    data = {s["id"]: (c.fixtures / s["fileName"]).read_bytes() for s in case["sources"]}
    for seg in case["segments"]:
        x = seg["extent"]
        assert intake.sha256(data[x["sourceId"]][x["byteStart"] : x["byteEnd"]]) == seg["sha256"]


def test_clips_and_posters_are_written_for_every_segment_with_video(analysed):
    c, case = analysed
    clips = c.root / "data" / "local" / "clips"
    with_video = [s for s in case["segments"] if s["state"] != "overwritten"]
    for seg in with_video:
        assert (clips / f"{seg['id']}.mp4").stat().st_size > 0
        assert (clips / f"{seg['id']}.jpg").stat().st_size > 0
    (lost,) = [s for s in case["segments"] if s["state"] == "overwritten"]
    assert "clip" not in lost


def test_provenance_links_every_clip_back_to_a_source(analysed):
    _, case = analysed
    nodes = {n["id"]: n for n in case["provenance"]["nodes"]}
    parent = {b: a for a, b in case["provenance"]["edges"]}
    for nid, n in nodes.items():
        if n["kind"] != "clip":
            continue
        at = nid
        while at in parent:
            at = parent[at]
        assert nodes[at]["kind"] == "source"
