"""The DVR disk layout our fixture uses, modelled on the published Hikvision layout.

Han, Jeong and Lee (2015) describe a Hikvision disk as a master sector at 0x200 that
starts with "HIKVISION@HANGZHOU" and records the capacity, the system log area, the video
area, the data block size and count, the HIKBTREE index, and the time the disk was
initialised; system log records signed "RATS" with a Unix time; a backup master sector
after the logs; a HIKBTREE index with a backup copy; and large data blocks of video.
Index times are Unix epoch seconds.

This module keeps those parts at laptop scale. Field order and sizes inside each
structure are our own, and "IMKH" segment headers carry a start time so a carved
segment can be dated. It is not a byte-exact Hikvision disk; docs/fixtures.md lists
every field and what it stands in for.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import TypedDict

from .errors import EvidenceFormatError

SIGNATURE = b"HIKVISION@HANGZHOU"
MASTER_AT = 0x200
MASTER_LEN = 0x100
LOG_AT = 0x10000
LOG_LEN = 0x8000
BACKUP_MASTER_AT = LOG_AT + LOG_LEN
INDEX_AT = 0x20000
INDEX_LEN = 0x8000  # one HIKBTREE copy; the backup follows it
INDEX_MAGIC = b"HIKBTREE"
DATA_AT = 0x100000
BLOCK = 32 * 1024
IMKH = b"IMKH"
IMKH_LEN = 40
RATS = b"RATS"
LOG_RECORD = 64
ENTRY_LEN = 64

# capacity, log offset, log size, video offset, block size, block count, index offset,
# index size, init time (epoch s), model, firmware
_MASTER = struct.Struct("<QQIQIIQII24s24s")
# in use, channel, flags, start s, start ms, end s, end ms, first block, block count, length
_ENTRY = struct.Struct("<BBHIHIHIIQ")
# magic, channel, codec, fps, start ms since epoch, frame count
_IMKH = struct.Struct("<4sBBHqI")
# magic, time s, ms, type, channel, text
_LOG = struct.Struct("<4s I H B B 48s")

LOG_TYPES = {
    1: "Power on",
    2: "Power off",
    3: "Recording started",
    4: "Recording stopped",
    5: "Video loss",
    6: "Video restored",
    7: "HDD initialised",
    8: "Local login",
}


@dataclass
class Master:
    capacity: int
    log_at: int
    log_len: int
    data_at: int
    block_size: int
    block_count: int
    index_at: int
    index_len: int
    init_s: int
    model: str
    firmware: str


@dataclass
class Entry:
    slot: int
    in_use: bool
    channel: int
    start_ms: int
    end_ms: int
    first_block: int
    block_count: int
    length: int


@dataclass
class LogRecord:
    offset: int
    ms: int
    type: int
    channel: int
    text: str


def pack_master(m: Master) -> bytes:
    body = _MASTER.pack(
        m.capacity,
        m.log_at,
        m.log_len,
        m.data_at,
        m.block_size,
        m.block_count,
        m.index_at,
        m.index_len,
        m.init_s,
        m.model.encode()[:24],
        m.firmware.encode()[:24],
    )
    sector = bytearray(MASTER_LEN)
    sector[0x10 : 0x10 + len(SIGNATURE)] = SIGNATURE
    sector[0x30 : 0x30 + len(body)] = body
    return bytes(sector)


def _text(raw: bytes) -> str:
    """Recorder text as written. Bytes that are not UTF-8, from damage or a multi-byte
    character cut at the field's end, stay visible as \\xNN escapes instead of failing."""
    return raw.rstrip(b"\0").decode(errors="backslashreplace")


def unpack_master(sector: bytes) -> Master:
    if sector[0x10 : 0x10 + len(SIGNATURE)] != SIGNATURE:
        raise EvidenceFormatError("no master signature")
    cap, log_at, log_len, data_at, block, count, index_at, index_len, init_s, model, fw = (
        _MASTER.unpack_from(sector, 0x30)
    )
    return Master(
        cap,
        log_at,
        log_len,
        data_at,
        block,
        count,
        index_at,
        index_len,
        init_s,
        _text(model),
        _text(fw),
    )


def pack_entry(e: Entry) -> bytes:
    s, sm = divmod(e.start_ms, 1000)
    en, em = divmod(e.end_ms, 1000)
    body = _ENTRY.pack(
        int(e.in_use), e.channel, 0, s, sm, en, em, e.first_block, e.block_count, e.length
    )
    return body.ljust(ENTRY_LEN, b"\0")


def unpack_entry(slot: int, raw: bytes) -> Entry:
    u, ch, _f, s, sm, en, em, fb, bc, ln = _ENTRY.unpack_from(raw)
    return Entry(slot, bool(u), ch, s * 1000 + sm, en * 1000 + em, fb, bc, ln)


def pack_index(entries: list[Entry], slots: int) -> bytes:
    body = bytearray(INDEX_MAGIC.ljust(64, b"\0"))
    by_slot = {e.slot: e for e in entries}
    for n in range(slots):
        body += pack_entry(by_slot[n]) if n in by_slot else bytes(ENTRY_LEN)
    return bytes(body)


def unpack_index(raw: bytes, slots: int) -> list[Entry]:
    if raw[:8] != INDEX_MAGIC:
        raise EvidenceFormatError("index magic missing")
    return [unpack_entry(n, raw[64 + n * ENTRY_LEN : 128 + n * ENTRY_LEN]) for n in range(slots)]


def pack_log(ms: int, kind: int, channel: int, text: str) -> bytes:
    s, m = divmod(ms, 1000)
    return _LOG.pack(RATS, s, m, kind, channel, text.encode()[:48]).ljust(LOG_RECORD, b"\0")


def unpack_logs(region: bytes, base: int) -> list[LogRecord]:
    out = []
    for o in range(0, len(region) - LOG_RECORD + 1, LOG_RECORD):
        if region[o : o + 4] != RATS:
            continue
        _m, s, ms, kind, ch, text = _LOG.unpack_from(region, o)
        out.append(LogRecord(base + o, s * 1000 + ms, kind, ch, _text(text)))
    return out


def pack_imkh(channel: int, fps: int, start_ms: int, frames: int) -> bytes:
    return _IMKH.pack(IMKH, channel, 0x1B, fps, start_ms, frames).ljust(IMKH_LEN, b"\0")


class SegmentHeader(TypedDict):
    channel: int
    codec: int
    fps: int
    start_ms: int
    frames: int


def unpack_imkh(raw: bytes) -> SegmentHeader | None:
    if raw[:4] != IMKH or len(raw) < IMKH_LEN:
        return None
    _m, ch, codec, fps, start, frames = _IMKH.unpack_from(raw)
    return {"channel": ch, "codec": codec, "fps": fps, "start_ms": start, "frames": frames}
