import { Triage } from "@/components/triage/triage";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Triage") };

export default function Page() {
  const c = loadCase();
  return <Triage c={c} />;
}
