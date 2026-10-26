import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { clock, secs } from "@/lib/format";
import { demo } from "../../../test/demo";
import { SyncPlayers } from "./players";

const disk = demo.sources.find((s) => s.kind === "disk-image")!;
const cams = demo.cameras;
const segOf = (camId: string, extra: (s: (typeof demo.segments)[number]) => boolean) =>
  demo.segments.filter((s) => s.cameraId === camId && s.clip && extra(s));

// A moment both cameras cover once the disk is carved: a carved disk segment overlapping an
// export segment. Before carving the disk camera has nothing there, which is the hole.
const [a, b] = (() => {
  for (const x of segOf(cams[0]!.id, (s) => s.state === "recovered-unindexed"))
    for (const y of segOf(cams[1]!.id, () => true))
      if (secs(x.refStart) < secs(y.refEnd) && secs(y.refStart) < secs(x.refEnd)) return [x, y];
  throw new Error("the demo case has no moment both cameras cover");
})();
const t = Math.max(secs(a.refStart), secs(b.refStart)) + 1;

// jsdom has no media pipeline: metadata is ready at once, a seek lands on the next tick, and
// currentTime is a plain number the test can move to stand for playback.
const times = new WeakMap<HTMLMediaElement, number>();
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(1);
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(600);
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(function (this: HTMLMediaElement) {
    return times.get(this) ?? 0;
  });
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set").mockImplementation(function (this: HTMLMediaElement, v: number) {
    times.set(this, v);
    setTimeout(() => this.dispatchEvent(new Event("seeked")), 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

// The players start once both seeks land; the reference clock then shows the moment.
const started = () => waitFor(() => expect(screen.getByTestId("ref-clock").textContent).toBe(clock(t, true)));
const video = (camId: string) => screen.getByTestId(`player-${camId}`) as HTMLVideoElement;

function players(sync: boolean, carved = true) {
  return <SyncPlayers c={demo} cams={cams} moment={{ t }} aligned sync={sync} onSync={() => {}} carved={carved} diskId={disk.id} />;
}

describe("SyncPlayers", () => {
  test("loads the segment each camera holds at the moment, and waits to play", () => {
    render(players(false));
    expect(video(cams[0]!.id).getAttribute("src")).toBe(`/clips/${a.clip!.replace(/^\/?(clips\/)?/, "")}`);
    expect(video(cams[1]!.id)).toBeTruthy();
    expect(screen.getByTestId("ref-clock").textContent).toBe("--:--:--");
    expect(screen.getByTestId("play-both").textContent).toContain(clock(t));
  });

  test("seeks both players to the moment and runs the reference clock from the lead", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    render(players(true));
    await started();
    expect(video(cams[0]!.id).currentTime).toBeCloseTo(t - secs(a.refStart), 3);
    expect(video(cams[1]!.id).currentTime).toBeCloseTo(t - secs(b.refStart), 3);
    expect(play).toHaveBeenCalledTimes(2);
  });

  test("pulls a player that drifts more than a tenth of a second back to the lead", async () => {
    render(players(true));
    await started();
    const lead = video(cams[0]!.id);
    const follower = video(cams[1]!.id);
    times.set(lead, times.get(lead)! + 2);
    times.set(follower, 0);
    await waitFor(() => expect(follower.currentTime).toBeCloseTo(t + 2 - secs(b.refStart), 3));
  });

  test("before carving, the disk camera shows the hole and only the export plays", () => {
    render(players(false, false));
    expect(screen.queryByTestId(`player-${cams[0]!.id}`)).toBeNull();
    expect(screen.getByText("No footage in the index at this time")).toBeTruthy();
    expect(video(cams[1]!.id)).toBeTruthy();
  });

  test("marks footage the carver recovered", () => {
    render(players(false));
    expect(screen.getByText("Recovered by carving")).toBeTruthy();
  });

  test("stops following the lead once it unmounts", async () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(players(true));
    await started();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
