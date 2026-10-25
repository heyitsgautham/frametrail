import assert from "node:assert/strict";
import { test } from "vitest";
import { makeAxis } from "./axis";

test("one burst fills the width, padded on both sides", () => {
  const a = makeAxis([[100, 200]]);
  assert.deepEqual(a.windows, [{ from: 88, to: 212, left: 0, width: 100 }]);
  assert.deepEqual(a.breaks, []);
  assert.equal(a.x(88), 0);
  assert.equal(a.x(150), 50);
  assert.equal(a.x(212), 100);
});

test("bursts closer than the join distance share one window", () => {
  const a = makeAxis([
    [150, 200],
    [0, 100],
  ]);
  assert.deepEqual(
    a.windows.map((w) => [w.from, w.to]),
    [[-12, 212]],
  );
});

test("an idle stretch becomes a narrow break band between windows", () => {
  const a = makeAxis([
    [0, 100],
    [1000, 1100],
  ]);
  assert.deepEqual(
    a.windows.map((w) => [w.from, w.to, w.left, w.width]),
    [
      [-12, 112, 0, 47.5],
      [988, 1112, 52.5, 47.5],
    ],
  );
  assert.deepEqual(a.breaks, [{ left: 47.5, width: 5, seconds: 876 }]);
  assert.equal(a.x(500), 50, "a time inside the gap sits mid-band");
  assert.equal(a.x(988), 52.5);
  assert.equal(a.x(5000), 100, "a time past the end clamps to the right edge");
});

test("ticks land on a round step inside their window", () => {
  const a = makeAxis([[100, 200]]);
  assert.deepEqual(a.ticks, [90, 105, 120, 135, 150, 165, 180, 195, 210]);
});
