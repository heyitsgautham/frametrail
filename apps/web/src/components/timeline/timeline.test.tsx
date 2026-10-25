import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { demo, finished } from "../../../test/demo";
import { Timeline } from "./timeline";

const lanes = () => screen.getAllByTestId(/^lane-/).map((el) => el.dataset.testid!.slice(5));
const diskSegs = demo.segments.filter((s) => s.extent.sourceId === "EV-001");
const nvrSegs = demo.segments.filter((s) => s.extent.sourceId === "EV-002");

describe("Timeline", () => {
  test("before carving, the disk camera shows only indexed footage and a hole", () => {
    render(<Timeline c={demo} />);
    expect(lanes().sort()).toEqual([...diskSegs.filter((s) => s.state === "indexed"), ...nvrSegs].map((s) => s.id).sort());
    expect(screen.getByTestId("hole")).toBeTruthy();
    expect(screen.getByText("Each recorder's own time")).toBeTruthy();
  });

  test("after carving, every disk segment has a lane and the hole is gone", () => {
    sessionStorage.setItem("ft-carved", "1");
    render(<Timeline c={demo} />);
    expect(lanes()).toHaveLength(demo.segments.length);
    expect(screen.queryByTestId("hole")).toBeNull();
  });

  test("marks the disk initialisation from the recorder log", () => {
    render(<Timeline c={demo} />);
    const init = demo.log!.find((l) => l.kind === "hdd-init")!;
    expect(within(screen.getByTestId("log-marker")).getByText(new RegExp(init.text))).toBeTruthy();
  });

  test("each clock card says how far its recorder is off the reference", () => {
    render(<Timeline c={demo} />);
    const nvr = demo.cameras.find((c) => c.id === "CAM-02")!;
    expect(within(screen.getByTestId("clock-CAM-01")).getByText("Matches the reference clock")).toBeTruthy();
    expect(within(screen.getByTestId("clock-CAM-02")).getByText(`${Math.abs(nvr.clock.offsetSec).toFixed(1)} s slow`)).toBeTruthy();
    expect(within(screen.getByTestId("correlation")).getByText(`${demo.alignment[0]!.offsetSec.toFixed(1)} s`)).toBeTruthy();
  });

  test("aligning moves the lanes to reference time and is remembered for the tab", async () => {
    render(<Timeline c={demo} />);
    expect((screen.getByTestId("play-both") as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByTestId("align"));
    expect(screen.getByTestId("align").textContent).toBe("Clocks aligned");
    expect(screen.getByText("Reference time, from the seizure record")).toBeTruthy();
    expect(sessionStorage.getItem("ft-aligned")).toBe("1");
    expect((screen.getByTestId("play-both") as HTMLButtonElement).disabled).toBe(false);
  });

  test("a finished screen opens aligned with both players on one moment", () => {
    finished();
    render(<Timeline c={demo} />);
    expect(screen.getByTestId("align").textContent).toBe("Clocks aligned");
    expect(screen.getAllByTestId("playhead")).toHaveLength(2);
    expect(screen.getByTestId("player-CAM-01")).toBeTruthy();
    expect(screen.getByTestId("player-CAM-02")).toBeTruthy();
    expect(screen.getByText("Recovered by carving")).toBeTruthy();
  });

  test("before carving, the disk player has no footage at the moment the players open on", () => {
    sessionStorage.setItem("ft-aligned", "1");
    render(<Timeline c={demo} />);
    expect(within(screen.getByTestId("player-panel-CAM-01")).getByText("No footage in the index at this time")).toBeTruthy();
    expect(screen.getByTestId("player-CAM-02")).toBeTruthy();
  });
});
