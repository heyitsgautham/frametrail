import { TriangleAlert } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Label, Mark, Panel } from "./shell";

// Shown in place of every case screen when case.json is missing or does not match what the
// screens read. It names the file and the fields, so the examiner knows what to fix.
export function CaseProblem({ message }: { message: string }) {
  return (
    <div className="floor flex h-screen items-center justify-center bg-bg px-6" data-testid="case-problem">
      <Panel className="w-full max-w-[720px] p-8">
        <div className="flex items-center gap-2.5 text-amber">
          <Mark className="h-7 w-7" />
          <span className="font-display text-[26px] font-extrabold leading-none text-ink">{BRAND.product}</span>
        </div>
        <div className="mt-7 flex items-center gap-2 text-red">
          <TriangleAlert className="h-5 w-5 shrink-0" />
          <h1 className="font-display text-[32px] font-extrabold leading-none">The case file cannot be shown</h1>
        </div>
        <Label className="mt-6">What is wrong</Label>
        <p className="mt-2 break-words rounded-md border border-line bg-panel-2 p-4 font-mono text-[13px] leading-relaxed text-ink">
          {message}
        </p>
        <Label className="mt-6">What to do</Label>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Run <code className="font-mono text-ink">pnpm engine:analyse</code> to write a fresh case, or point{" "}
          <code className="font-mono text-ink">FT_CASE</code> at a case file the engine wrote. The screens read the file on every request,
          so reload this page once it is fixed.
        </p>
      </Panel>
    </div>
  );
}
