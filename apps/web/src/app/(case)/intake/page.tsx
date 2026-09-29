import { Intake } from "@/components/intake/intake";
import { loadCase } from "@/lib/data";
import { pageTitle } from "@/lib/brand";

export const metadata = { title: pageTitle("Intake") };

export default function Page() {
  const c = loadCase();
  return <Intake sources={c.sources} />;
}
