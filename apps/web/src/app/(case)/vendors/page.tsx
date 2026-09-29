import { Label, PageHead, Panel } from "@/components/shell";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";
import type { Adapter } from "@/lib/types";

export const metadata = { title: pageTitle("Vendors") };

const STATUS: Record<Adapter["status"], { label: string; cls: string }> = {
  "tested-on-fixture": { label: "Tested on fixture", cls: "bg-teal/15 text-teal border-teal/40" },
  "export-parser": { label: "Export parser", cls: "bg-[#5b8def]/15 text-[#8fb0f5] border-[#5b8def]/40" },
  "next-phase": { label: "Next phase", cls: "bg-panel-2 text-ink-3 border-line" },
};

// One adapter per recorder family. Each says exactly what it has been tested on, so
// "supports Dahua" never quietly means every model and firmware.
export default function Page() {
  const c = loadCase();
  return (
    <div className="pb-10">
      <PageHead kicker="Step 8 · Vendor adapters" title="Honest about coverage" />
      <div className="px-8">
        <Panel className="overflow-hidden" data-testid="vendor-matrix">
          <div className="grid grid-cols-[150px_170px_1fr_170px_330px] items-center gap-4 border-b border-line bg-panel-2 px-5 py-3">
            <Label>Vendor</Label>
            <Label>Format</Label>
            <Label>What the adapter does</Label>
            <Label>Status</Label>
            <Label>Tested on, and limits</Label>
          </div>
          {c.adapters.map((a) => (
            <div key={a.vendor} data-testid={`vendor-${a.vendor}`} className="grid grid-cols-[150px_170px_1fr_170px_330px] items-center gap-4 border-b border-line/60 px-5 py-3 last:border-0">
              <span className="text-[16px] font-semibold text-ink">{a.vendor}</span>
              <span className="font-mono text-[13px] text-ink-2">{a.family}</span>
              <span className="flex flex-wrap gap-1.5">
                {a.ops.length ? (
                  a.ops.map((o) => (
                    <span key={o} className="rounded border border-teal/30 bg-teal/[0.07] px-2 py-0.5 text-[12.5px] text-ink-2">
                      {o}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-ink-3">Reported as unsupported</span>
                )}
              </span>
              <span className={`w-fit rounded-full border px-3 py-1 text-[13px] font-semibold ${STATUS[a.status].cls}`}>{STATUS[a.status].label}</span>
              <span className="text-[13px] leading-snug text-ink-3">{a.note}</span>
            </div>
          ))}
        </Panel>
        <div className="mt-4 text-[14px] text-ink-3">An unknown layout is reported as unsupported, never forced through the wrong parser.</div>
      </div>
    </div>
  );
}
