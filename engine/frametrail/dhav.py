"""DHAV frames, the container inside Dahua .dav exports.

The layout follows FFmpeg's own dhav demuxer (libavformat/dhav.c): a 24-byte header
starting "DHAV", optional extension records, the codec payload, then an 8-byte "dhav"
trailer repeating the frame length. The date field packs local time into 32 bits and a
16-bit field carries a running millisecond counter.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from datetime import datetime

I_FRAME = 0xFD
P_FRAME = 0xFC
_HEAD = struct.Struct("<4sBBBBIII HBB")
HEAD_LEN = 24
CODEC_H264 = 0x02
GAP_MS = 1000  # a jump longer than this in the recorder clock starts a new run


def pack_date(t: datetime) -> int:
    return (
        (t.second & 0x3F)
        | (t.minute & 0x3F) << 6
        | (t.hour & 0x1F) << 12
        | (t.day & 0x1F) << 17
        | (t.month & 0x0F) << 22
        | ((t.year - 2000) & 0x3F) << 26
    )


def unpack_date(d: int) -> datetime:
    return datetime(
        ((d >> 26) & 0x3F) + 2000,
        (d >> 22) & 0x0F,
        (d >> 17) & 0x1F,
        (d >> 12) & 0x1F,
        (d >> 6) & 0x3F,
        d & 0x3F,
    )


def epoch_ms(t: datetime) -> int:
    """Milliseconds for a naive recorder-local time, treated as UTC for arithmetic."""
    return round((t - datetime(1970, 1, 1)).total_seconds() * 1000)


def from_ms(ms: int) -> datetime:
    from datetime import timedelta

    return datetime(1970, 1, 1) + timedelta(milliseconds=ms)


def pack_frame(
    payload: bytes, key: bool, number: int, raw_ms: int, channel: int, w: int, h: int, fps: int
) -> bytes:
    ext = b""
    if key:
        ext = bytes([0x80, 0, w // 8, h // 8, 0x81, 0, CODEC_H264, fps])
    length = HEAD_LEN + len(ext) + len(payload) + 8
    t = from_ms(raw_ms)
    head = _HEAD.pack(
        b"DHAV",
        I_FRAME if key else P_FRAME,
        0,
        channel,
        0,
        number,
        length,
        pack_date(t),
        raw_ms & 0xFFFF,
        len(ext),
        0,
    )
    return head + ext + payload + b"dhav" + struct.pack("<I", length)


@dataclass
class Frame:
    offset: int
    key: bool
    channel: int
    number: int
    raw_ms: int  # recorder-local time, recovered to the millisecond
    payload: slice


def parse(data: bytes) -> list[Frame]:
    """Walk every DHAV frame in a buffer. Bytes between frames are skipped, not trusted."""
    frames: list[Frame] = []
    prev: int | None = None
    pos = data.find(b"DHAV")
    while pos >= 0 and pos + HEAD_LEN <= len(data):
        _m, kind, _sub, ch, _subn, num, length, date, ms16, ext_len, _ck = _HEAD.unpack_from(
            data, pos
        )
        end = pos + length
        ok = (
            kind in (I_FRAME, P_FRAME)
            and length >= HEAD_LEN + ext_len + 8  # header, extensions and trailer fit
            and end <= len(data)
            and data[end - 8 : end - 4] == b"dhav"
        )
        if not ok:
            pos = data.find(b"DHAV", pos + 1)
            continue
        try:
            second = epoch_ms(unpack_date(date))
        except ValueError:
            second = None
        if second is not None:
            # The 16-bit counter is the full millisecond clock modulo 65536; pick the value
            # that falls inside the second the date field names.
            raw = second + ((ms16 - second) % 65536)
            if raw >= second + 1000:  # counter disagrees with the date: trust the date
                raw = second
        else:
            # The date names no real time, such as month 0 or 31 February. The counter
            # still places the frame after the one before it, but only within the gap
            # that keeps a run together; otherwise the frame cannot be dated and is skipped.
            step = None if prev is None else (ms16 - prev) % 65536
            if step is None or step > GAP_MS:
                pos = data.find(b"DHAV", end)
                continue
            raw = prev + step
        start = pos + HEAD_LEN + ext_len
        frames.append(Frame(pos, kind == I_FRAME, ch, num, raw, slice(start, end - 8)))
        prev = raw
        pos = data.find(b"DHAV", end)
    return frames
