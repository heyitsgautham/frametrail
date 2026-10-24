"""Person detection for triage, fully offline.

YOLOX-S (Megvii, Apache-2.0) as ONNX, run through OpenCV's DNN module on the CPU. Its
findings are leads for an examiner to confirm or reject, never evidence on their own.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from .clocks import stamp
from .dhav import epoch_ms

MODEL = {"name": "YOLOX-S", "version": "0.1.1rc0 ONNX", "licence": "Apache-2.0"}
URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx"
SIZE = 640
PERSON = 0


class Detector:
    def __init__(self, model: Path) -> None:
        self.net = cv2.dnn.readNetFromONNX(str(model))
        grids, strides = [], []
        for s in (8, 16, 32):
            n = SIZE // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
            strides.append(np.full((n * n, 1), s))
        self.grid = np.concatenate(grids)
        self.stride = np.concatenate(strides)

    def people(self, bgr: np.ndarray, threshold: float = 0.35) -> list[tuple[float, list[float]]]:
        """(confidence, [x, y, w, h] as fractions of the frame) for each person found."""
        h, w = bgr.shape[:2]
        r = min(SIZE / h, SIZE / w)
        pad = np.full((SIZE, SIZE, 3), 114, np.uint8)
        small = cv2.resize(bgr, (int(w * r), int(h * r)))
        pad[: small.shape[0], : small.shape[1]] = small
        self.net.setInput(cv2.dnn.blobFromImage(pad.astype(np.float32), 1.0, (SIZE, SIZE)))
        out = self.net.forward()[0]
        xy = (out[:, :2] + self.grid) * self.stride
        wh = np.exp(out[:, 2:4]) * self.stride
        score = out[:, 4] * out[:, 5 + PERSON]
        keep = score > threshold
        boxes = np.concatenate([xy[keep] - wh[keep] / 2, wh[keep]], 1) / r
        s = score[keep]
        idx = np.array(cv2.dnn.NMSBoxes(boxes.tolist(), s.tolist(), threshold, 0.45)).flatten()
        return [
            (
                round(float(s[i]), 3),
                [
                    round(float(boxes[i][0] / w), 4),
                    round(float(boxes[i][1] / h), 4),
                    round(float(boxes[i][2] / w), 4),
                    round(float(boxes[i][3] / h), 4),
                ],
            )
            for i in idx
        ]


def detect_people(root: Path, clips: Path, segments: list[dict], cams: list[dict]) -> list[dict]:
    """Sample one frame a second from every clip and keep the moments a new person appears."""
    model = root / "data" / "local" / "models" / "yolox_s.onnx"
    if not model.exists():
        import urllib.request

        model.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(URL, model)
    det = Detector(model)
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
                            "model": MODEL,
                            "review": "pending",
                            "thumb": f"/clips/detections/{did}.jpg",
                        }
                    )
                prev = len(people)
            i += 1
        cap.release()
    return out
