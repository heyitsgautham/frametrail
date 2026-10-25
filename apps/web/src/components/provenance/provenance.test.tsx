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

  async function rehash(respond: () => Promise<Response>) {
    vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn(respond));
    try {
      render(<Provenance c={demo} />);
      await userEvent.click(screen.getByTestId(`node-${clips[0]!.id}`));
      await userEvent.click(screen.getByTestId("rehash"));
      await vi.advanceTimersByTimeAsync(800);
      return (await screen.findByTestId("rehash-result")).textContent;
    } finally {
      vi.useRealTimers();
    }
  }

  test("a clip that is not on this machine is reported as missing, not as changed", async () => {
    expect(await rehash(async () => new Response("not found", { status: 404 }))).toBe(
      "This clip is not on this machine yet. Run pnpm engine:analyse to export it, then re-hash.",
    );
  });

  test("a network failure compares nothing", async () => {
    expect(
      await rehash(async () => {
        throw new TypeError("network down");
      }),
    ).toBe("Could not read the clip, so nothing was compared. Try again.");
  });

  test("a server error compares nothing", async () => {
    expect(await rehash(async () => new Response("", { status: 500 }))).toBe(
      "Could not read the clip, so nothing was compared. Try again.",
    );
  });

  test("the exported bytes hash to the recorded value", async () => {
    const bytes = new TextEncoder().encode("exported clip");
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const c = {
      ...demo,
      provenance: { ...demo.provenance, nodes: demo.provenance.nodes.map((n) => (n.id === clips[0]!.id ? { ...n, sha256: hex } : n)) },
    };
    vi.useFakeTimers({ toFake: ["setTimeout"], shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes)),
    );
    try {
      render(<Provenance c={c} />);
      await userEvent.click(screen.getByTestId(`node-${clips[0]!.id}`));
      await userEvent.click(screen.getByTestId("rehash"));
      await vi.advanceTimersByTimeAsync(800);
      expect((await screen.findByTestId("rehash-result")).textContent).toBe("SHA-256 matches. Unchanged since export.");
    } finally {
      vi.useRealTimers();
    }
  });
});
