"""Carve video out of the data blocks an index does not list.

Walks every unclaimed, non-empty block. A run that starts with a segment header is kept if
its video decodes to the frame count the header claims, and rejected otherwise. A run with
video but no header is the tail of a segment whose head was overwritten; it is dated from
the carved segment that follows it on disk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TypedDict

from . import hikfs
from .media import FFPROBE, run


@dataclass
class Found:
    """One stretch of video bytes on the disk, however it was found."""

    key: str
    state: str  # indexed | partial | recovered-unindexed | overwritten
    channel: int
    start_ms: int
    end_ms: int
    byte_start: int
    byte_end: int
    first_block: int
    ps: bytes = b""  # MPEG-PS video, segment header removed
    frames: int = 0
    how: str = ""  # how the time was established
    note: str = ""
    evidence: list[str] = field(default_factory=list)
    pts: float | None = None  # first keyframe's PTS in a headerless tail, to date it


class Rejected(TypedDict):
    """A segment header the carver found but would not trust."""

    byteStart: int
    byteEnd: int
    claimedFrames: int
    decodedFrames: int
    reason: str


@dataclass
class Carving:
    """What the carver found: kept segments and tails in block order, and what it refused."""

    found: list[Found]
    candidates: int  # runs that started with a segment header
    rejected: list[Rejected]


def decoded_frames(ps: bytes) -> int:
    if not ps:
        return 0
    try:
        out = run(
            FFPROBE,
            "-v",
            "error",
            "-f",
            "mpeg",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "csv=p=0",
            "pipe:0",
            stdin=ps,
        )
    except RuntimeError:
        return 0
    text = out.decode().strip().split(",")[0]
    return int(text) if text.isdigit() else 0


def first_keyframe(ps: bytes) -> tuple[int, float] | None:
    """Byte position of the pack that carries the first keyframe, and that frame's PTS."""
    out = run(
        FFPROBE,
        "-v",
        "error",
        "-f",
        "mpeg",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=pts_time,flags,pos",
        "-of",
        "csv=p=0",
        "pipe:0",
        stdin=ps,
    )
    for line in out.decode().split():
        pts, pos, flags = (line.split(",") + ["", "", ""])[:3]
        if flags.startswith("K") and pts not in ("", "N/A") and pos.isdigit():
            pack = ps.rfind(b"\x00\x00\x01\xba", 0, int(pos) + 1)
            return max(pack, 0), float(pts)
    return None


_VCL = (1, 5)  # coded slices
_PREFIX = (6, 7, 8, 9, 14, 15, 16, 17, 18)  # NAL types that may open an access unit


def _units(ps: bytes) -> tuple[bytes, list[tuple[int, int]]]:
    """The first video stream's elementary bytes, and for each PES packet that carried them
    (offset in those bytes, offset in ps where the packet's unit starts). A unit starts at
    its pack header when the packet follows one directly, else at the packet itself."""
    es = bytearray()
    chunks: list[tuple[int, int]] = []
    video: int | None = None
    unit = -1  # where the current pack began, while nothing else has followed it
    i = ps.find(b"\x00\x00\x01")
    while 0 <= i and i + 6 <= len(ps):
        sid = ps[i + 3]
        if sid == 0xBA:  # pack header: MPEG-2 has a stuffing count, MPEG-1 is 12 bytes
            two = ps[i + 4] & 0xC0 == 0x40
            nxt = i + 14 + (ps[i + 13] & 7) if two else i + 12
            unit = i
        elif sid == 0xB9:  # program end
            nxt = i + 4
        elif sid == 0xBB or 0xBC <= sid:  # system header and every PES packet
            nxt = i + 6 + int.from_bytes(ps[i + 4 : i + 6], "big")
            if 0xE0 <= sid <= 0xEF and (video is None or sid == video):
                video = sid
                start = _payload(ps, i)
                chunks.append((len(es), unit if unit >= 0 else i))
                es += ps[start:nxt]
            if sid != 0xBB:
                unit = -1
        else:  # a start code inside data the walk could not follow: look for the next one
            i = ps.find(b"\x00\x00\x01", i + 3)
            continue
        i = ps.find(b"\x00\x00\x01", nxt) if nxt <= len(ps) else -1
        if i != nxt:
            unit = -1  # bytes between packets: the next packet starts its own unit
    return bytes(es), chunks


def _payload(ps: bytes, i: int) -> int:
    """Where a PES packet's payload starts, for MPEG-2 and MPEG-1 packet headers."""
    if ps[i + 6] & 0xC0 == 0x80:
        return i + 9 + ps[i + 8]
    k = i + 6
    while k < len(ps) and ps[k] == 0xFF:
        k += 1
    if k < len(ps) and ps[k] & 0xC0 == 0x40:  # buffer size
        k += 2
    if k < len(ps):
        k += {0x20: 5, 0x30: 10}.get(ps[k] & 0xF0, 1)
    return k


def frame_units(ps: bytes) -> list[int]:
    """For each H.264 access unit in the first video stream, the offset in ps of the unit
    that carries its first byte. Access units open on a delimiter, SPS, PPS or SEI after a
    slice, or on a slice whose first macroblock is 0 (H.264 section 7.4.1.2.3)."""
    es, chunks = _units(ps)
    out: list[int] = []
    seen_slice = False
    n = 0
    p = es.find(b"\x00\x00\x01")
    while 0 <= p and p + 4 <= len(es):
        kind = es[p + 3] & 0x1F
        first_mb_zero = kind in _VCL and p + 4 < len(es) and es[p + 4] & 0x80
        opens = (kind in _PREFIX and seen_slice) or (first_mb_zero and seen_slice) or not out
        if opens and (kind in _PREFIX or kind in _VCL):
            while n + 1 < len(chunks) and chunks[n + 1][0] <= p + 3:
                n += 1
            out.append(chunks[n][1])
            seen_slice = False
        if kind in _VCL:
            seen_slice = True
        p = es.find(b"\x00\x00\x01", p + 3)
    return out


def cut_after(ps: bytes, frames: int) -> int | None:
    """Bytes the first `frames` frames of a stream take: up to the unit that carries the
    next frame's first byte. None if the stream holds no frame after them."""
    units = frame_units(ps)
    if len(units) <= frames or units[frames] <= 0:
        return None
    return units[frames]


def carve(img: bytes, m: hikfs.Master, owner: dict[int, str], indexed: list[Found]) -> Carving:
    """Carve every block not in `owner`. `indexed` gives a whole segment to measure PTS on."""
    B, base = m.block_size, m.data_at
    candidates = 0
    rejected: list[Rejected] = []
    carved: list[Found] = []
    b = 0
    while b < m.block_count:
        if b in owner or not any(img[base + b * B : base + (b + 1) * B]):
            b += 1
            continue
        o = base + b * B
        head = hikfs.unpack_imkh(img[o : o + hikfs.IMKH_LEN])
        end = b + 1
        while end < m.block_count and end not in owner:
            nxt = base + end * B
            if hikfs.unpack_imkh(img[nxt : nxt + hikfs.IMKH_LEN]) or not any(img[nxt : nxt + B]):
                break
            end += 1
        raw = img[o : base + end * B].rstrip(b"\0")
        if head:
            candidates += 1
            ps = raw[hikfs.IMKH_LEN :]
            frames = decoded_frames(ps)
            cut = cut_after(ps, head["frames"]) if frames > head["frames"] else None
            if cut is not None:
                # The run went on past the segment's last frame into older footage, as it
                # does when no index marks the segment's end. Stop the segment where its
                # header says, and walk on from the next block for whatever follows.
                ps = ps[:cut]
                raw = raw[: hikfs.IMKH_LEN + cut]
                frames = decoded_frames(ps)
                end = -(-(o + len(raw) - base) // B)
            if frames and abs(frames - head["frames"]) <= 1:
                f = Found(
                    "",
                    "recovered-unindexed",
                    head["channel"],
                    head["start_ms"],
                    head["start_ms"] + frames * 1000 // head["fps"],
                    o,
                    o + len(raw),
                    b,
                    ps,
                    frames,
                    how="Segment header, carved",
                )
                f.note = "Found in blocks the index does not list. Header and every frame decode."
                carved.append(f)
            else:
                rejected.append(
                    {
                        "byteStart": o,
                        "byteEnd": o + len(raw),
                        "claimedFrames": head["frames"],
                        "decodedFrames": frames,
                        "reason": "Segment header found, but the bytes after it do not decode",
                    }
                )
        else:
            # Video with no header: the tail of a segment whose head was overwritten.
            pack = raw.find(b"\x00\x00\x01\xba")
            key_at = first_keyframe(raw[pack:]) if pack >= 0 else None
            if key_at:
                skip, pts = key_at
                ps = raw[pack + skip :]
                f = Found(
                    "", "partial", 1, 0, 0, o + pack + skip, o + len(raw), b, ps, decoded_frames(ps)
                )
                f.pts = pts
                carved.append(f)
        b = end

    # A headerless tail is dated from the segment that follows it on disk, recorded
    # without a break. The OSD check in analyse confirms or corrects this.
    carved.sort(key=lambda f: f.first_block)
    # Every whole segment's stream starts at the same PTS; measure it on one we have.
    whole = next((f for f in indexed + carved if f.state != "partial" and f.ps), None)
    whole_key = first_keyframe(whole.ps) if whole else None
    origin = whole_key[1] if whole_key else 0.0
    sys_blocks = base // B
    for i, f in enumerate(carved):
        if f.state == "partial":
            into = (f.pts or 0.0) - origin
            f.evidence.append(
                f"Block {f.first_block + sys_blocks} has video but no segment header; its first "
                f"keyframe is {into:.2f} s into a segment, so the segment's head is missing"
            )
            follows = carved[i + 1] if i + 1 < len(carved) else None
            if follows:
                f.end_ms = follows.start_ms
                f.start_ms = f.end_ms - f.frames * 40
                f.how = "Abuts the next carved segment; checked against the on-screen clock"
            f.note = "The head of this segment and everything before it were overwritten."
    for n, f in enumerate(carved):
        f.key = f"C{n + 1:02d}"
    return Carving(carved, candidates, rejected)
