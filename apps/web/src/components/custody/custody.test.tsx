import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { demo } from "../../../test/demo";
import { Custody, entryHash } from "./custody";

describe("entryHash", () => {
  test("reproduces every hash the Python engine wrote into the custody log", async () => {
    for (const e of demo.custody) expect(await entryHash(e)).toBe(e.hash);
  });

  test("changes when any sealed field changes", async () => {
    const e = demo.custody[3]!;
    expect(await entryHash({ ...e, actor: "Someone else" })).not.toBe(e.hash);
    expect(await entryHash({ ...e, prev: "0".repeat(64) })).not.toBe(e.hash);
  });
});

describe("entryHash without crypto.subtle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("still reproduces the engine's hashes, as over plain HTTP from another machine", async () => {
    vi.stubGlobal("crypto", {});
    for (const e of demo.custody) expect(await entryHash(e)).toBe(e.hash);
  });
});

describe("Custody", () => {
  test("says it is checking until the chain has been verified", () => {
    render(<Custody events={demo.custody} />);
    expect(screen.getByTestId("chain-status").textContent).toBe(`Checking ${demo.custody.length} entries`);
  });

  test("verifies the stored chain on open", async () => {
    render(<Custody events={demo.custody} />);
    expect(await screen.findByText(`All ${demo.custody.length} entries verify`)).toBeTruthy();
    expect(screen.getAllByTestId(/^entry-/)).toHaveLength(demo.custody.length);
  });

  test("reports where the chain breaks after an entry is edited", async () => {
    render(<Custody events={demo.custody} />);
    const target = Math.min(demo.custody.length - 2, Math.max(1, Math.floor(demo.custody.length / 2)));
    await userEvent.click(screen.getByTestId("tamper"));
    expect(await screen.findByText(`Chain broken at entry ${target + 1}`)).toBeTruthy();
    expect((screen.getByTestId("tamper") as HTMLButtonElement).disabled).toBe(true);
  });

  test("calls a chain with a broken link intact only in its links", async () => {
    const events = demo.custody.map((e, i) => (i === 2 ? { ...e, action: "Edited after the fact" } : e));
    render(<Custody events={events} />);
    expect(await screen.findByText("Links intact")).toBeTruthy();
  });
});
