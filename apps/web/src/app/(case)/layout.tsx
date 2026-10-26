import { CaseProblem } from "@/components/case-problem";
import { Shell } from "@/components/shell";
import { CaseFileError } from "@/lib/case-schema";
import { loadCase } from "@/lib/data";
import type { Case } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function CaseLayout({ children }: { children: React.ReactNode }) {
  let c: Case;
  try {
    c = loadCase();
  } catch (e) {
    // A production build hides a server error's message from the page, so a case file the
    // examiner can fix is caught here and shown with the field that is wrong.
    if (e instanceof CaseFileError) return <CaseProblem message={e.message} />;
    throw e;
  }
  return (
    <Shell caseId={c.id} caseTitle={c.title}>
      {children}
    </Shell>
  );
}
