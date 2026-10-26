import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { Intake } from "./intake";
import { demo, finished } from "../../../test/demo";

const disk = demo.sources.find((s) => s.kind === "disk-image")!;

describe("Intake", () => {
  test("waits for the examiner before hashing", () => {
    render(<Intake sources={demo.sources} />);
    expect(screen.getByTestId("acquire").textContent).toBe(`Acquire ${disk.id}`);
    expect(screen.getByTestId("hash-MD5").textContent).toBe("·".repeat(32));
    expect(screen.queryByTestId("vendor")).toBeNull();
  });

  test("acquiring starts the read and hides the button", async () => {
    render(<Intake sources={demo.sources} />);
    await userEvent.click(screen.getByTestId("acquire"));
    expect(screen.queryByTestId("acquire")).toBeNull();
    expect(screen.getByText("Reading the image once, both digests together")).toBeTruthy();
  });

  test("the finished intake shows both digests, the vendor and the disk map legend", async () => {
    finished();
    render(<Intake sources={demo.sources} />);
    expect(await screen.findByTestId("vendor")).toBeTruthy();
    expect(screen.getByTestId("vendor").textContent).toContain(disk.vendor.family);
    expect(screen.getByTestId("hash-MD5").textContent).toBe(disk.md5);
    expect(screen.getByTestId("hash-SHA-256").textContent).toBe(disk.sha256);
    const legend = within(screen.getByTestId("legend"));
    expect(legend.getByText("Listed in the index")).toBeTruthy();
    expect(legend.getByText("Not listed in the index")).toBeTruthy();
    for (const s of demo.sources.filter((x) => x !== disk)) expect(screen.getByTestId(`exhibit-${s.id}`)).toBeTruthy();
  });

  test("at intake, carved and overwritten blocks are not yet told apart from free ones", () => {
    finished();
    render(<Intake sources={demo.sources} />);
    expect(screen.queryByText("Recovered, not in index")).toBeNull();
    expect(screen.queryByText("Overwritten")).toBeNull();
  });

  test("an intact disk shows no damage panel", () => {
    finished();
    render(<Intake sources={demo.sources} />);
    expect(screen.queryByTestId("damage")).toBeNull();
  });

  test("a damaged disk lists what was wrong once the disk is mapped", () => {
    const hurt = {
      ...disk,
      structures: {
        index: { offset: 0x20000, copiesMatch: true, entries: 0, readable: false },
        image: { expectedBytes: 4194304, shortBy: 4096 },
      },
    };
    render(<Intake sources={[hurt, ...demo.sources.filter((s) => s !== disk)]} />);
    expect(screen.queryByTestId("damage")).toBeNull(); // nothing is known before the read
    finished();
    render(<Intake sources={[hurt]} />);
    const panel = screen.getAllByTestId("damage").at(-1)!;
    expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
    expect(within(panel).getByText(/Neither copy of the index can be read/)).toBeTruthy();
  });
});
