"use client";

import { Activity, Cpu, FileCheck2, GitBranch, HardDrive, Layers, Link2, ListChecks, ScanSearch } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/intake", label: "Intake", icon: HardDrive },
  { href: "/recovery", label: "Recovery", icon: ScanSearch },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/triage", label: "Triage", icon: ListChecks },
  { href: "/provenance", label: "Provenance", icon: GitBranch },
  { href: "/custody", label: "Custody", icon: Link2 },
  { href: "/report", label: "Report", icon: FileCheck2 },
  { href: "/vendors", label: "Vendors", icon: Cpu },
  { href: "/research", label: "Research", icon: Layers },
];

export function Mark({ className }: { className?: string }) {
  // A lens with a trail of frames behind it.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="11" width="6" height="10" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="8" y="9" width="7" height="14" rx="1" fill="currentColor" opacity="0.6" />
      <circle cx="23" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="23" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

export function Shell({ caseId, caseTitle, children }: { caseId: string; caseTitle: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line bg-panel px-5">
        <Link href="/intake" className="flex items-center gap-2.5 text-amber" data-testid="brand">
          <Mark className="h-7 w-7" />
          <span className="font-display text-[26px] font-extrabold leading-none text-ink">{BRAND.product}</span>
        </Link>
        <div className="h-6 w-px bg-line" />
        <div className="tag flex items-center gap-2 py-1 pl-5 pr-3 font-mono text-[13px] font-bold" data-testid="case-tag">
          CASE {caseId}
        </div>
        <span className="text-[14px] text-ink-2">{caseTitle}</span>
        <div className="ml-auto flex items-center gap-2 text-[13px] text-ink-3">
          <span className="h-2 w-2 rounded-full bg-teal" />
          Offline workstation
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[196px] shrink-0 flex-col gap-1 border-r border-line bg-panel px-3 py-4">
          {STEPS.map((s, i) => {
            const on = path === s.href;
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                data-testid={`nav-${s.label.toLowerCase()}`}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] transition-colors",
                  on ? "bg-panel-2 text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <span className={cn("font-mono text-[11px]", on ? "text-amber" : "text-ink-3")}>{String(i + 1).padStart(2, "0")}</span>
                <Icon className={cn("h-4 w-4", on ? "text-amber" : "")} />
                {s.label}
              </Link>
            );
          })}
        </nav>
        <main id="scroll-root" className="floor min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 px-8 pb-5 pt-7">
      <div>
        <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-amber">{kicker}</div>
        <h1 className="font-display mt-1 text-[44px] font-extrabold leading-none text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border border-line bg-panel", className)} {...rest}>
      {children}
    </div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3", className)}>{children}</div>;
}
