import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { day } from "@/lib/format";
import { demo } from "../../../test/demo";
import { Report } from "./report";

describe("Report", () => {
  test("fills the certificate from the case, with both hashes of every exhibit", () => {
    render(<Report c={demo} />);
    const cert = within(screen.getByTestId("certificate"));
    expect(cert.getByText(`${demo.id} · ${demo.title}`)).toBeTruthy();
    for (const s of demo.sources) {
      expect(cert.getByText(s.md5)).toBeTruthy();
      expect(cert.getByText(s.sha256)).toBeTruthy();
    }
    const recovered = demo.segments.filter((s) => s.state !== "indexed").length;
    expect(cert.getByText(`${recovered} of ${demo.segments.length}, each with its own hashes`)).toBeTruthy();
    expect(cert.getByText(day(demo.createdAt))).toBeTruthy();
  });

  test("counts the examiner's triage verdicts saved in the tab", () => {
    const [a, b, c] = demo.detections;
    sessionStorage.setItem("ft-review", JSON.stringify({ [a!.id]: "confirmed", [b!.id]: "confirmed", [c!.id]: "rejected" }));
    render(<Report c={demo} />);
    expect(
      screen.getByText(`${demo.detections.length} raised · 2 confirmed, 1 rejected by the examiner · the rest not relied on`),
    ).toBeTruthy();
  });

  test("states its limitations, starting with the partial segment", () => {
    render(<Report c={demo} />);
    const partial = demo.segments.filter((s) => s.state === "partial").length;
    expect(
      within(screen.getByTestId("limitations")).getByText(
        `${partial} segment only partly survives. Overwritten sectors cannot be restored.`,
      ),
    ).toBeTruthy();
  });
});
