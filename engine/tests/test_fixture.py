from frametrail.fixture import build


def test_access_units_split_at_each_delimiter():
    aud = b"\0\0\0\1\x09\xf0"
    idr = b"\0\0\1\x65\x88"
    p = b"\0\0\1\x41\x9a"
    stream = aud + idr + aud + p + aud + p
    aus = build.access_units(stream)
    assert aus == [aud + idr, aud + p, aud + p]
    assert [build.is_idr(au) for au in aus] == [True, False, False]


def test_nvr_clock_is_slow_by_the_offset_and_loses_drift_after_t0():
    t0 = 1_000_000_000
    assert build.nvr_clock(t0, t0, 97_400, 120.0) == t0 - 97_400
    # 1000 s later a 120 ppm clock has lost a further 120 ms.
    assert build.nvr_clock(t0 + 1_000_000, t0, 97_400, 120.0) == t0 + 1_000_000 - 97_520


def test_pack_dvr_reports_what_the_new_footage_overwrote():
    blk = build.hikfs.BLOCK
    clip = bytes([1]) * (3 * blk - build.hikfs.IMKH_LEN)  # exactly three blocks with header
    before = [(1000, 10, clip), (2000, 10, clip), (3000, 10, clip)]
    after = [(9000, 10, bytes([2]) * (4 * blk - build.hikfs.IMKH_LEN))]
    image, truth = build.pack_dvr(before, after, 5_000_000, 6_000_000, [])
    assert [s["firstBlock"] for s in truth["segmentsBefore"]] == [0, 3, 6]
    assert truth["fullyOverwritten"] == [1]
    assert truth["partlyOverwritten"] == [2]
    assert truth["overwrittenBytes"] == [build.hikfs.DATA_AT, build.hikfs.DATA_AT + 4 * blk]
    assert len(image) == build.hikfs.DATA_AT + (9 + 6) * blk
    assert image[truth["decoyByte"] : truth["decoyByte"] + 4] == b"IMKH"
