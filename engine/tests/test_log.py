import json
import logging

from frametrail import cli
from frametrail import log as events
from frametrail.analyse import analyse
from frametrail.fixture import synthetic


def record(name, **fields):
    r = logging.LogRecord("frametrail.analyse", logging.WARNING, __file__, 1, name, None, None)
    r.fields = fields
    return r


def test_json_lines_carry_the_event_and_its_fields():
    line = json.loads(events.JsonFormatter().format(record("export parsed", runs=2, frames=199)))
    assert {k: line[k] for k in ("level", "logger", "event", "runs", "frames")} == {
        "level": "warning",
        "logger": "frametrail.analyse",
        "event": "export parsed",
        "runs": 2,
        "frames": 199,
    }
    assert line["ts"].endswith("+00:00")


def test_text_lines_put_the_fields_after_the_event():
    text = events.TextFormatter().format(record("clock fitted", camera="CAM-02", drift_ppm=120.0))
    assert text == "warning export parsed  camera=CAM-02 drift_ppm=120.0".replace(
        "export parsed", "clock fitted"
    )


class Collect(logging.Handler):
    def __init__(self):
        super().__init__(logging.INFO)
        self.records = []

    def emit(self, record):
        self.records.append(record)


def test_an_analysis_logs_each_step_in_order(tmp_path):
    synthetic.build(tmp_path / "data" / "local" / "fixtures")
    # A handler of its own on the engine's logger, whatever an earlier cli.main() configured.
    root, got = logging.getLogger("frametrail"), Collect()
    level = root.level
    root.addHandler(got)
    root.setLevel(logging.INFO)
    try:
        analyse(tmp_path, run_detection=False)
    finally:
        root.removeHandler(got)
        root.setLevel(level)
    names = [r.getMessage() for r in got.records if r.name == "frametrail.analyse"]
    assert names == [
        "evidence hashed",
        "evidence hashed",
        "disk parsed",
        "export parsed",
        "clock fitted",
        "clock fitted",
        "segments extracted",
        "write block checked",
        "write block checked",
        "case written",
    ]
    by = {r.getMessage(): r.fields for r in got.records}
    assert by["export parsed"]["frames"] == by["export parsed"]["ffmpeg_frames"] == 200
    assert by["disk parsed"]["initialised"] is True
    assert all(r.levelno == logging.INFO for r in got.records)


def test_json_mode_reports_a_stop_as_an_error_event(tmp_path, capsys):
    assert cli.main(["--log-format", "json", "analyse"], root=tmp_path) == 2
    (line,) = [json.loads(x) for x in capsys.readouterr().err.splitlines()]
    assert (line["level"], line["event"], line["error"]) == ("error", "stopped", "CaseFileError")
    assert "EV-001_dvr-disk.img is missing" in line["message"]
