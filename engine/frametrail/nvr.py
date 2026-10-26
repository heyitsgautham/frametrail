"""Parse a Dahua-style .dav export into continuous recording runs."""

from __future__ import annotations

from dataclasses import dataclass

from . import dhav

GAP_MS = dhav.GAP_MS


@dataclass
class Run:
    key: str
    channel: int
    frames: list[dhav.Frame]
    annexb: bytes

    @property
    def start_ms(self) -> int:
        return self.frames[0].raw_ms

    @property
    def end_ms(self) -> int:
        return self.frames[-1].raw_ms + 40

    @property
    def byte_start(self) -> int:
        return self.frames[0].offset

    @property
    def byte_end(self) -> int:
        return self.frames[-1].payload.stop + 8


def parse(data: bytes) -> list[Run]:
    frames = dhav.parse(data)
    runs: list[list[dhav.Frame]] = []
    for f in frames:
        # A run is one stretch of forward time on one channel. A jump of more than GAP_MS, or
        # any step back, as when the recorder's clock is corrected, starts a new run.
        step = f.raw_ms - runs[-1][-1].raw_ms if runs else -1
        if runs and 0 <= step <= GAP_MS and f.channel == runs[-1][-1].channel:
            runs[-1].append(f)
        else:
            runs.append([f])
    return [
        Run(f"R{n + 1:02d}", r[0].channel, r, b"".join(data[f.payload] for f in r))
        for n, r in enumerate(runs)
    ]
