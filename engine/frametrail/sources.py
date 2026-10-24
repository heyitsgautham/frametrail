"""What the case says about each piece of evidence: hashes, vendor, on-disk structures,
the recorder's own log and the wipe it records."""

from __future__ import annotations

from pathlib import Path

from . import dvr, intake, nvr
from .clocks import stamp
from .segments import EXAMINER

_LOG_KIND = {
    1: "power",
    2: "power",
    3: "record",
    4: "record",
    5: "video-loss",
    6: "video-loss",
    7: "hdd-init",
    8: "login",
}


def _vendor(ident: dict) -> dict:
    return {
        "family": ident["family"],
        "confidence": 1.0 if ident["matched"] else 0.0,
        "signature": ident["signature"],
        "matched": ident["matched"],
    }


def _prefix(runs: list[dict]) -> list[dict]:
    out = []
    for r in runs:
        r = dict(r)
        if "segmentId" in r:
            r["segmentId"] = f"EV-001-{r['segmentId']}"
        if "lost" in r:
            r["lost"] = f"EV-001-{r['lost']}"
        out.append(r)
    return out


def sources(
    paths: dict[str, Path],
    before: dict,
    after: dict,
    seizure: dict,
    disk: dvr.Disk,
    runs: list[nvr.Run],
    our_frames: int,
    ffmpeg_frames: int,
) -> list[dict]:
    m = disk.master
    sys_blocks = m.data_at // m.block_size
    return [
        {
            "id": "EV-001",
            "kind": "disk-image",
            "fileName": paths["EV-001"].name,
            "sizeBytes": before["EV-001"].size,
            "md5": before["EV-001"].md5,
            "sha256": before["EV-001"].sha256,
            "acquiredAt": seizure["EV-001"]["reference"],
            "acquiredBy": EXAMINER,
            "writeBlocked": after["EV-001"].sha256 == before["EV-001"].sha256,
            "hashSeconds": round(before["EV-001"].seconds, 3),
            "vendor": {
                **_vendor(intake.identify(paths["EV-001"])),
                "model": m.model,
                "firmware": m.firmware,
            },
            "blocks": {
                "blockSize": m.block_size,
                "total": sys_blocks + m.block_count,
                "runs": _prefix(disk.runs),
            },
            "structures": {
                "masterSector": {
                    "offset": 0x200,
                    "backupOffset": m.log_at + m.log_len,
                    "backupMatches": disk.backup_matches,
                    "initialisedAt": stamp(m.init_s * 1000),
                },
                "index": {
                    "offset": m.index_at,
                    "copies": 2,
                    "copiesMatch": disk.index_copies_match,
                    "entries": sum(e.in_use for e in disk.entries),
                },
                "log": {"offset": m.log_at, "records": len(disk.logs)},
                "carving": {"candidates": disk.candidates, "rejected": disk.rejected},
            },
        },
        {
            "id": "EV-002",
            "kind": "native-export",
            "fileName": paths["EV-002"].name,
            "sizeBytes": before["EV-002"].size,
            "md5": before["EV-002"].md5,
            "sha256": before["EV-002"].sha256,
            "acquiredAt": seizure["EV-002"]["reference"],
            "acquiredBy": EXAMINER,
            "writeBlocked": after["EV-002"].sha256 == before["EV-002"].sha256,
            "hashSeconds": round(before["EV-002"].seconds, 3),
            "vendor": _vendor(intake.identify(paths["EV-002"])),
            "structures": {
                "frames": our_frames,
                "ffmpegDhavFrames": ffmpeg_frames,
                "runs": len(runs),
            },
        },
    ]


def log_rows(disk: dvr.Disk) -> list[dict]:
    return [
        {
            "seq": n + 1,
            "rawTime": stamp(r.ms),
            "refTime": stamp(r.ms),
            "type": _LOG_KIND[r.type],
            "text": r.text,
            "sourceId": "EV-001",
            "byteOffset": r.offset,
        }
        for n, r in enumerate(disk.logs)
    ]


def reformat(disk: dvr.Disk) -> dict | None:
    rf = disk.reformat
    if not rf:
        return None
    return {
        "sourceId": "EV-001",
        "at": stamp(rf["at"]),
        "evidence": rf["evidence"],
        "timeReversal": {
            "blockOrder": rf["blockOrder"],
            "times": [stamp(t) for t in rf["times"]],
            "segments": [f"EV-001-{k}" for k in rf["keys"]],
        },
    }
