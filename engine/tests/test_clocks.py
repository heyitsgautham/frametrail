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
