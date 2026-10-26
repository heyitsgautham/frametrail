import { describe, expect, test } from "vitest";
import { demo } from "../../test/demo";
import { damage } from "./damage";
import type { Source } from "./types";

const disk = demo.sources.find((s) => s.kind === "disk-image")!;
const exportFile = demo.sources.find((s) => s.kind === "native-export")!;
const master = { offset: 0x200, backupOffset: 0x18000, backupMatches: true };
const index = { offset: 0x20000, copiesMatch: true, entries: 2 };
const withStructures = (structures: Source["structures"]): Source => ({ ...disk, structures });

describe("damage", () => {
  test("finds nothing on the intact demo disk or on a source with no structures", () => {
    expect(damage(disk)).toEqual([]);
    expect(damage({ ...exportFile, structures: undefined })).toEqual([]);
  });

  test("says when the master sector came from its backup", () => {
    const src = withStructures({ masterSector: { ...master, backupMatches: false, primaryIntact: false, readFrom: 0x18000 } });
    expect(damage(src)).toEqual(["The master sector at 0x00000200 is damaged. The disk layout was read from the copy at 0x00018000."]);
  });

  test("says which index copy was read, or that none could be", () => {
    expect(damage(withStructures({ index: { ...index, copiesMatch: false, readFrom: 0x28000 } }))).toEqual([
      "The primary index at 0x00020000 is damaged. Its 2 entries were read from the backup copy at 0x00028000.",
    ]);
    expect(damage(withStructures({ index: { ...index, entries: 0, readable: false } }))).toEqual([
      "Neither copy of the index can be read. Every segment on this disk was found by carving.",
    ]);
  });

  test("says how much of a short image is missing", () => {
    const [line] = damage(withStructures({ image: { expectedBytes: 4194304, shortBy: 1194304 } }));
    expect(line).toBe(
      "The image is 1.1 MB shorter than the 4.0 MB disk its master sector records. The acquisition may have stopped early.",
    );
  });

  test("lists every problem found, in the order the engine reads the structures", () => {
    const all = withStructures({
      masterSector: { ...master, primaryIntact: false, readFrom: 0x18000 },
      index: { ...index, readable: false },
      image: { expectedBytes: 4194304, shortBy: 4096 },
    });
    expect(damage(all).map((l) => l.split(" ")[1])).toEqual(["master", "copy", "image"]);
  });
});
