import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Server code such as route handlers runs in the node environment, with no DOM to prepare.
const dom = typeof window !== "undefined";

// jsdom has no media playback or matchMedia; the screens call both.
if (dom) {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  if (!dom) return;
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  if (dom) cleanup();
});
