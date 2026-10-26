"""Parse and recover a Hikvision-style disk image.

Reads the master sector and its backup, the system log, both index copies, then hands
every data block the index does not list to the carver in carve.py. Finally it checks
block order against time order: a recorder writes forward, so newer footage in lower
blocks than older footage means the disk was initialised and recording started again
from the first block (Han, Jeong and Lee, 2015).
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import NotRequired, TypedDict

from . import hikfs
from .carve import Found, Rejected, carve, decoded_frames
from .errors import EvidenceFormatError
from .media import ffmpeg


class BlockRun(TypedDict):
    """A stretch of consecutive blocks in one state, for the disk map."""

    start: int
    count: int
    state: str
    segmentId: NotRequired[str]
    lost: NotRequired[str]


class Reformat(TypedDict):
    """Proof the disk was initialised: when, why, and the time reversal along the disk."""

    at: int
    evidence: list[str]
    blockOrder: list[int]
    times: list[int]
    keys: list[str]


@dataclass
class Disk:
    master: hikfs.Master
    master_at: int  # MASTER_AT, or the backup's offset when the primary is wiped
    backup_matches: bool
    index_copies_match: bool
    index_at: int | None  # the index copy read: m.index_at, the backup after it, or None
    entries: list[hikfs.Entry]
    logs: list[hikfs.LogRecord]
    found: list[Found]
    runs: list[BlockRun]
    candidates: int
    rejected: list[Rejected]
    reformat: Reformat | None


def to_mp4(stream: bytes, fmt: str) -> bytes:
    """Remux without re-encoding, so every coded frame is carried over as it was.
    faststart needs a seekable output, so this goes through a temporary folder."""
    with tempfile.TemporaryDirectory() as d:
        src, dst = Path(d) / "in.bin", Path(d) / "out.mp4"
        src.write_bytes(stream)
        rate = ["-framerate", "25"] if fmt == "h264" else []
        ffmpeg("-f", fmt, *rate, "-i", src, "-c", "copy", "-movflags", "+faststart", dst)
        return dst.read_bytes()


def _geometry_problem(m: hikfs.Master) -> str | None:
    """Why a master sector's layout cannot be right, or None if it can be read."""
    if m.block_size < hikfs.IMKH_LEN:
        return (
            f"gives a data block size of {m.block_size} bytes, too small to hold a segment header"
        )
    if m.index_len < 64:
        return f"gives an index of {m.index_len} bytes, smaller than the index header"
    return None


def _master(img: bytes) -> tuple[hikfs.Master, int, bool]:
    """The master sector, the offset it was read from, and whether its backup matches it.

    The primary sits at MASTER_AT. If it is wiped, or its layout cannot be right, the next
    copy on the disk with a readable layout is used instead, normally the backup after the
    log area. A primary that was not used cannot be said to match its backup."""
    copies: list[int] = []
    if img[hikfs.MASTER_AT + 0x10 :].startswith(hikfs.SIGNATURE):
        copies.append(hikfs.MASTER_AT)
    sig = img.find(hikfs.SIGNATURE)
    while sig >= 0x10 and len(copies) < 8:
        if sig - 0x10 not in copies:
            copies.append(sig - 0x10)
        sig = img.find(hikfs.SIGNATURE, sig + 1)
    if not copies:
        raise EvidenceFormatError(
            "no Hikvision-style master sector signature; this is not a disk image FrameTrail reads"
        )
    problems = []
    for at in copies:
        sector = img[at : at + hikfs.MASTER_LEN]
        m = hikfs.unpack_master(sector)
        problem = _geometry_problem(m)
        if problem:
            problems.append(f"the master sector at {at:#x} {problem}")
            continue
        backup_at = m.log_at + m.log_len
        matches = at == hikfs.MASTER_AT and img[backup_at : backup_at + hikfs.MASTER_LEN] == sector
        return m, at, matches
    raise EvidenceFormatError("; ".join(problems) + "; no copy of it can be read")


def parse(img: bytes) -> Disk:
    m, master_at, backup_ok = _master(img)
    logs = hikfs.unpack_logs(img[m.log_at : m.log_at + m.log_len], m.log_at)
    copy_a = img[m.index_at : m.index_at + m.index_len]
    copy_b = img[m.index_at + m.index_len : m.index_at + 2 * m.index_len]
    entries, index_at = _index(img, m)
    B, base = m.block_size, m.data_at
    found: list[Found] = []
    owner: dict[int, str] = {}

    for e in (e for e in entries if e.in_use):
        key = f"N{len(found) + 1:02d}"
        a = base + e.first_block * B
        raw = img[a : a + e.length]
        ps = raw[hikfs.IMKH_LEN :] if hikfs.unpack_imkh(raw) else b""
        f = Found(
            key,
            "indexed",
            e.channel,
            e.start_ms,
            e.end_ms,
            a,
            a + e.length,
            e.first_block,
            ps,
            decoded_frames(ps),
            how="Index entry, Unix epoch time",
        )
        found.append(f)
        for b in range(e.first_block, e.first_block + e.block_count):
            owner[b] = key

    carving = carve(img, m, owner, found)
    for f in carving.found:
        for blk in range(f.first_block, -(-(f.byte_end - base) // B)):
            owner.setdefault(blk, f.key)
    found += carving.found

    reformat, lost = _reformat(m, logs, entries, index_at, found)
    if lost:
        found.append(lost)
    runs = _runs(m, owner, found, lost)
    return Disk(
        m,
        master_at,
        backup_ok,
        copy_a == copy_b,
        index_at,
        entries,
        logs,
        found,
        runs,
        carving.candidates,
        carving.rejected,
        reformat,
    )


def _index(img: bytes, m: hikfs.Master) -> tuple[list[hikfs.Entry], int | None]:
    """The entries of the first index copy whose header is intact, and where it sits.

    The recorder keeps a backup copy right after the primary for when the primary is damaged.
    With neither readable there are no entries, and the carver still walks every block."""
    slots = (m.index_len - 64) // hikfs.ENTRY_LEN
    for at in (m.index_at, m.index_at + m.index_len):
        raw = img[at : at + m.index_len]
        if raw[: len(hikfs.INDEX_MAGIC)] == hikfs.INDEX_MAGIC:
            return hikfs.unpack_index(raw, slots), at
    return [], None


def _index_line(m: hikfs.Master, entries: list[hikfs.Entry], index_at: int | None) -> str:
    listed = sum(e.in_use for e in entries)
    if index_at is None:
        return "Neither index copy can be read, so every segment here was carved"
    if index_at != m.index_at:
        return (
            f"The backup index copy lists only {listed} segments, all after it; "
            "the primary copy is damaged"
        )
    return f"Both index copies list only {listed} segments, all after it"


def _reformat(
    m: hikfs.Master,
    logs: list[hikfs.LogRecord],
    entries: list[hikfs.Entry],
    index_at: int | None,
    found: list[Found],
) -> tuple[Reformat | None, Found | None]:
    video = sorted((f for f in found if f.frames), key=lambda f: f.first_block)
    init_ms = m.init_s * 1000
    reversal = [(a, b) for a, b in zip(video, video[1:], strict=False) if b.start_ms < a.start_ms]
    if not reversal:
        return None, None
    a, b = reversal[0]
    sys_blocks = m.data_at // m.block_size
    older = [f for f in found if f.start_ms < init_ms and f.frames]
    rec = next((r for r in logs if r.type == 7), None)
    evidence = [
        f"Block {b.first_block + sys_blocks} holds footage recorded before block "
        f"{a.first_block + sys_blocks}'s: "
        "time runs backwards along the disk",
        f"The master sector records the disk as initialised at Unix time {m.init_s} "
        f"({datetime.fromtimestamp(m.init_s, UTC):%Y-%m-%d %H:%M:%S} recorder time)",
        f"{len(older)} carved segments are older than that; the index lists none of them",
        _index_line(m, entries, index_at),
    ]
    if rec:
        evidence.append(f'Recorder log at byte {rec.offset:#x}: "{rec.text}"')
    lost = None
    partial = next((f for f in found if f.state == "partial"), None)
    if partial:
        # Everything between the first data block and the surviving tail was overwritten
        # by footage recorded after initialisation.
        started = [r.ms for r in logs if r.type == 3 and r.ms < partial.start_ms]
        # The footage recorded after initialisation now sits in those blocks: the indexed
        # segments, or the carved ones when the index could not be read.
        holders = [
            f
            for f in found
            if f.state in ("indexed", "recovered-unindexed")
            and f.start_ms >= init_ms
            and f.first_block < partial.first_block
        ]
        end = max((f.byte_end for f in holders), default=partial.byte_start)
        lost = Found(
            "X01",
            "overwritten",
            partial.channel,
            min(started) if started else partial.start_ms,
            partial.start_ms,
            m.data_at,
            end,
            sys_blocks,
            how="From the recorder log and the surviving tail",
        )
        last = (end - 1 - m.data_at) // m.block_size + sys_blocks
        keys = ", ".join(f.key for f in holders) or "no footage FrameTrail can read"
        lost.note = (
            "Recorded before initialisation, then overwritten when recording restarted at "
            f"block 0. These blocks now hold {keys}."
        )
        lost.evidence = [
            *(
                [
                    f"Segment headers of {keys}, recorded after initialisation, sit in "
                    f"blocks {sys_blocks} to {last}"
                ]
                if holders
                else []
            ),
            *partial.evidence,
        ]
    return {
        "at": init_ms,
        "evidence": evidence,
        "blockOrder": [f.first_block + sys_blocks for f in video],
        "times": [f.start_ms for f in video],
        "keys": [f.key for f in video],
    }, lost


def _runs(
    m: hikfs.Master, owner: dict[int, str], found: list[Found], lost: Found | None
) -> list[BlockRun]:
    state_of = {f.key: f.state for f in found}
    lost_blocks: set[int] = set()
    if lost:
        lost_blocks = set(range(0, -(-(lost.byte_end - m.data_at) // m.block_size)))
    labels: list[tuple[str, str | None]] = [("system", None)] * (m.data_at // m.block_size)
    for b in range(m.block_count):
        seg = owner.get(b)
        if b in lost_blocks:
            labels.append(("overwritten", seg))
        elif seg:
            labels.append((state_of.get(seg, "indexed"), seg))
        else:
            labels.append(("free", None))
    runs: list[BlockRun] = []
    for i, (state, seg) in enumerate(labels):
        if runs and runs[-1]["state"] == state and runs[-1].get("segmentId") == seg:
            runs[-1]["count"] += 1
            continue
        item: BlockRun = {"start": i, "count": 1, "state": state}
        if seg:
            item["segmentId"] = seg
        if state == "overwritten":
            item["lost"] = "X01"
        runs.append(item)
    return runs
