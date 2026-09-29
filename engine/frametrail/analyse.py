"""Run the whole case and write data/demo/derived/case.json plus clips.

Every number the web app shows comes from here. Planted fixture values (truth.json) are
read only to report validation errors, never to compute a result.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import numpy as np

from . import custody, detect, dvr, intake, nvr, osd
from .dhav import epoch_ms, from_ms
from .media import decode_gray, ffmpeg, probe_frames, version

CASE_ID = "FT-26-014"
EXAMINER = "Examiner 1"
DAY_MS = 86_400_000


def stamp(ms: float) -> str:
    return from_ms(round(ms)).isoformat(sep=" ", timespec="milliseconds")


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def frame_hashes(stream: bytes | Path, fmt: str | None) -> list[str]:
    """MD5 of every decoded frame, the way FFmpeg's framemd5 muxer reports them."""
    args = ["-f", fmt, "-i", "pipe:0"] if fmt else ["-i", stream]
    out = ffmpeg(*args, "-map", "0:v", "-f", "framemd5", "pipe:1", stdin=stream if fmt else None)
    return [ln.rsplit(",", 1)[1].strip() for ln in out.decode().splitlines() if ln and ln[0] != "#"]


def analyse(root: Path, run_detection: bool = True) -> dict:
    fx = root / "data" / "local" / "fixtures"
    clips = root / "data" / "local" / "clips"
    clips.mkdir(parents=True, exist_ok=True)
    out_path = root / "data" / "demo" / "derived" / "case.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    truth = json.loads((fx / "truth.json").read_text())
    seizure = json.loads((fx / "seizure.json").read_text())
    paths = {"EV-001": fx / "EV-001_dvr-disk.img", "EV-002": fx / "EV-002_nvr-export.dav"}
    log = custody.Log()
    tool = version()

    # Intake: hash first, then work only on bytes read through read-only handles.
    before = {k: intake.digest(p) for k, p in paths.items()}
    for p in paths.values():
        os.chmod(p, 0o444)
    img = paths["EV-001"].read_bytes()
    dav = paths["EV-002"].read_bytes()
    disk = dvr.parse(img)
    runs = nvr.parse(dav)
    ffmpeg_frames = probe_frames(paths["EV-002"], "dhav")
    our_frames = sum(len(r.frames) for r in runs)

    for k, d in before.items():
        seized = seizure[k]["reference"]
        log.add(seized, EXAMINER, "Seized and sealed", k, d.sha256)
        log.add(now(), EXAMINER, "Acquired read-only; MD5 and SHA-256 recorded", k, d.sha256)

    # --- On-screen clock, read from pixels -------------------------------------------
    # Glyph templates are learned from one header-dated segment and scored by how well
    # they read every other header-dated segment; the best-scoring font is used.
    dated = [f for f in disk.found if f.ps and f.state in ("indexed", "recovered-unindexed")]
    grey = {f.key: decode_gray(f.ps, "mpeg", 384, 288)[:, :10] for f in dated}

    def labels(f: dvr.Found, n: int) -> list[str]:
        return [osd.text_at((f.start_ms + i * 40) % DAY_MS) for i in range(n)]

    best = (-1.0, None, None)
    for f in dated:
        font_try = osd.learn(grey[f.key], labels(f, len(grey[f.key])))
        hits = total = 0
        for g in dated:
            if g is f:
                continue
            want = labels(g, len(grey[g.key]))
            for i in range(0, len(want), 25):
                x = osd.read(grey[g.key][i], font_try)
                hits += bool(x) and osd.text_at(x[0]) == want[i]
                total += 1
        if hits / total > best[0]:
            best = (hits / total, f, font_try)
    font_accuracy, font_seg, font = best

    def read_points(frames: np.ndarray, raw: np.ndarray, every: int) -> tuple[list, list]:
        r, o = [], []
        for i in range(0, len(frames), every):
            x = osd.read(frames[i], font)
            if x:
                r.append(raw[i])
                o.append(raw[i] - raw[i] % DAY_MS + x[0])
        return r, o

    dvr_r, dvr_o, c01_r, c01_o = [], [], [], []
    for f in disk.found:
        if not f.ps or f is font_seg:
            continue
        fr = decode_gray(f.ps, "mpeg", 384, 288)[:, :10]
        raw = f.start_ms + np.arange(len(fr)) * 40
        r, o = read_points(fr, raw, 5 if f.state == "partial" else 25)
        if f.state == "partial":
            c01_r, c01_o = r, o
        else:
            dvr_r += r
            dvr_o += o
    t0_dvr = min(dvr_r)
    dvr_fit = osd.fit(np.array(dvr_r), np.array(dvr_o), t0_dvr)
    # The headerless tail was dated by where it sits on disk; its own OSD checks that.
    c01_check = (
        osd.fit(np.array(c01_r), np.array(c01_o), min(c01_r)).offset_ms if len(c01_r) > 3 else None
    )

    nvr_r, nvr_o = [], []
    for r in runs:
        fr = decode_gray(r.annexb, "h264", 384, 288)[:, :10]
        raw = np.array([x.raw_ms for x in r.frames])[: len(fr)]
        a, b = read_points(fr, raw, 25)
        nvr_r += a
        nvr_o += b
    t0_nvr = runs[0].start_ms
    nvr_fit = osd.fit(np.array(nvr_r), np.array(nvr_o), t0_nvr)

    def to_ref_nvr(raw_ms: float) -> float:
        return raw_ms + nvr_fit.offset_ms + nvr_fit.drift_ppm * (raw_ms - t0_nvr) / 1e6

    def seizure_block(k: str, fit: osd.Fit, t0: int) -> dict:
        s = seizure[k]
        shown = epoch_ms(datetime.fromisoformat(s["dvrShown"]))
        ref = epoch_ms(datetime.fromisoformat(s["reference"]))
        dvr_minus_ref = (shown - ref) / 1000
        predicted = -(fit.offset_ms + fit.drift_ppm * (shown - t0) / 1e6) / 1000
        return {
            "dvrShown": s["dvrShown"],
            "reference": s["reference"],
            "offsetSec": dvr_minus_ref,
            "resolutionSec": 1.0,
            "note": s["note"],
            "agreementSec": round(abs(predicted - dvr_minus_ref), 3),
            "osdPredictedSec": round(predicted, 3),
        }

    cams = [
        {
            "id": "CAM-01",
            "name": "Corridor",
            "sourceId": "EV-001",
            "channel": 1,
            "fps": 25,
            "width": 384,
            "height": 288,
            "clock": {
                "rawTz": "Recorder local time, zone not stored",
                "offsetSec": 0.0,
                "driftPpm": 0.0,
                "uncertaintySec": 1.0,
                "reference": True,
                "method": "Reference recorder. At seizure its screen matched the reference clock",
                "seizure": seizure_block("EV-001", dvr_fit, t0_dvr),
                "crossCheck": {
                    "method": "On-screen clock read from the pixels, least squares",
                    "offsetSec": round(dvr_fit.offset_ms / 1000, 3),
                    "driftPpm": round(dvr_fit.drift_ppm, 1),
                    "uncertaintySec": round(dvr_fit.uncertainty_ms / 1000, 3),
                    "residualMs": round(dvr_fit.residual_ms, 2),
                    "framesRead": dvr_fit.used,
                    "misreads": dvr_fit.rejected,
                },
            },
        },
        {
            "id": "CAM-02",
            "name": "Shop front",
            "sourceId": "EV-002",
            "channel": 3,
            "fps": 25,
            "width": 384,
            "height": 288,
            "clock": {
                "rawTz": "Recorder local time, zone not stored",
                "offsetSec": round(nvr_fit.offset_ms / 1000, 3),
                "driftPpm": round(nvr_fit.drift_ppm, 1),
                "uncertaintySec": round(nvr_fit.uncertainty_ms / 1000, 3),
                "reference": False,
                "method": "Seizure record sets the offset to the second; the on-screen clock, "
                "read from the pixels, refines it to the frame and measures drift",
                "plantedOffsetSec": truth["nvrOffsetMs"] / 1000,
                "plantedDriftPpm": truth["nvrDriftPpm"],
                "seizure": seizure_block("EV-002", nvr_fit, t0_nvr),
                "crossCheck": {
                    "method": "On-screen clock read from the pixels, least squares",
                    "offsetSec": round(nvr_fit.offset_ms / 1000, 3),
                    "driftPpm": round(nvr_fit.drift_ppm, 1),
                    "uncertaintySec": round(nvr_fit.uncertainty_ms / 1000, 3),
                    "residualMs": round(nvr_fit.residual_ms, 2),
                    "framesRead": nvr_fit.used,
                    "misreads": nvr_fit.rejected,
                },
            },
        },
    ]
    osd_note = {"fontFrom": f"EV-001-{font_seg.key}", "fontAccuracy": round(font_accuracy, 3)}
    for c in cams:
        c["clock"]["crossCheck"].update(osd_note)

    # --- Segments, clips and provenance -----------------------------------------------
    ff = tool
    segments, nodes, edges = [], [], []
    for sid, d in before.items():
        nodes.append({"id": sid, "kind": "source", "label": paths[sid].name, "sha256": d.sha256})
    sys_blocks = disk.master.data_at // disk.master.block_size

    def add_segment(
        sid: str,
        cam: str,
        key: str,
        state: str,
        raw_s: float,
        raw_e: float,
        ref_s: float,
        ref_e: float,
        bs: int,
        be: int,
        data: bytes,
        stream: bytes,
        fmt: str,
        frames: int,
        note: str,
        how: str,
        evidence: list[str],
        first_block: int | None,
    ) -> dict:
        seg_id = f"{sid}-{key}"
        extent = data[bs:be]
        seg = {
            "id": seg_id,
            "cameraId": cam,
            "state": state,
            "rawStart": stamp(raw_s),
            "rawEnd": stamp(raw_e),
            "refStart": stamp(ref_s),
            "refEnd": stamp(ref_e),
            "extent": {"sourceId": sid, "byteStart": bs, "byteEnd": be},
            "md5": intake.md5(extent),
            "sha256": intake.sha256(extent),
            "frames": frames,
            "kept": [],
            "lost": [],
            "note": note,
            "how": how,
            "evidence": evidence,
        }
        if first_block is not None:
            seg["firstBlock"] = first_block
        ext_id = f"{seg_id}/bytes"
        nodes.append(
            {
                "id": ext_id,
                "kind": "extent",
                "label": f"Bytes {bs:#x} to {be:#x} of {sid}",
                "sha256": seg["sha256"],
            }
        )
        edges.append([sid, ext_id])
        if not stream:
            return seg
        mp4 = dvr.to_mp4(stream, fmt)
        clip = clips / f"{seg_id}.mp4"
        clip.write_bytes(mp4)
        mid = frames / 50
        ffmpeg(
            "-ss", f"{mid:.2f}", "-i", clip, "-frames:v", "1", "-q:v", "3", clips / f"{seg_id}.jpg"
        )
        same = frame_hashes(stream, fmt) == frame_hashes(clip, None)
        seg.update(clip=f"/clips/{seg_id}.mp4", poster=f"/clips/{seg_id}.jpg")
        seg["kept"] = [
            "Every coded video frame, copied without re-encoding",
            f"Decoded frames identical to the source stream ({frames} of {frames}, MD5 per frame)"
            if same
            else "Decoded frames differ from the source stream",
            "Frame order and timing at 25 fps",
        ]
        seg["lost"] = (
            [
                "Segment header fields (channel, start time) do not fit in MP4; kept here",
                "No audio was recorded on this channel",
            ]
            if fmt == "mpeg"
            else [
                "Per-frame DHAV headers (recorder date, frame number) do not fit in MP4; kept here",
                "No audio was recorded on this channel",
            ]
        )
        seg["remuxIdentical"] = same
        st_id, dv_id = f"{seg_id}/stream", f"{seg_id}/mp4"
        nodes.append(
            {
                "id": st_id,
                "kind": "stream",
                "label": "MPEG-PS video, header removed"
                if fmt == "mpeg"
                else "H.264 frames from DHAV",
                "sha256": intake.sha256(stream),
                "op": "extract",
                "tool": "frametrail",
            }
        )
        nodes.append(
            {
                "id": dv_id,
                "kind": "clip",
                "label": f"{seg_id}.mp4",
                "sha256": intake.sha256(mp4),
                "op": "remux, codec copy",
                "tool": ff,
            }
        )
        edges.extend([[ext_id, st_id], [st_id, dv_id]])
        log.add(
            now(), EXAMINER, f"Extracted {seg_id} and remuxed to MP4", dv_id, intake.sha256(mp4)
        )
        return seg

    for f in sorted(disk.found, key=lambda x: x.start_ms):
        fb = f.first_block + sys_blocks if f.state != "overwritten" else f.first_block
        segments.append(
            add_segment(
                "EV-001",
                "CAM-01",
                f.key,
                f.state,
                f.start_ms,
                f.end_ms,
                f.start_ms,
                f.end_ms,
                f.byte_start,
                f.byte_end,
                img,
                f.ps,
                "mpeg",
                f.frames,
                f.note,
                f.how,
                f.evidence,
                fb,
            )
        )
    for r in runs:
        segments.append(
            add_segment(
                "EV-002",
                "CAM-02",
                r.key,
                "indexed",
                r.start_ms,
                r.end_ms,
                to_ref_nvr(r.start_ms),
                to_ref_nvr(r.end_ms),
                r.byte_start,
                r.byte_end,
                dav,
                r.annexb,
                "h264",
                len(r.frames),
                "A continuous run of DHAV frames in the export.",
                "DHAV frame headers, recorder local time",
                [],
                None,
            )
        )

    # --- Detections ------------------------------------------------------------------
    detections = []
    if run_detection:
        detections = detect_people(root, clips, segments, cams)
        log.add(
            now(),
            "frametrail",
            f"AI-assisted person detection, {detect.MODEL['name']}",
            "detections",
            intake.sha256(json.dumps(detections, sort_keys=True).encode()),
        )

    # --- Write block check -----------------------------------------------------------
    after = {k: intake.digest(p) for k, p in paths.items()}
    for k in paths:
        log.add(
            now(),
            "frametrail",
            "Re-hashed after analysis; unchanged"
            if after[k].sha256 == before[k].sha256
            else "Re-hashed after analysis; CHANGED",
            k,
            after[k].sha256,
        )

    sources = [
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
                "model": disk.master.model,
                "firmware": disk.master.firmware,
            },
            "blocks": {
                "blockSize": disk.master.block_size,
                "total": sys_blocks + disk.master.block_count,
                "runs": _prefix(disk.runs),
            },
            "structures": {
                "masterSector": {
                    "offset": 0x200,
                    "backupOffset": disk.master.log_at + disk.master.log_len,
                    "backupMatches": disk.backup_matches,
                    "initialisedAt": stamp(disk.master.init_s * 1000),
                },
                "index": {
                    "offset": disk.master.index_at,
                    "copies": 2,
                    "copiesMatch": disk.index_copies_match,
                    "entries": sum(e.in_use for e in disk.entries),
                },
                "log": {"offset": disk.master.log_at, "records": len(disk.logs)},
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

    logs = [
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
    rf = disk.reformat
    reformat = None
    if rf:
        reformat = {
            "sourceId": "EV-001",
            "at": stamp(rf["at"]),
            "evidence": rf["evidence"],
            "timeReversal": {
                "blockOrder": rf["blockOrder"],
                "times": [stamp(t) for t in rf["times"]],
                "segments": [f"EV-001-{k}" for k in rf["keys"]],
            },
        }

    alignment = [
        {
            "a": "CAM-01",
            "b": "CAM-02",
            "offsetSec": round(nvr_fit.offset_ms / 1000, 3),
            "uncertaintySec": round(nvr_fit.uncertainty_ms / 1000, 3),
            "score": round(1 - nvr_fit.rejected / max(nvr_fit.used + nvr_fit.rejected, 1), 3),
            "plantedSec": truth["nvrOffsetMs"] / 1000,
            "driftPpm": round(nvr_fit.drift_ppm, 1),
            "curve": [[round(x, 2), round(y, 4)] for x, y in nvr_fit.points],
            "method": "Seizure record, refined by the on-screen clock read from the pixels",
        }
    ]

    recovered = [s for s in segments if s["state"] in ("recovered-unindexed", "partial")]
    rec_sec = sum(s["frames"] for s in recovered) / 25
    lost_seg = next((s for s in segments if s["state"] == "overwritten"), None)
    lost_sec = (
        (
            epoch_ms(datetime.fromisoformat(lost_seg["rawEnd"]))
            - epoch_ms(datetime.fromisoformat(lost_seg["rawStart"]))
        )
        / 1000
        if lost_seg
        else 0
    )
    stats = {
        "sources": 2,
        "evidenceBytes": sum(d.size for d in before.values()),
        "hashSecondsTotal": round(sum(d.seconds for d in before.values()), 3),
        "indexedSegments": sum(
            s["state"] == "indexed" and s["cameraId"] == "CAM-01" for s in segments
        ),
        "recoveredSegments": len(recovered),
        "recoveredSeconds": round(rec_sec, 1),
        "overwrittenSeconds": round(lost_sec, 1),
        "carveCandidates": disk.candidates,
        "carveRejected": len(disk.rejected),
        "nvrFrames": our_frames,
        "ffmpegDhavFrames": ffmpeg_frames,
        "offsetSec": round(nvr_fit.offset_ms / 1000, 3),
        "offsetPlantedSec": truth["nvrOffsetMs"] / 1000,
        "offsetErrorMs": round(nvr_fit.offset_ms - truth["nvrOffsetMs"], 2),
        "driftPpm": round(nvr_fit.drift_ppm, 1),
        "driftPlantedPpm": truth["nvrDriftPpm"],
        "seizureOffsetSec": cams[1]["clock"]["seizure"]["offsetSec"],
        "seizureAgreementSec": cams[1]["clock"]["seizure"]["agreementSec"],
        "osdFramesRead": nvr_fit.used + dvr_fit.used,
        "osdMisreads": nvr_fit.rejected + dvr_fit.rejected,
        "osdFontAccuracy": round(font_accuracy, 3),
        "partialDatingCheckMs": round(c01_check, 1) if c01_check is not None else "n/a",
        "remuxIdentical": sum(bool(s.get("remuxIdentical")) for s in segments),
        "clips": sum("clip" in s for s in segments),
        "logRecords": len(logs),
        "detections": len(detections),
        "custodyEvents": len(log.events),
        "initialisedAt": reformat["at"] if reformat else "none",
        "adapters": len(ADAPTERS),
        "adaptersTested": sum(a["status"] == "tested-on-fixture" for a in ADAPTERS),
    }
    case = {
        "id": CASE_ID,
        "title": "Bag taken from a shopping-centre corridor",
        "createdAt": now(),
        "examiner": EXAMINER,
        "tz": "Recorder local time. Neither recorder stores a time zone.",
        "sources": sources,
        "cameras": cams,
        "segments": segments,
        "alignment": alignment,
        "detections": detections,
        "provenance": {"nodes": nodes, "edges": edges},
        "custody": log.events,
        "adapters": ADAPTERS,
        "log": logs,
        "reformat": reformat,
        "stats": stats,
        "footage": {
            "name": "CAVIAR project, Lisbon shopping-centre sequences "
            "TwoEnterShop1, OneStopMoveEnter1, OneShopOneWait1",
            "url": "https://homepages.inf.ed.ac.uk/rbf/CAVIARDATA1/",
            "licence": "CC BY-SA",
            "credit": "EC Funded CAVIAR project/IST 2001 37540",
            "note": "Real CCTV footage, packed by us into synthetic recorder images.",
        },
        "tools": {"ffmpeg": tool, "model": detect.MODEL},
    }
    out_path.write_text(json.dumps(case, indent=1))
    return case


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


def detect_people(root: Path, clips: Path, segments: list[dict], cams: list[dict]) -> list[dict]:
    """Sample one frame a second from every clip and keep the moments a new person appears."""
    import cv2

    model = root / "data" / "local" / "models" / "yolox_s.onnx"
    if not model.exists():
        import urllib.request

        model.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(detect.URL, model)
    det = detect.Detector(model)
    thumbs = clips / "detections"
    thumbs.mkdir(exist_ok=True)
    out = []
    for s in segments:
        if "clip" not in s:
            continue
        path = clips / Path(s["clip"]).name
        cap = cv2.VideoCapture(str(path))
        raw0 = epoch_ms(datetime.fromisoformat(s["rawStart"]))
        ref0 = epoch_ms(datetime.fromisoformat(s["refStart"]))
        prev = 0
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if i % 25 == 0:
                people = [p for p in det.people(frame) if p[0] >= 0.5]
                if len(people) > prev:
                    best = max(people, key=lambda p: p[0])
                    did = f"D{len(out) + 1:03d}"
                    cv2.imwrite(str(thumbs / f"{did}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    out.append(
                        {
                            "id": did,
                            "cameraId": s["cameraId"],
                            "segmentId": s["id"],
                            "label": "person",
                            "refTime": stamp(ref0 + i * 40),
                            "rawTime": stamp(raw0 + i * 40),
                            "confidence": best[0],
                            "box": best[1],
                            "boxes": [p[1] for p in people],
                            "count": len(people),
                            "model": detect.MODEL,
                            "review": "pending",
                            "thumb": f"/clips/detections/{did}.jpg",
                        }
                    )
                prev = len(people)
            i += 1
        cap.release()
    return out


ADAPTERS = [
    {
        "vendor": "Hikvision",
        "family": "HIKBTREE disk",
        "formats": ["Raw disk image", "IMKH export"],
        "status": "tested-on-fixture",
        "ops": [
            "Identify",
            "Master sector and backup",
            "System log",
            "Both index copies",
            "Carve",
            "Detect initialisation",
        ],
        "note": "Fixture modelled on Han, Jeong and Lee (2015). Not yet run on a real disk.",
    },
    {
        "vendor": "Dahua",
        "family": "DHAV frames",
        "formats": [".dav export"],
        "status": "tested-on-fixture",
        "ops": ["Identify", "Parse frames", "Recorder time", "Remux"],
        "note": "Frames also read back by FFmpeg's own dhav demuxer. DHFS disk parsing is next.",
    },
    {
        "vendor": "CP Plus",
        "family": "Dahua OEM",
        "formats": [".dav export"],
        "status": "export-parser",
        "ops": ["Parse frames through the Dahua adapter"],
        "note": "Listed as a Dahua OEM (IPVM, 2024). Not yet tested on a real CP Plus file.",
    },
    {
        "vendor": "Honeywell",
        "family": "Own file system",
        "formats": ["Raw disk image"],
        "status": "next-phase",
        "ops": [],
        "note": "Undocumented file system studied by Yoon and Hwang (DFRWS USA 2026).",
    },
    {
        "vendor": "Uniview",
        "family": "Unknown",
        "formats": ["Raw disk image"],
        "status": "next-phase",
        "ops": [],
        "note": "No public on-disk specification found.",
    },
    {
        "vendor": "TP-Link VIGI",
        "family": "Unknown",
        "formats": ["USB export"],
        "status": "next-phase",
        "ops": [],
        "note": "TP-Link does not publish the export format.",
    },
    {
        "vendor": "Godrej",
        "family": "Unknown",
        "formats": [],
        "status": "next-phase",
        "ops": [],
        "note": "OEM source not publicly documented.",
    },
    {
        "vendor": "Matrix",
        "family": "SATATYA exports",
        "formats": [".mxs", ".avs", ".stm"],
        "status": "next-phase",
        "ops": [],
        "note": "Export formats named on Matrix's own wiki.",
    },
]
