"""Segments, their clips and the provenance graph that ties each clip to its source bytes.

Every segment hashes the byte extent it came from. A segment with a video stream is
remuxed to MP4 without re-encoding, and its decoded frames are compared one by one with
the source stream's, so the case can say the clip shows exactly what the bytes held.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from . import custody, dvr, intake, nvr
from .clocks import stamp
from .media import ffmpeg

EXAMINER = "Examiner 1"


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def frame_hashes(stream: bytes | Path, fmt: str | None) -> list[str]:
    """MD5 of every decoded frame, the way FFmpeg's framemd5 muxer reports them."""
    args = ["-f", fmt, "-i", "pipe:0"] if fmt else ["-i", stream]
    out = ffmpeg(*args, "-map", "0:v", "-f", "framemd5", "pipe:1", stdin=stream if fmt else None)
    return [ln.rsplit(",", 1)[1].strip() for ln in out.decode().splitlines() if ln and ln[0] != "#"]


class Extractor:
    """Writes clips into one folder and collects the provenance nodes and edges."""

    def __init__(self, clips: Path, log: custody.Log, tool: str, sources: dict) -> None:
        self.clips, self.log, self.tool = clips, log, tool
        self.nodes: list[dict] = [
            {"id": sid, "kind": "source", "label": p.name, "sha256": d.sha256}
            for sid, (p, d) in sources.items()
        ]
        self.edges: list[list[str]] = []

    def add(
        self,
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
        self.nodes.append(
            {
                "id": ext_id,
                "kind": "extent",
                "label": f"Bytes {bs:#x} to {be:#x} of {sid}",
                "sha256": seg["sha256"],
            }
        )
        self.edges.append([sid, ext_id])
        if not stream:
            return seg
        mp4 = dvr.to_mp4(stream, fmt)
        clip = self.clips / f"{seg_id}.mp4"
        clip.write_bytes(mp4)
        mid = frames / 50
        ffmpeg(
            "-ss",
            f"{mid:.2f}",
            "-i",
            clip,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            self.clips / f"{seg_id}.jpg",
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
        self.nodes.append(
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
        self.nodes.append(
            {
                "id": dv_id,
                "kind": "clip",
                "label": f"{seg_id}.mp4",
                "sha256": intake.sha256(mp4),
                "op": "remux, codec copy",
                "tool": self.tool,
            }
        )
        self.edges.extend([[ext_id, st_id], [st_id, dv_id]])
        self.log.add(
            now(), EXAMINER, f"Extracted {seg_id} and remuxed to MP4", dv_id, intake.sha256(mp4)
        )
        return seg

    def disk(self, disk: dvr.Disk, img: bytes) -> list[dict]:
        """Every segment found on the DVR disk, indexed, carved or overwritten, in time order."""
        sys_blocks = disk.master.data_at // disk.master.block_size
        out = []
        for f in sorted(disk.found, key=lambda x: x.start_ms):
            fb = f.first_block + sys_blocks if f.state != "overwritten" else f.first_block
            out.append(
                self.add(
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
        return out

    def export(
        self, runs: list[nvr.Run], dav: bytes, to_ref: Callable[[float], float]
    ) -> list[dict]:
        """Every continuous run in the NVR export, placed on the reference clock."""
        return [
            self.add(
                "EV-002",
                "CAM-02",
                r.key,
                "indexed",
                r.start_ms,
                r.end_ms,
                to_ref(r.start_ms),
                to_ref(r.end_ms),
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
            for r in runs
        ]
