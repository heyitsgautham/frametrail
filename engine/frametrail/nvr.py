"""Parse a Dahua-style .dav export into continuous recording runs."""

from __future__ import annotations

from dataclasses import dataclass

from . import dhav

GAP_MS = 1000  # a jump longer than this in the recorder clock starts a new run


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
        if runs and f.raw_ms - runs[-1][-1].raw_ms <= GAP_MS and f.channel == runs[-1][-1].channel:
            runs[-1].append(f)
        else:
            runs.append([f])
    return [
        Run(f"R{n + 1:02d}", r[0].channel, r, b"".join(data[f.payload] for f in r))
        for n, r in enumerate(runs)
    ]
