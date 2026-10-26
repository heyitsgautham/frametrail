"""Fitting the recorder clocks when the evidence leaves too little to read."""

import dataclasses

import pytest

from frametrail import cli, clocks, nvr
from frametrail.errors import EvidenceFormatError
from frametrail.fixture import synthetic


def test_one_dated_segment_cannot_both_teach_and_check_the_font(disk):
    first = next(f for f in disk.found if f.state == "indexed")
    with pytest.raises(EvidenceFormatError, match="has 1 segment"):
        clocks.fit(dataclasses.replace(disk, found=[first]), [])


def test_an_export_with_no_frames_stops_before_the_fit(disk):
    with pytest.raises(EvidenceFormatError, match="export holds no DHAV frames"):
        clocks.fit(disk, [])


def test_the_clocks_still_fit_on_the_whole_synthetic_case(disk, synth):
    fit = clocks.fit(disk, nvr.parse(synth.export))
    assert abs(fit.nvr_fit.offset_ms - synth.truth["nvrOffsetMs"]) < 40


def test_a_disk_cut_short_inside_the_first_segment_stops_with_a_message(tmp_path, capsys):
    # An acquisition that stopped 1.2 MB in keeps only part of one dated segment. The run
    # used to end in a ZeroDivisionError traceback while scoring the clock font.
    fx = tmp_path / "data" / "local" / "fixtures"
    synthetic.build(fx)
    img = fx / "EV-001_dvr-disk.img"
    img.write_bytes(img.read_bytes()[:1_200_000])
    assert cli.main(["analyse", "--no-detect"], root=tmp_path) == 2
    assert "has 1 segment(s) dated by an index or segment header" in capsys.readouterr().err


def _cut(f, keep: int):
    # Keep the first `keep` bytes of a segment's video, as a damaged or short image would.
    return dataclasses.replace(f, ps=f.ps[:keep])


def test_a_segment_too_short_to_show_every_digit_checks_the_font_instead(disk, synth):
    # A tenth of N02 is about 7 frames, under 300 ms, so its clock never shows a 9 and it
    # cannot teach the font. It used to stop the fit with a ValueError; now the others teach.
    found = [_cut(f, len(f.ps) // 10) if f.key == "N02" else f for f in disk.found]
    fit = clocks.fit(dataclasses.replace(disk, found=found), nvr.parse(synth.export))
    assert fit.font_seg.key != "N02"
    assert abs(fit.nvr_fit.offset_ms - synth.truth["nvrOffsetMs"]) < 40


def test_no_segment_long_enough_to_teach_the_font_stops_with_a_message(disk):
    dated = [f for f in disk.found if f.state == "indexed"]
    short = [_cut(f, len(f.ps) // 10) for f in dated]
    with pytest.raises(EvidenceFormatError, match="shows every digit"):
        clocks.fit(dataclasses.replace(disk, found=short), [])


def test_a_disk_cut_short_inside_the_second_segment_stops_with_a_message(tmp_path, capsys):
    # Stopping 1.49 MB in keeps all of N01 and 9 frames of N02. The run used to end in a
    # ValueError traceback while learning the font; it now says too little footage is left.
    fx = tmp_path / "data" / "local" / "fixtures"
    synthetic.build(fx)
    img = fx / "EV-001_dvr-disk.img"
    img.write_bytes(img.read_bytes()[:1_490_101])
    assert cli.main(["analyse", "--no-detect"], root=tmp_path) == 2
    assert "read in only 1 disk frame(s) outside the font segment" in capsys.readouterr().err
