import json

import pytest

from frametrail import records
from frametrail.errors import CaseFileError

GOOD = {
    "EV-001": {
        "dvrShown": "2004-01-20 10:34:02",
        "reference": "2004-01-20 10:34:02",
        "note": "live view",
    },
    "EV-002": {
        "dvrShown": "2004-01-20 11:02:12",
        "reference": "2004-01-20 11:03:50",
        "note": "playback",
    },
}


def write(tmp_path, name, obj):
    p = tmp_path / name
    p.write_text(obj if isinstance(obj, str) else json.dumps(obj))
    return p


def test_seizure_records_parse_into_typed_times(tmp_path):
    got = records.load_seizure(write(tmp_path, "seizure.json", GOOD), ["EV-001", "EV-002"])
    assert got["EV-002"].reference == "2004-01-20 11:03:50"
    assert (got["EV-002"].reference_at() - got["EV-002"].shown_at()).total_seconds() == 98


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda s: s.pop("EV-002"), "no seizure record for EV-002"),
        (lambda s: s["EV-001"].pop("reference"), "seizure.json EV-001 has no 'reference'"),
        (lambda s: s["EV-001"].update(note=7), "'note' should be str"),
        (lambda s: s["EV-002"].update(dvrShown="yesterday"), "'dvrShown' is not a date and time"),
    ],
)
def test_an_incomplete_seizure_record_names_the_file_and_field(tmp_path, change, message):
    s = json.loads(json.dumps(GOOD))
    change(s)
    with pytest.raises(CaseFileError, match=message):
        records.load_seizure(write(tmp_path, "seizure.json", s), ["EV-001", "EV-002"])


def test_a_missing_or_broken_case_file_says_how_to_get_one(tmp_path):
    with pytest.raises(CaseFileError, match="seizure.json is missing .* run `frametrail fixtures`"):
        records.load_seizure(tmp_path / "seizure.json", ["EV-001"])
    with pytest.raises(CaseFileError, match="truth.json is not valid JSON"):
        records.load_planted(write(tmp_path, "truth.json", "{"))


def test_planted_values_keep_the_number_as_written(tmp_path):
    p = records.load_planted(
        write(tmp_path, "truth.json", {"nvrOffsetMs": 97400, "nvrDriftPpm": 120.0})
    )
    assert (p.nvr_offset_ms, p.nvr_drift_ppm) == (97400, 120.0)
    assert isinstance(p.nvr_offset_ms, int)
    with pytest.raises(CaseFileError, match="'nvrDriftPpm' should be"):
        records.load_planted(
            write(tmp_path, "truth.json", {"nvrOffsetMs": 1, "nvrDriftPpm": "fast"})
        )
