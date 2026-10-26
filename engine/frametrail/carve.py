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


def cut_after(ps: bytes, frames: int) -> int | None:
    """Bytes the first `frames` frames of a stream take: up to the pack carrying the next
    frame. None if the stream holds no frame after them or cannot be read."""
    try:
        out = run(
            FFPROBE,
            "-v",
            "error",
            "-f",
            "mpeg",
            "-select_streams",
            "v:0",
            "-show_entries",
            "packet=pos",
            "-of",
            "csv=p=0",
            "pipe:0",
            stdin=ps,
        )
    except RuntimeError:
        return None
    # One line per frame, in order; a frame the demuxer cannot place reads N/A.
    after = [int(p) for p in out.decode().split()[frames:] if p.isdigit()]
    if not after:
        return None
    cut = ps.rfind(b"\x00\x00\x01\xba", 0, after[0] + 1)
    return cut if cut > 0 else None


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
