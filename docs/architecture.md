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
  dvr.py       master and index copies, overwrite ranges, initialisation proof
  carve.py     carving unindexed blocks, decode validation, dating headless tails
  dhav.py      DHAV frame parser and packed-date decoder (Dahua-style)
  nvr.py       continuous recording runs from DHAV frames
  osd.py       reads the burned-in clock from the pixels, fits offset and drift
  clocks.py    learns the clock font, fits each recorder's clock, checks it at seizure
  detect.py    YOLOX-S person detection through OpenCV DNN, CPU only
  custody.py   hash-chained custody log
  segments.py  clips remuxed without re-encoding, frame-by-frame check, provenance graph
  sources.py   evidence hashes, vendor, on-disk structures, the recorder log and the wipe
  adapters.py  the vendor families read today and the ones still to come
  analyse.py   runs the steps in order, adds up the stats, writes case.json
  records.py   seizure.json and truth.json, checked into frozen records before any evidence is read
  errors.py    the errors an examiner can act on; the CLI prints them and exits 2
  log.py       one structured event per step, as text or JSON lines on stderr
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

A seized disk is often damaged, so each structure has a fallback, and the case says when one was used.

| Damage | What the engine does | What `case.json` adds |
|---|---|---|
| Primary master sector wiped, or its block size or index size impossible | Reads the next copy with a readable layout, normally the backup after the log area | `masterSector.primaryIntact: false` and `readFrom` |
| No copy of the master sector readable | Stops with exit code 2, naming each copy and the bad field | Nothing, no case is written |
| Primary index copy damaged | Reads the backup copy | `index.readFrom` |
| Both index copies damaged | Carves every block | `index.readable: false` |
| Image shorter than the disk the master records | Reads what is there and notes indexed segments that run past the end | `image.expectedBytes` and `shortBy` |
| Indexed segment whose video bytes do not decode, as after a bad sector | Keeps the segment without a clip and leaves it out of the clock fit | The segment has `frames: 0`, no `clip`, and a `lost` line saying its video does not decode |

An intact disk adds none of these fields.
The Intake screen lists whichever it finds.

### 4. Carving and decode validation

`carve.carve` scans every block not claimed by an index entry for segment headers.
A candidate is kept only if FFmpeg decodes the frame count its header claims, give or take one.
If it decodes more, the run went on into older footage, as it does when no index marks where a segment ends.
`carve.frame_units` then walks the program stream's packs and the H.264 access units in it, and the segment is cut where its last claimed frame ends.
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

The font is learned from one segment dated by its index entry or header and checked on the others, so the disk needs at least two such segments whose video decodes.
Each recorder also needs at least 3 readings to fit a line.
Short of either, the run stops with exit code 2 and says which is missing.

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

## The workbench

The screens are server components that read `case.json` on every request through `loadCase()`.
`lib/case-schema.ts` checks the file with zod at that point, so a wrong or damaged file stops with the file and fields named, and the case layout shows that message instead of the screens.
`GET /health` answers 200 with the case ID, or 503 with the same message.

`src/instrumentation.ts` logs every server error as one pino JSON line on stdout, with the digest Next shows on its error page.
Errors stay in that local log, since the workbench runs offline.

Every response carries a content security policy that allows only the app's own origin, plus nosniff, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`.
The custody screen recomputes the chain's SHA-256 hashes in the browser, with `crypto.subtle` where the browser allows it and `lib/sha256.ts` over plain HTTP.

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
