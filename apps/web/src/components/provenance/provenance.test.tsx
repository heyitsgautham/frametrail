import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { demo, finished } from "../../../test/demo";
import { Provenance } from "./provenance";

const clips = demo.provenance.nodes.filter((n) => n.kind === "clip");

afterEach(() => vi.unstubAllGlobals());

describe("Provenance", () => {
  test("lists every exported clip and waits for a pick", () => {
    render(<Provenance c={demo} />);
    expect(within(screen.getByTestId("clip-list")).getAllByRole("button")).toHaveLength(clips.length);
    expect(screen.getByText("Pick a clip to trace it back to the seized bytes")).toBeTruthy();
  });

  test("traces a clip back through stream and extent to the seized source", async () => {
    render(<Provenance c={demo} />);
    const clip = clips[0]!;
    await userEvent.click(screen.getByTestId(`node-${clip.id}`));
    const graph = within(screen.getByTestId("graph"));
    for (const stage of ["Seized evidence", "Byte extent", "Video stream", "Exported clip"]) expect(graph.getByText(stage)).toBeTruthy();
    expect(graph.getByText(clip.sha256!)).toBeTruthy();
    expect(graph.getByText("remux, codec copy")).toBeTruthy();
  });

  test("a finished screen opens on a carved clip", () => {
    finished();
    render(<Provenance c={demo} />);
    const graph = within(screen.getByTestId("graph"));
    expect(graph.getByText(/^EV-001-C0\d\.mp4$/)).toBeTruthy();
  });

  test("re-hashing the clip compares its SHA-256 with the one recorded at export", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
    const clip = clips[0]!;
    const body = new TextEncoder().encode("not the exported clip");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    try {
      render(<Provenance c={demo} />);
      await userEvent.click(screen.getByTestId(`node-${clip.id}`));
      await userEvent.click(screen.getByTestId("rehash"));
      await vi.advanceTimersByTimeAsync(800);
      expect((await screen.findByTestId("rehash-result")).textContent).toBe("SHA-256 differs from the value at export.");
      expect(fetch).toHaveBeenCalledWith(`/clips/${clip.label}`, { cache: "no-store" });
    } finally {
      vi.useRealTimers();
    }
  });
});
