import { bytes, hex } from "./format";
import type { Source } from "./types";

/**
 * What the engine found wrong with a source's own structures, one sentence each, for the
 * intake screen. An intact source gives none, so the screen shows nothing extra.
 */
export function damage(source: Source): string[] {
  const s = source.structures;
  if (!s) return [];
  const out: string[] = [];
  const m = s.masterSector;
  if (m && m.primaryIntact === false) {
    out.push(
      `The master sector at ${hex(m.offset)} is damaged. The disk layout was read from the copy at ${hex(m.readFrom ?? m.backupOffset)}.`,
    );
  }
  const i = s.index;
  if (i?.readable === false) {
    out.push("Neither copy of the index can be read. Every segment on this disk was found by carving.");
  } else if (i?.readFrom !== undefined) {
    out.push(
      `The primary index at ${hex(i.offset)} is damaged. Its ${i.entries} entries were read from the backup copy at ${hex(i.readFrom)}.`,
    );
  }
  if (s.image && s.image.shortBy > 0) {
    out.push(
      `The image is ${bytes(s.image.shortBy)} shorter than the ${bytes(s.image.expectedBytes)} disk its master sector records. The acquisition may have stopped early.`,
    );
  }
  return out;
}
