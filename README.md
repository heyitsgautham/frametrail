<h1 align="center">FrameTrail</h1>

<p align="center">Every frame, traced to its source bytes.</p>

<p align="center"><img src="docs/hero.png" alt="FrameTrail timeline: two cameras from two recorder vendors on one reference clock, with recovered footage filling the hole a disk wipe left" width="100%"></p>

FrameTrail reads a seized DVR disk and an NVR export side by side, offline and read-only.
When someone has wiped the recorder, it finds the wipe in the recorder's own log and in time running backwards across the disk, then carves back the footage the format left behind.
Every clip it exports traces to the exact bytes it came from, with MD5 and SHA-256 at every step and a hash-chained custody log.

| On the demo case | Result |
|---|---|
| Footage carved back after the wipe | 7 segments, 99.4 s |
| Recorded over, reported as lost | 30.0 s |
| Disk initialisation | Dated to 10:31:05 from 5 independent clues |
| NVR clock offset | 97.4 s found, 97.4 s planted, 120 ppm drift |
| Exported clips identical to their source frames | 11 of 11 |
| Custody events, hash-chained | 18 |

The footage is real CCTV from the CAVIAR project (CC BY-SA), packed into synthetic recorder images modelled on published disk layouts.
FrameTrail has not yet been run on a seized recorder, and [docs/validation.md](docs/validation.md) says what that means.

## Run it

You need Node 20.9 or later, pnpm, [uv](https://docs.astral.sh/uv/) and FFmpeg on your PATH.

```sh
pnpm install
pnpm engine:setup      # Python 3.12 engine
pnpm engine:fixtures   # download the footage, build both evidence files into data/local
pnpm engine:analyse    # run the case, write data/demo/derived/case.json
pnpm build && pnpm start   # http://localhost:3150
```

`data/demo/derived/case.json` is committed, so `pnpm build && pnpm start` works without the fixtures, but the video players need the clips from `pnpm engine:analyse`.

```sh
pnpm engine:test && pnpm check   # engine tests, then names, types and lint
```

## Inside

```
engine/        Python engine: intake, vendor detection, index and log parsing, carving,
               clock model, detection, provenance, custody, fixture builder, tests
apps/web/      Next.js workbench, one screen per step of the examination
data/demo/     case.json, the analysed demo case the web app reads
recording/     Playwright script that records the demo video
scripts/       Checks run before every commit
docs/          Architecture, SOP, validation, OEM comparison, user manual, fixtures
```

## Docs

- [Architecture](docs/architecture.md)
- [Standard operating procedure](docs/sop.md)
- [Validation](docs/validation.md)
- [OEM comparison](docs/oem-comparison.md)
- [User manual](docs/user-manual.md)
- [The two evidence fixtures](docs/fixtures.md)

## Credits

Footage: EC Funded CAVIAR project/IST 2001 37540, found at http://homepages.inf.ed.ac.uk/rbf/CAVIAR/, used under CC BY-SA and not included in this repository.
Person detection: YOLOX-S by Megvii, Apache-2.0.
The disk layout follows Han, Jeong and Lee (2015), and the `.dav` framing follows FFmpeg's dhav demuxer.

Built by a student team at Saveetha Engineering College, Chennai.
Code under the [MIT licence](LICENSE).
