import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CaseFileError } from "@/lib/case-schema";
import type { Case } from "@/lib/types";

const loadCase = vi.hoisted(() => vi.fn<() => Case>());
vi.mock("@/lib/data", () => ({ loadCase }));
vi.mock("next/navigation", () => ({ usePathname: () => "/intake" }));

import CaseLayout from "./layout";

describe("CaseLayout", () => {
  test("wraps the screen in the shell with the case named", () => {
    loadCase.mockReturnValueOnce({ id: "FT-26-014", title: "Bag taken" } as Case);
    render(CaseLayout({ children: <p>screen</p> }));
    expect(screen.getByTestId("case-tag").textContent).toBe("CASE FT-26-014");
    expect(screen.getByText("screen")).toBeTruthy();
  });

  test("shows what is wrong with the case file instead of the screen", () => {
    loadCase.mockImplementationOnce(() => {
      throw new CaseFileError("case.json is not a case file FrameTrail can show. segments[2].md5: Invalid input");
    });
    render(CaseLayout({ children: <p>screen</p> }));
    expect(screen.getByTestId("case-problem")).toBeTruthy();
    expect(screen.getByText(/segments\[2\]\.md5: Invalid input/)).toBeTruthy();
    expect(screen.getByText("pnpm engine:analyse")).toBeTruthy();
    expect(screen.queryByText("screen")).toBeNull();
  });

  test("lets any other failure reach the error page", () => {
    loadCase.mockImplementationOnce(() => {
      throw new Error("disk on fire");
    });
    expect(() => CaseLayout({ children: <p>screen</p> })).toThrow("disk on fire");
  });
});
