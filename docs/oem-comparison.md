# OEM comparison

This compares the eight recorder brands most common in Indian installations, from published papers, vendor documentation and OEM directories.
Each fact is marked **V** when we read it in the source linked, and **U** when it is unverified and needs a test on a real recorder.
Facts are thin for several brands, and this page says so rather than guess.

## At a glance

| OEM | What stores the video | Export format | Relationship | FrameTrail adapter |
|---|---|---|---|---|
| Hikvision | Own file system: master sector, `HIKBTREE` index, large data blocks (V) | Proprietary export and MP4 | Manufacturer | Tested on fixture |
| Dahua | DHFS4.1 on disk (V, layout U), DHAV-framed video (V) | `.dav` | Manufacturer | Tested on fixture (`.dav`) |
| CP Plus | Likely DHFS and DHAV (U) | `.dav` likely (U) | Listed as a current Dahua OEM (V) | Export parser through the Dahua adapter |
| Honeywell | Own undocumented file system (V) | Not documented | Former Dahua OEM, stopped April 2022 (V) | Next phase |
| TP-Link VIGI | Not documented (U) | USB export, format not named (V) | Not documented | Next phase |
| Godrej | Not documented (U) | Not documented (U) | No source found (U) | Next phase |
| Uniview | Not documented (U) | Not documented | Separate manufacturer (V) | Next phase |
| Matrix Comsec | Not documented (U) | `.mxs`, `.avs`, `.stm` (V) | Indian manufacturer | Next phase |

## Hikvision

| Fact | Status | Source |
|---|---|---|
| Master sector at offset 0x200, 256 bytes, signature `HIKVISION@HANGZHOU` | V | Han, Jeong, Lee 2015, https://doi.org/10.1007/978-3-319-25512-5_13 |
| A backup master sector follows the system logs | V | same |
| Master sector holds capacity, log offset and size, data offset, block size and count, index offset and size, and the initialisation time | V | same |
| Data blocks are generally 1 GB | V | same |
| Two `HIKBTREE` index copies; each entry holds an in-use flag, channel, start and end time, and a data offset | V | same, and fmpfeifer/hikextractor |
| Index times are Unix epoch seconds | V | same, and Magnet Forensics 2022 |
| System log records carry the signature `RATS` and a Unix time | V | Han et al. 2015 |
| The studied recorders have no delete function; initialisation is the only way to delete, and the video stays in the blocks | V | same |
| Initialisation shows as time reversal between blocks and against the master sector time | V | same |
| Whether the Unix times are true UTC or local wall-clock time written as epoch | U | Needs a real disk |
| Hikvision log records were not parsed by the major commercial tools when studied | V | Dragonas et al. 2023, https://doi.org/10.1111/1556-4029.15349 |

## Dahua

| Fact | Status | Source |
|---|---|---|
| DHAV frame header: `DHAV`, type, subtype, channel, frame number, frame length, packed date, 2-byte millisecond counter, extension length, checksum | V | FFmpeg `libavformat/dhav.c` |
| The packed date has no timezone field | V | same |
| Each frame ends with a `dhav` trailer and a 4-byte length | V | same |
| Header and trailer matching recovered footage from 27 drives at 91.8% | V (abstract) | Rzayeva et al. 2025, https://doi.org/10.3390/info16110983 |
| Analogue Dahua DVRs interleave up to 32 cameras in one stream | V (abstract) | Rzayeva et al. 2026, https://doi.org/10.3390/info17050493 |
| DHFS4.1 keeps log records of HDD formatting and recording disabled | V (abstract) | Dragonas et al. 2023, https://doi.org/10.1111/1556-4029.15401 |
| DHFS4.1 partition and cluster-chain layout | U | Open code exists (gbatmobile/dhfs_extractor), no peer-reviewed specification found |

## CP Plus

| Fact | Status | Source |
|---|---|---|
| Listed as a current Dahua OEM, "CP Plus (Orange Line)", May 2024 | V | IPVM Dahua OEM directory, https://ipvm.com/reports/dahua-oem |
| Many CP Plus recorders therefore likely write DHFS and DHAV | U | Inference only, test per model |

## Honeywell

| Fact | Status | Source |
|---|---|---|
| Former Dahua OEM, stopped buying in April 2022 | V | IPVM Dahua OEM directory |
| Has its own undocumented file system, studied for deletion, expiry and overwrite | V (abstract) | Yoon and Hwang, DFRWS USA 2026, https://doi.org/10.48550/arXiv.2605.07430 |

## TP-Link VIGI

| Fact | Status | Source |
|---|---|---|
| Export needs a USB drive on the NVR, and the FAQ does not name the format | V | https://www.tp-link.com/in/support/faq/4615/ |
| Uses DHAV framing | U | One unsourced claim, do not rely on it |

## Godrej

| Fact | Status | Source |
|---|---|---|
| OEM source of Godrej recorders | U | No source found |

## Uniview

| Fact | Status | Source |
|---|---|---|
| Separate manufacturer with its own OEM list | V | IPVM |
| Commercial tools claim recovery from NVR300 and NVR200 disks | V (vendor claim) | 512 BYTE knowledge base |
| On-disk layout | U | No public specification found |

## Matrix Comsec

| Fact | Status | Source |
|---|---|---|
| SATATYA exports `.mxs` (Device Client, Web Client, SATATYA CORE), `.avs` (DVR Backup Manager), `.stm` (Device Player) | V | Matrix Wiki, https://wiki.matrixcomsec.com/index.php?title=How_to_play_.avs%2C_.mxs_and_.stm_file%3F |
| IPVM lists "Matrix Security Solutions" as a former Hikvision OEM | U | May not be Matrix Comsec of India, do not use |

## What this means for an adapter

Two families, Hikvision-style and Dahua-style, cover the brands with published structure.
CP Plus should follow the Dahua adapter, but each model needs its own test before we claim it.
Honeywell, Uniview, TP-Link VIGI, Godrej and Matrix need real recorders to study, and FrameTrail reports their files as unsupported until an adapter is tested.
