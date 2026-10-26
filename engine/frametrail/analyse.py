"""Run the whole case and write data/demo/derived/case.json plus clips.

Every number the web app shows comes from here. Planted fixture values (truth.json) are
read only to report validation errors, never to compute a result.

The steps live in their own modules: clocks reads each recorder's on-screen clock,
segments writes the clips and the provenance graph, sources describes the evidence, and
detect finds people for triage. This module runs them in order and adds up the stats.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from . import clocks, custody, detect, dvr, hikfs, intake, nvr, records, sources
from . import log as events
from .adapters import ADAPTERS
from .dhav import epoch_ms
from .errors import CaseFileError
from .media import probe_frames, version
from .segments import EXAMINER, Extractor, now

CASE_ID = "FT-26-014"
_log = events.get("analyse")


def analyse(root: Path, run_detection: bool = True) -> dict:
    fx = root / "data" / "local" / "fixtures"
    clips = root / "data" / "local" / "clips"
    out_path = root / "data" / "demo" / "derived" / "case.json"
    paths = {"EV-001": fx / "EV-001_dvr-disk.img", "EV-002": fx / "EV-002_nvr-export.dav"}
    # Check every input before touching the evidence or the disk, so a bad case changes nothing.
    for p in paths.values():
        if not p.is_file():
            raise CaseFileError(f"{p.name} is missing from {fx}; run `frametrail fixtures`")
    seizure = records.load_seizure(fx / "seizure.json", list(paths))
    truth = records.load_planted(fx / "truth.json")
    clips.mkdir(parents=True, exist_ok=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    log = custody.Log()
    tool = version()

    # Intake: hash first, then work only on bytes read through read-only handles.
    before = {k: intake.digest(p) for k, p in paths.items()}
    for k, d in before.items():
        events.event(
            _log,
            "evidence hashed",
            source=k,
            bytes=d.size,
            sha256=d.sha256,
            seconds=round(d.seconds, 3),
        )
    for p in paths.values():
        os.chmod(p, 0o444)
    img = paths["EV-001"].read_bytes()
    dav = paths["EV-002"].read_bytes()
    disk = dvr.parse(img)
    states = [f.state for f in disk.found]
    events.event(
        _log,
        "disk parsed",
        source="EV-001",
        indexed=states.count("indexed"),
        carved=states.count("recovered-unindexed") + states.count("partial"),
        overwritten=states.count("overwritten"),
        rejected=len(disk.rejected),
        log_records=len(disk.logs),
        initialised=disk.reformat is not None,
    )
    if disk.master_at != hikfs.MASTER_AT:
        events.event(
            _log,
            "master sector read from its backup",
            logging.WARNING,
            source="EV-001",
            primary=hex(hikfs.MASTER_AT),
            read_from=hex(disk.master_at),
        )
    if disk.short_by:
        events.event(
            _log,
            "image shorter than the disk it records",
            logging.WARNING,
            source="EV-001",
            missing_bytes=disk.short_by,
        )
    if disk.index_at != disk.master.index_at:
        events.event(
            _log,
            "index read from its backup" if disk.index_at else "no index copy readable",
            logging.WARNING,
            source="EV-001",
            primary=hex(disk.master.index_at),
            read_from=hex(disk.index_at) if disk.index_at else None,
        )
    runs = nvr.parse(dav)
    ffmpeg_frames = probe_frames(paths["EV-002"], "dhav")
    our_frames = sum(len(r.frames) for r in runs)
    events.event(
        _log,
        "export parsed",
        logging.INFO if our_frames == ffmpeg_frames else logging.WARNING,
        source="EV-002",
        runs=len(runs),
        frames=our_frames,
        ffmpeg_frames=ffmpeg_frames,
    )

    for k, d in before.items():
        seized = seizure[k].reference
        log.add(seized, EXAMINER, "Seized and sealed", k, d.sha256)
        log.add(now(), EXAMINER, "Acquired read-only; MD5 and SHA-256 recorded", k, d.sha256)

    clk = clocks.fit(disk, runs)
    for cam, fit in (("CAM-01", clk.dvr_fit), ("CAM-02", clk.nvr_fit)):
        events.event(
            _log,
            "clock fitted",
            camera=cam,
            offset_ms=round(fit.offset_ms, 1),
            drift_ppm=round(fit.drift_ppm, 1),
            frames_read=fit.used,
            misreads=fit.rejected,
        )
    cams = clocks.cameras(clk, seizure, truth)

    ex = Extractor(clips, log, tool, {k: (paths[k], d) for k, d in before.items()})
    segments = ex.disk(disk, img) + ex.export(runs, dav, clk.to_ref_nvr)
    clipped = [s for s in segments if "clip" in s]
    for s in clipped:
        if not s["remuxIdentical"]:
            events.event(_log, "clip differs from its source", logging.WARNING, segment=s["id"])
    events.event(
        _log,
        "segments extracted",
        segments=len(segments),
        clips=len(clipped),
        identical=sum(bool(s["remuxIdentical"]) for s in clipped),
    )

    detections = []
    if run_detection:
        detections = detect.detect_people(root, clips, segments, cams)
        log.add(
            now(),
            "frametrail",
            f"AI-assisted person detection, {detect.MODEL['name']}",
            "detections",
            intake.sha256(json.dumps(detections, sort_keys=True).encode()),
        )
        events.event(_log, "people detected", markers=len(detections), model=detect.MODEL["name"])

    # Write block check: the evidence must hash the same after the analysis as before it.
    after = {k: intake.digest(p) for k, p in paths.items()}
    for k in paths:
        same = after[k].sha256 == before[k].sha256
        events.event(
            _log,
            "write block checked",
            logging.INFO if same else logging.ERROR,
            source=k,
            unchanged=same,
        )
        log.add(
            now(),
            "frametrail",
            "Re-hashed after analysis; unchanged"
            if after[k].sha256 == before[k].sha256
            else "Re-hashed after analysis; CHANGED",
            k,
            after[k].sha256,
        )

    logs = sources.log_rows(disk)
    reformat = sources.reformat(disk)
    stats = _stats(
        before, disk, segments, clk, cams, truth, our_frames, ffmpeg_frames, logs, detections
    ) | {
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
        "sources": sources.sources(
            paths, before, after, seizure, disk, runs, our_frames, ffmpeg_frames
        ),
        "cameras": cams,
        "segments": segments,
        "alignment": clocks.alignment(clk, truth),
        "detections": detections,
        "provenance": {"nodes": ex.nodes, "edges": ex.edges},
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
    events.event(_log, "case written", path=str(out_path), custody_events=len(log.events))
    return case


def _stats(
    before: dict,
    disk: dvr.Disk,
    segments: list[dict],
    clk: clocks.Clocks,
    cams: list[dict],
    truth: records.Planted,
    our_frames: int,
    ffmpeg_frames: int,
    logs: list[dict],
    detections: list[dict],
) -> dict:
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
    nvr_fit, dvr_fit = clk.nvr_fit, clk.dvr_fit
    return {
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
        "offsetPlantedSec": truth.nvr_offset_ms / 1000,
        "offsetErrorMs": round(nvr_fit.offset_ms - truth.nvr_offset_ms, 2),
        "driftPpm": round(nvr_fit.drift_ppm, 1),
        "driftPlantedPpm": truth.nvr_drift_ppm,
        "seizureOffsetSec": cams[1]["clock"]["seizure"]["offsetSec"],
        "seizureAgreementSec": cams[1]["clock"]["seizure"]["agreementSec"],
        "osdFramesRead": nvr_fit.used + dvr_fit.used,
        "osdMisreads": nvr_fit.rejected + dvr_fit.rejected,
        "osdFontAccuracy": round(clk.font_accuracy, 3),
        "partialDatingCheckMs": round(clk.c01_check, 1) if clk.c01_check is not None else "n/a",
        "remuxIdentical": sum(bool(s.get("remuxIdentical")) for s in segments),
        "clips": sum("clip" in s for s in segments),
        "logRecords": len(logs),
        "detections": len(detections),
    }
