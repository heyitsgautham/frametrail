import assert from "node:assert/strict";
import { test } from "vitest";
import { bytes, clock, day, hex, media, secs, short } from "./format";

test("bytes picks the largest unit and one decimal below 100", () => {
  assert.equal(bytes(0), "0 B");
  assert.equal(bytes(1023), "1023 B");
  assert.equal(bytes(1024), "1.0 KB");
  assert.equal(bytes(1536), "1.5 KB");
  assert.equal(bytes(150 * 1024 ** 2), "150 MB");
  assert.equal(bytes(5 * 1024 ** 5), "5120 TB");
});

test("hex pads to the width and upper-cases", () => {
  assert.equal(hex(255), "0x000000FF");
  assert.equal(hex(0x1000, 4), "0x1000");
  assert.equal(hex(0x123456789, 4), "0x123456789");
});

test("short keeps both ends of a long hash", () => {
  assert.equal(short("abcdef0123456789abcdef"), "abcdef01…89abcdef");
  assert.equal(short("0123456789abcdef"), "0123456789abcdef");
  assert.equal(short("abcdef0123", 2), "ab…23");
});

test("secs reads the time of day and ignores the date and zone", () => {
  assert.equal(secs("2004-01-20T10:05:53.477Z"), 36353.477);
  assert.equal(secs("10:05:53"), 36353);
  assert.equal(secs("not a time"), 0);
});

test("clock wraps at midnight and rounds fractions to hundredths", () => {
  assert.equal(clock(36353.477), "10:05:53");
  assert.equal(clock(36353.477, true), "10:05:53.48");
  assert.equal(clock(5.5, true), "00:00:05.50");
  assert.equal(clock(-1), "23:59:59");
  assert.equal(clock(86405), "00:00:05");
});

test("day names the month and passes through what it cannot read", () => {
  assert.equal(day("2004-01-20T10:05:53"), "20 Jan 2004");
  assert.equal(day("2026-12-05"), "5 Dec 2026");
  assert.equal(day("unknown"), "unknown");
});

test("media serves every path form the engine writes under /clips", () => {
  assert.equal(media(undefined), undefined);
  assert.equal(media(""), undefined);
  assert.equal(media("data/local/clips/C01/N03.mp4"), "/clips/C01/N03.mp4");
  assert.equal(media("/clips/N03.mp4"), "/clips/N03.mp4");
  assert.equal(media("N03.jpg"), "/clips/N03.jpg");
});
