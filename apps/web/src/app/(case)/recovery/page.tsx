import { Recovery } from "@/components/recovery/recovery";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Recovery") };

export default function Page() {
  const c = loadCase();
  const disk = c.sources.find((s) => s.kind === "disk-image") ?? c.sources[0]!;
  const segs = c.segments.filter((s) => s.extent.sourceId === disk.id);
  const cams = Object.fromEntries(c.cameras.map((x) => [x.id, x.name]));
  const all = (c.log ?? []).filter((l) => l.sourceId === disk.id);
  // The records around the wipe: a few before the initialisation and the one after it.
  const at = all.findIndex((l) => /init|format/i.test(`${l.kind} ${l.text}`));
  const log = at < 0 ? all.slice(-6) : all.slice(Math.max(0, at - 4), at + 2);
  const reformat = c.reformat?.sourceId === disk.id ? c.reformat : undefined;
  return <Recovery source={disk} segments={segs} cameras={cams} log={log} reformat={reformat} />;
}
