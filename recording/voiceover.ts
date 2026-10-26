import { writeFileSync } from "node:fs";
import path from "node:path";
import { BRAND, PRODUCT_SAY, VOICEOVER } from "./brand";
import { DURATION, type Scene, scenes } from "./storyboard";

// Writes voiceover.md from the storyboard, so the lines and their windows always match
// the recorded MP4, and refuses any line that would have to be rushed.

// The cut is read slowly on purpose. Numbers count as the words spoken.
const MAX_WPM = 120;
// Each recorded line starts this long after its scene does, so a cut never lands on a word.
export const LEAD_IN = 0.3;

// How the reader says the names the script uses.
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const productSay: [RegExp, string, string][] = PRODUCT_SAY
  ? [[new RegExp(`\\b${escapeRe(BRAND.product)}\\b`, "g"), PRODUCT_SAY, `${BRAND.product} as "${PRODUCT_SAY}"`]]
  : [];
export const SAY: [RegExp, string, string][] = [
  ...productSay,
  [/\bDVR\b/g, "D V R", "DVR letter by letter, D V R"],
  [/\bNVR\b/g, "N V R", "NVR letter by letter, N V R"],
  [/\bMD5\b/g, "M D five", "MD5 as M D five"],
  [/\bSHA-256\b/g, "shah two fifty-six", "SHA-256 as shah two fifty-six"],
  [/\bHDD\b/g, "H D D", "HDD letter by letter, H D D"],
  [/\bSWGDE\b/g, "swig dee", "SWGDE as swig dee"],
  [/\bNIST\b/g, "nist", "NIST as one word, nist"],
  [/\bAdhiniyam\b/g, "Adhi-niyam", "Adhiniyam as Adhi-niyam"],
];

function clock(s: number): string {
  const whole = Math.floor(s);
  const tenth = Math.round((s - whole) * 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}${tenth ? `.${tenth}` : ""}`;
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const SCALES: [number, string][] = [
  [1e9, "billion"],
  [1e6, "million"],
  [1e3, "thousand"],
];

// How a number is said aloud, so a line's pace counts what the reader actually says.
export function sayNumber(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${sayNumber(n % 100)}` : ""}`;
  for (const [size, name] of SCALES) {
    if (n >= size) return `${sayNumber(Math.floor(n / size))} ${name}${n % size ? ` ${sayNumber(n % size)}` : ""}`;
  }
  return String(n);
}

// The line as it is spoken, names and numbers spelled out.
export function spoken(line: string): string {
  let out = line;
  for (const [re, said] of SAY) out = out.replace(re, said);
  return out.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
    const [whole, frac] = m.replace(/,/g, "").split(".");
    return (
      sayNumber(Number(whole)) +
      (frac
        ? ` point ${frac
            .split("")
            .map((d) => ONES[Number(d)])
            .join(" ")}`
        : "")
    );
  });
}

export function spokenWords(line: string): number {
  return spoken(line)
    .split(/[\s-]+/)
    .filter((w) => /\w/.test(w)).length;
}

// One audio file per line, named so `pnpm mux` finds it.
export function lineFile(s: Scene, i: number): string {
  return `${String(i + 1).padStart(2, "0")}-${s.id}`;
}

export function writeVoiceover(file: string): void {
  const rows = scenes().map((s, i) => {
    const words = spokenWords(s.line);
    const wpm = Math.round(words / ((s.end - s.start) / 60));
    if (wpm > MAX_WPM) throw new Error(`scene ${s.id} needs ${wpm} words a minute, over ${MAX_WPM}. Cut the line.`);
    return { ...s, words, wpm, file: lineFile(s, i) };
  });
  const total = rows.reduce((n, r) => n + r.words, 0);
  const md = [
    `# ${BRAND.product} demo voiceover`,
    "",
    `Read over \`recording/out/frametrail.mp4\`, which runs ${clock(DURATION)}.`,
    `${total} spoken words in ${DURATION} seconds, ${Math.round(total / (DURATION / 60))} words a minute over the whole cut.`,
    `The busiest line runs at ${Math.max(...rows.map((r) => r.wpm))} words a minute and the slowest at ${Math.min(...rows.map((r) => r.wpm))}, with numbers counted as they are said.`,
    "Every number in a line is on screen while the line plays, read from the same analysis the screen renders.",
    "",
    "## How to record",
    "",
    "1. Record one file per line, in a quiet room, about a hand's width from the microphone.",
    "   Leave half a second of silence before and after each line.",
    "2. Read calmly. Every line fits its window at a relaxed pace, so there is never a reason to hurry.",
    "3. Save the files into `recording/vo/` with the names in the table, as .wav, .m4a, .mp3 or .aiff.",
    "4. Run `pnpm mux`. It places each line at its scene start, warns if a line runs past its window, evens out the loudness and writes `recording/out/frametrail-final.mp4`.",
    "",
    "Say the names this way.",
    "",
    ...SAY.filter(([re]) => rows.some((r) => new RegExp(re.source).test(r.line))).map(([, , note]) => `- ${note}.`),
    "",
    "## Lines",
    "",
    "| File | Start | End | On screen | Line to read | Words | Pace |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| \`${r.file}\` | ${clock(r.start)} | ${clock(r.end)} | ${r.screen} | ${r.line} | ${r.words} | ${r.wpm} |`),
    "",
    "Generated from `recording/storyboard.ts` by `pnpm record` and `pnpm voiceover`. Edit the storyboard, not this file.",
    "",
  ].join("\n");
  writeFileSync(file, md);
}

// Captions for YouTube, one cue per sentence. A line's time is shared among its sentences by
// the words spoken in each. `spans` gives each line's measured length when the audio exists.
export function writeSrt(file: string, spans?: (number | null)[]): void {
  const t = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  const cues: string[] = [];
  for (const [i, s] of scenes().entries()) {
    const from = s.start + LEAD_IN;
    const to = Math.min(s.end - 0.1, from + (spans?.[i] ?? s.end - s.start - LEAD_IN - 0.4));
    const sentences = s.line.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [s.line];
    const words = sentences.map(spokenWords);
    const total = words.reduce((a, b) => a + b, 0);
    let at = from;
    for (const [k, sentence] of sentences.entries()) {
      const end = k === sentences.length - 1 ? to : at + ((to - from) * words[k]!) / total;
      cues.push(`${cues.length + 1}\n${t(at)} --> ${t(end)}\n${sentence}\n`);
      at = end;
    }
  }
  writeFileSync(file, cues.join("\n"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  writeVoiceover(VOICEOVER);
  writeSrt(path.join(dir, "out", "frametrail.srt"));
  console.log(`wrote ${path.relative(path.join(dir, ".."), VOICEOVER)} and recording/out/frametrail.srt`);
}
