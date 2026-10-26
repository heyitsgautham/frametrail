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


def mpeg2_pes(payload: bytes, sid: int = 0xE0) -> bytes:
    head = bytes([0x80, 0x00, 0x00])  # MPEG-2 flags, no PTS, header length 0
    body = head + payload
    return b"\x00\x00\x01" + bytes([sid]) + len(body).to_bytes(2, "big") + body


MPEG2_PACK = b"\x00\x00\x01\xba" + bytes([0x44]) + bytes(8) + bytes([0xF8])  # 14 bytes


def nal(kind: int, first_mb_zero: bool = True) -> bytes:
    return b"\x00\x00\x01" + bytes([0x60 | kind, 0x80 if first_mb_zero else 0x40]) + b"\x11" * 20


def test_frame_units_reads_mpeg2_packs_and_finds_each_access_unit():
    # Frame 1: SPS, PPS, IDR slice. Frame 2: a slice in two parts. Frame 3: a slice.
    one = mpeg2_pes(nal(7) + nal(8) + nal(5))
    two = mpeg2_pes(nal(1) + nal(1, first_mb_zero=False))
    audio = mpeg2_pes(b"\xff" * 30, sid=0xC0)
    three = mpeg2_pes(nal(1))
    ps = MPEG2_PACK + one + two + audio + MPEG2_PACK + three
    second = len(MPEG2_PACK) + len(one)
    third = second + len(two) + len(audio)
    assert carve.frame_units(ps) == [0, second, third]
    assert carve.cut_after(ps, 2) == third
    assert carve.cut_after(ps, 3) is None


def test_frame_units_skips_other_video_streams_and_junk_between_packets():
    other = mpeg2_pes(nal(5), sid=0xE1)
    one = mpeg2_pes(nal(9) + nal(5))
    junk = b"\x13\x37" * 5
    two = mpeg2_pes(nal(9) + nal(1))
    ps = one + other + junk + two
    # Only stream 0xE0 counts; the second frame's packet starts its own unit after the junk.
    assert carve.frame_units(ps) == [0, len(one) + len(other) + len(junk)]


def test_a_header_whose_start_time_is_no_real_date_is_rejected(disk, synth):
    # Damage to the high bytes of a header's start time gave a year past 9999, and dating
    # the clip later stopped the whole run with an OverflowError.
    c05 = next(f for f in disk.found if f.key == "C05")
    raw = bytearray(synth.image)
    raw[c05.byte_start + 8 : c05.byte_start + 16] = (1 << 62).to_bytes(8, "little")
    found = carve.carve(bytes(raw), disk.master, {}, [])
    assert c05.byte_start not in [f.byte_start for f in found.found]
    (r,) = [r for r in found.rejected if r["byteStart"] == c05.byte_start]
    assert r["decodedFrames"] == c05.frames
    assert "start time" in r["reason"]


def test_a_disk_with_an_impossible_header_time_still_runs(tmp_path):
    from frametrail import cli
    from frametrail.fixture import synthetic

    fx = tmp_path / "data" / "local" / "fixtures"
    synthetic.build(fx)
    img = fx / "EV-001_dvr-disk.img"
    raw = bytearray(img.read_bytes())
    at = next(f for f in dvr.parse(bytes(raw)).found if f.key == "C05").byte_start
    raw[at + 8 : at + 16] = (1 << 62).to_bytes(8, "little")
    img.write_bytes(bytes(raw))
    assert cli.main(["analyse", "--no-detect"], root=tmp_path) == 0
