import { describe, expect, test } from "vitest";
import { secs } from "@/lib/format";
import type { Case } from "@/lib/types";
import { demo } from "../../../test/demo";
import { pickMoment } from "./moment";

const [disk, nvr] = [demo.cameras[0]!, demo.cameras[1]!];

describe("pickMoment", () => {
  test("opens on people on the second camera while the disk footage there was carved back", () => {
    const m = pickMoment(demo, disk, nvr)!;
    const onDisk = demo.segments.find((s) => s.cameraId === disk.id && secs(s.refStart) + 1 <= m.t && m.t <= secs(s.refEnd) - 14);
    expect(onDisk?.state).toBe("recovered-unindexed");
    expect(demo.detections.some((d) => d.cameraId === nvr.id && secs(d.refTime) === m.t)).toBe(true);
  });

  test("uses the moment the engine names in stats.syncRef", () => {
    expect(pickMoment({ ...demo, stats: { ...demo.stats, syncRef: 37000 } }, disk, nvr)).toEqual({ t: 37000 });
    expect(pickMoment({ ...demo, stats: { ...demo.stats, syncRef: "10:20:30" } }, disk, nvr)).toEqual({ t: 37230 });
  });

  test("without detections, opens five seconds into the first export clip the disk camera also covers", () => {
    // R01 starts over footage that was recorded over; R02 starts inside carved segment C04.
    const r02 = demo.segments.find((s) => s.id === "EV-002-R02")!;
    expect(pickMoment({ ...demo, detections: [] }, disk, nvr)!.t).toBeCloseTo(secs(r02.refStart) + 5, 6);
  });

  test("with no overlap between the cameras there is no moment", () => {
    const c: Case = { ...demo, detections: [], segments: demo.segments.filter((s) => s.cameraId !== disk.id) };
    expect(pickMoment(c, disk, nvr)).toBeNull();
  });
});
