import { Shell } from "@/components/shell";
import { loadCase } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function CaseLayout({ children }: { children: React.ReactNode }) {
  const c = loadCase();
  return (
    <Shell caseId={c.id} caseTitle={c.title}>
      {children}
    </Shell>
  );
}
