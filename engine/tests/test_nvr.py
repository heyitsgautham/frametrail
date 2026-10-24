from test_dhav import START, frame

from frametrail import nvr


def test_a_clock_jump_longer_than_a_second_starts_a_new_run():
    data = b"".join(frame(n, START + n * 40) for n in range(5))
    data += b"".join(frame(5 + n, START + 60_000 + n * 40) for n in range(3))
    a, b = nvr.parse(data)
    assert (a.key, len(a.frames), a.start_ms, a.end_ms) == ("R01", 5, START, START + 200)
    assert (b.key, len(b.frames), b.start_ms) == ("R02", 3, START + 60_000)
    assert a.byte_end == b.byte_start


def test_a_gap_of_exactly_one_second_stays_in_the_run():
    data = frame(0, START) + frame(1, START + nvr.GAP_MS)
    (run,) = nvr.parse(data)
    assert len(run.frames) == 2


def test_a_channel_change_starts_a_new_run():
    data = frame(0, START, channel=3) + frame(1, START + 40, channel=4)
    runs = nvr.parse(data)
    assert [r.channel for r in runs] == [3, 4]


def test_a_run_joins_its_payloads_into_one_stream():
    data = frame(0, START, payload=b"\0\0\1\x09A") + frame(1, START + 40, payload=b"\0\0\1\x09B")
    (run,) = nvr.parse(data)
    assert run.annexb == b"\0\0\1\x09A\0\0\1\x09B"


def test_the_synthetic_export_splits_into_its_planted_runs(synth):
    runs = nvr.parse(synth.export)
    assert [len(r.frames) for r in runs] == [100, 100]
    assert sum(len(r.frames) for r in runs) == synth.truth["nvrFrames"]
    # The export clock is slow by the planted offset at the first frame.
    assert synth.truth["nvrEpochMs"] - runs[0].start_ms == synth.truth["nvrOffsetMs"]
