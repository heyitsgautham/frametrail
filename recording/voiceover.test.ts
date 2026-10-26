import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { scenes } from "./storyboard";
import { LEAD_IN, lineFile, sayNumber, spoken, spokenWords, writeSrt, writeVoiceover } from "./voiceover";

test("numbers are said the way a reader says them", () => {
  assert.equal(sayNumber(0), "zero");
  assert.equal(sayNumber(17), "seventeen");
  assert.equal(sayNumber(98), "ninety eight");
  assert.equal(sayNumber(256), "two hundred fifty six");
  assert.equal(sayNumber(2004), "two thousand four");
});

test("millions and billions get their own word instead of thousand thousand", () => {
  assert.equal(sayNumber(1_000_000), "one million");
  assert.equal(sayNumber(14_581_760), "fourteen million five hundred eighty one thousand seven hundred sixty");
  assert.equal(sayNumber(3_000_000_007), "three billion seven");
});

test("a line is spoken with its names and numbers spelled out", () => {
  assert.equal(spoken("MD5 and SHA-256 over 99.4 s"), "M D five and shah two fifty-six over ninety nine point four s");
  assert.equal(spoken("The DVR wrote 1,048,576 bytes"), "The D V R wrote one million forty eight thousand five hundred seventy six bytes");
  assert.equal(spokenWords("MD5 over 98 s"), 7); // M D five over ninety eight s
});

test("each line's audio file is numbered from 01 in scene order", () => {
  const [first, second] = scenes();
  assert.equal(lineFile(first!, 0), `01-${first!.id}`);
  assert.equal(lineFile(second!, 1), `02-${second!.id}`);
});

const tmp = () => mkdtempSync(path.join(tmpdir(), "ft-vo-"));

test("the voiceover table lists every scene with a pace the reader can keep", () => {
  const file = path.join(tmp(), "voiceover.md");
  writeVoiceover(file);
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("| `"));
  assert.equal(rows.length, scenes().length);
  for (const row of rows) assert.ok(Number(row.split("|").at(-2)) <= 120, row);
});

test("captions start after each scene's lead-in, run in order and never overlap", () => {
  const file = path.join(tmp(), "out.srt");
  writeSrt(file);
  const toSec = (t: string) => {
    const [h, m, rest] = t.split(":");
    const [sec, ms] = rest!.split(",");
    return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms) / 1000;
  };
  const cues = readFileSync(file, "utf8")
    .trim()
    .split("\n\n")
    .map((c) => c.split("\n")[1]!.split(" --> ").map(toSec) as [number, number]);
  assert.ok(Math.abs(cues[0]![0] - (scenes()[0]!.start + LEAD_IN)) < 0.002);
  for (const [i, [from, to]] of cues.entries()) {
    assert.ok(to > from, `cue ${i + 1} ends after it starts`);
    if (i > 0) assert.ok(from >= cues[i - 1]![1] - 0.002, `cue ${i + 1} starts after cue ${i}`);
  }
});
