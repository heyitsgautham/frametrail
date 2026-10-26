"""Person detection without the YOLOX model: a stand-in network checks the decoding of
the model's output, and a stand-in detector checks how clips are sampled into markers."""

import math
from pathlib import Path

import cv2
import numpy as np
import pytest

from frametrail import detect

ANCHORS = sum((detect.SIZE // s) ** 2 for s in (8, 16, 32))


class FakeNet:
    """Returns a prepared YOLOX output, one row per anchor: dx, dy, log w, log h, obj, classes."""

    def __init__(self, out: np.ndarray) -> None:
        self.out = out
        self.blob: np.ndarray | None = None

    def setInput(self, blob: np.ndarray) -> None:  # noqa: N802 - OpenCV's name
        self.blob = blob

    def forward(self) -> np.ndarray:
        return self.out[None]


def output(*anchors: tuple[int, int, float, float, float]) -> np.ndarray:
    """Rows for anchors on the stride-8 grid: (grid x, grid y, box side in pixels, obj, person)."""
    out = np.zeros((ANCHORS, 85), np.float32)
    for gx, gy, side, obj, person in anchors:
        row = gy * (detect.SIZE // 8) + gx
        out[row, 2:4] = math.log(side / 8)
        out[row, 4] = obj
        out[row, 5 + detect.PERSON] = person
    return out


def detector(monkeypatch: pytest.MonkeyPatch, out: np.ndarray) -> tuple[detect.Detector, FakeNet]:
    net = FakeNet(out)
    monkeypatch.setattr(detect.cv2.dnn, "readNetFromONNX", lambda _path: net)
    return detect.Detector(Path("model.onnx")), net


FRAME = np.zeros((288, 384, 3), np.uint8)  # a CAVIAR frame, scaled by 640 / 384 into the input


def test_a_box_is_decoded_back_to_fractions_of_the_frame(monkeypatch):
    det, net = detector(monkeypatch, output((20, 15, 80, 0.9, 0.9)))
    ((conf, box),) = det.people(FRAME)
    assert conf == pytest.approx(0.81, abs=1e-3)
    # Centre (160, 120) and side 80 in the 640 input are (96, 72) and 48 in the frame.
    assert box == pytest.approx([72 / 384, 48 / 288, 48 / 384, 48 / 288], abs=1e-4)
    # The frame is letterboxed into a 640 square padded with grey.
    assert net.blob is not None and net.blob.shape == (1, 3, 640, 640)
    assert net.blob[0, 0, 639, 639] == 114


def test_scores_under_the_threshold_are_dropped(monkeypatch):
    det, _ = detector(monkeypatch, output((20, 15, 80, 0.5, 0.5)))  # 0.25
    assert det.people(FRAME) == []
    assert len(det.people(FRAME, threshold=0.2)) == 1


def test_overlapping_boxes_keep_only_the_strongest(monkeypatch):
    det, _ = detector(
        monkeypatch, output((20, 15, 80, 0.9, 0.9), (21, 15, 80, 0.8, 0.8), (60, 50, 40, 0.7, 0.9))
    )
    confs = sorted(c for c, _ in det.people(FRAME))
    assert confs == pytest.approx([0.63, 0.81], abs=1e-3)


class FakeDetector:
    """Reports a scripted list of people for each sampled frame."""

    script: list[list[tuple[float, list[float]]]] = []

    def __init__(self, _model: Path) -> None:
        self.calls = 0

    def people(self, _bgr: np.ndarray) -> list[tuple[float, list[float]]]:
        found = FakeDetector.script[min(self.calls, len(FakeDetector.script) - 1)]
        self.calls += 1
        return found


def write_clip(path: Path, frames: int) -> None:
    out = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 25, (64, 48))
    for _ in range(frames):
        out.write(np.zeros((48, 64, 3), np.uint8))
    out.release()


SEGMENT = {
    "id": "EV-001-C01",
    "cameraId": "CAM-01",
    "clip": "/clips/EV-001-C01.mp4",
    "rawStart": "2004-01-20 10:00:00.000",
    "refStart": "2004-01-20 10:00:02.000",
}


def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, script: list) -> tuple[list[dict], Path]:
    clips = tmp_path / "clips"
    clips.mkdir()
    write_clip(clips / "EV-001-C01.mp4", 75)  # three sampled frames, one a second
    model = tmp_path / "data" / "local" / "models" / "yolox_s.onnx"
    model.parent.mkdir(parents=True)
    model.write_bytes(b"onnx")
    FakeDetector.script = script
    monkeypatch.setattr(detect, "Detector", FakeDetector)
    # The second segment has no clip, like an overwritten range, and is skipped.
    no_clip = {k: v for k, v in SEGMENT.items() if k != "clip"} | {"id": "EV-001-X01"}
    segments = [SEGMENT, no_clip]
    return detect.detect_people(tmp_path, clips, segments, []), clips


def test_a_marker_is_made_each_time_more_people_appear(tmp_path, monkeypatch):
    one = [(0.9, [0.1, 0.1, 0.2, 0.4])]
    two = [(0.6, [0.5, 0.1, 0.2, 0.4]), (0.95, [0.1, 0.1, 0.2, 0.4])]
    markers, clips = run(tmp_path, monkeypatch, [one, one, two])
    assert [m["id"] for m in markers] == ["D001", "D002"]
    first, second = markers
    assert (first["count"], second["count"]) == (1, 2)
    # The second marker is two seconds in, on both clocks, with its strongest box.
    assert second["rawTime"] == "2004-01-20 10:00:02.000"
    assert second["refTime"] == "2004-01-20 10:00:04.000"
    assert (second["confidence"], second["box"]) == (0.95, [0.1, 0.1, 0.2, 0.4])
    assert second["review"] == "pending" and second["model"] == detect.MODEL
    assert (clips / "detections" / "D002.jpg").exists()


def test_people_under_half_confidence_do_not_make_a_marker(tmp_path, monkeypatch):
    markers, _ = run(tmp_path, monkeypatch, [[(0.4, [0, 0, 0.1, 0.1])]])
    assert markers == []


def test_the_model_is_downloaded_once_when_missing(tmp_path, monkeypatch):
    fetched: list[tuple[str, Path]] = []

    def fetch(url: str, to: Path) -> None:
        fetched.append((url, to))
        Path(to).write_bytes(b"onnx")

    monkeypatch.setattr("urllib.request.urlretrieve", fetch)
    monkeypatch.setattr(detect, "Detector", FakeDetector)
    FakeDetector.script = [[]]
    (tmp_path / "clips").mkdir()
    assert detect.detect_people(tmp_path, tmp_path / "clips", [], []) == []
    assert fetched == [(detect.URL, tmp_path / "data" / "local" / "models" / "yolox_s.onnx")]
