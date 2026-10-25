import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import RecoveryPage from "@/app/(case)/recovery/page";
import { hex, short } from "@/lib/format";
import { demo, finished } from "../../../test/demo";

const disk = demo.segments.filter((s) => s.extent.sourceId === "EV-001");
const indexed = disk.filter((s) => s.state === "indexed");
const carvedClips = disk.filter((s) => s.state !== "indexed" && s.clip);

describe("Recovery", () => {
  test("lists only what the index still holds until the disk is carved", () => {
    render(<RecoveryPage />);
    const list = screen.getByTestId("segment-list");
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.dataset.testid),
    ).toEqual(indexed.map((s) => `seg-${s.id}`));
    expect(screen.getByText("The index lists only what was recorded after the wipe")).toBeTruthy();
    expect(screen.getByTestId("carve").textContent).toBe("Carve unallocated blocks");
  });

  test("shows the wipe in the recorder's own log and in the time reversal", () => {
    render(<RecoveryPage />);
    const init = demo.log!.find((l) => l.kind === "hdd-init")!;
    expect(within(screen.getByTestId("recorder-log")).getByText(init.text).className).toContain("text-red");
    for (const e of demo.reformat!.evidence) expect(screen.getByText(e)).toBeTruthy();
    expect(screen.getByText("time runs backwards here")).toBeTruthy();
  });

  test("starts the scan when the examiner clicks carve", async () => {
    render(<RecoveryPage />);
    await userEvent.click(screen.getByTestId("carve"));
    expect(screen.getByTestId("carve").textContent).toBe("Carving…");
    expect((screen.getByTestId("carve") as HTMLButtonElement).disabled).toBe(true);
  });

  test("a finished screen opens carved, with every segment listed", () => {
    finished();
    render(<RecoveryPage />);
    expect(screen.getByText(`${carvedClips.length} segments carved`)).toBeTruthy();
    expect(within(screen.getByTestId("segment-list")).getAllByRole("button")).toHaveLength(disk.length);
  });

  test("a full scan carves the disk and remembers it for the tab", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout"] });
    try {
      render(<RecoveryPage />);
      fireEvent.click(screen.getByTestId("carve"));
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByText(`${carvedClips.length} segments carved`)).toBeTruthy();
      expect(within(screen.getByTestId("segment-list")).getAllByRole("button")).toHaveLength(disk.length);
      expect(sessionStorage.getItem("ft-carved")).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("a picked segment shows its byte extent and hashes", async () => {
    sessionStorage.setItem("ft-carved", "1");
    render(<RecoveryPage />);
    const seg = carvedClips[1]!;
    await userEvent.click(screen.getByTestId(`seg-${seg.id}`));
    const view = await screen.findByTestId("segment-view");
    expect(within(view).getByText(hex(seg.extent.byteStart, 9))).toBeTruthy();
    expect(within(view).getByText(`MD5 ${short(seg.md5, 6)}`)).toBeTruthy();
    expect((within(view).getByTestId("segment-video") as HTMLVideoElement).getAttribute("src")).toBe(`/clips/${seg.id}.mp4`);
  });

  test("a segment with nothing decodable says so instead of showing a player", async () => {
    sessionStorage.setItem("ft-carved", "1");
    render(<RecoveryPage />);
    const lost = disk.find((s) => !s.clip)!;
    await userEvent.click(screen.getByTestId(`seg-${lost.id}`));
    expect(await screen.findByText("Nothing decodable survives")).toBeTruthy();
  });
});
