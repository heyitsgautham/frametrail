import { Timeline } from "@/components/timeline/timeline";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Timeline") };

export default function Page() {
  const c = loadCase();
  return <Timeline c={c} />;
}
