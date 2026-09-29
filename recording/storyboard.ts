import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type { Case } from "../apps/web/src/lib/types";
import { BRAND } from "./brand";

// The demo video, one slow cut of about three and a half minutes. One case: two recorders
// from two vendors, clocks that disagree, and a hole in one camera because someone wiped
// the recorder. The first half finds the hole and proves the wipe; the peak is carving the
// footage back and watching the hole fill; the rest shows why the result holds up.
//
// Every number the voiceover says is read from the same case.json the screen renders, so a
// spoken figure can never drift from the one on screen. Each scene owns a window of the
// final cut, its line, and the actions that play in it. record.ts plays this and writes
// voiceover.md from it.

export interface Director {
  page: Page;
  at(seconds: number): Promise<void>;
  moveTo(testId: string, opts?: { ms?: number; dx?: number; dy?: number }): Promise<void>;
  click(testId: string, opts?: { ms?: number; dx?: number; dy?: number }): Promise<void>;
  // An edit zoom: the camera moves so the element sits in the middle of the frame, scaled.
  zoom(testId: string, scale: number, ms?: number, dy?: number): Promise<void>;
  unzoom(ms?: number): Promise<void>;
  // A ring drawn around an element for `ms`, the way an editor points at something.
  ring(testId: string, ms?: number, tone?: "ink" | "gap"): Promise<void>;
  // Scroll so the element's top sits `at` of the way down the frame, 0.3 by default.
  scrollTo(testId: string, ms?: number, at?: number): Promise<void>;
  reveal(testId: string, ms?: number): Promise<void>;
  hideCursor(): Promise<void>;
  lowerThird(show: boolean): Promise<void>;
}

export interface Scene {
  id: string;
  start: number;
  end: number;
  screen: string;
  line: string;
  play(d: Director): Promise<void>;
}

export const DURATION = 222;
export const START = "/intake";

// Where the cursor rests when nothing is being pointed at, the empty foot of the side rail.
const PARK: [number, number] = [98, 820];

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function load(): Case {
  const file = process.env.FT_CASE || path.join(repo, "data/demo/derived/case.json");
  return JSON.parse(readFileSync(file, "utf8")) as Case;
}

function secs(iso: string): number {
  const m = /T?(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(iso);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

// "40 seconds fast" from a signed offset, where positive means the recorder is behind.
function drift(off: number): string {
  const n = Math.round(Math.abs(off));
  return `${n} seconds ${off > 0 ? "slow" : "fast"}`;
}

export function scenes(): Scene[] {
  const c = load();
  const disk = c.sources.find((s) => s.kind === "disk-image") ?? c.sources[0]!;
  const dvr = c.cameras.find((x) => x.sourceId === disk.id) ?? c.cameras[0]!;
  const nvr = c.cameras.find((x) => x !== dvr) ?? dvr;
  const mine = c.segments.filter((s) => s.extent.sourceId === disk.id);
  const found = mine.filter((s) => s.state !== "indexed" && s.clip);
  const carved = Number(c.stats.recoveredSegments ?? found.length);
  const carvedSec = Math.round(Number(c.stats.recoveredSeconds ?? 0));
  const lostSec = Math.round(
    Number(
      c.stats.overwrittenSeconds ??
        mine.filter((s) => s.state === "overwritten").reduce((n, s) => n + Math.max(0, secs(s.rawEnd) - secs(s.rawStart)), 0),
    ),
  );
  // The engine writes log records with type and rawTime.
  const log = (c.log ?? []) as unknown as { type?: string; kind?: string; text: string; rawTime?: string; at?: string }[];
  const init = log.find((l) => /init|format/i.test(`${l.type ?? l.kind} ${l.text}`));
  const initAt = init ? (init.rawTime ?? init.at ?? "").match(/(\d{2}):(\d{2})/)?.[0] : undefined;
  const initSaid = init ? init.text.replace(/, user (\S+)$/, ", by $1") : "HDD initialised";
  const nvrSeized = Math.round(Math.abs(nvr.clock.seizure?.offsetSec ?? nvr.clock.offsetSec));
  const nvrRead = nvr.clock.offsetSec.toFixed(1);
  const dvrRight = Math.abs(dvr.clock.offsetSec) < 0.5;
  const firstClip =
    c.provenance.nodes.find((n) => n.kind === "clip" && mine.some((s) => s.state === "recovered-unindexed" && n.id.startsWith(`${s.id}/`))) ??
    c.provenance.nodes.find((n) => n.kind === "clip");
  const people = c.detections.filter((d) => d.label === "person").sort((a, b) => b.confidence - a.confidence);
  const weakest = [...c.detections].sort((a, b) => a.confidence - b.confidence)[0];
  const firstCarved = firstClip ? mine.find((s) => firstClip.id.startsWith(`${s.id}/`)) : found[0];
  // The college is on the end card; the spoken line keeps to the team so it fits its window.
  const team = BRAND.team ? ` by ${BRAND.team.replace(/_\d+/, "").split(" · ")[0]}` : "";

  return [
    {
      id: "case",
      start: 0,
      end: 24,
      screen: `Intake. Lower third with ${BRAND.product}. Acquire ${disk.id}: MD5 and SHA-256 type out as the image is read, write-blocked badge, the vendor signature lights up in the hex strip, the disk map fills block by block`,
      line: `A bag was taken in a shopping-centre corridor. Police seized two recorders, from two vendors. ${BRAND.product} images the DVR read-only, hashes every byte with MD5 and SHA-256, and reads the vendor from its own signature.`,
      async play(d) {
        await d.page.mouse.move(...PARK, { steps: 2 });
        await d.at(0.6);
        await d.lowerThird(true);
        await d.at(5.4);
        await d.lowerThird(false);
        await d.at(5.8);
        await d.click("acquire", { ms: 900 });
        await d.page.mouse.move(...PARK, { steps: 40 });
        await d.at(14.2);
        await d.ring("signature", 2600, "ink");
        await d.at(18.4);
        await d.ring("disk-map", 3600, "ink");
      },
    },
    {
      id: "align",
      start: 24,
      end: 50,
      screen: `Timeline. Seizure record for each clock, recorder screen against the reference clock. Click Align: ${dvr.name} ${dvrRight ? "matches the reference" : drift(dvr.clock.offsetSec)}, ${nvr.name} ${drift(nvr.clock.offsetSec)}, the burned-in clock read per frame gives ${nvrRead} s, the lanes slide onto one clock and the holes stay`,
      line: `The two clocks disagree. At seizure, each recorder's screen was photographed beside a reference clock. ${dvrRight ? "The DVR was right." : `The DVR ran ${drift(dvr.clock.offsetSec)}.`} The NVR ran ${nvrSeized} seconds slow, and its burned-in clock agrees. On one clock, the cameras line up, except where the DVR has nothing.`,
      async play(d) {
        await d.at(24.2);
        await d.click("nav-timeline", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(28.6);
        await d.ring(`clock-${dvr.id}`, 3000, "ink");
        await d.at(31.8);
        await d.ring(`clock-${nvr.id}`, 3000, "ink");
        await d.at(35.2);
        await d.click("align", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(40.2);
        await d.ring("correlation", 3200, "ink");
        await d.at(45.2);
        await d.ring("hole", 4200, "gap");
      },
    },
    {
      id: "hole",
      start: 50,
      end: 64,
      screen: `Play both at a moment the ${nvr.name} camera sees people: the ${dvr.name} player says no footage in the index. Ring on the red log marker, ${init?.text ?? "HDD initialised"}`,
      line: `The DVR's index has nothing here, though its log says it was recording. Then at ${initAt ?? "the end"}, ${initSaid}.`,
      async play(d) {
        await d.at(50.2);
        await d.scrollTo("players", 1000);
        await d.click("play-both", { ms: 700 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(52.4);
        await d.ring(`player-panel-${dvr.id}`, 3600, "gap");
        await d.at(56.6);
        await d.scrollTo("lanes", 900);
        await d.at(57.8);
        await d.ring("log-marker", 5400, "gap");
      },
    },
    {
      id: "wipe",
      start: 64,
      end: 82,
      screen: "Recovery. The time-reversal plot, block number against recorded time, drops where the new recording restarted at the front of the disk. The recorder log and the evidence of re-initialisation",
      line: "The blocks prove it. Time runs backwards across the disk: new footage at the front, older footage behind it. The wipe erased the index, not the video.",
      async play(d) {
        await d.at(64.2);
        await d.click("nav-recovery", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(67.6);
        await d.ring("time-reversal", 8400, "gap");
        await d.at(77.2);
        await d.ring("recorder-log", 4200, "gap");
      },
    },
    {
      id: "carve",
      start: 82,
      end: 104,
      screen: `Click Carve: a scan line runs across the unallocated blocks, ${carved} carved segments appear in the list, one overwritten slice in red. Open ${firstCarved?.id ?? "the first carved segment"}, it plays with its byte extent`,
      line: `${BRAND.product} carves the unallocated blocks, and keeps only what decodes. ${carved} segments come back, ${carvedSec} seconds of video. ${lostSec} seconds were recorded over, and the report says so.`,
      async play(d) {
        await d.at(82.4);
        await d.click("carve", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(88.4);
        await d.scrollTo("segment-list", 1100);
        if (firstCarved) {
          await d.at(91.2);
          await d.click(`seg-${firstCarved.id}`, { ms: 800 });
          await d.page.mouse.move(...PARK, { steps: 30 });
          await d.at(94.6);
          await d.ring("extent", 4400, "ink");
        }
      },
    },
    {
      id: "fill",
      start: 104,
      end: 128,
      screen: `Back on the timeline, already aligned. The carved segments grow into the hole one by one, amber, with the overwritten slice in red. Play both: the ${dvr.name} player shows the recovered footage beside the ${nvr.name}, both burned-in clocks on the same second`,
      line: "Back on the timeline, the holes fill. Both cameras now show the same moment, on one clock.",
      async play(d) {
        await d.at(104.2);
        await d.click("nav-timeline", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(106.4);
        await d.ring("lanes", 4200, "ink");
        await d.at(111.2);
        // Lanes and both players in one frame, nothing cropped.
        await d.scrollTo("lanes", 1000, 0.08);
        await d.click("play-both", { ms: 700 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(114.6);
        await d.ring("players", 10800, "ink");
      },
    },
    {
      id: "triage",
      start: 128,
      end: 143,
      screen: `AI triage. ${c.detections.length} markers across both cameras. Confirm the strongest person marker, reject the weakest`,
      line: "An offline model marks where people appear, so the examiner knows where to look. It points. The examiner decides.",
      async play(d) {
        await d.at(128.2);
        await d.click("nav-triage", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        if (people[0]) {
          await d.at(134.2);
          await d.click(`confirm-${people[0].id}`, { ms: 800 });
        }
        if (weakest && weakest.id !== people[0]?.id) {
          await d.at(137.4);
          await d.click(`reject-${weakest.id}`, { ms: 800 });
        }
        await d.page.mouse.move(...PARK, { steps: 30 });
      },
    },
    {
      id: "provenance",
      start: 143,
      end: 164,
      screen: `Provenance. Pick ${firstClip?.label ?? "the exported clip"}: the chain back to its byte extent and the seized image lights up, with hashes, and what the export kept and lost. Re-hash: SHA-256 matches`,
      line: "Every clip traces back to its exact bytes on the disk, with both hashes, and what the export kept or lost. Hash it again, and it still matches.",
      async play(d) {
        await d.at(143.2);
        await d.click("nav-provenance", { ms: 800 });
        if (firstClip) {
          await d.at(146.4);
          await d.click(`node-${firstClip.id}`, { ms: 900 });
          await d.page.mouse.move(...PARK, { steps: 30 });
          await d.at(149.2);
          await d.ring("graph", 4400, "ink");
          await d.at(155.6);
          await d.click("rehash", { ms: 900 });
          await d.page.mouse.move(...PARK, { steps: 30 });
          await d.at(159.2);
          await d.ring("rehash-result", 3800, "ink");
        }
      },
    },
    {
      id: "custody",
      start: 164,
      end: 178,
      screen: "Custody. Every entry verifies. Edit one entry: it turns red, the links after it break, the badge reads chain broken",
      line: "Custody is hash-chained. Change one entry, and everything after it stops verifying.",
      async play(d) {
        await d.at(164.2);
        await d.click("nav-custody", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(168.4);
        await d.click("tamper", { ms: 900 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(172.6);
        await d.ring("chain-status", 4000, "gap");
      },
    },
    {
      id: "report",
      start: 178,
      end: 193,
      screen: "Report. Generate: the Section 63 certificate, Part B, fills row by row with devices and both hashes; the limitations list beside it; the signature lines stay empty",
      line: "The certificate the Bharatiya Sakshya Adhiniyam asks for fills itself from the case. The examiner still signs it.",
      async play(d) {
        await d.at(178.2);
        await d.click("nav-report", { ms: 800 });
        await d.at(180.8);
        await d.click("generate", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(184.2);
        await d.ring("certificate", 6800, "ink");
      },
    },
    {
      id: "vendors",
      start: 193,
      end: 204,
      screen: `Vendor adapters for ${c.adapters.length} OEMs, each with what it was tested on: fixture, export parser or next phase`,
      line: "Each vendor adapter says exactly what it was tested on. An unknown layout is reported, never forced.",
      async play(d) {
        await d.at(193.2);
        await d.click("nav-vendors", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(196.4);
        await d.ring("vendor-matrix", 6000, "ink");
      },
    },
    {
      id: "research",
      start: 204,
      end: 216,
      screen: `How we built it: real CCTV from ${c.footage.name}, ${c.footage.licence}, synthetic recorder images, validation against what we planted, the offline model, the standards and the law we read`,
      line: "We built this on real public CCTV footage, the SWGDE and NIST guidance, the police seizure procedure, and published recovery research.",
      async play(d) {
        await d.at(204.2);
        await d.click("nav-research", { ms: 800 });
        await d.page.mouse.move(...PARK, { steps: 30 });
        await d.at(208.2);
        await d.ring("method-validation", 4400, "ink");
      },
    },
    {
      id: "end-card",
      start: 216,
      end: DURATION,
      screen: `End card, ${BRAND.product}, ${BRAND.tagline}`,
      line: `${BRAND.product}, a working prototype${team}.`,
      async play(d) {
        await d.at(215.8);
        await d.page.goto(new URL("/title", d.page.url()).href, { waitUntil: "load" });
        await d.hideCursor();
      },
    },
  ];
}
