# Validation

Every recovery claim FrameTrail makes on the demo case is checked against a value we planted when building the fixtures.
The planted values sit in `data/local/fixtures/truth.json`, and the engine reads them only to report errors, never to compute a result.
The fixtures and what they plant are described in [fixtures.md](fixtures.md).

## Planted truth against results

| What we planted | What FrameTrail found |
|---|---|
| 6 intact segments recorded before initialisation, plus the tail of a seventh | All 6 intact segments and the partial tail carved back, 7 segments, 99.4 s of video |
| A decoy segment header over random bytes in free space | Rejected, because 0 frames decode |
| The oldest segment and 6 s of the next overwritten after initialisation | 30.0 s marked overwritten, ending where the surviving tail resumes |
| The partial tail's true start time | Dated from the segment after it, 0 ms error, confirmed by the burned-in clock |
| Initialisation at 10:31:05 | Found at 10:31:05 from 5 independent clues: time reversal, master sector time, index contents, carved segments older than it, and the log record at 0x10200 |
| NVR clock 97.4 s slow | 97.400 s, error 0.01 ms, uncertainty 0.02 s |
| NVR drift 120 ppm | 120.0 ppm |
| Seizure record for the NVR | Shows 98 s to the whole second, and agrees with the burned-in clock fit within 0.194 s |

## Independent checks

| Check | Result |
|---|---|
| FFmpeg's own `dhav` demuxer reads our `.dav` export | 3,235 of 3,235 frames |
| Exported MP4 clips decode to the same frames as their source stream, compared by MD5 per decoded frame | 11 of 11 clips identical |
| Both sources hashed again after analysis | MD5 and SHA-256 unchanged |
| Custody log, 18 events | Every hash verifies, and editing any event breaks every hash after it |

## Automated tests

`pnpm engine:test` runs these in `engine/tests/test_engine.py`.

| Test | What it proves |
|---|---|
| Streamed hashes match hashlib | One-pass MD5 and SHA-256 equal whole-file digests |
| Index and log records round trip | The on-disk structures pack and unpack without loss |
| Custody chain catches an edited event | Tampering is detected at the edited entry |
| OSD fit recovers offset and drift despite misreads | The clock fit tolerates wrong digit reads |
| DHAV round trip through FFmpeg | Our DHAV frames are readable by an independent parser |
| Carver recovers pre-initialisation footage and rejects the decoy | Needs the fixtures |
| Overwritten range and initialisation are flagged | Needs the fixtures |
| Case matches the planted clock | Needs the fixtures |

The last three skip with a clear reason when the fixtures have not been built, as in CI.
`pnpm test:e2e` drives every workbench screen in a browser, including the custody tamper check.

## The burned-in clock reader

The reader learns digit templates from one segment whose start time is known, picked by cross-validation.
On held-out segments it reads the whole time string correctly 85% of the time.
Of 238 reads, 31 were thrown out as misreads before the fit.
The fit uses least squares over the remaining reads, so single misreads do not move the offset.

## What this does not prove

- Nothing has been read off a real recorder yet.
  Real disks will differ in field layout, block size, frame headers and log format.
- Our segment headers carry a start time, and real Hikvision `IMKH` headers do not.
  That makes carved segments easier to date than they will be on a real disk.
- The fixture keeps the log outside the data area, so the initialisation record survives.
  Whether it survives on every real Hikvision model is an assumption to test.
- The seizure records are written by the fixture builder, standing in for the examiner's photograph.
- The footage is from 2004, so every timestamp in the demo case reads 2004.
- Person detection marks moments when the count of people in view goes up.
  It does not recognise events such as entering a shop or leaving a bag, and face detection is not built yet.
- Motion correlation between the two camera views was tried as a clock cross-check and failed on this footage.
  The corridor and shop-front views share too little motion, and it locked onto 55.9 s against the true 97.4 s.
  We replaced it with the burned-in clock reader.
- The custody log's lab events carry the real analysis time, so `case.json` changes on every run.

## Next

1. Image second-hand Hikvision and CP Plus recorders, before and after initialising them, and publish per-model results.
2. Replace the dated segment headers with the real `IMKH` and IDR table (`OFNI`) structures.
3. Measure recovery and dating accuracy on those disks against the recorders' own playback.
