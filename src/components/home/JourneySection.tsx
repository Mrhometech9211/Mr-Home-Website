import Image from "next/image";
import type { PageSection, SectionItem } from "@/db/schema";
import { Reveal } from "@/components/site/Reveal";
import { StatsBar } from "./StatsBar";

export function JourneySection({ section, stats }: { section: PageSection; stats: SectionItem[] }) {
  const words = (section.title || "").split(" ");
  const careerExperience = stats.find((item) => item.value?.trim() && /career experience/i.test(item.label ?? ""));
  const careerSales = stats.find((item) => item.value?.trim() && /career sales/i.test(item.label ?? ""));
  return (
    <section id="journey" className="relative overflow-hidden py-24 lg:py-32" aria-labelledby="journey-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-space to-transparent" />
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-6">
            <p className="eyebrow">{section.eyebrow || "Track Record"}</p>
            <h2 id="journey-title" className="display mt-4 text-[clamp(2rem,4vw,3.2rem)] uppercase text-ink">
              {words.slice(0, -2).join(" ")} <span className="text-brand">{words.slice(-2).join(" ")}</span>
            </h2>
            {section.body && <p className="mt-5 max-w-lg text-[15.5px] leading-relaxed text-charcoal/80">{section.body}</p>}
            <ol className="mt-10 grid gap-4 sm:grid-cols-2">
              {(section.items ?? []).map((it, i) => (
                <li key={i} className="group relative rounded-2xl border border-ink/8 bg-white/70 p-5 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:shadow-card">
                  <span className="text-[11px] font-semibold tracking-[0.2em] text-brand">0{i + 1}</span>
                  <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-ink">{it.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-charcoal/75">{it.description}</p>
                </li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="relative lg:col-span-6" y={60}>
            <div className="relative aspect-[5/4] overflow-hidden rounded-[32px] shadow-[0_50px_100px_-40px_rgba(17,20,17,0.5)]">
              {section.image && <Image src={section.image} alt="" fill className="object-cover" sizes="(min-width:1024px) 50vw, 100vw" />}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgba(17,20,17,0.5))]" />
              {careerExperience && (
                <div className="absolute inset-x-6 bottom-6 flex items-end justify-between text-white">
                  <div className="max-w-[85%] text-[18px] font-semibold text-balance">{careerExperience.value} {careerExperience.label}</div>
                </div>
              )}
            </div>
            {careerSales && (
              <div className="glass float-slow absolute -left-4 top-8 hidden rounded-2xl px-5 py-4 shadow-card md:block"><div className="text-[24px] font-semibold text-brand">{careerSales.value}</div><div className="text-[12px] text-charcoal/70">{careerSales.label}</div></div>
            )}
          </Reveal>
        </div>
        {stats.length > 0 && <div className="mt-16"><StatsBar items={stats} id="journey-stats" compact /></div>}
      </div>
    </section>
  );
}
