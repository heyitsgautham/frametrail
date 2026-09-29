import { Mark } from "@/components/shell";
import { BRAND, orgLine, pageTitle } from "@/lib/brand";

export const metadata = { title: pageTitle() };

// The video's end card.
export default function Page() {
  return (
    <div className="floor grid h-screen place-items-center bg-bg" data-testid="title-card">
      <div className="flex flex-col items-center text-center">
        <Mark className="h-20 w-20 text-amber" />
        <div className="font-display mt-6 text-[96px] font-extrabold leading-none text-ink">{BRAND.product}</div>
        <div className="mt-4 text-[26px] text-ink-2">{BRAND.tagline}</div>
        <div className="mt-10 font-mono text-[15px] uppercase tracking-[0.2em] text-amber">{orgLine()}</div>
        {BRAND.team && <div className="mt-3 text-[18px] text-ink-3">{BRAND.team}</div>}
      </div>
    </div>
  );
}
