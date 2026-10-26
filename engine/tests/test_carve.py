"""The carver on its own: what it keeps, what it refuses, and where it cuts a stream."""

from frametrail import carve, dvr, hikfs


def test_carving_with_no_index_claims_finds_every_segment_header(synth, disk):
    # With no block claimed, the indexed segments are carved from their headers too.
    found = carve.carve(synth.image, disk.master, {}, [])
    whole = [f for f in found.found if f.state == "recovered-unindexed"]
    assert len(whole) == 6
    assert [f.key for f in found.found] == [f"C{n + 1:02d}" for n in range(len(found.found))]
    assert found.candidates == 7  # six segments and the decoy
    assert len(found.rejected) == 1


def test_claimed_blocks_are_left_to_the_index(disk, synth):
    owner = {b: "N" for b in range(disk.master.block_count)}
    found = carve.carve(synth.image, disk.master, owner, [])
    assert (found.found, found.candidates, found.rejected) == ([], 0, [])


def test_a_header_over_bytes_that_do_not_decode_is_rejected_with_both_counts(disk, synth):
    (r,) = carve.carve(synth.image, disk.master, {}, []).rejected
    assert r["byteStart"] == synth.truth["decoyByte"]
    assert (r["claimedFrames"], r["decodedFrames"]) == (400, 0)
    assert "do not decode" in r["reason"]


def test_cut_after_stops_a_stream_at_a_pack_boundary_before_the_next_frame(disk):
    seg = next(f for f in disk.found if f.state == "indexed")
    cut = carve.cut_after(seg.ps, 25)
    assert cut is not None and 0 < cut < len(seg.ps)
    assert seg.ps[cut : cut + 4] == b"\x00\x00\x01\xba"
    assert carve.decoded_frames(seg.ps[:cut]) == 25


def test_cut_after_finds_nothing_past_the_last_frame_or_in_junk(disk):
    seg = next(f for f in disk.found if f.state == "indexed")
    assert carve.cut_after(seg.ps, seg.frames) is None
    assert carve.cut_after(b"\x00\x00\x01\xba" + bytes(range(256)) * 8, 0) is None


def test_decoded_frames_is_zero_for_no_bytes_and_for_junk():
    assert carve.decoded_frames(b"") == 0
    assert carve.decoded_frames(bytes(range(256)) * 16) == 0


def test_dvr_keeps_found_as_the_carver_type(disk):
    assert dvr.Found is carve.Found
    assert all(isinstance(f, carve.Found) for f in disk.found)
    assert hikfs.IMKH_LEN == 40  # carve cuts headers by this length
