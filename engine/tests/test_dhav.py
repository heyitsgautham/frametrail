from datetime import datetime

from frametrail import dhav, nvr
from frametrail.fixture.build import access_units, is_idr
from frametrail.media import ffmpeg, probe_frames

START = dhav.epoch_ms(datetime(2004, 1, 20, 10, 5, 53, 477_000))


def frame(n: int, ms: int, key: bool = False, channel: int = 3, payload: bytes = b"") -> bytes:
    return dhav.pack_frame(payload or bytes([n % 256]) * 32, key, n, ms, channel, 384, 288, 25)


def test_date_field_round_trips_to_the_second():
    t = datetime(2031, 12, 31, 23, 59, 58)
    assert dhav.unpack_date(dhav.pack_date(t)) == t


def test_epoch_ms_and_from_ms_are_inverse():
    t = datetime(2004, 1, 20, 10, 5, 53, 477_000)
    assert dhav.from_ms(dhav.epoch_ms(t)) == t


def test_frames_carry_millisecond_time_and_payload():
    data = frame(0, START, key=True, payload=b"KEY") + frame(1, START + 40, payload=b"P1")
    a, b = dhav.parse(data)
    assert (a.key, a.number, a.raw_ms, data[a.payload]) == (True, 0, START, b"KEY")
    assert (b.key, b.number, b.raw_ms, data[b.payload]) == (False, 1, START + 40, b"P1")
    assert b.offset == len(frame(0, START, key=True, payload=b"KEY"))


def test_bytes_between_frames_are_skipped():
    data = b"\xff" * 13 + frame(0, START) + b"DHAV not a frame" + frame(1, START + 40)
    assert [f.number for f in dhav.parse(data)] == [0, 1]
    assert dhav.parse(data)[0].offset == 13


def test_a_frame_with_a_broken_trailer_is_dropped():
    good = frame(1, START + 40)
    bad = bytearray(frame(0, START))
    bad[-8:-4] = b"xxxx"
    assert [f.number for f in dhav.parse(bytes(bad) + good)] == [1]


def test_a_truncated_last_frame_is_dropped():
    data = frame(0, START) + frame(1, START + 40)[:-3]
    assert [f.number for f in dhav.parse(data)] == [0]


def test_a_millisecond_counter_outside_the_named_second_falls_back_to_the_date():
    data = bytearray(frame(0, START))
    # The 16-bit counter sits after magic, 4 single bytes and three 32-bit fields.
    data[20:22] = ((START + 5000) & 0xFFFF).to_bytes(2, "little")
    (f,) = dhav.parse(bytes(data))
    assert f.raw_ms == START - START % 1000


def undated(raw: bytes) -> bytes:
    """The frame with month 0 in its date field, a date no recorder can mean."""
    data = bytearray(raw)
    d = int.from_bytes(data[16:20], "little")  # after magic, 4 single bytes and two fields
    data[16:20] = (d & ~(0x0F << 22)).to_bytes(4, "little")
    return bytes(data)


def test_an_impossible_date_is_dated_from_the_counter_after_the_previous_frame():
    data = frame(0, START) + undated(frame(1, START + 40)) + frame(2, START + 80)
    assert [(f.number, f.raw_ms) for f in dhav.parse(data)] == [
        (0, START),
        (1, START + 40),
        (2, START + 80),
    ]
    (run,) = nvr.parse(data)
    assert len(run.frames) == 3


def test_an_impossible_date_with_no_frame_before_it_is_skipped():
    data = undated(frame(0, START)) + frame(1, START + 40)
    assert [f.number for f in dhav.parse(data)] == [1]


def test_an_impossible_date_whose_counter_jumps_past_the_run_gap_is_skipped():
    data = frame(0, START) + undated(frame(1, START + 5000)) + frame(2, START + 80)
    assert [f.number for f in dhav.parse(data)] == [0, 2]


def test_dhav_round_trip_through_ffmpeg(tmp_path):
    h264 = ffmpeg(
        *("-f", "lavfi", "-i", "testsrc=size=384x288:rate=25:duration=2"),
        *("-c:v", "libx264", "-g", "25", "-bf", "0", "-x264-params", "aud=1"),
        *("-f", "h264", "pipe:1"),
    )
    aus = access_units(h264)
    assert [is_idr(au) for au in aus].count(True) == 2
    dav = b"".join(
        dhav.pack_frame(au, is_idr(au), n, START + n * 40, 3, 384, 288, 25)
        for n, au in enumerate(aus)
    )
    p = tmp_path / "t.dav"
    p.write_bytes(dav)
    assert probe_frames(p, "dhav") == len(aus) == 50
    (run,) = nvr.parse(dav)
    assert [f.raw_ms - START for f in run.frames[:3]] == [0, 40, 80]
    assert run.byte_end == len(dav)
    assert run.annexb == b"".join(aus)


def test_a_frame_whose_extension_overruns_it_is_dropped():
    # Byte 22 is the extension length. Claiming more extension bytes than the frame holds
    # used to yield a frame with an empty payload instead of rejecting it.
    bad = bytearray(frame(0, START, payload=b"P0"))
    bad[22] = 200
    good = frame(1, START + 40, payload=b"P1")
    frames = dhav.parse(bytes(bad) + good)
    assert [f.number for f in frames] == [1]
