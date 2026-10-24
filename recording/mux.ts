import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import { DURATION, scenes } from "./storyboard";
import { LEAD_IN, lineFile, spoken, writeSrt } from "./voiceover";

// pnpm mux
// Lays the recorded voiceover on the silent take. Each line in recording/vo/ is placed at
// its scene's start, loudness is evened out, and the final cut keeps the video untouched.
//
//   pnpm mux            the recorded lines from recording/vo/ into out/frametrail-final.mp4
//   pnpm mux --guide    a synthetic reading with macOS say, to prove every line fits its window

const { values } = parseArgs({
  options: {
    guide: { type: "boolean", default: false },
    // Reading speed of the guide voice, in words a minute.
    rate: { type: "string", default: "115" },
    voice: { type: "string", default: "Rishi" },
  },
});

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, "out");
const video = path.join(out, "frametrail.mp4");
const dir = path.join(root, values.guide ? "vo-guide" : "vo");
const target = path.join(out, values.guide ? "frametrail-guide.mp4" : "frametrail-final.mp4");
// Silence a line needs after it before the next scene cuts in.
const TAIL = 0.2;
const AUDIO = [".wav", ".m4a", ".mp3", ".aiff", ".aif"];

function seconds(file: string): number {
  return Number(
    execFileSync(ffprobe.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim(),
  );
}

function main() {
  if (!existsSync(video)) throw new Error(`${path.relative(process.cwd(), video)} is missing, run pnpm record first`);
  mkdirSync(dir, { recursive: true });
  const all = scenes();

  if (values.guide) {
    for (const [i, s] of all.entries()) {
      execFileSync("say", [
        "-v",
        values.voice ?? "Rishi",
        "-r",
        values.rate ?? "115",
        "-o",
        path.join(dir, `${lineFile(s, i)}.aiff`),
        spoken(s.line),
      ]);
    }
  }

  const files = readdirSync(dir);
  const placed: { file: string; at: number }[] = [];
  const spans: (number | null)[] = [];
  let overruns = 0;
  for (const [i, s] of all.entries()) {
    const name = lineFile(s, i);
    const file = files.find((f) => f.startsWith(`${name}.`) && AUDIO.includes(path.extname(f).toLowerCase()));
    if (!file) {
      console.warn(`missing ${name}, that scene stays silent`);
      spans.push(null);
      continue;
    }
    const full = path.join(dir, file);
    const len = seconds(full);
    const room = s.end - s.start - LEAD_IN - TAIL;
    const flag = len > room ? `  OVER by ${(len - room).toFixed(1)} s` : "";
    if (flag) overruns++;
    console.log(`${name.padEnd(20)} ${len.toFixed(1).padStart(5)} s of ${room.toFixed(1).padStart(5)} s${flag}`);
    placed.push({ file: full, at: s.start + LEAD_IN });
    spans.push(len);
  }
  if (!placed.length) throw new Error(`no lines in ${path.relative(process.cwd(), dir)}`);

  // Every line delayed to its start, mixed without level changes, then one loudness pass.
  const delays = placed.map(
    (p, i) =>
      `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}[l${i}]`,
  );
  const mix = `${placed.map((_, i) => `[l${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad,atrim=0:${DURATION},loudnorm=I=-16:TP=-1.5:LRA=11[vo]`;
  execFileSync(
    ffmpeg.path,
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      video,
      ...placed.flatMap((p) => ["-i", p.file]),
      "-filter_complex",
      [...delays, mix].join(";"),
      "-map",
      "0:v",
      "-map",
      "[vo]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      String(DURATION),
      "-movflags",
      "+faststart",
      target,
    ],
    { stdio: "inherit" },
  );
  writeSrt(path.join(out, "frametrail.srt"), spans);
  console.log(
    `wrote ${path.relative(process.cwd(), target)}, ${seconds(target).toFixed(2)} s${overruns ? `, ${overruns} line(s) over their window` : ", every line inside its window"}`,
  );
  if (overruns) process.exitCode = 1;
}

main();
