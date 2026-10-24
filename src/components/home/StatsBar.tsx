import type { SectionItem } from "@/db/schema";
import { DynamicIcon } from "@/components/site/Icons";
import { Reveal } from "@/components/site/Reveal";
import { cn } from "@/lib/utils";

export function StatsBar({ items, id = "stats", dark = false, compact = false }: { items: SectionItem[]; id?: string; dark?: boolean; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div id={id} className={cn("relative z-10 mx-auto max-w-[1400px] px-4 sm:px-6")}>
      <Reveal stagger="[data-stat]" className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[28px] shadow-card md:grid-cols-3 lg:grid-cols-5", dark ? "glass-dark" : "glass")}>
        {items.map((it, i) => (
          <div key={i} data-stat className={cn("flex items-center gap-4 px-5 py-6", dark ? "border-white/5" : "border-ink/5", i !== 0 && "lg:border-l", i % 2 === 1 && "border-l lg:border-l", i >= 2 && "border-t lg:border-t-0")}>
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", dark ? "bg-brand/15 text-brand-bright" : "bg-brand/10 text-brand")} style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.6), 0 8px 18px -10px rgba(31,143,58,.5)" }}>
              <DynamicIcon name={it.icon} className="h-5 w-5" />
            </span>
            <div>
              <div className={cn("text-[24px] font-semibold tracking-tight leading-none", dark ? "text-white" : "text-ink")}>{it.value}</div>
              <div className={cn("mt-1.5 text-[12.5px]", dark ? "text-white/60" : "text-charcoal/70")}>{it.label}</div>
            </div>
          </div>
        ))}
      </Reveal>
    </div>
  );
}
