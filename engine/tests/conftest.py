"""Shared fixtures. The evidence files come from frametrail.fixture.synthetic, so every test
here runs offline from a fresh clone; only test_caviar.py needs the downloaded footage."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest

from frametrail import dvr
from frametrail.analyse import analyse
from frametrail.fixture import synthetic


@dataclass
class Case:
    root: Path
    fixtures: Path
    truth: dict

    @property
    def image(self) -> bytes:
        return (self.fixtures / "EV-001_dvr-disk.img").read_bytes()

    @property
    def export(self) -> bytes:
        return (self.fixtures / "EV-002_nvr-export.dav").read_bytes()


@pytest.fixture(scope="session")
def synth(tmp_path_factory: pytest.TempPathFactory) -> Case:
    root = tmp_path_factory.mktemp("case")
    fx = root / "data" / "local" / "fixtures"
    return Case(root, fx, synthetic.build(fx))


@pytest.fixture(scope="session")
def disk(synth: Case) -> dvr.Disk:
    return dvr.parse(synth.image)


@pytest.fixture(scope="session")
def analysed(tmp_path_factory: pytest.TempPathFactory) -> tuple[Case, dict]:
    """A separate copy for the full run, because analyse makes the evidence read-only."""
    root = tmp_path_factory.mktemp("analysed")
    fx = root / "data" / "local" / "fixtures"
    c = Case(root, fx, synthetic.build(fx))
    analyse(root, run_detection=False)
    return c, json.loads((root / "data" / "demo" / "derived" / "case.json").read_text())
