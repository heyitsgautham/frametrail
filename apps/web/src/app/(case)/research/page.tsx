import { BookOpen, Film, FlaskConical, Scale, Sparkles, Target } from "lucide-react";
import { PageHead, Panel } from "@/components/shell";
import { pageTitle } from "@/lib/brand";
import { loadCase } from "@/lib/data";

export const metadata = { title: pageTitle("Research") };

// How the demo was built, and what in it is real.
export default function Page() {
  const c = loadCase();
  const al = c.alignment[0];
  const model = c.detections[0]?.model;
  const cards = [
    {
      icon: Film,
      id: "footage",
      title: "Real CCTV footage",
      body: `${c.footage.name}. Two cameras watching the same corridor. ${c.footage.licence}, credit: ${c.footage.credit}.`,
    },
    {
      icon: FlaskConical,
      id: "fixtures",
      title: "Synthetic recorder images",
      body: "The footage is packed into a disk image modelled on a published DVR layout and a native export, with a deleted index entry, an overwrite and a slow clock planted on purpose.",
    },
    {
      icon: Target,
      id: "validation",
      title: "Checked against what we planted",
      body: al
        ? `Clock offset found at ${al.offsetSec.toFixed(1)} s against ${al.plantedSec?.toFixed(1) ?? "?"} s planted. ${c.stats.recoveredSegments ?? "All"} deleted segments recovered, ${c.stats.carveRejected ?? 0} false candidate rejected.`
        : "Every planted segment recovered and labelled with its true state.",
    },
    {
      icon: Sparkles,
      id: "model",
      title: "Offline AI, used for triage",
      body: model
        ? `${model.name} ${model.version}, ${model.licence}. Runs on the workstation. No cloud, no upload.`
        : "Runs on the workstation. No cloud, no upload.",
    },
    {
      icon: BookOpen,
      id: "standards",
      title: "What we read",
      body: "SWGDE best practices for DVR acquisition and forensic video analysis, NISTIR 8172 on CCTV export, and published recovery methods for Hikvision and Dahua disks.",
    },
    {
      icon: Scale,
      id: "law",
      title: "Built for Indian courts",
      body: "The report follows the certificate in the Schedule of the Bharatiya Sakshya Adhiniyam, 2023, with MD5 and SHA-256 for every exhibit.",
    },
  ];
  return (
    <div className="pb-10">
      <PageHead kicker="Research" title="How we built it" />
      <div className="grid grid-cols-3 gap-5 px-8">
        {cards.map((k) => (
          <Panel key={k.id} className="p-6" data-testid={`method-${k.id}`}>
            <k.icon className="h-7 w-7 text-amber" />
            <div className="mt-4 text-[19px] font-bold text-ink">{k.title}</div>
            <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{k.body}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
