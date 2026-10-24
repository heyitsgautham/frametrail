import pytest

from frametrail import hikfs


def master() -> hikfs.Master:
    return hikfs.Master(
        1 << 22,
        hikfs.LOG_AT,
        hikfs.LOG_LEN,
        hikfs.DATA_AT,
        hikfs.BLOCK,
        96,
        hikfs.INDEX_AT,
        hikfs.INDEX_LEN,
        1_074_594_665,
        "HV-7208-FX",
        "V4.30",
    )


def test_master_sector_round_trips():
    sector = hikfs.pack_master(master())
    assert len(sector) == hikfs.MASTER_LEN
    assert sector[0x10:0x22] == hikfs.SIGNATURE
    assert hikfs.unpack_master(sector) == master()


def test_master_sector_without_signature_is_refused():
    with pytest.raises(ValueError, match="no master signature"):
        hikfs.unpack_master(bytes(hikfs.MASTER_LEN))


def test_index_and_log_records_round_trip():
    e = hikfs.Entry(3, True, 1, 1_074_593_253_997, 1_074_593_277_997, 72, 44, 1_400_000)
    assert hikfs.unpack_entry(3, hikfs.pack_entry(e)) == e
    rec = hikfs.pack_log(1_074_594_665_000, 7, 0, "HDD 1 initialised, user admin")
    (got,) = hikfs.unpack_logs(rec, 0x10000)
    assert (got.ms, got.type, got.text, got.offset) == (
        1_074_594_665_000,
        7,
        "HDD 1 initialised, user admin",
        0x10000,
    )


def test_index_keeps_empty_slots_in_place():
    used = hikfs.Entry(2, True, 1, 1000, 2000, 5, 3, 90_000)
    entries = hikfs.unpack_index(hikfs.pack_index([used], 4), 4)
    assert [e.in_use for e in entries] == [False, False, True, False]
    assert entries[2] == used


def test_index_without_magic_is_refused():
    with pytest.raises(ValueError, match="index magic"):
        hikfs.unpack_index(bytes(64 + 4 * hikfs.ENTRY_LEN), 4)


def test_log_reader_skips_slots_that_are_not_records():
    a = hikfs.pack_log(1_000_000, 1, 0, "System power on")
    b = hikfs.pack_log(2_000_000, 2, 0, "System power off")
    region = a + bytes(hikfs.LOG_RECORD) + b"junk".ljust(hikfs.LOG_RECORD, b"\0") + b
    got = hikfs.unpack_logs(region, 0x100)
    assert [(r.offset, r.text) for r in got] == [
        (0x100, "System power on"),
        (0x100 + 3 * hikfs.LOG_RECORD, "System power off"),
    ]


def test_log_text_is_cut_at_48_bytes():
    (got,) = hikfs.unpack_logs(hikfs.pack_log(0, 3, 1, "x" * 80), 0)
    assert got.text == "x" * 48


def test_segment_header_round_trips_and_rejects_other_bytes():
    raw = hikfs.pack_imkh(1, 25, 1_074_593_253_997, 400)
    assert len(raw) == hikfs.IMKH_LEN
    assert hikfs.unpack_imkh(raw) == {
        "channel": 1,
        "codec": 0x1B,
        "fps": 25,
        "start_ms": 1_074_593_253_997,
        "frames": 400,
    }
    assert hikfs.unpack_imkh(b"\0\0\1\xba" + raw[4:]) is None
    assert hikfs.unpack_imkh(raw[:20]) is None
