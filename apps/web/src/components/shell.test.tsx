import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BRAND } from "@/lib/brand";
import { Shell } from "./shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/custody" }));

describe("Shell", () => {
  test("names the case and marks the current step", () => {
    render(
      <Shell caseId="FT-26-014" caseTitle="Bag taken">
        <p>body</p>
      </Shell>,
    );
    expect(screen.getByTestId("case-tag").textContent).toBe("CASE FT-26-014");
    expect(screen.getByTestId("brand").textContent).toBe(BRAND.product);
    expect(screen.getByTestId("nav-custody").classList.contains("bg-panel-2")).toBe(true);
    expect(screen.getByTestId("nav-intake").classList.contains("bg-panel-2")).toBe(false);
    expect(screen.getByTestId("nav-intake").getAttribute("href")).toBe("/intake");
    expect(screen.getByText("body")).toBeTruthy();
  });
});
