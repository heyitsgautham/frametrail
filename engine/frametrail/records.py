"""The case files that come with the evidence, read once and checked at the boundary.

seizure.json is what the examiner noted when the recorders were seized; truth.json holds the
values the fixture builder planted, read only to report validation errors. Both are parsed
into frozen records here, so a missing field or a time that does not parse fails before any
evidence is touched, with the file and field named.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .errors import CaseFileError


@dataclass(frozen=True)
class Seizure:
    """What one recorder's screen showed at seizure, against a trusted reference clock."""

    dvr_shown: str
    reference: str
    note: str

    def shown_at(self) -> datetime:
        return datetime.fromisoformat(self.dvr_shown)

    def reference_at(self) -> datetime:
        return datetime.fromisoformat(self.reference)


@dataclass(frozen=True)
class Planted:
    """The NVR clock error the fixture builder planted, to measure the fit against."""

    nvr_offset_ms: float
    nvr_drift_ppm: float


def _read(path: Path) -> object:
    if not path.exists():
        raise CaseFileError(f"{path.name} is missing from {path.parent}; run `frametrail fixtures`")
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise CaseFileError(f"{path.name} is not valid JSON: {e}") from e


def _field(obj: dict, key: str, kind: type | tuple[type, ...], where: str) -> object:
    if key not in obj:
        raise CaseFileError(f"{where} has no {key!r}")
    v = obj[key]
    if not isinstance(v, kind) or isinstance(v, bool):
        raise CaseFileError(f"{where} {key!r} should be {getattr(kind, '__name__', 'a number')}")
    return v


def load_seizure(path: Path, ids: list[str]) -> dict[str, Seizure]:
    raw = _read(path)
    if not isinstance(raw, dict):
        raise CaseFileError(f"{path.name} should map exhibit IDs to seizure records")
    out = {}
    for k in ids:
        if not isinstance(raw.get(k), dict):
            raise CaseFileError(f"{path.name} has no seizure record for {k}")
        where = f"{path.name} {k}"
        rec = Seizure(
            str(_field(raw[k], "dvrShown", str, where)),
            str(_field(raw[k], "reference", str, where)),
            str(_field(raw[k], "note", str, where)),
        )
        for name, read in (("dvrShown", rec.shown_at), ("reference", rec.reference_at)):
            try:
                at = read()
            except ValueError as e:
                raise CaseFileError(f"{where} {name!r} is not a date and time: {e}") from e
            # Recorder times on the disk carry no zone, so a seizure time is compared with
            # them as the clock showed it. An offset would mix the two kinds of time.
            if at.tzinfo is not None:
                raise CaseFileError(
                    f"{where} {name!r} has a UTC offset; write the time as the clock showed it, "
                    "with no offset or Z"
                )
        out[k] = rec
    return out


def load_planted(path: Path) -> Planted:
    raw = _read(path)
    if not isinstance(raw, dict):
        raise CaseFileError(f"{path.name} should be a JSON object")
    num = (int, float)
    # Kept as written, so case.json reports the planted value exactly.
    return Planted(
        _field(raw, "nvrOffsetMs", num, path.name),  # type: ignore[arg-type]
        _field(raw, "nvrDriftPpm", num, path.name),  # type: ignore[arg-type]
    )
