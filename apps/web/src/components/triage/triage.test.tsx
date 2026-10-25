import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { demo } from "../../../test/demo";
import { Triage } from "./triage";

const cards = () => screen.getAllByTestId(/^det-D/).map((el) => el.dataset.testid!.slice(4));

describe("Triage", () => {
  test("opens with every marker waiting for a verdict", () => {
    render(<Triage c={demo} />);
    expect(screen.getByTestId("n-pending").textContent).toBe(`${demo.detections.length} to review`);
    expect(screen.getByText(`${demo.detections.length} markers across both cameras, reference time`)).toBeTruthy();
  });

  test("puts the strongest marker first and a weak one in the first row", () => {
    render(<Triage c={demo} />);
    const shown = cards();
    const by = [...demo.detections].sort((a, b) => b.confidence - a.confidence);
    expect(shown[0]).toBe(by[0]!.id);
    expect(shown).toContain(by.at(-1)!.id);
    expect(new Set(shown).size).toBe(shown.length);
  });

  test("verdicts update the counts and are saved for the report", async () => {
    render(<Triage c={demo} />);
    const [first, second] = cards();
    await userEvent.click(screen.getByTestId(`confirm-${first}`));
    await userEvent.click(screen.getByTestId(`reject-${second}`));
    expect(screen.getByTestId("n-confirmed").textContent).toBe("1 confirmed");
    expect(screen.getByTestId("n-rejected").textContent).toBe("1 rejected");
    expect(screen.getByTestId("n-pending").textContent).toBe(`${demo.detections.length - 2} to review`);
    expect(JSON.parse(sessionStorage.getItem("ft-review")!)).toEqual({ [first!]: "confirmed", [second!]: "rejected" });
  });

  test("restores verdicts saved earlier in the tab", () => {
    const id = demo.detections[5]!.id;
    sessionStorage.setItem("ft-review", JSON.stringify({ [id]: "rejected" }));
    render(<Triage c={demo} />);
    expect(screen.getByTestId("n-rejected").textContent).toBe("1 rejected");
  });
});
