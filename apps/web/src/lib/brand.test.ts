import assert from "node:assert/strict";
import { test } from "vitest";
import { BRAND, orgLine, pageTitle } from "./brand";

test("page titles lead with the page and end with the product", () => {
  assert.equal(pageTitle("Timeline"), `Timeline · ${BRAND.product}`);
  assert.equal(pageTitle(), BRAND.product);
});

test("the organisation line puts the problem statement ID first only when one is set", () => {
  assert.equal(orgLine("CERT-In"), [BRAND.ps, "CERT-In"].filter(Boolean).join(" · "));
  assert.ok(orgLine().endsWith("NTRO"));
});
