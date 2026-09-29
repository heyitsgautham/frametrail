# The two evidence fixtures

Both fixtures are synthetic recorder files built around real CCTV footage.
Neither is a real Hikvision or Dahua disk.
They exist so every recovery claim in this repository can be checked against values we planted.

`uv run --project engine frametrail fixtures` rebuilds them into `data/local/fixtures/`, which git ignores.

## The footage

Real CCTV from the EC-funded CAVIAR project, Lisbon shopping-centre set, https://homepages.inf.ed.ac.uk/rbf/CAVIARDATA1/.
Licence CC BY-SA. Credit: EC Funded CAVIAR project/IST 2001 37540.
384 x 288, 25 fps, two views of the same corridor, each with the time burned into the top-left corner.

| Sequence | View | Used for |
|---|---|---|
| TwoEnterShop1 | corridor, front | Recorded before the disk was initialised, and the NVR export |
| OneStopMoveEnter1 | corridor, front | Same |
| OneShopOneWait1 | corridor | Recorded after the disk was initialised |

Each clip is re-encoded once to H.264 (x264, CRF 20, one keyframe a second).
After that no step re-encodes anything.

## EV-001, a DVR disk image modelled on the published Hikvision layout

The structures follow Han, Jeong and Lee (2015), "Forensic analysis of the Hikvision DVR file system", and the open parser fmpfeifer/hikextractor.
Field order and sizes inside each structure are ours.

| Offset | Structure | Stands in for |
|---|---|---|
| 0x200 | Master sector, 256 bytes, `HIKVISION@HANGZHOU` at +0x10, then capacity, log offset and size, data offset, block size and count, index offset and size, initialisation time (Unix seconds), model and firmware strings | The Hikvision master sector |
| 0x10000 | System log, 64-byte records signed `RATS`, each with a Unix time, a type, a channel and text | Hikvision system log records |
| 0x18000 | Backup master sector, identical to the first | The backup master sector after the logs |
| 0x20000 | Index, `HIKBTREE`, 64-byte entries with in-use flag, channel, start and end (Unix seconds plus milliseconds), first block, block count, byte length | HIKBTREE |
| 0x28000 | Backup index, identical | The backup HIKBTREE |
| 0x100000 | Data area, 32 KiB blocks | Hikvision data blocks, which are far larger on real disks |

Each recorded segment starts on a block boundary with a 40-byte `IMKH` header, then MPEG-PS video.
Real IMKH headers do not carry a start time. Ours do, so a carved segment can be dated without its index entry.
This is the largest simplification in the fixture.

### What happened to the disk

1. Camera 1 recorded eight motion segments, 10:07:34 to 10:23:28, written forward from block 0.
2. At 10:31:05 the local admin initialised the disk.
   The master sector's initialisation time was set, both index copies were emptied, and the log kept a record, as the log area is outside the data area.
3. Recording restarted at 10:32:32 from block 0 and wrote 30 s of new footage, overwriting the first segment and the first 6 s of the second.
4. The recorder was powered off at seizure, 10:34:10.

Four free blocks at the end hold a stray `IMKH` header over random bytes, which the carver must reject.

### What the engine must find, and does

| Planted | Found |
|---|---|
| 6 intact segments from before initialisation | 6 carved, each at its planted start time |
| Segment 2's tail, head overwritten | Carved from its first keyframe, dated from the segment after it, and confirmed by the on-screen clock |
| Segment 1 and 6 s of segment 2 overwritten | One overwritten range, from the log's first recording start to the surviving tail |
| Initialisation at 10:31:05 | Time reversal along the blocks, the master sector time, and the log record |
| Decoy header in free space | Rejected: header found, 0 frames decode |

## EV-002, a Dahua-style `.dav` export

DHAV frames exactly as FFmpeg's own demuxer (libavformat/dhav.c) reads them: a 24-byte header starting `DHAV`, extension records on keyframes (0x80 size, 0x81 codec and frame rate), the H.264 access unit, then an 8-byte `dhav` trailer.
FFmpeg's demuxer reads back every frame, which is checked on each run.

The NVR clock was planted slow by 97.4 s, and it loses a further 120 microseconds every second.
The burned-in time in the picture is untouched, which is what lets the engine measure both.

## What this does not show

- Nothing here was read off a real recorder. Real disks will differ in field layout, block size, frame headers and log format.
- The seizure record in `seizure.json` is written by the fixture builder to stand in for the examiner's photograph of each recorder's screen.
- The planted values in `truth.json` are read only to report errors. No result is computed from them.
