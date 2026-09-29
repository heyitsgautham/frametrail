"""Person detection for triage, fully offline.

YOLOX-S (Megvii, Apache-2.0) as ONNX, run through OpenCV's DNN module on the CPU. Its
findings are leads for an examiner to confirm or reject, never evidence on their own.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

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
