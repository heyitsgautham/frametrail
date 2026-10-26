"""The carver and wipe detection, on the synthetic disk: six segments recorded, the disk
initialised, two segments recorded again from block 0 over the first one and a half."""

import pytest

from frametrail import dvr, hikfs
from frametrail.errors import EvidenceFormatError


def by_state(disk: dvr.Disk, state: str) -> list[dvr.Found]:
    return [f for f in disk.found if f.state == state]


def test_the_planted_overwrite_is_one_and_a_half_segments(synth):
    # Guards the fixture itself: the tests below assume this layout.
    assert synth.truth["fullyOverwritten"] == [1]
    assert synth.truth["partlyOverwritten"] == [2]


def test_master_backup_and_index_copies_are_checked(disk, synth):
    assert disk.master.init_s * 1000 == synth.truth["initialisedAt"]
    assert disk.backup_matches and disk.index_copies_match
    assert len(disk.logs) == 10


def test_indexed_segments_are_the_ones_recorded_after_initialisation(disk, synth):
    indexed = by_state(disk, "indexed")
    after = synth.truth["segmentsAfter"]
    assert [f.start_ms for f in indexed] == [s["start"] for s in after]
    assert [f.frames for f in indexed] == [s["frames"] for s in after]
    assert [f.key for f in indexed] == ["N01", "N02"]


def test_carver_recovers_every_whole_segment_the_index_lost(disk, synth):
    carved = by_state(disk, "recovered-unindexed")
    before = synth.truth["segmentsBefore"]
    # Segments 3 to 6 keep their headers; each is found at its true start and length.
    assert [f.start_ms for f in carved] == [s["start"] for s in before[2:]]
    assert [f.frames for f in carved] == [s["frames"] for s in before[2:]]
    assert all(f.end_ms - f.start_ms == f.frames * 40 for f in carved)
    assert [f.first_block for f in carved] == [s["firstBlock"] for s in before[2:]]


def test_a_headless_tail_is_dated_to_its_first_keyframe(disk, synth):
    (tail,) = by_state(disk, "partial")
    seg2, seg3 = synth.truth["segmentsBefore"][1:3]
    # Keyframes fall once a second; the overwrite ends inside segment 2, so the tail starts
    # on a keyframe a whole number of seconds into it and runs to where segment 3 starts.
    assert tail.end_ms == seg3["start"]
    into = tail.start_ms - seg2["start"]
    assert 0 < into < seg2["frames"] * 40 and into % 1000 == 0
    assert tail.frames == seg2["frames"] - into // 40
    assert any("segment's head is missing" in e for e in tail.evidence)


def test_the_decoy_header_over_random_bytes_is_rejected(disk, synth):
    (r,) = disk.rejected
    assert r["byteStart"] == synth.truth["decoyByte"]
    assert (r["claimedFrames"], r["decodedFrames"]) == (400, 0)
    assert disk.candidates == 5  # four whole segments and the decoy


def test_the_overwritten_range_runs_from_the_data_area_to_the_new_footage(disk, synth):
    (lost,) = by_state(disk, "overwritten")
    after_end = max(f.byte_end for f in by_state(disk, "indexed"))
    assert (lost.byte_start, lost.byte_end) == (hikfs.DATA_AT, after_end)
    (tail,) = by_state(disk, "partial")
    assert (lost.start_ms, lost.end_ms) == (
        synth.truth["segmentsBefore"][0]["start"],
        tail.start_ms,
    )
    assert "N01, N02" in lost.note


def test_initialisation_is_found_from_time_running_backwards(disk, synth):
    rf = disk.reformat
    assert rf and rf["at"] == synth.truth["initialisedAt"]
    times = rf["times"]
    assert any(b < a for a, b in zip(times, times[1:], strict=False))
    assert rf["blockOrder"] == sorted(rf["blockOrder"])
    assert any("HDD 1 initialised" in e for e in rf["evidence"])
    assert any("time runs backwards" in e for e in rf["evidence"])


def test_block_runs_cover_the_whole_disk_in_order(disk):
    m = disk.master
    total = m.data_at // m.block_size + m.block_count
    runs = disk.runs
    assert runs[0] == {"start": 0, "count": m.data_at // m.block_size, "state": "system"}
    assert [r["start"] for r in runs[1:]] == [r["start"] + r["count"] for r in runs[:-1]]
    assert runs[-1]["start"] + runs[-1]["count"] == total
    states = {r["state"] for r in runs}
    assert states == {"system", "overwritten", "partial", "recovered-unindexed", "free"}


def test_a_disk_that_was_never_initialised_reports_no_wipe(synth, disk):
    # Keep only what the index lists and clear every block after it.
    m = disk.master
    used = max(e.first_block + e.block_count for e in disk.entries if e.in_use)
    end = m.data_at + used * m.block_size
    img = bytearray(synth.image)
    img[end:] = bytes(len(img) - end)
    clean = dvr.parse(bytes(img))
    assert clean.reformat is None
    assert {f.state for f in clean.found} == {"indexed"}
    assert clean.rejected == []


def test_a_changed_backup_index_is_reported(synth):
    img = bytearray(synth.image)
    img[hikfs.INDEX_AT + hikfs.INDEX_LEN + 70] ^= 0xFF
    disk = dvr.parse(bytes(img))
    assert not disk.index_copies_match
    assert disk.backup_matches


def wipe_primary_master(image: bytes) -> bytes:
    img = bytearray(image)
    img[hikfs.MASTER_AT : hikfs.MASTER_AT + hikfs.MASTER_LEN] = bytes(hikfs.MASTER_LEN)
    return bytes(img)


def test_an_intact_master_is_read_where_the_layout_puts_it(disk):
    assert disk.master_at == hikfs.MASTER_AT


def test_a_wiped_primary_master_is_read_from_its_backup_and_does_not_match_it(synth, disk):
    wiped = dvr.parse(wipe_primary_master(synth.image))
    # The backup was read, so the geometry and every result are the same as on the intact disk.
    assert wiped.master_at == hikfs.BACKUP_MASTER_AT
    assert wiped.master == disk.master
    assert [(f.key, f.state, f.start_ms) for f in wiped.found] == [
        (f.key, f.state, f.start_ms) for f in disk.found
    ]
    # The primary is gone, so it cannot be said to match its backup.
    assert not wiped.backup_matches


def with_master(image: bytes, offsets: list[int], **changes: int) -> bytes:
    img = bytearray(image)
    m = hikfs.unpack_master(image[hikfs.MASTER_AT : hikfs.MASTER_AT + hikfs.MASTER_LEN])
    sector = hikfs.pack_master(hikfs.Master(**{**m.__dict__, **changes}))
    for at in offsets:
        img[at : at + hikfs.MASTER_LEN] = sector
    return bytes(img)


def test_a_primary_master_with_an_impossible_block_size_falls_back_to_the_backup(synth, disk):
    damaged = dvr.parse(with_master(synth.image, [hikfs.MASTER_AT], block_size=0))
    assert damaged.master_at == hikfs.BACKUP_MASTER_AT
    assert damaged.master == disk.master
    assert not damaged.backup_matches
    assert len(damaged.found) == len(disk.found)


def test_no_readable_master_stops_with_the_field_named(synth):
    both = [hikfs.MASTER_AT, hikfs.BACKUP_MASTER_AT]
    with pytest.raises(EvidenceFormatError, match=r"at 0x200 gives a data block size of 0 bytes"):
        dvr.parse(with_master(synth.image, both, block_size=0))
    with pytest.raises(EvidenceFormatError, match=r"at 0x18000 gives an index of 10 bytes"):
        dvr.parse(with_master(synth.image, both, index_len=10))


def test_a_disk_with_no_master_signature_is_refused():
    with pytest.raises(EvidenceFormatError, match="not a disk image FrameTrail reads"):
        dvr.parse(bytes(0x200000))


def with_index(image: bytes, copies: int) -> bytes:
    """Zero the primary index copy, or both."""
    img = bytearray(image)
    img[hikfs.INDEX_AT : hikfs.INDEX_AT + copies * hikfs.INDEX_LEN] = bytes(
        copies * hikfs.INDEX_LEN
    )
    return bytes(img)


def test_an_intact_index_is_read_from_the_primary_copy(disk):
    assert disk.index_at == hikfs.INDEX_AT


def test_a_damaged_primary_index_is_read_from_the_backup_copy(synth, disk):
    damaged = dvr.parse(with_index(synth.image, 1))
    assert damaged.index_at == hikfs.INDEX_AT + hikfs.INDEX_LEN
    assert not damaged.index_copies_match
    assert [(f.key, f.state, f.start_ms) for f in damaged.found] == [
        (f.key, f.state, f.start_ms) for f in disk.found
    ]
    assert damaged.reformat
    assert any("backup index copy lists only 2" in e for e in damaged.reformat["evidence"])


def test_with_no_readable_index_the_carver_still_runs_and_finds_the_wipe(synth, disk):
    blind = dvr.parse(with_index(synth.image, 2))
    assert blind.index_at is None and blind.entries == []
    assert not by_state(blind, "indexed")
    # The first segment recorded after initialisation is carved from its header instead.
    first = by_state(disk, "indexed")[0]
    assert any(f.start_ms == first.start_ms for f in by_state(blind, "recovered-unindexed"))
    assert blind.reformat and blind.reformat["at"] == synth.truth["initialisedAt"]
    assert any("Neither index copy" in e for e in blind.reformat["evidence"])


def test_with_no_index_a_carved_segment_stops_at_its_header_frame_count(synth, disk):
    # With no index, nothing marks where a segment recorded after initialisation ends, and
    # its last block runs straight into the older footage behind it.
    blind = dvr.parse(with_index(synth.image, 2))
    whole = [f for f in disk.found if f.state in ("indexed", "recovered-unindexed")]
    carved = by_state(blind, "recovered-unindexed")
    assert [(f.start_ms, f.frames, f.byte_start, f.byte_end) for f in carved] == [
        (f.start_ms, f.frames, f.byte_start, f.byte_end) for f in whole
    ]
    # So the headless tail behind them is found and dated exactly as on the indexed disk,
    # and the only rejected header is the decoy.
    ((tail,), (was,)) = by_state(blind, "partial"), by_state(disk, "partial")
    assert (tail.start_ms, tail.end_ms, tail.frames) == (was.start_ms, was.end_ms, was.frames)
    assert [r["byteStart"] for r in blind.rejected] == [synth.truth["decoyByte"]]
    (lost,) = by_state(blind, "overwritten")
    assert "C01, C02" in lost.note


def test_a_complete_image_is_not_short(disk):
    assert disk.short_by == 0


def test_an_image_cut_short_says_how_much_is_missing(synth, disk):
    cut = dvr.parse(synth.image[:3_000_000])
    assert cut.short_by == len(synth.image) - 3_000_000
    # What lies before the cut is still found as on the whole image.
    kept = [f.key for f in disk.found if f.byte_end <= 3_000_000 and f.state != "overwritten"]
    assert set(kept) <= {f.key for f in cut.found}


def test_an_indexed_segment_past_the_end_of_the_image_is_flagged(synth):
    cut = dvr.parse(synth.image[:1_300_000])
    n01, n02 = by_state(cut, "indexed")
    assert n01.frames > 0 and "past the end of the image" in n01.note
    assert n02.frames == 0 and f"{cut.short_by} bytes shorter" in n02.note
