# Architecture

FrameTrail has two parts.
A Python engine reads the evidence and writes one file, `data/demo/derived/case.json`, plus exported clips in `data/local/clips/`.
A Next.js workbench reads only that file and those clips, so everything the examiner sees traces to one analysis run.

```
seized evidence (disk image, native export)
        |  opened read-only, hashed before and after
        v
engine/frametrail
  intake.py    streamed MD5 + SHA-256, vendor signature scan
  hikfs.py     master sector, system log, index copies, segment headers (Hikvision-style)
  dvr.py       index parse, carving, decode validation, overwrite ranges, initialisation proof
  dhav.py      DHAV frame parser and packed-date decoder (Dahua-style)
  nvr.py       continuous recording runs from DHAV frames
  osd.py       reads the burned-in clock from the pixels, fits offset and drift
  detect.py    YOLOX-S person detection through OpenCV DNN, CPU only
  custody.py   hash-chained custody log
  analyse.py   runs the case, builds provenance, writes case.json
        |
        v
data/demo/derived/case.json + data/local/clips/*.mp4
        |
        v
apps/web   Intake, Timeline, Recovery, Triage, Provenance, Custody, Report, Vendors, Research
```

## The pipeline

### 1. Intake and hashing

`intake.digest` reads each source once in fixed-size chunks and feeds MD5 and SHA-256 from the same read.
Sources are opened read-only.
After analysis the engine hashes every source again, and the case records whether both digests still match.
On the demo case both do.

### 2. Vendor detection

`intake.identify` scans the first MiB for known signatures and reports the family, the offset and the bytes around it.

| Signature | Where | Family |
|---|---|---|
| `HIKVISION@HANGZHOU` | Anywhere in the first MiB, at 0x210 on the demo disk | Hikvision-style disk |
| `HIKBTREE` | Anywhere in the first MiB | Hikvision-style disk |
| `IMKH` | Offset 0 | Hikvision-style export |
| `DAHUA`, `DHAV` | Offset 0 | Dahua-style export |

The master sector also carries a model and firmware string, which the case reports.
An unknown file matches no signature and is reported as unsupported, never pushed through a parser.

### 3. Index and log parsing

`dvr.parse` reads the master sector, checks it against its backup copy, reads the system log records (`RATS`), and reads both index copies (`HIKBTREE`).
Each in-use index entry becomes an indexed segment with its channel, start and end time, first block and length.
Times on the disk are Unix epoch values in recorder time.
FrameTrail keeps them exactly as stored.

### 4. Carving and decode validation

Every block not claimed by an index entry is scanned for segment headers.
A candidate is kept only if FFmpeg decodes frames from it.
The demo disk holds a decoy header over random bytes, and the carver rejects it because 0 frames decode.
A segment whose head was overwritten is carved from its first keyframe and marked partial.

### 5. Proving the disk was re-initialised

After initialisation a recorder writes new footage from the front of the data area again.
So footage recorded later sits in lower blocks than footage recorded earlier, and time runs backwards along the disk.
This is the method Han, Jeong and Lee (2015) describe.
`dvr._reformat` looks for that reversal and then gathers every independent clue.

1. Time reversal between two blocks.
2. The initialisation time in the master sector.
3. Carved segments older than that time, which the index does not list.
4. Both index copies listing only segments after it.
5. The system log record for the initialisation, with its byte offset.

The range between the first data block and the surviving tail of the oldest segment is marked overwritten.
Overwritten data cannot be recovered, and the report says so.

### 6. Clock model

Each camera's clock keeps its raw time and gains a reference time beside it, never in place of it.

| Input | Role |
|---|---|
| Seizure record: the recorder screen beside a reference clock | Sets the offset to the second, as NISTIR 8172 and SWGDE 17-V-002 describe |
| Burned-in clock read from the pixels (`osd.py`) | Refines the offset to the frame and measures drift by least squares |

The offset is recorder time minus reference time.
Each camera stores its method, offset, drift, uncertainty and the agreement between the two methods.

### 7. Person detection

`detect.py` runs YOLOX-S (Apache-2.0) as ONNX through OpenCV's DNN module on the CPU.
It marks moments where the number of people in view goes up.
Each marker records the model, its version and licence, the confidence and the box.
Markers start as pending, and only the examiner confirms or rejects them.

### 8. Export and provenance

Clips are remuxed to MP4 with the codec copied, never re-encoded.
For every clip the engine hashes each decoded frame with MD5 and compares it with the source stream.
The provenance graph links each clip to its video stream, its byte extent and the seized image, with a SHA-256 at every node and the tool that made each step.
Each clip also lists what the export kept and what it could not carry, such as header fields MP4 has no place for.

### 9. Custody

`custody.py` appends one event per action.
Each event's hash is SHA-256 over the previous hash and the event's canonical JSON.
Changing any past event breaks its hash and every hash after it, and `custody.verify` returns the first broken entry.

### 10. Report

The workbench builds the certificate Part B that Section 63(4)(c) of the Bharatiya Sakshya Adhiniyam, 2023 asks for.
It fills device type DVR, the make and model, both hashes of every source, the acquisition details and the limitations.
The signature lines stay blank for the examiner.

## Data contract

`case.json` holds the whole case.

| Key | Holds |
|---|---|
| `sources` | Each evidence file: size, MD5, SHA-256, vendor signature, block map with a state per run |
| `cameras` | Channel, frame rate, size, and the clock model with seizure record and cross-check |
| `segments` | Raw and reference start and end, byte extent, hashes, clip, state, what was kept and lost |
| `log` | Recorder log records with raw and reference time and byte offset |
| `reformat` | Initialisation time, the evidence lines, and the time-reversal block order |
| `detections` | AI markers with model, confidence, box and review state |
| `provenance` | Nodes and edges from each clip back to its source |
| `custody` | The hash-chained events |
| `adapters` | Each OEM with its formats, operations, status and a note |
| `stats` | Every headline number the workbench and the video show |

Segment states are `indexed`, `recovered-unindexed`, `partial`, `overwritten`, `free` and `system`.

## Running offline

Nothing calls a network service at analysis time.
`frametrail fixtures` downloads the public footage once, and the first `frametrail analyse` downloads the YOLOX-S weights once.
After that the machine can be air-gapped, or both files can be carried in on removable media.
The engine needs Python 3.12, NumPy, OpenCV and FFmpeg, and runs on a laptop CPU with no GPU.
The workbench is a Next.js production build served on localhost.

## Adding a vendor

Today each vendor family is one parser module that returns segments in the same shape: channel, raw start and end, byte extent, frames and state.
Adding a vendor takes three steps.

1. Add its signature to `intake.SIGNATURES`.
2. Write a parser module next to `dvr.py` or `nvr.py` that returns those segments, and reports anything it cannot read as unsupported.
3. Add an entry to the adapters list with the models and firmware it was tested on, and a fixture and test that plant known values.
