import { Report } from "@/components/report/report";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Report") };

export default function Page() {
  const c = loadCase();
  return <Report c={c} />;
}
