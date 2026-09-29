import { Custody } from "@/components/custody/custody";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Custody") };

export default function Page() {
  const c = loadCase();
  return <Custody events={c.custody} />;
}
