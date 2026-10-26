"""Comparing a clip's decoded frames with its source stream."""

import random

from frametrail import dvr, nvr
from frametrail.segments import frame_hashes


def _damaged(export: bytes) -> bytes:
    # Thirty bytes changed at random, as bad sectors under an export would leave.
    rng = random.Random(5)
    raw = bytearray(export)
    for _ in range(30):
        raw[rng.randrange(len(raw))] = rng.randrange(256)
    return bytes(raw)


def test_a_damaged_stream_decodes_to_the_same_frames_every_time(synth):
    # FFmpeg's threaded H.264 decoder conceals damage differently from run to run, so the
    # same bytes hashed twice used to disagree and an exact remux was reported as changed.
    run = nvr.parse(_damaged(synth.export))[0]
    first = frame_hashes(run.annexb, "h264")
    assert all(frame_hashes(run.annexb, "h264") == first for _ in range(3))


def test_the_clip_of_a_damaged_stream_matches_its_source(synth, tmp_path):
    for run in nvr.parse(_damaged(synth.export)):
        clip = tmp_path / f"{run.key}.mp4"
        clip.write_bytes(dvr.to_mp4(run.annexb, "h264"))
        assert frame_hashes(clip, None) == frame_hashes(run.annexb, "h264"), run.key
