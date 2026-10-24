"""Build the two evidence fixtures from public CAVIAR footage.

EV-001 is a small raw DVR disk image holding the corridor camera, in the layout of
frametrail.hikfs. EV-002 is a .dav export of DHAV frames holding the shop-front camera,
from a recorder whose clock runs slow. Both views are real CCTV from the EC-funded
CAVIAR project, Lisbon shopping-centre set, licensed CC BY-SA.

Planted, so the engine can be checked against them:
- the index entry of one corridor segment is wiped, its bytes left on disk;
- the recorder wrapped round and a later segment overwrote the head of the oldest one;
- the NVR clock is slow by a fixed offset plus a small drift;
- a stray IMKH header over random bytes sits in free space, which the carver must reject.

The planted values go to truth.json, which only validation reads.
"""

from __future__ import annotations

import json
import os
import random
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .. import dhav, hikfs
from ..dhav import epoch_ms
from ..media import ffmpeg

SOURCE = "https://homepages.inf.ed.ac.uk/rbf/CAVIARDATA2/{name}/{name}.mpg"
FPS = 25
FRAME_MS = 40
W, H = 384, 288
NVR_OFFSET_MS = 97_400  # the NVR clock reads this much behind true time
NVR_DRIFT_PPM = 120.0  # and loses a further 120 microseconds every second
DVR_CHANNEL = 1
NVR_CHANNEL = 3


@dataclass
class Sequence:
    name: str
    frames: int
    # Burned-in OSD time of frame 0 in each view, read off the footage by eye.
    cor_start: datetime
    front_start: datetime


SEQUENCES = [
    Sequence(
        "TwoEnterShop1",
        1645,
        datetime(2004, 1, 20, 10, 7, 33, 997_000),
        datetime(2004, 1, 20, 10, 7, 30, 877_000),
    ),
    Sequence(
        "OneStopMoveEnter1",
        1590,
        datetime(2004, 1, 20, 10, 22, 24, 157_000),
        datetime(2004, 1, 20, 10, 22, 21, 77_000),
    ),
]
# Corridor footage recorded before the disk was initialised, as frame ranges of each
# sequence in recording order, then the footage recorded after it.
CUTS = [
    (0, 0, 600),
    (0, 600, 1000),
    (0, 1000, 1350),
    (0, 1350, 1645),
    (1, 0, 425),
    (1, 425, 850),
    (1, 850, 1290),
    (1, 1290, 1590),
]
AFTER = Sequence(
    "OneShopOneWait1",
    750,
    datetime(2004, 1, 20, 10, 32, 32, 237_000),
    datetime(2004, 1, 20, 10, 32, 32, 237_000),
)
AFTER_CUTS = [(0, 375), (375, 750)]
INIT = datetime(2004, 1, 20, 10, 31, 5)  # "HDD initialised" by the local admin
SEIZED = datetime(2004, 1, 20, 10, 34, 10)


def _ms(t: datetime) -> int:
    return epoch_ms(t)


LOG = [
    (datetime(2004, 1, 20, 9, 58, 12), 1, 0, "System power on"),
    (datetime(2004, 1, 20, 10, 7, 33, 997_000), 3, 1, "Motion recording, camera 1"),
    (datetime(2004, 1, 20, 10, 8, 39, 797_000), 4, 1, "Recording stopped, camera 1"),
    (datetime(2004, 1, 20, 10, 15, 3), 5, 2, "Video loss, camera 2"),
    (datetime(2004, 1, 20, 10, 15, 41), 6, 2, "Video restored, camera 2"),
    (datetime(2004, 1, 20, 10, 22, 24, 157_000), 3, 1, "Motion recording, camera 1"),
    (datetime(2004, 1, 20, 10, 23, 27, 757_000), 4, 1, "Recording stopped, camera 1"),
    (datetime(2004, 1, 20, 10, 30, 48), 8, 0, "Local login, user admin"),
    (INIT, 7, 0, "HDD 1 initialised, user admin"),
    (datetime(2004, 1, 20, 10, 31, 52), 1, 0, "System power on"),
    (datetime(2004, 1, 20, 10, 32, 32, 237_000), 3, 1, "Motion recording, camera 1"),
    (datetime(2004, 1, 20, 10, 33, 2, 237_000), 4, 1, "Recording stopped, camera 1"),
    (SEIZED, 2, 0, "System power off"),
]


def download(dest: Path, seqs: list[Sequence]) -> dict[str, Path]:
    dest.mkdir(parents=True, exist_ok=True)
    paths = {}
    for s in seqs:
        for view in ("cor", "front") if s in SEQUENCES else ("cor",):
            name = f"{s.name}{view}"
            path = dest / f"{name}.mpg"
            if not path.exists():
                req = urllib.request.Request(
                    SOURCE.format(name=name), headers={"User-Agent": "frametrail-fixture"}
                )
                with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                    f.write(r.read())
            paths[name] = path
    return paths


def encode(src: Path, a: int, b: int, fmt: str) -> bytes:
    """Frames a..b of a CAVIAR clip as H.264. CAVIAR's MPEG-1 timestamps are unreliable,
    so frames are renumbered at 25 fps before cutting."""
    extra = ["-muxpreload", "0", "-muxdelay", "0"] if fmt == "mpeg" else []
    return ffmpeg(
        "-i",
        src,
        "-vf",
        f"setpts=N/({FPS}*TB),trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS",
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-g",
        str(FPS),
        "-bf",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-x264-params",
        "aud=1",
        *extra,
        "-f",
        fmt,
        "pipe:1",
    )


def access_units(annexb: bytes) -> list[bytes]:
    """Split an Annex B stream at its access unit delimiters."""
    marks = []
    i = annexb.find(b"\x00\x00\x01\x09")
    while i >= 0:
        start = i - 1 if i > 0 and annexb[i - 1] == 0 else i
        marks.append(start)
        i = annexb.find(b"\x00\x00\x01\x09", i + 4)
    marks.append(len(annexb))
    return [annexb[a:b] for a, b in zip(marks, marks[1:], strict=False)]


def is_idr(au: bytes) -> bool:
    i = au.find(b"\x00\x00\x01")
    while i >= 0:
        if au[i + 3] & 0x1F == 5:
            return True
        i = au.find(b"\x00\x00\x01", i + 3)
    return False


Clip = tuple[int, int, bytes]  # start ms, frame count, MPEG-PS video


def build_dvr(paths: dict[str, Path], out: Path) -> dict:
    """Record the eight early segments from block 0, initialise the disk, then record two
    more from block 0 again, as a recorder does after initialisation."""
    before, after = [], []
    for si, a, b in CUTS:
        s = SEQUENCES[si]
        start = _ms(s.cor_start) + a * FRAME_MS
        before.append((start, b - a, encode(paths[f"{s.name}cor"], a, b, "mpeg")))
    for a, b in AFTER_CUTS:
        start = _ms(AFTER.cor_start) + a * FRAME_MS
        after.append((start, b - a, encode(paths[f"{AFTER.name}cor"], a, b, "mpeg")))
    log = [(_ms(t), k, ch, text) for t, k, ch, text in LOG]
    image, truth = pack_dvr(before, after, _ms(INIT), _ms(SEIZED), log)
    out.write_bytes(image)
    return truth


def pack_dvr(
    before: list[Clip],
    after: list[Clip],
    init_ms: int,
    seized_ms: int,
    log: list[tuple[int, int, int, str]],
) -> tuple[bytes, dict]:
    """Lay segments out on a disk image the way a recorder that was initialised mid-way
    leaves it: `before` written forward from block 0, then `after` written from block 0
    again over the top, with only `after` in the index. A stray segment header over
    random bytes goes in free space for the carver to reject.

    Returns the image and the planted values the engine is checked against."""

    def lay(items: list[Clip]) -> tuple[list[tuple[int, int, int, int, bytes]], int]:
        at, placed = 0, []
        for start, frames, ps in items:
            payload = hikfs.pack_imkh(DVR_CHANNEL, FPS, start, frames) + ps
            n = -(-len(payload) // hikfs.BLOCK)
            placed.append((at, n, start, frames, payload))
            at += n
        return placed, at

    old, used = lay(before)
    new, new_used = lay(after)
    capacity = used + 6
    data = bytearray(capacity * hikfs.BLOCK)
    for first, _n, _s, _f, payload in old + new:  # the new footage lands on top of the old
        o = first * hikfs.BLOCK
        data[o : o + len(payload)] = payload
    rng = random.Random(26150)
    decoy_block = used + 2
    decoy = hikfs.pack_imkh(DVR_CHANNEL, FPS, old[2][2], 400) + rng.randbytes(20_000)
    data[decoy_block * hikfs.BLOCK : decoy_block * hikfs.BLOCK + len(decoy)] = decoy

    size = hikfs.DATA_AT + len(data)
    master = hikfs.Master(
        size,
        hikfs.LOG_AT,
        hikfs.LOG_LEN,
        hikfs.DATA_AT,
        hikfs.BLOCK,
        capacity,
        hikfs.INDEX_AT,
        hikfs.INDEX_LEN,
        init_ms // 1000,
        "HV-7208-FX",
        "V4.30 fixture",
    )
    # Initialisation emptied the index; only the footage recorded since is listed.
    entries = [
        hikfs.Entry(n, True, DVR_CHANNEL, start, start + frames * FRAME_MS, first, blocks, len(p))
        for n, (first, blocks, start, frames, p) in enumerate(new)
    ]
    index = hikfs.pack_index(entries, 32)
    logs = b"".join(hikfs.pack_log(ms, k, ch, text) for ms, k, ch, text in log)

    image = bytearray(size)
    image[hikfs.MASTER_AT : hikfs.MASTER_AT + hikfs.MASTER_LEN] = hikfs.pack_master(master)
    image[hikfs.LOG_AT : hikfs.LOG_AT + len(logs)] = logs
    image[hikfs.BACKUP_MASTER_AT : hikfs.BACKUP_MASTER_AT + hikfs.MASTER_LEN] = hikfs.pack_master(
        master
    )
    image[hikfs.INDEX_AT : hikfs.INDEX_AT + len(index)] = index
    image[hikfs.INDEX_AT + hikfs.INDEX_LEN : hikfs.INDEX_AT + hikfs.INDEX_LEN + len(index)] = index
    image[hikfs.DATA_AT : hikfs.DATA_AT + len(data)] = data

    lost_to = new_used * hikfs.BLOCK
    return bytes(image), {
        "initialisedAt": init_ms,
        "seizedAt": seized_ms,
        "segmentsBefore": [{"start": s, "frames": f, "firstBlock": b} for b, _n, s, f, _p in old],
        "segmentsAfter": [{"start": s, "frames": f, "firstBlock": b} for b, _n, s, f, _p in new],
        "fullyOverwritten": [
            i + 1 for i, (b, n, *_r) in enumerate(old) if (b + n) * hikfs.BLOCK <= lost_to
        ],
        "partlyOverwritten": [
            i + 1
            for i, (b, n, *_r) in enumerate(old)
            if b * hikfs.BLOCK < lost_to < (b + n) * hikfs.BLOCK
        ],
        "overwrittenBytes": [hikfs.DATA_AT, hikfs.DATA_AT + lost_to],
        "decoyByte": hikfs.DATA_AT + decoy_block * hikfs.BLOCK,
    }


def build_nvr(paths: dict[str, Path], out: Path) -> dict:
    runs = [
        (
            epoch_ms(s.front_start),
            access_units(encode(paths[f"{s.name}front"], 0, s.frames, "h264")),
        )
        for s in SEQUENCES
    ]
    dav, frames = pack_nvr(runs, NVR_OFFSET_MS, NVR_DRIFT_PPM)
    out.write_bytes(dav)
    return {
        "nvrOffsetMs": NVR_OFFSET_MS,
        "nvrDriftPpm": NVR_DRIFT_PPM,
        "nvrFrames": frames,
        "nvrEpochMs": runs[0][0],
    }


def nvr_clock(true_ms: int, t0: int, offset_ms: int, drift_ppm: float) -> int:
    """What a recorder that is `offset_ms` slow at t0, and loses `drift_ppm` after it, reads."""
    return true_ms - offset_ms - round((true_ms - t0) * drift_ppm / 1e6)


def pack_nvr(
    runs: list[tuple[int, list[bytes]]], offset_ms: int, drift_ppm: float
) -> tuple[bytes, int]:
    """DHAV frames for each run of H.264 access units, stamped with the slow recorder
    clock. Each run is (true start ms, access units). Returns the bytes and frame count."""
    t0 = runs[0][0]
    number = 0
    chunks = []
    for start, aus in runs:
        for i, au in enumerate(aus):
            raw = nvr_clock(start + i * FRAME_MS, t0, offset_ms, drift_ppm)
            chunks.append(dhav.pack_frame(au, is_idr(au), number, raw, NVR_CHANNEL, W, H, FPS))
            number += 1
    return b"".join(chunks), number


def build(root: Path) -> dict:
    local = root / "data" / "local"
    paths = download(local / "downloads", [*SEQUENCES, AFTER])
    fx = local / "fixtures"
    fx.mkdir(parents=True, exist_ok=True)
    for f in fx.glob("EV-*"):
        os.chmod(f, 0o644)
    truth = {
        "footage": "CAVIAR, Lisbon shopping-centre set, sequences "
        + ", ".join(s.name for s in SEQUENCES),
        "osdStarts": {
            s.name: {"cor": epoch_ms(s.cor_start), "front": epoch_ms(s.front_start)}
            for s in SEQUENCES
        },
        **build_dvr(paths, fx / "EV-001_dvr-disk.img"),
        **build_nvr(paths, fx / "EV-002_nvr-export.dav"),
        "builtAt": datetime.now().isoformat(timespec="seconds"),
    }
    (fx / "truth.json").write_text(json.dumps(truth, indent=2))
    (fx / "seizure.json").write_text(json.dumps(seizure_record(), indent=2))
    return truth


def seizure_record() -> dict:
    """What the examiner wrote down at seizure: each recorder's on-screen clock against a
    reference clock, read off the same photograph. Screens show whole seconds."""
    nvr_ref = datetime(2004, 1, 20, 11, 3, 50)
    t0 = epoch_ms(SEQUENCES[0].front_start)
    shown = nvr_clock(_ms(nvr_ref), t0, NVR_OFFSET_MS, NVR_DRIFT_PPM)
    dvr_ref = datetime(2004, 1, 20, 10, 34, 2)
    return {
        "EV-001": {
            "dvrShown": dvr_ref.isoformat(sep=" "),
            "reference": dvr_ref.isoformat(sep=" "),
            "note": "Photographed on the live view before power-off. Reference: NTP-synced phone.",
        },
        "EV-002": {
            "dvrShown": dhav.from_ms(shown - shown % 1000).isoformat(sep=" "),
            "reference": nvr_ref.isoformat(sep=" "),
            "note": "Photographed on the playback screen at export. Reference: NTP-synced phone.",
        },
    }


if __name__ == "__main__":
    print(json.dumps(build(Path(__file__).resolve().parents[3]), indent=2))
