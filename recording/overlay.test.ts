import assert from "node:assert/strict";
import { test } from "node:test";
import { lowerThird, overlay } from "./overlay";

const brand = { product: "FrameTrail", ps: "", event: "", team: "", tagline: "Every frame" };

test("the lower third names the product and adds the team only when one is set", () => {
  assert.equal(lowerThird(brand, "NTRO"), "<b>FrameTrail</b><span><i>NTRO</i>Every frame</span>");
  assert.match(lowerThird({ ...brand, team: "Team A" }, "NTRO"), /<span><i>Team<\/i>Team A<\/span>$/);
});

test("the overlay is valid JavaScript and carries the lower third as a quoted string", () => {
  const script = overlay('<b>"quoted"</b>');
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes(JSON.stringify('<b>"quoted"</b>')));
});

// Just enough of a DOM for the overlay to install itself.
class El {
  id = "";
  innerHTML = "";
  textContent = "";
  style: Record<string, string> = {};
  children: El[] = [];
  appendChild(c: El) {
    this.children.push(c);
    return c;
  }
}

function run(script: string) {
  const root = new El();
  const all = () => root.children;
  const store = new Map<string, string>();
  const listeners: string[] = [];
  const win: Record<string, unknown> = {
    addEventListener: (name: string) => listeners.push(name),
  };
  const doc = {
    readyState: "complete",
    documentElement: root,
    body: new El(),
    createElement: () => new El(),
    getElementById: (id: string) => all().find((e) => e.id === id) ?? null,
    addEventListener: () => {},
  };
  const session = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  const globals = ["window", "document", "sessionStorage", "requestAnimationFrame", "innerWidth", "innerHeight"];
  new Function(...globals, script)(win, doc, session, () => 0, 1600, 900);
  return { root, win, doc, listeners };
}

test("running the overlay installs the cursor, the click ring, the lower third and the camera", () => {
  const { root, win, doc, listeners } = run(overlay("<b>FrameTrail</b>"));
  assert.deepEqual(
    root.children.map((e) => e.id),
    ["__rec_ring", "__rec_cursor", "__rec_style", "__rec_lower"],
  );
  assert.equal(doc.getElementById("__rec_lower")?.innerHTML, "<b>FrameTrail</b>");
  assert.deepEqual(listeners, ["mousemove", "mousedown"]);
  const cam = win.__cam as Record<string, (...a: unknown[]) => void>;
  assert.deepEqual(Object.keys(cam), ["zoom", "reset", "ring", "scroll", "lower"]);
  cam.lower!(true);
  assert.equal(doc.getElementById("__rec_lower")?.style.opacity, "1");
  cam.zoom!({ x: 0, y: 0, width: 800, height: 450 }, 2, 300);
  assert.equal(doc.body.style.transform, "translate(0px,0px) scale(2)");
  assert.equal(doc.getElementById("__rec_cursor")?.style.opacity, "0");
});

test("installing twice adds nothing, so a reload keeps one cursor", () => {
  const { root, doc } = run(overlay("x"));
  const again = new Function("window", "document", "sessionStorage", "requestAnimationFrame", overlay("x"));
  again({ addEventListener: () => {} }, doc, { getItem: () => null, setItem: () => {} }, () => 0);
  assert.equal(root.children.length, 4);
});
