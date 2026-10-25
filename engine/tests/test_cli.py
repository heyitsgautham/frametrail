import json
import os
import shutil
import stat

import pytest

from frametrail import cli, dvr, media
from frametrail.errors import EvidenceFormatError, ToolError
from frametrail.fixture import synthetic


@pytest.fixture
def case(tmp_path):
    fx = tmp_path / "data" / "local" / "fixtures"
    synthetic.build(fx)
    return tmp_path, fx


def test_analyse_prints_the_stats_and_exits_zero(case, capsys):
    root, _ = case
    assert cli.main(["analyse", "--no-detect"], root=root) == 0
    stats = json.loads(capsys.readouterr().out)
    assert stats["ffmpegDhavFrames"] == stats["nvrFrames"] == 200


def test_missing_evidence_is_an_error_message_not_a_traceback(tmp_path, capsys):
    assert cli.main(["analyse"], root=tmp_path) == 2
    err = capsys.readouterr().err
    assert err.startswith("frametrail: error: EV-001_dvr-disk.img is missing")
    assert "run `frametrail fixtures`" in err
    assert "Traceback" not in err


def test_a_bad_seizure_record_fails_before_the_evidence_is_made_read_only(case, capsys):
    root, fx = case
    (fx / "seizure.json").write_text('{"EV-001": {"dvrShown": "yesterday"}}')
    assert cli.main(["analyse", "--no-detect"], root=root) == 2
    assert "seizure.json EV-001 has no 'reference'" in capsys.readouterr().err
    assert os.stat(fx / "EV-001_dvr-disk.img").st_mode & stat.S_IWUSR


def test_a_disk_with_no_recorder_signature_is_refused_by_name(case, capsys):
    root, fx = case
    (fx / "EV-001_dvr-disk.img").write_bytes(bytes(1 << 20))
    assert cli.main(["analyse", "--no-detect"], root=root) == 2
    assert "no Hikvision-style master sector signature" in capsys.readouterr().err
    with pytest.raises(EvidenceFormatError):
        dvr.parse(bytes(1 << 20))


def test_a_missing_ffmpeg_is_reported_as_a_tool_error(monkeypatch):
    monkeypatch.setattr(media, "FFMPEG", "/nonexistent/ffmpeg")
    with pytest.raises(ToolError, match="ffmpeg is not on PATH"):
        media.version()


def test_a_failing_tool_is_still_a_runtime_error_for_older_callers():
    with pytest.raises(RuntimeError, match="failed"):
        media.ffmpeg("-i", "/nonexistent/input.mp4", "-f", "null", "-")
    assert shutil.which(media.FFMPEG)
