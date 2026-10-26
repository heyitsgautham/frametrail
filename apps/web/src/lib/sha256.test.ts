import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { sha256Hex } from "./sha256";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sha256Hex", () => {
  test("matches the FIPS 180-4 examples", () => {
    expect(sha256Hex(enc(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(enc("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  test("matches Node's digest across every padding boundary and for non-ASCII text", () => {
    for (let n = 0; n < 200; n++) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) % 256);
      expect(sha256Hex(data), `length ${n}`).toBe(createHash("sha256").update(data).digest("hex"));
    }
    const text = enc("Examiner 1 · seized at 10:31 — ஆதாரம்");
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
});
