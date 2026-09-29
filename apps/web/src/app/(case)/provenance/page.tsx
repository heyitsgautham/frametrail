import { Provenance } from "@/components/provenance/provenance";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Provenance") };

export default function Page() {
  const c = loadCase();
  return <Provenance c={c} />;
}
