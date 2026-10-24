import hashlib

import numpy as np
import pytest

from frametrail import hikfs, intake


def test_streamed_hashes_match_hashlib(tmp_path):
    data = np.random.default_rng(1).bytes(3 * intake.CHUNK + 123)
    p = tmp_path / "x.bin"
    p.write_bytes(data)
    d = intake.digest(p)
    assert d.md5 == hashlib.md5(data).hexdigest()
    assert d.sha256 == hashlib.sha256(data).hexdigest()
    assert d.size == len(data)


def test_digest_of_an_empty_file(tmp_path):
    p = tmp_path / "empty.bin"
    p.write_bytes(b"")
    d = intake.digest(p)
    assert (d.md5, d.size) == (hashlib.md5(b"").hexdigest(), 0)


def test_digest_reads_a_read_only_file(tmp_path):
    p = tmp_path / "sealed.bin"
    p.write_bytes(b"evidence")
    p.chmod(0o444)
    assert intake.digest(p).sha256 == intake.sha256(b"evidence")


def test_identifies_a_disk_by_its_master_signature_anywhere_in_the_first_mib(tmp_path):
    img = bytearray(0x1000)
    img[0x210 : 0x210 + len(hikfs.SIGNATURE)] = hikfs.SIGNATURE
    p = tmp_path / "disk.img"
    p.write_bytes(bytes(img))
    got = intake.identify(p)
    assert got["family"] == "Hikvision-style disk"
    assert got["matched"] == "HIKVISION@HANGZHOU"
    assert got["signature"]["offset"] == 0x210
    assert got["signature"]["ascii"].startswith("HIKVISION@HANGZHOU")


@pytest.mark.parametrize(
    ("head", "family"),
    [(b"DHAV\xfd\0\0\0", "Dahua-style export"), (b"IMKH\x01", "Hikvision-style export")],
)
def test_identifies_an_export_by_its_leading_magic(tmp_path, head, family):
    p = tmp_path / "export.bin"
    p.write_bytes(head + bytes(64))
    assert intake.identify(p)["family"] == family


def test_export_magic_away_from_offset_zero_does_not_count(tmp_path):
    p = tmp_path / "export.bin"
    p.write_bytes(bytes(16) + b"DHAV" + bytes(64))
    got = intake.identify(p)
    assert got["family"] == "unknown"
    assert got["signature"]["offset"] == -1


def test_identifies_the_synthetic_evidence(synth):
    assert intake.identify(synth.fixtures / "EV-001_dvr-disk.img")["family"] == (
        "Hikvision-style disk"
    )
    assert intake.identify(synth.fixtures / "EV-002_nvr-export.dav")["family"] == (
        "Dahua-style export"
    )
